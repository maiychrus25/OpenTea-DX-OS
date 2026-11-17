// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hub_mobile/app/activity_controller.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:hub_mobile/data/seed_data.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> _pump(WidgetTester tester, {Map<String, Object> prefs = const {}}) async {
  SharedPreferences.setMockInitialValues(prefs);
  final store = await LocalStore.open();
  tester.view.physicalSize = const Size(800, 2800);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(const SizedBox()); // dispose any previous app
  await tester.pumpWidget(HubApp(repository: MockHubRepository(), auth: DemoAuthService(store), store: store));
  await tester.pumpAndSettle();
}

Future<void> _login(WidgetTester tester, String email) async {
  await tester.enterText(find.byKey(const Key('login-email')), email);
  await tester.enterText(find.byKey(const Key('login-password')), DemoAuthService.demoPassword);
  await tester.tap(find.byKey(const Key('login-submit')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('first screen offers guest or login', (tester) async {
    await _pump(tester);
    expect(find.text('Tiếp tục khám phá'), findsOneWidget);
    expect(find.byKey(const Key('login-submit')), findsOneWidget);
  });

  testWidgets('guest browses home, tours, products and news', (tester) async {
    await _pump(tester);
    await tester.tap(find.byKey(const Key('login-guest')));
    await tester.pumpAndSettle();
    expect(find.text('Khám phá ngay ›'), findsOneWidget);
    await tester.tap(find.byKey(const Key('home-explore')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('tour-tour-01')), findsOneWidget);
    await tester.tap(find.byKey(const Key('back')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('cat-products')));
    await tester.pumpAndSettle();
    expect(find.text('Chè móc câu'), findsOneWidget);
    await tester.tap(find.byKey(const Key('back')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('home-news')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Vào vụ chè xuân'), findsOneWidget);
  });

  testWidgets('guest can fill the cart but checkout asks to log in, then continues to checkout', (tester) async {
    await _pump(tester);
    await tester.tap(find.byKey(const Key('login-guest')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('cat-products')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('add-prod-01')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('back')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('home-cart')));
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

  testWidgets('customer checks out paying on delivery: no QR, goes to the order', (tester) async {
    await _pump(tester);
    await _login(tester, 'customer@demo.vn');
    await tester.tap(find.byKey(const Key('cat-products')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('add-prod-01')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('back')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('home-cart')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('cart-checkout')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('checkout-total')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('checkout-phone')), '0912345678');
    await tester.enterText(find.byKey(const Key('checkout-address')), '12 Nguyễn Trãi, Hà Nội');
    await tester.ensureVisible(find.byKey(const Key('method-cod')));
    await tester.tap(find.byKey(const Key('method-cod')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('checkout-submit')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('pay-qr')), findsNothing);
    expect(find.byKey(const Key('checkout-submit')), findsNothing);
  });

  testWidgets('customer checks out with VietQR and sees the QR and the order', (tester) async {
    await _pump(tester);
    await _login(tester, 'customer@demo.vn');
    await tester.tap(find.byKey(const Key('cat-products')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('add-prod-01')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('back')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('home-cart')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('cart-checkout')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('checkout-phone')), '0912345678');
    await tester.enterText(find.byKey(const Key('checkout-address')), '12 Nguyễn Trãi, Hà Nội');
    await tester.tap(find.byKey(const Key('checkout-submit')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('pay-qr')), findsOneWidget);
    expect(find.byKey(const Key('pay-amount')), findsOneWidget);
    // A product order is paid to the cooperative.
    expect(find.text('HTX CHE TAN CUONG'), findsOneWidget);
    expect(find.text('8600201001234'), findsOneWidget);
    expect(find.textContaining('Hợp tác xã xác nhận khi tiền về'), findsOneWidget);
    expect(find.text(SeedData.tourCompany.bankAccount), findsNothing);
    await tester.tap(find.byKey(const Key('pay-claim')));
    await tester.pumpAndSettle();
    expect(find.text('Khách báo đã chuyển khoản'), findsOneWidget);
  });

  testWidgets('a tour booking is paid to the travel company, not to the cooperative', (tester) async {
    await _pump(tester);
    await _login(tester, 'customer@demo.vn');
    final context = tester.element(find.byType(Scaffold).first);
    await tester.runAsync(() => context.read<ActivityController>().refresh()); // bookings of the demo customer
    GoRouter.of(context).go('/shop/pay/${Uri.encodeComponent('TOUR K7M2QX')}');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('pay-qr')), findsOneWidget);
    expect(find.text(SeedData.tourCompany.name), findsOneWidget);
    expect(find.text(SeedData.tourCompany.accountHolder), findsOneWidget);
    expect(find.text(SeedData.tourCompany.bankAccount), findsOneWidget);
    expect(find.text('MB'), findsOneWidget);
    expect(find.textContaining('Vé được xác nhận ngay'), findsOneWidget);
    expect(find.text('HTX CHE TAN CUONG'), findsNothing);
    expect(find.text('8600201001234'), findsNothing);
  });

  testWidgets('each demo account lands on its own interface', (tester) async {
    final expected = {
      'customer@demo.vn': 'Khám phá ngay ›',
      'farmer@demo.vn': 'Tình trạng thửa đất',
      'manager@demo.vn': 'Tổng quan',
      'operator@demo.vn': 'Duyệt bài',
    };
    for (final e in expected.entries) {
      await _pump(tester);
      await _login(tester, e.key);
      if (e.key == 'farmer@demo.vn') await tester.scrollUntilVisible(find.text(e.value), 300);
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

  testWidgets('farmer has no tour pages: no visits, no check-in', (tester) async {
    await _pump(tester);
    await _login(tester, 'farmer@demo.vn');
    expect(find.text('Lịch tham quan'), findsNothing);
    expect(find.byKey(const Key('visit-bk-01')), findsNothing);
    final router = GoRouter.of(tester.element(find.byType(Scaffold).first));
    router.go('/farmer/visits/bk-01');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('farmer-checkin')), findsNothing);
    expect(find.byKey(const Key('operator-checkin')), findsNothing);
  });

  testWidgets('operator checks in a confirmed group', (tester) async {
    await _pump(tester);
    await _login(tester, 'operator@demo.vn');
    GoRouter.of(tester.element(find.byType(Scaffold).first)).go('/operator/bookings');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('op-booking-bk-01')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('confirm-payment')), findsNothing); // already paid
    await tester.tap(find.byKey(const Key('operator-checkin')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('operator-checkin')), findsNothing);
    expect(find.text('Đã đến'), findsOneWidget);
    expect(find.byKey(const Key('cancel-booking')), findsNothing); // a group that arrived cannot be cancelled
  });

  testWidgets('operator confirms the money of a booking and it shows in the tour ledger', (tester) async {
    await _pump(tester);
    await _login(tester, 'operator@demo.vn');
    final router = GoRouter.of(tester.element(find.byType(Scaffold).first));
    router.go('/operator/bookings');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('op-booking-bk-02')));
    await tester.pumpAndSettle();
    expect(find.text('Trần Minh Đức · 0987654321'), findsOneWidget);
    expect(find.byKey(const Key('operator-checkin')), findsNothing); // not confirmed yet
    await tester.tap(find.byKey(const Key('confirm-payment')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('confirm-payment')), findsNothing);
    expect(find.text('Đã xác nhận'), findsWidgets);
    expect(find.byKey(const Key('operator-checkin')), findsOneWidget);
    router.go('/operator/payments');
    await tester.pumpAndSettle();
    expect(find.text('TOUR P3N8ZD'), findsOneWidget);
  });

  testWidgets('operator cancels a booking after confirming in the dialog', (tester) async {
    await _pump(tester);
    await _login(tester, 'operator@demo.vn');
    GoRouter.of(tester.element(find.byType(Scaffold).first)).go('/operator/bookings/bk-03');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('cancel-booking')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('cancel-booking-keep')));
    await tester.pumpAndSettle();
    expect(find.text('Chờ xác nhận'), findsOneWidget); // "Không" keeps it
    await tester.tap(find.byKey(const Key('cancel-booking')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('cancel-booking-confirm')));
    await tester.pumpAndSettle();
    expect(find.text('Đã huỷ'), findsOneWidget);
    expect(find.byKey(const Key('cancel-booking')), findsNothing);
    expect(find.byKey(const Key('confirm-payment')), findsNothing);
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
    await tester.tap(find.text('Tài khoản').first);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('account-logout')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('login-guest')), findsOneWidget);
  });
}
