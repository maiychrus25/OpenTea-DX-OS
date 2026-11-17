// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> _open(WidgetTester tester, String route) async {
  SharedPreferences.setMockInitialValues({});
  final store = await LocalStore.open();
  tester.view.physicalSize = const Size(800, 2800);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(HubApp(repository: MockHubRepository(), auth: DemoAuthService(store), store: store));
  await tester.pumpAndSettle();
  await tester.enterText(find.byKey(const Key('login-email')), 'customer@demo.vn');
  await tester.enterText(find.byKey(const Key('login-password')), DemoAuthService.demoPassword);
  await tester.tap(find.byKey(const Key('login-submit')));
  await tester.pumpAndSettle();
  GoRouter.of(tester.element(find.byType(Scaffold).first)).go(route);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the cart changes quantity, removes a line and shows the subtotal', (tester) async {
    await _open(tester, '/shop/products');
    await tester.tap(find.byKey(const Key('add-prod-01')));
    await tester.pumpAndSettle();
    GoRouter.of(tester.element(find.byType(Scaffold).first)).go('/shop/cart');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('cart-line-prod-01')), findsOneWidget);
    expect(find.text('Tạm tính'), findsOneWidget);
    await tester.tap(find.byKey(const Key('cart-plus-prod-01')));
    await tester.pumpAndSettle();
    expect(find.textContaining('360.000'), findsWidgets);
    await tester.tap(find.byKey(const Key('cart-remove-prod-01')));
    await tester.pumpAndSettle();
    expect(find.text('Giỏ hàng đang trống'), findsOneWidget);
  });

  testWidgets('the order list shows the product and the detail shows the timeline and the delivery', (tester) async {
    await _open(tester, '/shop/orders');
    final card = find.byWidgetPredicate(
      (w) => w.key is ValueKey<String> && (w.key as ValueKey<String>).value.startsWith('order-'),
    );
    expect(card, findsWidgets);
    await tester.tap(card.first);
    await tester.pumpAndSettle();
    expect(find.text('Tiến trình đơn hàng'), findsOneWidget);
    expect(find.text('Nhận hàng'), findsOneWidget);
    expect(find.text('Thanh toán'), findsWidgets);
  });

  testWidgets('the ticket page shows the QR and the booking details', (tester) async {
    await _open(tester, '/shop/tickets');
    final card = find.byWidgetPredicate(
      (w) => w.key is ValueKey<String> && (w.key as ValueKey<String>).value.startsWith('ticket-'),
    );
    expect(card, findsWidgets);
    await tester.tap(card.first);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('ticket-qr')), findsOneWidget);
    expect(find.text('Thông tin đặt chỗ'), findsOneWidget);
  });

  testWidgets('the ticket page has no status chip or status row', (tester) async {
    await _open(tester, '/shop/tickets');
    await tester.tap(
      find
          .byWidgetPredicate(
            (w) => w.key is ValueKey<String> && (w.key as ValueKey<String>).value.startsWith('ticket-'),
          )
          .first,
    );
    await tester.pumpAndSettle();
    expect(find.text('Đã xác nhận'), findsNothing);
    expect(find.text('Tình trạng'), findsNothing);
  });

  testWidgets('a ticket opened with go (right after paying) still has a way back', (tester) async {
    await _open(tester, '/shop/tickets/bk-01');
    expect(find.byKey(const Key('ticket-qr')), findsOneWidget);
    expect(find.byType(BackButton), findsOneWidget);
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('ticket-qr')), findsNothing);
    expect(find.text('Lịch trình của tôi'), findsWidgets);
  });

  testWidgets('the account page shows the counters and the shortcuts', (tester) async {
    await _open(tester, '/shop/me');
    // The counters are loaded when the page opens: the demo customer has one order and one ticket.
    expect(find.text('Đơn hàng'), findsOneWidget);
    expect(find.text('Vé tour'), findsOneWidget);
    expect(find.text('Trong giỏ'), findsOneWidget);
    for (final k in ['go-orders', 'go-tickets', 'go-cart', 'go-notifications', 'account-logout']) {
      expect(find.byKey(Key(k)), findsOneWidget, reason: k);
    }
  });
}
