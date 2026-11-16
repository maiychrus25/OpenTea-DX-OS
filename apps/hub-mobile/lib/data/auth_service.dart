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

/// What the real repository sends to the gateway: the access token and the
/// Hasura role to act as (`x-hasura-role`; must be one of the token's roles).
class BearerToken {
  const BearerToken(this.token, {this.hasuraRole});
  final String token;
  final String? hasuraRole;
}

/// Sign-in boundary of the app.
///
/// Production plan (NOT implemented yet): Keycloak OIDC authorization code
/// flow with PKCE, public client `dxos-mobile`, system browser, tokens kept in
/// the platform secure storage, roles read from the token. Only the demo
/// implementation exists today.
///
/// [bearerToken] is the extension point of the real repository: the access
/// token for the core, or null when there is none (then the repository shows
/// "đăng nhập lại" instead of calling the server).
abstract class AuthService {
  /// Session restored from a previous run, if any.
  Future<Session?> restore();
  Future<Session> signIn(String email, String password);
  Future<void> signOut();

  /// Token for calls to the core, or null when the user has none.
  Future<BearerToken?> bearerToken();
}
