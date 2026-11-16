// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:hub_mobile/data/auth_service.dart';
import 'package:hub_mobile/data/core/core_exception.dart';

import 'core_test_support.dart';

Future<CoreException> _fail(
  FakeCore core, {
  BearerToken? token = const BearerToken('tok-123', hasuraRole: 'manager'),
}) async {
  try {
    await core.graphql(token: token).query('query { lots { id } }');
  } on CoreException catch (e) {
    return e;
  }
  fail('expected a CoreException');
}

void main() {
  test('request: POST {base}/api/data/graphql with bearer, role and a JSON body', () async {
    final core = FakeCore((_) => '{"data":{"lots":[]}}');
    final data = await core.graphql().query(
      'query Q(\$limit: Int!) { lots(limit: \$limit) { id } }',
      variables: {'limit': 5},
    );
    expect(data['lots'], isEmpty);
    final s = core.seen.single;
    expect(s.request.method, 'POST');
    expect(s.request.url.toString(), 'https://gateway.test/api/data/graphql');
    expect(s.headers['Authorization'], 'Bearer tok-123');
    expect(s.headers['x-hasura-role'], 'manager');
    expect(s.headers['Content-Type'], startsWith('application/json'));
    expect(s.variables, {'limit': 5});
    expect(s.query, contains('lots(limit: \$limit)'));
  });

  test('no token means no request and a sign-in message', () async {
    final core = FakeCore((_) => '{"data":{}}');
    final e = await _fail(core, token: null);
    expect(e.kind, CoreErrorKind.unauthorized);
    expect(core.seen, isEmpty);
  });

  test('HTTP 401, 403 and 5xx map to their Vietnamese states', () async {
    final unauthorized = await _fail(FakeCore((_) => http.Response('', 401)));
    expect((unauthorized.kind, unauthorized.message), (CoreErrorKind.unauthorized, CoreException.unauthorizedMessage));
    final forbidden = await _fail(FakeCore((_) => http.Response('', 403)));
    expect((forbidden.kind, forbidden.message), (CoreErrorKind.forbidden, CoreException.forbiddenMessage));
    for (final status in [500, 502, 503]) {
      final server = await _fail(FakeCore((_) => http.Response('<html>boom</html>', status)));
      expect(server.kind, CoreErrorKind.server);
      expect(server.statusCode, status);
      expect(server.message, contains('$status'));
      expect(server.message, isNot(contains('boom')));
    }
  });

  test('Hasura errors are mapped by code, whatever the HTTP status', () async {
    final jwt = await _fail(FakeCore((_) => fixture('error_invalid_jwt')));
    expect(jwt.kind, CoreErrorKind.unauthorized);
    final denied = await _fail(
      FakeCore((_) => '{"errors":[{"extensions":{"code":"access-denied"},"message":"x-hasura-role not allowed"}]}'),
    );
    expect(denied.kind, CoreErrorKind.forbidden);
    final field = await _fail(FakeCore((_) => fixture('error_field_not_found')));
    expect(field.kind, CoreErrorKind.graphql);
    expect(field.message, CoreException.graphqlMessage);
    expect(field.message, isNot(contains('query_root')));
    // errors next to data still fail, like the web client does
    final both = await _fail(FakeCore((_) => '{"data":{"lots":[]},"errors":[{"message":"x"}]}'));
    expect(both.kind, CoreErrorKind.graphql);
  });

  test('network failure, timeout and unreadable answers', () async {
    final offline = await _fail(FakeCore((_) => http.ClientException('connection refused')));
    expect((offline.kind, offline.message), (CoreErrorKind.network, CoreException.networkMessage));
    final slow = FakeCore((_) => TimeoutException('slow'));
    expect((await _fail(slow)).kind, CoreErrorKind.network);
    expect((await _fail(FakeCore((_) => 'not json'))).kind, CoreErrorKind.badResponse);
    expect((await _fail(FakeCore((_) => '[1,2]'))).kind, CoreErrorKind.badResponse);
    expect((await _fail(FakeCore((_) => '{"data":null}'))).kind, CoreErrorKind.badResponse);
  });

  test('messages never carry the token or the raw server text', () async {
    final all = [
      await _fail(FakeCore((_) => http.Response('token tok-123 leaked', 500))),
      await _fail(FakeCore((_) => http.ClientException('failed for Bearer tok-123'))),
      await _fail(FakeCore((_) => '{"errors":[{"message":"secret tok-123"}]}')),
    ];
    for (final e in all) {
      expect(e.message, isNot(contains('tok-123')));
      expect(e.toString(), isNot(contains('tok-123')));
    }
  });
}
