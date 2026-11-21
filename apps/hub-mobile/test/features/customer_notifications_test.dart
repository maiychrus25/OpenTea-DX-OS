// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> _openHome(WidgetTester tester, {String? email}) async {
  SharedPreferences.setMockInitialValues({});
  final store = await LocalStore.open();
  tester.view.physicalSize = const Size(800, 2800);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(HubApp(repository: MockHubRepository(), auth: DemoAuthService(store), store: store));
  await tester.pumpAndSettle();
  if (email == null) {
    await tester.tap(find.byKey(const Key('login-guest')));
  } else {
    await tester.enterText(find.byKey(const Key('login-email')), email);
    await tester.enterText(find.byKey(const Key('login-password')), DemoAuthService.demoPassword);
    await tester.tap(find.byKey(const Key('login-submit')));
  }
  await tester.pumpAndSettle();
}

void main() {
  group('bell of the home page', () {
    testWidgets('replaces the account icon in the header', (tester) async {
      await _openHome(tester, email: 'customer@demo.vn');
      expect(find.byKey(const Key('home-notifications')), findsOneWidget);
      expect(find.byKey(const Key('home-account')), findsNothing);
      expect(find.byIcon(Icons.person_outline), findsWidgets); // the bottom tab keeps the account page
    });

    testWidgets('opens the notification list of a customer, built from bookings and orders', (tester) async {
      await _openHome(tester, email: 'customer@demo.vn');
      await tester.tap(find.byKey(const Key('home-notifications')));
      await tester.pumpAndSettle();
      expect(find.text('Thông báo'), findsWidgets);
      final hasList = find.byKey(const Key('notices-list')).evaluate().isNotEmpty;
      final isEmpty = find.byKey(const Key('notices-empty')).evaluate().isNotEmpty;
      expect(hasList || isEmpty, isTrue);
    });

    testWidgets('a guest is asked to sign in', (tester) async {
      await _openHome(tester);
      await tester.tap(find.byKey(const Key('home-notifications')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('notices-guest')), findsOneWidget);
      await tester.tap(find.byKey(const Key('notices-signin')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('login-submit')), findsOneWidget);
    });

    testWidgets('the menu lists Thông báo', (tester) async {
      await _openHome(tester, email: 'customer@demo.vn');
      await tester.tap(find.byKey(const Key('home-menu')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('menu-notifications')), findsOneWidget);
    });
  });
}
