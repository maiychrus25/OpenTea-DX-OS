// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> _pump(WidgetTester tester, {Map<String, Object> prefs = const {}}) async {
  SharedPreferences.setMockInitialValues(prefs);
  final store = await LocalStore.open();
  tester.view.physicalSize = const Size(800, 1800);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(const SizedBox()); // dispose any previous app
  await tester.pumpWidget(HubApp(repository: MockHubRepository(), auth: DemoAuthService(store), store: store));
  await tester.pumpAndSettle();
}

Future<void> _login(WidgetTester tester, String email) async {
  await tester.tap(find.byKey(const Key('welcome-login')));
  await tester.pumpAndSettle();
  await tester.enterText(find.byKey(const Key('login-email')), email);
  await tester.enterText(find.byKey(const Key('login-password')), DemoAuthService.demoPassword);
  await tester.tap(find.byKey(const Key('login-submit')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('first screen offers guest or login', (tester) async {
    await _pump(tester);
    expect(find.text('Xem với tư cách khách'), findsOneWidget);
    expect(find.text('Đăng nhập'), findsOneWidget);
  });

  testWidgets('guest browses news, tours and products', (tester) async {
    await _pump(tester);
    await tester.tap(find.byKey(const Key('welcome-guest')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Vào vụ chè xuân'), findsOneWidget);
    await tester.tap(find.text('Tour').last);
    await tester.pumpAndSettle();
    expect(find.text('Một ngày làm người hái chè'), findsOneWidget);
    await tester.tap(find.text('Sản phẩm').last);
    await tester.pumpAndSettle();
    expect(find.text('Chè móc câu'), findsOneWidget);
  });

  testWidgets('guest can fill the cart but checkout asks to log in, then continues to checkout', (tester) async {
    await _pump(tester);
    await tester.tap(find.byKey(const Key('welcome-guest')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sản phẩm').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('add-prod-01')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Giỏ hàng').last);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('cart-total')), findsOneWidget);
    await tester.tap(find.byKey(const Key('cart-checkout')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('login-submit')), findsOneWidget);
    expect(find.text('Cần đăng nhập để tiếp tục'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('login-email')), 'customer@demo.vn');
    await tester.enterText(find.byKey(const Key('login-password')), DemoAuthService.demoPassword);
    await tester.tap(find.byKey(const Key('login-submit')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('checkout-submit')), findsOneWidget);
  });

  testWidgets('customer checks out with VietQR and sees the QR and the order', (tester) async {
    await _pump(tester);
    await _login(tester, 'customer@demo.vn');
    await tester.tap(find.text('Sản phẩm').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('add-prod-01')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Giỏ hàng').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('cart-checkout')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('checkout-phone')), '0912345678');
    await tester.enterText(find.byKey(const Key('checkout-address')), '12 Nguyễn Trãi, Hà Nội');
    await tester.tap(find.byKey(const Key('checkout-submit')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('pay-qr')), findsOneWidget);
    expect(find.byKey(const Key('pay-amount')), findsOneWidget);
    await tester.tap(find.byKey(const Key('pay-claim')));
    await tester.pumpAndSettle();
    expect(find.text('Khách báo đã chuyển khoản'), findsOneWidget);
  });

  testWidgets('each demo account lands on its own interface', (tester) async {
    final expected = {
      'customer@demo.vn': 'Tin tức',
      'farmer@demo.vn': 'Lịch tham quan',
      'manager@demo.vn': 'Tổng quan',
      'operator@demo.vn': 'Duyệt bài',
    };
    for (final e in expected.entries) {
      await _pump(tester);
      await _login(tester, e.key);
      expect(find.text(e.value), findsWidgets, reason: e.key);
    }
  });

  testWidgets('manager confirms a payment on an order', (tester) async {
    await _pump(tester);
    await _login(tester, 'manager@demo.vn');
    await tester.tap(find.text('Đơn hàng').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('m-order-ord-01')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('confirm-payment')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('confirm-payment')), findsNothing);
    expect(find.text('Đã xác nhận'), findsWidgets);
  });

  testWidgets('officer sees no write buttons', (tester) async {
    await _pump(tester);
    await _login(tester, 'officer@demo.vn');
    await tester.tap(find.text('Đơn hàng').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('m-order-ord-01')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('confirm-payment')), findsNothing);
    expect(find.text('Chỉ xem (cán bộ)'), findsOneWidget);
  });

  testWidgets('farmer checks in a confirmed group of own household', (tester) async {
    await _pump(tester);
    await _login(tester, 'farmer@demo.vn');
    await tester.tap(find.byKey(const Key('visit-bk-01')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('farmer-checkin')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('farmer-checkin')), findsNothing);
    expect(find.text('Đã đến'), findsOneWidget);
  });

  testWidgets('operator approves a pending article', (tester) async {
    await _pump(tester);
    await _login(tester, 'operator@demo.vn');
    await tester.tap(find.text('Duyệt bài').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('approve-art-03')));
    await tester.pumpAndSettle();
    expect(find.text('Không có bài nào chờ duyệt'), findsOneWidget);
  });

  testWidgets('sign out returns to the first screen', (tester) async {
    await _pump(tester);
    await _login(tester, 'customer@demo.vn');
    await tester.tap(find.text('Tài khoản').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('account-logout')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('welcome-guest')), findsOneWidget);
  });
}
