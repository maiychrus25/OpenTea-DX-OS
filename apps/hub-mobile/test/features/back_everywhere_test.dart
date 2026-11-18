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

/// A page the person opened by tapping always has a way back: the round arrow, the AppBar back button, the staff
/// arrow or a close cross.
Finder get _back => find.byWidgetPredicate(
  (w) =>
      w is BackButton ||
      (w.key is ValueKey<String> && const {'back', 'staff-back'}.contains((w.key as ValueKey<String>).value)) ||
      (w is Icon && (w.icon == Icons.close || w.icon == Icons.arrow_back)),
);

Future<GoRouter> _open(WidgetTester tester, String email) async {
  SharedPreferences.setMockInitialValues({});
  final store = await LocalStore.open();
  tester.view.physicalSize = const Size(390, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(HubApp(repository: MockHubRepository(), auth: DemoAuthService(store), store: store));
  await tester.pumpAndSettle();
  await tester.enterText(find.byKey(const Key('login-email')), email);
  await tester.enterText(find.byKey(const Key('login-password')), DemoAuthService.demoPassword);
  await tester.tap(find.byKey(const Key('login-submit')));
  await tester.pumpAndSettle();
  return GoRouter.of(tester.element(find.byType(Scaffold).first));
}

void main() {
  // Pages reached from the home by a tap: pushed on top of it, like in the app. Bottom bar tabs are not listed: they are
  // peers of the home and have no arrow.
  const customerPages = [
    '/shop/products',
    '/shop/cart',
    '/shop/me',
    '/shop/notifications',
    '/shop/news',
    '/shop/htxs',
    '/shop/htx/tan-cuong',
    '/shop/farm/hh-01',
    '/shop/tours/tour-01',
    '/shop/products/prod-01',
    '/shop/booking/tour-01?dep=dep-01',
    '/shop/orders',
    '/shop/orders/ord-01',
    '/shop/tickets',
    '/shop/tickets/bk-01',
    '/shop/visit?household=hh-01',
    '/shop/visit/sent?code=VT-1',
    '/shop/checkout',
    '/shop/pay/TOUR%20K7M2QX',
  ];

  testWidgets('customer pages all have a way back', (tester) async {
    final router = await _open(tester, 'customer@demo.vn');
    final missing = <String>[];
    for (final path in customerPages) {
      router.go('/shop');
      await tester.pumpAndSettle();
      router.push(path);
      await tester.pumpAndSettle();
      if (_back.evaluate().isEmpty) missing.add(path);
    }
    expect(missing, isEmpty, reason: 'no way back on: $missing');
  });

  const staffPages = {
    'farmer@demo.vn': [
      '/farmer/journal/new',
      '/farmer/journal/jr-01',
      '/farmer/schedule',
      '/farmer/bulletin',
      '/farmer/parcels',
      '/farmer/products',
    ],
    'manager@demo.vn': [
      '/manager/members',
      '/manager/households',
      '/manager/households/hh-01',
      '/manager/zones',
      '/manager/lots',
      '/manager/bulletin',
      '/manager/profile',
      '/manager/payments',
      '/manager/products',
      '/manager/articles',
      '/manager/orders/ord-01',
      '/manager/journal/jr-01',
      '/manager/me',
    ],
    'operator@demo.vn': ['/operator/payments', '/operator/bookings/bk-01', '/operator/me'],
  };
  for (final entry in staffPages.entries) {
    testWidgets('${entry.key} pages opened from the home have a way back', (tester) async {
      final router = await _open(tester, entry.key);
      final home = '/${entry.key.split('@').first}';
      final missing = <String>[];
      for (final path in entry.value) {
        router.go(home);
        await tester.pumpAndSettle();
        router.push(path);
        await tester.pumpAndSettle();
        if (_back.evaluate().isEmpty) missing.add(path);
      }
      expect(missing, isEmpty, reason: 'no way back on: $missing');
    });
  }
}
