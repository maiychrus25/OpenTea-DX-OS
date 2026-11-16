// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/core/role/role.dart';
import 'package:hub_mobile/data/auth_service.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/models/cart.dart';
import 'package:hub_mobile/data/models/order.dart';
import 'package:hub_mobile/data/seed_data.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<LocalStore> _open([Map<String, Object> initial = const {}]) async {
  SharedPreferences.setMockInitialValues(initial);
  return LocalStore.open();
}

void main() {
  test('cart survives a restart (second store over the same prefs)', () async {
    final store = await _open();
    await store.saveCart(const [
      CartLine(productId: 'p1', htxCode: 'a', name: 'Chè', unit: 'hộp', unitPrice: 100000, quantity: 2),
    ]);
    final again = LocalStore(await SharedPreferences.getInstance());
    final lines = again.loadCart();
    expect(lines.single.name, 'Chè');
    expect(lines.single.quantity, 2);
  });

  test('orders and tickets are saved per user', () async {
    final store = await _open();
    final orders = SeedData.orders(DateTime(2026, 11, 16));
    final bookings = SeedData.bookings(DateTime(2026, 11, 16));
    await store.saveOrders('u1', orders);
    await store.saveBookings('u1', bookings);
    expect(store.loadOrders('u1').length, orders.length);
    expect(store.loadOrders('u1').first.lines.first.name, orders.first.lines.first.name);
    expect(store.loadOrders('u1').first.method, PaymentMethod.vietQr);
    expect(store.loadBookings('u1').first.code, bookings.first.code);
    expect(store.loadBookings('u1').first.departureDate, bookings.first.departureDate);
    expect(store.loadOrders('u2'), isEmpty);
    expect(store.loadBookings('u2'), isEmpty);
  });

  test('corrupt stored data yields an empty list instead of a crash', () async {
    final store = await _open({'cart.v1': '{not json', 'orders.v1.u1': '[{"id":1}]'});
    expect(store.loadCart(), isEmpty);
    expect(store.loadOrders('u1'), isEmpty);
  });

  test('demo session is saved, restored and cleared', () async {
    final store = await _open();
    final auth = DemoAuthService(store);
    expect(await auth.restore(), isNull);
    final session = await auth.signIn('Manager@Demo.vn ', DemoAuthService.demoPassword);
    expect(session.role, AppRole.manager);
    final restored = await DemoAuthService(store).restore();
    expect(restored?.claims.email, 'manager@demo.vn');
    expect(restored?.claims.htxCode, 'tan-cuong');
    await auth.signOut();
    expect(await auth.restore(), isNull);
  });

  test('wrong password or unknown email is refused', () async {
    final auth = DemoAuthService(await _open());
    await expectLater(auth.signIn('customer@demo.vn', 'wrong'), throwsA(isA<AuthException>()));
    await expectLater(auth.signIn('nobody@demo.vn', DemoAuthService.demoPassword), throwsA(isA<AuthException>()));
  });
}
