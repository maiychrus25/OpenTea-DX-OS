// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/foundation.dart';

import '../core/role/role.dart';
import 'auth_service.dart';
import 'local_store.dart';

/// Offline demo accounts, one per role. These are public demo credentials for
/// the skeleton, not secrets; production replaces this class with Keycloak.
class DemoAuthService implements AuthService {
  /// [devToken] (from `--dart-define=HUB_DEV_TOKEN`) is only used when
  /// [debugBuild] is true, so a release build can never carry one.
  ///
  /// [devHouseholdId] (`HUB_DEV_HOUSEHOLD_ID`) replaces the demo farmer's
  /// made-up household with a real one, only while a dev token is active.
  DemoAuthService(this._store, {String devToken = '', String devHouseholdId = '', bool debugBuild = kDebugMode})
    : _devToken = debugBuild ? devToken : '',
      _devHouseholdId = debugBuild && devToken.isNotEmpty ? devHouseholdId : '';
  final LocalStore _store;
  final String _devToken;
  final String _devHouseholdId;

  Claims _adapt(Claims c) => _devHouseholdId.isNotEmpty && c.householdId != null
      ? Claims(
          subject: c.subject,
          name: c.name,
          email: c.email,
          roles: c.roles,
          htxCode: c.htxCode,
          householdId: _devHouseholdId,
        )
      : c;
  Claims? _claims;

  static const demoPassword = 'Demo@2026';

  static const accounts = <String, Claims>{
    'customer@demo.vn': Claims(
      subject: 'cus-demo',
      name: 'Nguyễn Thu Hà',
      email: 'customer@demo.vn',
      roles: [roleCustomer],
    ),
    'farmer@demo.vn': Claims(
      subject: 'farmer-demo',
      name: 'Hoàng Văn Sáng',
      email: 'farmer@demo.vn',
      roles: [roleFarmer],
      htxCode: 'tan-cuong',
      householdId: 'hh-01',
    ),
    'manager@demo.vn': Claims(
      subject: 'manager-demo',
      name: 'Lê Thị Hoa',
      email: 'manager@demo.vn',
      roles: [roleManager],
      htxCode: 'tan-cuong',
    ),
    'officer@demo.vn': Claims(
      subject: 'officer-demo',
      name: 'Phạm Quốc Bảo',
      email: 'officer@demo.vn',
      roles: [roleOfficer],
      htxCode: 'tan-cuong',
    ),
    'operator@demo.vn': Claims(
      subject: 'operator-demo',
      name: 'Công ty Lữ hành Xứ Chè',
      email: 'operator@demo.vn',
      roles: [roleOperator],
    ),
  };

  @override
  Future<Session?> restore() async {
    final stored = _store.loadSession();
    final claims = stored == null ? null : _adapt(stored);
    _claims = claims;
    return claims == null ? null : Session(claims: claims);
  }

  @override
  Future<Session> signIn(String email, String password) async {
    final account = accounts[email.trim().toLowerCase()];
    if (account == null || password != demoPassword) {
      throw const AuthException('Email hoặc mật khẩu không đúng');
    }
    final claims = _adapt(account);
    await _store.saveSession(claims);
    _claims = claims;
    return Session(claims: claims);
  }

  @override
  Future<void> signOut() {
    _claims = null;
    return _store.clearSession();
  }

  /// Debug builds only: a token pasted from a dev stack, to try the real
  /// repository by hand. Not a login; Keycloak PKCE replaces this (README).
  @override
  Future<BearerToken?> bearerToken() async {
    final claims = _claims;
    if (_devToken.isEmpty || claims == null) return null;
    final role = [roleManager, roleOfficer, roleFarmer].where(claims.hasRole).firstOrNull;
    return role == null ? null : BearerToken(_devToken, hasuraRole: role);
  }
}
