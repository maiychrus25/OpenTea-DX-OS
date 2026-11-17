// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> _openProducts(WidgetTester tester, {String? email}) async {
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
  await tester.tap(find.byKey(const Key('home-menu')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('menu-products')));
  await tester.pumpAndSettle();
}

void main() {
  group('product page with an order button', () {
    testWidgets('a product card opens the product page', (tester) async {
      await _openProducts(tester, email: 'customer@demo.vn');
      await tester.tap(find.byKey(const Key('product-prod-01')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('product-order')), findsOneWidget);
      expect(find.text('Đặt hàng'), findsOneWidget);
      expect(find.text('Giới thiệu'), findsOneWidget);
      expect(find.text('Chè xanh Tân Cương đặc biệt'), findsOneWidget);
      expect(find.byKey(const Key('product-total')), findsOneWidget);
    });

    testWidgets('the quantity changes the total', (tester) async {
      await _openProducts(tester, email: 'customer@demo.vn');
      await tester.tap(find.byKey(const Key('product-prod-01')));
      await tester.pumpAndSettle();
      final one = tester.widget<Text>(find.byKey(const Key('product-total'))).data;
      await tester.tap(find.byKey(const Key('qty-plus')));
      await tester.pump();
      expect(tester.widget<Text>(find.byKey(const Key('qty-count'))).data, '2');
      expect(tester.widget<Text>(find.byKey(const Key('product-total'))).data, isNot(one));
      expect(
        tester
            .widget<IconButton>(
              find.descendant(of: find.byKey(const Key('qty-minus')), matching: find.byType(IconButton)),
            )
            .onPressed,
        isNotNull,
      );
    });

    testWidgets('Đặt hàng puts the product in the cart and opens the checkout', (tester) async {
      await _openProducts(tester, email: 'customer@demo.vn');
      await tester.tap(find.byKey(const Key('product-prod-01')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('qty-plus')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('product-order')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('product-order')), findsNothing);
      expect(find.byKey(const Key('checkout-submit')), findsOneWidget);
      // Two boxes of 180.000 đ: the checkout total is the quantity picked on the product page.
      expect(find.textContaining('360.000'), findsWidgets);
    });

    testWidgets('the page has the Order button only: no cart button and no arrow', (tester) async {
      await _openProducts(tester, email: 'customer@demo.vn');
      await tester.tap(find.byKey(const Key('product-prod-01')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('product-add')), findsNothing);
      expect(find.byKey(const Key('product-cart')), findsNothing);
      expect(find.byIcon(Icons.shopping_cart_outlined), findsNothing);
      expect(find.byIcon(Icons.add_shopping_cart), findsNothing);
      expect(
        find.descendant(of: find.byKey(const Key('product-order')), matching: find.byIcon(Icons.arrow_forward)),
        findsNothing,
      );
      expect(find.text('Đặt hàng'), findsOneWidget);
    });

    testWidgets('a guest who orders is sent to sign in', (tester) async {
      await _openProducts(tester);
      await tester.tap(find.byKey(const Key('product-prod-01')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('product-order')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('login-submit')), findsOneWidget);
    });

    testWidgets('a sold-out product cannot be ordered', (tester) async {
      await _openProducts(tester, email: 'customer@demo.vn');
      await tester.tap(find.byKey(const Key('product-prod-05')));
      await tester.pumpAndSettle();
      expect(find.text('Hết hàng'), findsWidgets);
      expect(tester.widget<FilledButton>(find.byKey(const Key('product-order'))).onPressed, isNull);
    });
  });
}
