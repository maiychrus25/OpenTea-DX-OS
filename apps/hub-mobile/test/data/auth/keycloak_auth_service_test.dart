// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/core/role/role.dart';
import 'package:hub_mobile/data/auth/oidc_client.dart';
import 'package:hub_mobile/data/auth_service.dart';
import 'package:hub_mobile/data/keycloak_auth_service.dart';

import 'jwt_test_support.dart';

void main() {
  var now = DateTime.utc(2026, 11, 16, 8);
  late FakeOidc oidc;
  late SpyTokenStore store;
  late KeycloakAuthService auth;
  var lost = 0;

  OidcTokens tokens({
    List<String> roles = const ['farmer'],
    Duration life = const Duration(minutes: 5),
    String? refresh = 'refresh-1',
    String sub = 'user-1',
  }) {
    final exp = now.add(life);
    return OidcTokens(
      accessToken: fakeJwt(roles: roles, exp: exp, sub: sub),
      refreshToken: refresh,
      accessTokenExpiry: exp,
    );
  }

  KeycloakAuthService build() =>
      KeycloakAuthService(oidc: oidc, store: store, now: () => now)..onSessionLost = () => lost++;

  setUp(() {
    now = DateTime.utc(2026, 11, 16, 8);
    oidc = FakeOidc();
    store = SpyTokenStore();
    lost = 0;
    auth = build();
  });

  test('does not ask for a password: the browser does', () {
    expect(auth.usesPasswordForm, isFalse);
  });

  group('signIn', () {
    test('keeps the tokens in the store and returns the role from the token', () async {
      final t = tokens(roles: ['manager']);
      oidc.authorizeResults.add(t);
      final s = await auth.signIn('ignored', 'ignored');
      expect(s.role, AppRole.manager);
      expect(s.claims.subject, 'user-1');
      expect(store.tokens!.accessToken, t.accessToken);
      expect(store.tokens!.refreshToken, 'refresh-1');
      final b = (await auth.bearerToken())!;
      expect((b.token, b.hasuraRole), (t.accessToken, 'manager'));
    });

    test('a user without a known role is refused and nothing is kept', () async {
      oidc.authorizeResults.add(tokens(roles: ['offline_access']));
      await expectLater(auth.signIn('', ''), throwsA(isA<AuthException>()));
      expect(store.tokens, isNull);
      expect(await auth.bearerToken(), isNull);
    });

    test('a customer is accepted only if the token says customer, and has no staff role for Hasura', () async {
      oidc.authorizeResults.add(tokens(roles: ['customer']));
      final s = await auth.signIn('', '');
      expect(s.role, AppRole.customer);
      expect((await auth.bearerToken())!.hasuraRole, isNull);
    });

    test('cancel, refusal and network failure give Vietnamese messages without internals', () async {
      for (final k in OidcFailureKind.values) {
        oidc.authorizeResults.add(OidcFailure(k));
        await expectLater(
          auth.signIn('', ''),
          throwsA(
            isA<AuthException>().having((e) => e.message, 'message', allOf(isNotEmpty, isNot(contains('OidcFailure')))),
          ),
        );
      }
      expect(store.tokens, isNull);
    });
  });

  group('restore', () {
    test('no stored tokens means signed out', () async {
      expect(await auth.restore(), isNull);
    });

    test('a stored valid token restores the session without a network call', () async {
      store.tokens = tokens(roles: ['farmer']);
      final s = (await build().restore())!;
      expect(s.role, AppRole.farmer);
      expect(oidc.refreshCalls, isEmpty);
    });

    test('an expired token is renewed on start and the new tokens are stored', () async {
      store.tokens = tokens(life: const Duration(seconds: -5));
      final fresh = tokens(life: const Duration(minutes: 5), refresh: 'refresh-2');
      oidc.refreshResults.add(fresh);
      final s = await build().restore();
      expect(s, isNotNull);
      expect(oidc.refreshCalls, ['refresh-1']);
      expect(store.tokens!.refreshToken, 'refresh-2');
    });

    test('a refused refresh token ends the session quietly and clears the store', () async {
      store.tokens = tokens(life: const Duration(seconds: -5));
      oidc.refreshResults.add(const OidcFailure(OidcFailureKind.rejected));
      expect(await build().restore(), isNull);
      expect(store.tokens, isNull);
    });

    test('a damaged token in the store is dropped', () async {
      store.tokens = const OidcTokens(accessToken: 'not-a-jwt');
      expect(await build().restore(), isNull);
      expect(store.tokens, isNull);
    });
  });

  group('bearerToken and refresh', () {
    setUp(() async {
      oidc.authorizeResults.add(tokens());
      await auth.signIn('', '');
    });

    test('renews before expiry (inside the 60 s margin) and keeps the old refresh token if none is returned', () async {
      now = now.add(const Duration(minutes: 4, seconds: 30));
      oidc.refreshResults.add(
        OidcTokens(
          accessToken: fakeJwt(exp: now.add(const Duration(minutes: 5))),
          accessTokenExpiry: now.add(const Duration(minutes: 5)),
        ),
      );
      final b = (await auth.bearerToken())!;
      expect(oidc.refreshCalls, ['refresh-1']);
      expect(b.token, store.tokens!.accessToken);
      expect(store.tokens!.refreshToken, 'refresh-1');
    });

    test('does not renew a token that is still fresh', () async {
      await auth.bearerToken();
      expect(oidc.refreshCalls, isEmpty);
    });

    test('concurrent callers share one renewal', () async {
      now = now.add(const Duration(minutes: 5));
      oidc.refreshResults.add(tokens(refresh: 'refresh-2'));
      final results = await Future.wait([auth.bearerToken(), auth.bearerToken(), auth.refreshBearer()]);
      expect(oidc.refreshCalls, hasLength(1));
      expect(results.every((r) => r != null), isTrue);
    });

    test('a refused refresh token signs the user out and tells the app', () async {
      oidc.refreshResults.add(const OidcFailure(OidcFailureKind.rejected));
      expect(await auth.refreshBearer(), isNull);
      expect(lost, 1);
      expect(store.tokens, isNull);
      expect(await auth.bearerToken(), isNull);
    });

    test('a passing failure keeps the session and the still-valid token', () async {
      now = now.add(const Duration(minutes: 4, seconds: 30));
      oidc.refreshResults.add(const OidcFailure(OidcFailureKind.unavailable));
      final b = await auth.bearerToken();
      expect(b, isNotNull, reason: 'the token has 30 s left');
      expect(lost, 0);
      expect(store.tokens, isNotNull);
    });

    test('a passing failure after real expiry gives no token but keeps the session', () async {
      now = now.add(const Duration(minutes: 6));
      oidc.refreshResults.add(const OidcFailure(OidcFailureKind.unavailable));
      expect(await auth.bearerToken(), isNull);
      expect(lost, 0);
      expect(store.tokens, isNotNull);
    });

    test('no refresh token: forcing a refresh ends the session', () async {
      oidc.authorizeResults.add(tokens(refresh: null));
      await auth.signIn('', '');
      expect(await auth.refreshBearer(), isNull);
      expect(lost, 1);
    });

    test('signOut forgets everything and does not call onSessionLost', () async {
      await auth.signOut();
      expect(store.tokens, isNull);
      expect(await auth.bearerToken(), isNull);
      expect(lost, 0);
    });

    test('a renewed token that no longer has a known role ends the session', () async {
      oidc.refreshResults.add(tokens(roles: ['offline_access']));
      expect(await auth.refreshBearer(), isNull);
      expect(lost, 1);
    });
  });

  test('tokens never appear in toString of the token object or in errors', () async {
    final t = tokens();
    expect(t.toString(), isNot(contains(t.accessToken)));
    oidc.authorizeResults.add(const OidcFailure(OidcFailureKind.unavailable));
    try {
      await auth.signIn('', '');
    } on AuthException catch (e) {
      expect(e.toString(), isNot(contains('eyJ')));
    }
  });
}
