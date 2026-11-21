// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:hub_mobile/data/auth_service.dart';
import 'package:hub_mobile/data/core/core_exception.dart';
import 'package:hub_mobile/data/core/graphql_client.dart';
import 'package:hub_mobile/data/core/hub_api_client.dart';
import 'package:hub_mobile/data/http_hub_repository.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:hub_mobile/data/models/staff.dart';

/// A request as the fake web API saw it.
class _Call {
  _Call(this.request) : body = request.body.isEmpty ? null : jsonDecode(request.body) as Map<String, Object?>;
  final http.Request request;
  final Map<String, Object?>? body;
  String get method => request.method;
  String get path => request.url.path;
  String? get auth => request.headers['Authorization'];
}

const _secretToken = 'tok-SECRET-123';
const _newToken = 'tok-RENEWED-456';

/// Fake token source: the first token, then the renewed one after [refresh].
class _Tokens {
  _Tokens({this.renewable = true});
  final bool renewable;
  var refreshed = 0;
  BearerToken? current = const BearerToken(_secretToken, hasuraRole: 'farmer');

  Future<BearerToken?> bearer() async => current;
  Future<BearerToken?> refresh() async {
    refreshed++;
    if (!renewable) return current = null;
    return current = const BearerToken(_newToken, hasuraRole: 'farmer');
  }
}

({HubApiClient api, HttpHubRepository repo, List<_Call> calls, _Tokens tokens}) _setup(
  http.Response Function(_Call call) reply, {
  _Tokens? tokens,
}) {
  final calls = <_Call>[];
  final t = tokens ?? _Tokens();
  final client = MockClient((request) async {
    final c = _Call(request);
    calls.add(c);
    return reply(c);
  });
  final api = HubApiClient(
    baseUrl: 'https://gateway.test/',
    client: client,
    bearer: t.bearer,
    refresh: t.refresh,
    timeout: const Duration(milliseconds: 200),
  );
  final repo = HttpHubRepository(
    core: GraphqlClient(baseUrl: 'https://gateway.test', client: client, bearer: t.bearer, refresh: t.refresh),
    api: api,
    shop: MockHubRepository(),
  );
  return (api: api, repo: repo, calls: calls, tokens: t);
}

http.Response _json(int status, Object body) =>
    http.Response.bytes(utf8.encode(jsonEncode(body)), status, headers: {'content-type': 'application/json'});

http.Response _ok([Object data = const {'success': true}]) => _json(200, {'data': data});
http.Response _err(int status, String code, [String message = 'SERVER-SECRET-TEXT']) => _json(status, {
  'error': {'code': code, 'message': message},
});

NewJournalEntry _draft({
  ActivityType type = ActivityType.spraying,
  String? product = 'Thuốc A',
  String? dosage = '2 lít/ha',
  int? days = 7,
  String? notes = 'Trời nắng',
}) => NewJournalEntry(
  parcelId: 'clx0parcel1',
  entryDate: DateTime(2026, 11, 5),
  activityType: type,
  performedBy: 'Hoàng Văn Sáng',
  productName: product,
  dosage: dosage,
  withdrawalDays: days,
  notes: notes,
);

void main() {
  group('request shapes (zod schemas of the web routes)', () {
    test('addJournal: POST /api/journal with Bearer and the journalCreateSchema body', () async {
      final s = _setup(
        (_) => _json(201, {
          'data': {'id': 'j1'},
        }),
      );
      await s.repo.addJournal(_draft());
      final c = s.calls.single;
      expect((c.method, c.path), ('POST', '/api/journal'));
      expect(c.auth, 'Bearer $_secretToken');
      expect(c.request.headers['Content-Type'], contains('application/json'));
      expect(c.body, {
        'parcel_id': 'clx0parcel1',
        'entry_date': '2026-11-05',
        'observation': 'Trời nắng',
        'activities': [
          {'activity_type': 'SPRAYING', 'product_name': 'Thuốc A', 'dosage': '2 lít/ha', 'withdrawal_days': 7},
        ],
      });
    });

    test('addJournal leaves out empty optional fields and never sends the author or a token', () async {
      final s = _setup(
        (_) => _json(201, {
          'data': {'id': 'j1'},
        }),
      );
      await s.repo.addJournal(_draft(type: ActivityType.irrigation, product: ' ', dosage: null, days: null, notes: ''));
      final body = s.calls.single.body!;
      expect(body.keys.toSet(), {'parcel_id', 'entry_date', 'activities'});
      expect(body['activities'], [
        {'activity_type': 'IRRIGATION'},
      ]);
      expect(jsonEncode(body), isNot(contains('Hoàng Văn Sáng')), reason: 'the server takes the author from the token');
    });

    test('every activity type maps to a value the zod enum accepts', () async {
      const allowed = {'SOWING', 'FERTILIZING', 'SPRAYING', 'IRRIGATION', 'HARVEST', 'OTHER'};
      final s = _setup((_) => _json(201, {'data': {}}));
      for (final t in ActivityType.values) {
        await s.repo.addJournal(_draft(type: t, product: null, dosage: null, days: null, notes: null));
      }
      final sent = [for (final c in s.calls) ((c.body!['activities']! as List).single as Map)['activity_type']];
      expect(sent.toSet(), allowed);
    });

    test('a negative withdrawal is not sent (the schema wants an integer >= 0)', () async {
      final s = _setup((_) => _json(201, {'data': {}}));
      await s.repo.addJournal(_draft(days: -1));
      expect(((s.calls.single.body!['activities']! as List).single as Map).containsKey('withdrawal_days'), isFalse);
    });

    test('reviewJournal(approve): POST /api/journal/batch-approve {entry_ids: [id]}', () async {
      final s = _setup((_) => _ok({'approved_count': 1, 'failed_ids': <String>[]}));
      await s.repo.reviewJournal('clx0entry1', approve: true);
      final c = s.calls.single;
      expect((c.method, c.path), ('POST', '/api/journal/batch-approve'));
      expect(c.body, {
        'entry_ids': ['clx0entry1'],
      });
    });

    test('batch-approve that approved nothing is reported, not hidden', () async {
      for (final data in [
        {
          'approved_count': 0,
          'failed_ids': ['clx0entry1'],
        },
        {
          'approved_count': 1,
          'failed_ids': ['clx0entry1'],
        },
      ]) {
        final s = _setup((_) => _ok(data));
        await expectLater(
          s.repo.reviewJournal('clx0entry1', approve: true),
          throwsA(isA<CoreException>().having((e) => e.kind, 'kind', CoreErrorKind.conflict)),
        );
      }
    });

    test('rejecting is unsupported and does not call the server (no Bearer route)', () async {
      final s = _setup((_) => _ok());
      expect(s.repo.canRejectJournal, isFalse);
      await expectLater(
        s.repo.reviewJournal('x', approve: false),
        throwsA(isA<CoreException>().having((e) => e.kind, 'kind', CoreErrorKind.unsupported)),
      );
      expect(s.calls, isEmpty);
    });

    test('rescheduleHarvest stays unsupported: /api/schedule/harvest does not accept Bearer', () async {
      final s = _setup((_) => _ok());
      expect(s.repo.canRescheduleHarvest, isFalse);
      await expectLater(
        s.repo.rescheduleHarvest('p', DateTime(2026)),
        throwsA(isA<CoreException>().having((e) => e.kind, 'kind', CoreErrorKind.unsupported)),
      );
      expect(s.calls, isEmpty);
    });

    test('markNotificationRead: PUT /api/notifications {id, action: mark-read}', () async {
      final s = _setup((_) => _ok());
      await s.repo.markNotificationRead('clx0note1');
      final c = s.calls.single;
      expect((c.method, c.path), ('PUT', '/api/notifications'));
      expect(c.body, {'id': 'clx0note1', 'action': 'mark-read'});
    });

    test('markAllNotificationsRead: PUT /api/notifications {action: mark-all-read}', () async {
      final s = _setup((_) => _ok());
      await s.repo.markAllNotificationsRead('TC', householdId: 'hh');
      expect(s.calls.single.body, {'action': 'mark-all-read'});
    });

    test('announce: POST /api/notifications/announce {title, body}, trimmed', () async {
      final s = _setup(
        (_) => _json(201, {
          'data': {'success': true},
        }),
      );
      await s.repo.announce(title: ' Họp HTX ', body: ' Thứ bảy 8h ');
      final c = s.calls.single;
      expect((c.method, c.path), ('POST', '/api/notifications/announce'));
      expect(c.body, {'title': 'Họp HTX', 'body': 'Thứ bảy 8h'});
    });

    test('a repository without a write client is read-only', () async {
      final repo = HttpHubRepository(
        core: GraphqlClient(
          baseUrl: 'https://g.test',
          client: MockClient((_) async => _ok()),
          bearer: () async => null,
        ),
        shop: MockHubRepository(),
      );
      expect(repo.coreWritable, isFalse);
      await expectLater(
        repo.markNotificationRead('n'),
        throwsA(isA<CoreException>().having((e) => e.kind, 'kind', CoreErrorKind.unsupported)),
      );
    });

    test('with a write client the repository is writable and says what is still unsupported', () {
      final s = _setup((_) => _ok());
      expect(s.repo.coreWritable, isTrue);
      expect(s.repo.coreIsSample, isFalse);
    });
  });

  group('401: refresh once, then ask to sign in again', () {
    test('a 401 renews the token and repeats the same request with it', () async {
      final s = _setup((c) => c.auth == 'Bearer $_secretToken' ? _err(401, 'UNAUTHORIZED') : _ok());
      await s.repo.markNotificationRead('n1');
      expect(s.tokens.refreshed, 1);
      expect(s.calls.map((c) => c.auth), ['Bearer $_secretToken', 'Bearer $_newToken']);
      expect(s.calls[1].body, s.calls[0].body);
      expect((s.calls[1].method, s.calls[1].path), (s.calls[0].method, s.calls[0].path));
    });

    test('a second 401 gives the sign-in-again message and refreshes only once', () async {
      final s = _setup((_) => _err(401, 'UNAUTHORIZED'));
      await expectLater(
        s.repo.markNotificationRead('n1'),
        throwsA(isA<CoreException>().having((e) => e.kind, 'kind', CoreErrorKind.unauthorized)),
      );
      expect(s.tokens.refreshed, 1);
      expect(s.calls, hasLength(2));
    });

    test('when the session cannot be renewed the first 401 is final', () async {
      final s = _setup((_) => _err(401, 'UNAUTHORIZED'), tokens: _Tokens(renewable: false));
      await expectLater(
        s.repo.addJournal(_draft()),
        throwsA(isA<CoreException>().having((e) => e.kind, 'kind', CoreErrorKind.unauthorized)),
      );
      expect(s.calls, hasLength(1));
    });

    test('no token at all means no call', () async {
      final s = _setup((_) => _ok(), tokens: _Tokens()..current = null);
      await expectLater(
        s.repo.markNotificationRead('n1'),
        throwsA(isA<CoreException>().having((e) => e.kind, 'kind', CoreErrorKind.unauthorized)),
      );
      expect(s.calls, isEmpty);
    });

    test('reads (GraphQL) renew the same way', () async {
      final seen = <String?>[];
      final tokens = _Tokens();
      final client = MockClient((r) async {
        seen.add(r.headers['Authorization']);
        return r.headers['Authorization'] == 'Bearer $_secretToken'
            ? http.Response('', 401)
            : _json(200, {
                'data': {'households': <Object>[]},
              });
      });
      final gql = GraphqlClient(
        baseUrl: 'https://g.test',
        client: client,
        bearer: tokens.bearer,
        refresh: tokens.refresh,
      );
      await gql.query('{ households { id } }');
      expect(seen, ['Bearer $_secretToken', 'Bearer $_newToken']);
    });
  });

  group('error mapping', () {
    Future<CoreException> failWith(http.Response r) async {
      final s = _setup((_) => r);
      try {
        await s.repo.markNotificationRead('n1');
      } on CoreException catch (e) {
        return e;
      }
      fail('expected a CoreException');
    }

    test('403 -> "Bạn không có quyền"', () async {
      final e = await failWith(_err(403, 'FORBIDDEN'));
      expect(e.kind, CoreErrorKind.forbidden);
      expect(e.message, contains('Bạn không có quyền'));
    });

    test('403 NO_HTX says the account has no cooperative', () async {
      final e = await failWith(_err(403, 'NO_HTX'));
      expect(e.message, CoreException.noHtxMessage);
    });

    test('404 -> not found', () async {
      expect((await failWith(_err(404, 'NOT_FOUND'))).kind, CoreErrorKind.notFound);
    });

    test('400, 409 and 422 -> Vietnamese validation or conflict messages', () async {
      expect((await failWith(_err(400, 'VALIDATION_ERROR'))).message, CoreException.validationMessage);
      expect((await failWith(_err(422, 'VALIDATION_ERROR'))).message, CoreException.validationMessage);
      expect((await failWith(_err(409, 'CONFLICT'))).message, CoreException.conflictMessage);
    });

    test('503 -> "Hệ thống tạm thời không khả dụng" and is retryable', () async {
      final e = await failWith(_err(503, 'CORE_UNAVAILABLE'));
      expect(e.message, contains('Hệ thống tạm thời không khả dụng'));
      expect(e.retryable, isTrue);
    });

    test('other 5xx is retryable; 4xx errors are not', () async {
      final e = await failWith(_err(500, 'INTERNAL'));
      expect((e.kind, e.retryable, e.statusCode), (CoreErrorKind.server, true, 500));
      expect((await failWith(_err(403, 'FORBIDDEN'))).retryable, isFalse);
      expect((await failWith(_err(400, 'VALIDATION_ERROR'))).retryable, isFalse);
    });

    test('network failure and timeout -> network message, retryable', () async {
      final repo = HttpHubRepository(
        core: GraphqlClient(
          baseUrl: 'https://g.test',
          client: MockClient((_) async => throw Exception('dns')),
          bearer: () async => const BearerToken(_secretToken),
        ),
        api: HubApiClient(
          baseUrl: 'https://g.test',
          client: MockClient((_) async => throw Exception('dns $_secretToken')),
          bearer: () async => const BearerToken(_secretToken),
        ),
        shop: MockHubRepository(),
      );
      try {
        await repo.markNotificationRead('n');
        fail('expected a failure');
      } on CoreException catch (e) {
        expect((e.kind, e.retryable), (CoreErrorKind.network, true));
        expect(e.message, CoreException.networkMessage);
      }
    });

    test('a 2xx without {data} or with rubbish is a bad response', () async {
      expect((await failWith(http.Response('<html>ok</html>', 200))).kind, CoreErrorKind.badResponse);
      expect((await failWith(_json(200, {'ok': true}))).kind, CoreErrorKind.badResponse);
    });

    test('no token, request body or server text in any error string', () async {
      for (final status in [400, 401, 403, 404, 409, 422, 500, 503]) {
        final s = _setup((_) => _err(status, 'WHATEVER', 'SERVER-SECRET-TEXT $_secretToken'));
        try {
          await s.repo.addJournal(_draft(notes: 'ghi chú riêng tư'));
          fail('expected a failure for $status');
        } on CoreException catch (e) {
          for (final text in [e.message, e.toString(), '${e.kind}', '${e.statusCode}']) {
            expect(text, isNot(contains(_secretToken)), reason: '$status');
            expect(text, isNot(contains(_newToken)), reason: '$status');
            expect(text, isNot(contains('SERVER-SECRET-TEXT')), reason: '$status');
            expect(text, isNot(contains('ghi chú riêng tư')), reason: '$status');
            expect(text, isNot(contains('Bearer')), reason: '$status');
          }
        }
      }
    });
  });
}
