// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/core/role/role.dart';
import 'package:hub_mobile/data/auth/jwt_claims.dart';

import 'jwt_test_support.dart';

void main() {
  group('claimsFromAccessToken', () {
    test('reads sub, name, email, htx_code and roles', () {
      final c = claimsFromAccessToken(fakeJwt(roles: ['farmer', 'default-roles-agrimarket']))!;
      expect(c.subject, 'user-1');
      expect(c.name, 'Hoàng Văn Sáng');
      expect(c.email, 'sang@example.test');
      expect(c.htxCode, 'TC');
      expect(c.roles, ['farmer'], reason: 'unknown realm roles are dropped');
    });

    test('maps to the interface with the web priority: manager > officer > farmer', () {
      AppRole role(List<String> roles) => roleFromClaims(claimsFromAccessToken(fakeJwt(roles: roles)));
      expect(role(['farmer']), AppRole.farmer);
      expect(role(['officer', 'farmer']), AppRole.manager);
      expect(role(['farmer', 'manager', 'officer']), AppRole.manager);
      expect(role(['customer']), AppRole.customer);
      expect(role(['customer', 'farmer']), AppRole.farmer);
      final both = claimsFromAccessToken(fakeJwt(roles: ['farmer', 'officer']))!;
      expect(staffRoleOf(both), 'officer');
      expect(staffRoleOf(claimsFromAccessToken(fakeJwt(roles: ['farmer', 'manager', 'officer']))!), 'manager');
      expect(staffRoleOf(claimsFromAccessToken(fakeJwt(roles: ['customer']))!), isNull);
    });

    test('a user with no known role is refused, not treated as a customer', () {
      expect(claimsFromAccessToken(fakeJwt(roles: <String>[])), isNull);
      expect(claimsFromAccessToken(fakeJwt(roles: ['offline_access', 'uma_authorization'])), isNull);
      expect(claimsFromAccessToken(fakeJwt(roles: null)), isNull);
      expect(claimsFromAccessToken(fakeJwt(roles: 'farmer')), isNull, reason: 'roles must be a list');
      expect(claimsFromAccessToken(fakeJwt(roles: ['operator'])), isNull, reason: 'operator role is not decided yet');
    });

    test('falls back to preferred_username, then email, for the display name', () {
      expect(claimsFromAccessToken(fakeJwt(name: null, extra: {'preferred_username': 'sang'}))!.name, 'sang');
      expect(claimsFromAccessToken(fakeJwt(name: null))!.name, 'sang@example.test');
      expect(claimsFromAccessToken(fakeJwt(name: null, email: null))!.name, isNotEmpty);
    });

    test('a missing or empty htx_code is null', () {
      expect(claimsFromAccessToken(fakeJwt(htxCode: null))!.htxCode, isNull);
      expect(claimsFromAccessToken(fakeJwt(htxCode: ''))!.htxCode, isNull);
    });

    test('rubbish is refused without throwing', () {
      for (final bad in ['', 'abc', 'a.b.c', 'a.b', '${fakeJwt()}.x', fakeJwt(sub: '')]) {
        expect(claimsFromAccessToken(bad), isNull, reason: bad);
      }
    });
  });

  test('tokenExpiry reads exp in UTC', () {
    final exp = DateTime.utc(2026, 11, 16, 8, 30);
    expect(tokenExpiry(fakeJwt(exp: exp)), exp);
    expect(tokenExpiry(fakeJwt()), isNull);
    expect(tokenExpiry('nope'), isNull);
  });
}
