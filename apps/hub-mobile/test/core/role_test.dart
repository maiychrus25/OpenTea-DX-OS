// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/core/role/role.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';

Claims _claims(List<String> roles) => Claims(subject: 's', name: 'n', email: 'e@x.vn', roles: roles);

void main() {
  group('roleFromClaims', () {
    test('no claims is guest', () => expect(roleFromClaims(null), AppRole.guest));
    test('each realm role maps to its interface', () {
      expect(roleFromClaims(_claims([roleCustomer])), AppRole.customer);
      expect(roleFromClaims(_claims([roleFarmer])), AppRole.farmer);
      expect(roleFromClaims(_claims([roleManager])), AppRole.manager);
      expect(roleFromClaims(_claims([roleOfficer])), AppRole.manager);
      expect(roleFromClaims(_claims([roleOperator])), AppRole.operator);
    });
    test('unknown roles fall back to guest', () => expect(roleFromClaims(_claims(['admin'])), AppRole.guest));
    test('highest privilege wins', () {
      expect(roleFromClaims(_claims([roleCustomer, roleManager])), AppRole.manager);
      expect(roleFromClaims(_claims([roleFarmer, roleOperator])), AppRole.operator);
    });
    test('only manager can write; officer is read only', () {
      expect(_claims([roleManager]).canWriteHtx, isTrue);
      expect(_claims([roleOfficer]).canWriteHtx, isFalse);
    });
  });

  group('claims json', () {
    test('round trips', () {
      const c = Claims(subject: 'a', name: 'B', email: 'c@d.vn', roles: [roleFarmer], htxCode: 'h', householdId: 'hh');
      final back = Claims.fromJson(c.toJson());
      expect(back.subject, 'a');
      expect(back.roles, [roleFarmer]);
      expect(back.htxCode, 'h');
      expect(back.householdId, 'hh');
    });
  });

  group('redirectFor', () {
    test('guest browses the storefront freely', () {
      for (final p in ['/shop', '/shop/tours', '/shop/tours/tour-01', '/shop/products', '/shop/cart', '/shop/me']) {
        expect(redirectFor(AppRole.guest, p), isNull, reason: p);
      }
    });
    test('guest is sent to login for anything that needs an account', () {
      for (final p in [
        '/shop/checkout',
        '/shop/orders',
        '/shop/tickets/bk-1',
        '/shop/booking/tour-01',
        '/shop/pay/DH 1',
      ]) {
        expect(redirectFor(AppRole.guest, p), startsWith('/login?from='), reason: p);
      }
    });
    test('guest cannot open staff areas', () {
      for (final p in ['/farmer', '/manager/orders', '/operator']) {
        expect(redirectFor(AppRole.guest, p), '/login', reason: p);
      }
    });
    test('customer may buy but not enter staff areas', () {
      expect(redirectFor(AppRole.customer, '/shop/checkout'), isNull);
      expect(redirectFor(AppRole.customer, '/manager'), '/shop');
      expect(redirectFor(AppRole.customer, '/farmer/visits/x'), '/shop');
    });
    test('each staff role stays in its own area', () {
      expect(redirectFor(AppRole.farmer, '/farmer'), isNull);
      expect(redirectFor(AppRole.farmer, '/manager'), '/farmer');
      expect(redirectFor(AppRole.farmer, '/shop'), '/farmer');
      expect(redirectFor(AppRole.manager, '/manager/bookings'), isNull);
      expect(redirectFor(AppRole.manager, '/operator'), '/manager');
      expect(redirectFor(AppRole.operator, '/operator/articles'), isNull);
      expect(redirectFor(AppRole.operator, '/farmer'), '/operator');
    });
    test('a signed in user skips the login screen', () {
      expect(redirectFor(AppRole.manager, '/login'), '/manager');
      expect(redirectFor(AppRole.guest, '/login'), isNull);
    });
  });

  test('every demo account maps to a distinct expected role', () {
    final roles = {for (final e in DemoAuthService.accounts.entries) e.key: roleFromClaims(e.value)};
    expect(roles['customer@demo.vn'], AppRole.customer);
    expect(roles['farmer@demo.vn'], AppRole.farmer);
    expect(roles['manager@demo.vn'], AppRole.manager);
    expect(roles['officer@demo.vn'], AppRole.manager);
    expect(roles['operator@demo.vn'], AppRole.operator);
    expect(DemoAuthService.accounts['customer@demo.vn']!.htxCode, isNull);
  });
}
