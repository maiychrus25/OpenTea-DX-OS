// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> _openHome(WidgetTester tester, {String? email, double width = 800}) async {
  SharedPreferences.setMockInitialValues({});
  final store = await LocalStore.open();
  tester.view.physicalSize = Size(width, 2800);
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

Future<void> _openMenu(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('home-menu')));
  await tester.pumpAndSettle();
}

void main() {
  group('menu of guests and customers', () {
    testWidgets('the three-line icon opens the full list of pages', (tester) async {
      await _openHome(tester, email: 'customer@demo.vn');
      await _openMenu(tester);
      for (final k in ['home', 'tours', 'products', 'news', 'cart', 'trips', 'tickets', 'orders', 'account']) {
        expect(find.byKey(Key('menu-$k')), findsOneWidget, reason: k);
      }
      expect(find.byKey(const Key('menu-signout')), findsOneWidget);
      expect(find.byKey(const Key('menu-signin')), findsNothing);
    });

    testWidgets('a guest gets no tickets or orders and a sign-in button', (tester) async {
      await _openHome(tester);
      await _openMenu(tester);
      expect(find.byKey(const Key('menu-tickets')), findsNothing);
      expect(find.byKey(const Key('menu-orders')), findsNothing);
      expect(find.byKey(const Key('menu-tours')), findsOneWidget);
      expect(find.byKey(const Key('menu-signin')), findsOneWidget);
      await tester.tap(find.byKey(const Key('menu-signin')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('login-submit')), findsOneWidget);
    });

    testWidgets('an item closes the menu and opens its page', (tester) async {
      await _openHome(tester, email: 'customer@demo.vn');
      await _openMenu(tester);
      await tester.tap(find.byKey(const Key('menu-tours')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('menu-tours')), findsNothing);
      expect(find.byKey(const Key('tour-tour-01')), findsOneWidget);
    });

    testWidgets('orders opens as a page on top of the shop', (tester) async {
      await _openHome(tester, email: 'customer@demo.vn');
      await _openMenu(tester);
      await tester.tap(find.byKey(const Key('menu-orders')));
      await tester.pumpAndSettle();
      expect(find.text('Đơn hàng của tôi'), findsWidgets);
    });

    testWidgets('signing out from the menu returns to the first screen', (tester) async {
      await _openHome(tester, email: 'customer@demo.vn');
      await _openMenu(tester);
      await tester.tap(find.byKey(const Key('menu-signout')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('login-submit')), findsOneWidget);
    });

    testWidgets('the header row still fits on a narrow phone', (tester) async {
      await _openHome(tester, width: 640);
      expect(tester.takeException(), isNull);
      expect(find.byKey(const Key('home-menu')), findsOneWidget);
      expect(find.byKey(const Key('home-account')), findsOneWidget);
    });
  });
}
