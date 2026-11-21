// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/data/auth/oidc_client.dart';
import 'package:hub_mobile/data/auth/token_store.dart';
import 'package:hub_mobile/data/core/graphql_client.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/core/hub_api_client.dart';
import 'package:hub_mobile/data/http_hub_repository.dart';
import 'package:hub_mobile/data/keycloak_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/auth/jwt_test_support.dart';
import '../data/core/core_test_support.dart';

/// Real mode (Keycloak sign-in, real repository) over a fake OIDC library and a fake server.
Future<({FakeCore core, List<http.Request> writes, KeycloakAuthService auth})> _open(
  WidgetTester tester, {
  List<String> roles = const ['manager'],
}) async {
  SharedPreferences.setMockInitialValues({});
  final store = await LocalStore.open();
  tester.view.physicalSize = const Size(800, 2800);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(const SizedBox());

  final oidc = FakeOidc()
    ..authorizeResults.add(
      OidcTokens(
        accessToken: fakeJwt(roles: roles, exp: DateTime.now().add(const Duration(hours: 1))),
        refreshToken: 'r1',
        accessTokenExpiry: DateTime.now().add(const Duration(hours: 1)),
      ),
    );
  final auth = KeycloakAuthService(oidc: oidc, store: MemoryTokenStore());
  final core = FakeCore.byRoot(rootFixtures);
  final writes = <http.Request>[];
  final api = MockClient((request) async {
    writes.add(request);
    return http.Response(
      jsonEncode({
        'data': {'approved_count': 1, 'failed_ids': <String>[], 'success': true},
      }),
      200,
      headers: {'content-type': 'application/json'},
    );
  });
  final repo = HttpHubRepository(
    core: GraphqlClient(
      baseUrl: 'https://g.test',
      client: core.client,
      bearer: auth.bearerToken,
      refresh: auth.refreshBearer,
    ),
    api: HubApiClient(baseUrl: 'https://g.test', client: api, bearer: auth.bearerToken, refresh: auth.refreshBearer),
    shop: MockHubRepository(),
  );
  await tester.pumpWidget(HubApp(repository: repo, auth: auth, store: store));
  await tester.pumpAndSettle();
  return (core: core, writes: writes, auth: auth);
}

void main() {
  testWidgets('real mode login: one browser button and guest, no demo box, no password field', (tester) async {
    await _open(tester);
    expect(find.text('Đăng nhập bằng tài khoản HTX'), findsOneWidget);
    expect(find.text('Tiếp tục khám phá'), findsOneWidget);
    expect(find.byKey(const Key('login-email')), findsNothing);
    expect(find.byKey(const Key('login-password')), findsNothing);
    expect(find.byKey(const Key('login-submit')), findsNothing);
    expect(find.textContaining('Tài khoản demo'), findsNothing);
    expect(find.textContaining('Demo@2026'), findsNothing);
  });

  testWidgets('mock mode login still shows the demo box and the password form', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final store = await LocalStore.open();
    tester.view.physicalSize = const Size(800, 2800);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(HubApp(repository: MockHubRepository(), auth: DemoAuthService(store), store: store));
    await tester.pumpAndSettle();
    expect(find.textContaining('Tài khoản demo'), findsOneWidget);
    expect(find.byKey(const Key('login-password')), findsOneWidget);
    expect(find.byKey(const Key('login-keycloak')), findsNothing);
  });

  testWidgets('the browser button signs in and goes to the interface of the token role', (tester) async {
    final s = await _open(tester);
    await tester.tap(find.byKey(const Key('login-keycloak')));
    await tester.pumpAndSettle();
    expect(find.text('Thành viên'), findsOneWidget, reason: 'manager dashboard');
    // the real token and the Hasura role went out with the read
    expect(s.core.seen.first.headers['Authorization'], startsWith('Bearer eyJ'));
    expect(s.core.seen.first.headers['x-hasura-role'], 'manager');
  });

  testWidgets('a token without a known role is refused on the login screen', (tester) async {
    await _open(tester, roles: const ['offline_access']);
    await tester.tap(find.byKey(const Key('login-keycloak')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('login-error')), findsOneWidget);
    expect(find.textContaining('chưa được cấp quyền'), findsOneWidget);
    expect(find.text('Đăng nhập bằng tài khoản HTX'), findsOneWidget);
  });

  testWidgets('manager approves through batch-approve; there is no reject button (no Bearer route)', (tester) async {
    final s = await _open(tester);
    await tester.tap(find.byKey(const Key('login-keycloak')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bottom-/manager/journal-approve')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('journal-reject-clx0je0002')), findsNothing);
    await tester.tap(find.byKey(const Key('journal-approve-clx0je0002')));
    await tester.pumpAndSettle();
    final w = s.writes.single;
    expect((w.method, w.url.path), ('POST', '/api/journal/batch-approve'));
    expect(jsonDecode(w.body), {
      'entry_ids': ['clx0je0002'],
    });
    expect(w.headers['Authorization'], startsWith('Bearer eyJ'));
  });

  testWidgets('when the session is lost the app returns to the login screen', (tester) async {
    final s = await _open(tester);
    await tester.tap(find.byKey(const Key('login-keycloak')));
    await tester.pumpAndSettle();
    expect(find.text('Thành viên'), findsOneWidget);
    s.auth.onSessionLost!.call();
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('login-keycloak')), findsOneWidget);
  });
}
