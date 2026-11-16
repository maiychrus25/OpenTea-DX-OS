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

/// Sign-in boundary of the app. Two implementations: [DemoAuthService]
/// (offline demo accounts) and [KeycloakAuthService] (OIDC authorization code
/// flow with PKCE, public client `dxos-mobile`, system browser, tokens in the
/// platform secure store).
///
/// [bearerToken] is the extension point of the real repository: the access
/// token for the core, or null when there is none (then the repository shows
/// "đăng nhập lại" instead of calling the server).
abstract class AuthService {
  /// True when the login screen asks for email and password (demo accounts);
  /// false when sign-in happens in the system browser (Keycloak).
  bool get usesPasswordForm;

  /// Set by the app. Called when the session ended without the user asking
  /// (the refresh token was refused), after the stored tokens were deleted.
  void Function()? onSessionLost;

  /// Session restored from a previous run, if any.
  Future<Session?> restore();

  /// Demo: checks [email] and [password]. Keycloak: ignores both and opens the browser.
  Future<Session> signIn(String email, String password);
  Future<void> signOut();

  /// Token for calls to the core, or null when the user has none. Renews an
  /// access token that is about to expire.
  Future<BearerToken?> bearerToken();

  /// Asks for a new token after the server answered 401. Returns it, or null
  /// when the session is over (then [onSessionLost] has been called).
  Future<BearerToken?> refreshBearer();
}
