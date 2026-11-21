// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:hub_mobile/data/auth_service.dart';
import 'package:hub_mobile/data/core/graphql_client.dart';
import 'package:hub_mobile/data/http_hub_repository.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';

/// Hand-written JSON shaped like Hasura answers (`{"data": ...}` / `{"errors": ...}`).
/// They were not recorded from a running server.
String fixture(String name) => File('test/fixtures/core/$name.json').readAsStringSync();

/// A request as the fake server saw it.
class Seen {
  Seen(this.request) : body = jsonDecode((request as http.Request).body) as Map<String, Object?>;
  final http.BaseRequest request;
  final Map<String, Object?> body;
  String get query => body['query']! as String;
  Map<String, Object?> get variables => (body['variables']! as Map).cast<String, Object?>();
  Map<String, String> get headers => request.headers;
}

/// Fake Hasura: answers each request with [reply] and records it in [seen].
class FakeCore {
  FakeCore(this.reply);
  Object Function(Seen request) reply;
  final seen = <Seen>[];

  late final MockClient client = MockClient((request) async {
    final s = Seen(request);
    seen.add(s);
    final r = reply(s);
    if (r is http.Response) return r;
    if (r is Exception) throw r;
    return http.Response.bytes(utf8.encode(r as String), 200, headers: {'content-type': 'application/json'});
  });

  /// Picks the fixture by the first root field of the query.
  static FakeCore byRoot(Map<String, String> fixtures) => FakeCore((s) {
    final root = RegExp(r'\{\s*(\w+)').firstMatch(s.query.substring(s.query.indexOf('{')))!.group(1)!;
    return fixture(fixtures[root]!);
  });

  GraphqlClient graphql({BearerToken? token = const BearerToken('tok-123', hasuraRole: 'manager')}) => GraphqlClient(
    baseUrl: 'https://gateway.test/',
    client: client,
    bearer: () async => token,
    timeout: const Duration(milliseconds: 200),
  );

  /// Repository whose token comes from [bearer], like in main.dart (the auth service decides).
  HttpHubRepository repositoryWith(BearerProvider bearer) => HttpHubRepository(
    core: GraphqlClient(baseUrl: 'https://gateway.test', client: client, bearer: bearer),
    shop: MockHubRepository(),
  );

  HttpHubRepository repository({BearerToken? token = const BearerToken('tok-123', hasuraRole: 'manager')}) =>
      HttpHubRepository(
        core: graphql(token: token),
        shop: MockHubRepository(),
      );
}

const rootFixtures = {
  'htx_profiles': 'htx_profile',
  'households': 'households',
  'parcels': 'parcels',
  'journal_entries': 'journal',
  'lots': 'lots',
  'notifications': 'notifications',
};
