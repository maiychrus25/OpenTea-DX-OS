// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/hub_config.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<DemoAuthService> _auth({String token = '', bool debug = true, String household = ''}) async {
  SharedPreferences.setMockInitialValues({});
  return DemoAuthService(await LocalStore.open(), devToken: token, debugBuild: debug, devHouseholdId: household);
}

void main() {
  group('HubConfig', () {
    test('default is the sample repository', () {
      const c = HubConfig();
      expect(c.useMock, isTrue);
      expect(c.useReal, isFalse);
      expect(c.problem, isNull);
    });

    test('real needs an address', () {
      expect(const HubConfig(useMock: false).problem, contains('HUB_API_BASE_URL'));
      expect(const HubConfig(useMock: false, baseUrl: 'gateway').problem, isNotNull);
      expect(const HubConfig(useMock: false, baseUrl: 'ftp://x').problem, isNotNull);
      const ok = HubConfig(useMock: false, baseUrl: 'https://gateway.example');
      expect(ok.problem, isNull);
      expect(ok.useReal, isTrue);
    });

    test('an address alone does not switch off the sample data', () {
      expect(const HubConfig(baseUrl: 'https://gateway.example').useReal, isFalse);
    });
  });

  group('AuthService.bearerToken', () {
    test('no dev token means no bearer token', () async {
      final auth = await _auth();
      await auth.signIn('manager@demo.vn', DemoAuthService.demoPassword);
      expect(await auth.bearerToken(), isNull);
    });

    test('a dev token is used in a debug build with the role of the demo account', () async {
      for (final (email, role) in [
        ('manager@demo.vn', 'manager'),
        ('officer@demo.vn', 'officer'),
        ('farmer@demo.vn', 'farmer'),
      ]) {
        final auth = await _auth(token: 'dev-token');
        await auth.signIn(email, DemoAuthService.demoPassword);
        final t = (await auth.bearerToken())!;
        expect((t.token, t.hasuraRole), ('dev-token', role), reason: email);
      }
    });

    test('a release build ignores the dev token', () async {
      final auth = await _auth(token: 'dev-token', debug: false);
      await auth.signIn('manager@demo.vn', DemoAuthService.demoPassword);
      expect(await auth.bearerToken(), isNull);
    });

    test('signed out, a customer or an operator get no token', () async {
      final auth = await _auth(token: 'dev-token');
      expect(await auth.bearerToken(), isNull);
      await auth.signIn('customer@demo.vn', DemoAuthService.demoPassword);
      expect(await auth.bearerToken(), isNull);
      await auth.signIn('operator@demo.vn', DemoAuthService.demoPassword);
      expect(await auth.bearerToken(), isNull);
      await auth.signOut();
      expect(await auth.bearerToken(), isNull);
    });

    test('the dev household replaces the made-up one only with a dev token in debug', () async {
      var auth = await _auth(token: 'dev-token', household: 'clx0hh0002');
      expect((await auth.signIn('farmer@demo.vn', DemoAuthService.demoPassword)).claims.householdId, 'clx0hh0002');
      auth = await _auth(household: 'clx0hh0002');
      expect((await auth.signIn('farmer@demo.vn', DemoAuthService.demoPassword)).claims.householdId, 'hh-01');
      auth = await _auth(token: 'dev-token', household: 'clx0hh0002', debug: false);
      expect((await auth.signIn('farmer@demo.vn', DemoAuthService.demoPassword)).claims.householdId, 'hh-01');
    });
  });
}
