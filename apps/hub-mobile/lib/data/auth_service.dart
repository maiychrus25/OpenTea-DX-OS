// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import '../core/role/role.dart';

class AuthException implements Exception {
  const AuthException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// A signed-in user. In production [claims] are decoded from the Keycloak token.
class Session {
  const Session({required this.claims});
  final Claims claims;
  AppRole get role => roleFromClaims(claims);
}

/// Sign-in boundary of the app.
///
/// Production plan (NOT implemented yet): Keycloak OIDC authorization code
/// flow with PKCE, public client `dxos-mobile`, system browser, tokens kept in
/// the platform secure storage, roles read from the token. Only the demo
/// implementation exists today.
abstract class AuthService {
  /// Session restored from a previous run, if any.
  Future<Session?> restore();
  Future<Session> signIn(String email, String password);
  Future<void> signOut();
}
