// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/// Tokens of one sign-in. [accessToken] is what the API receives; [refreshToken]
/// renews it. Neither may ever be logged or shown.
class OidcTokens {
  const OidcTokens({required this.accessToken, this.refreshToken, this.accessTokenExpiry, this.idToken});
  final String accessToken;
  final String? refreshToken;

  /// From the token endpoint's `expires_in`, or the token's `exp` when absent.
  final DateTime? accessTokenExpiry;
  final String? idToken;

  /// Never prints a token, so a stray `print` or exception cannot leak one.
  @override
  String toString() => 'OidcTokens(hidden)';
}

enum OidcFailureKind {
  /// The user closed the browser.
  cancelled,

  /// The server refused (bad or revoked refresh token, `invalid_grant`): the session is over.
  rejected,

  /// Network, timeout or any other failure that may pass: keep the session.
  unavailable,
}

class OidcFailure implements Exception {
  const OidcFailure(this.kind);
  final OidcFailureKind kind;
  @override
  String toString() => 'OidcFailure($kind)';
}

/// What the sign-in needs from an OpenID Connect library. The app uses
/// [AppAuthOidcClient]; tests use a fake.
abstract class OidcClient {
  /// Authorization code flow with PKCE (S256) in the system browser.
  /// Throws [OidcFailure].
  Future<OidcTokens> authorize();

  /// Exchanges [refreshToken] for new tokens. Throws [OidcFailure].
  Future<OidcTokens> refresh(String refreshToken);
}
