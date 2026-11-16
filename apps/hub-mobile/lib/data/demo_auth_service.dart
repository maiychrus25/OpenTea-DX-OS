// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import '../core/role/role.dart';
import 'auth_service.dart';
import 'local_store.dart';

/// Offline demo accounts, one per role. These are public demo credentials for
/// the skeleton, not secrets; production replaces this class with Keycloak.
class DemoAuthService implements AuthService {
  DemoAuthService(this._store);
  final LocalStore _store;

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
    final claims = _store.loadSession();
    return claims == null ? null : Session(claims: claims);
  }

  @override
  Future<Session> signIn(String email, String password) async {
    final claims = accounts[email.trim().toLowerCase()];
    if (claims == null || password != demoPassword) {
      throw const AuthException('Email hoặc mật khẩu không đúng');
    }
    await _store.saveSession(claims);
    return Session(claims: claims);
  }

  @override
  Future<void> signOut() => _store.clearSession();
}
