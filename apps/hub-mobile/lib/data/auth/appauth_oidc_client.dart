// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/services.dart';
import 'package:flutter_appauth/flutter_appauth.dart';

import 'oidc_client.dart';

/// Keycloak public client of the mobile apps (PKCE, no secret).
const keycloakClientId = 'dxos-mobile';

/// Redirect URI registered for this app on the client; the same value is the
/// `appAuthRedirectScheme` placeholder in android/app/build.gradle.kts and a
/// URL scheme in ios/Runner/Info.plist.
const keycloakRedirectUri = 'vn.opentea.hubmobile:/oauth2redirect';
const keycloakScopes = ['openid', 'profile', 'email'];

/// [OidcClient] on the native AppAuth libraries (AppAuth-Android, AppAuth-iOS).
/// No Google Play services. PKCE S256 is what `flutter_appauth` sends by default.
///
/// NOT run against a real Keycloak or on a device.
class AppAuthOidcClient implements OidcClient {
  AppAuthOidcClient({
    required this.issuer,
    this.allowInsecureConnections = false,
    FlutterAppAuth appAuth = const FlutterAppAuth(),
  }) : _appAuth = appAuth;

  /// Realm URL, e.g. `https://host/realms/agrimarket`; endpoints come from its discovery document.
  final String issuer;

  /// Debug builds against a plain-http dev stack only.
  final bool allowInsecureConnections;
  final FlutterAppAuth _appAuth;

  @override
  Future<OidcTokens> authorize() async {
    try {
      final r = await _appAuth.authorizeAndExchangeCode(
        AuthorizationTokenRequest(
          keycloakClientId,
          keycloakRedirectUri,
          issuer: issuer,
          scopes: keycloakScopes,
          allowInsecureConnections: allowInsecureConnections,
        ),
      );
      return _tokens(r.accessToken, r.refreshToken, r.accessTokenExpirationDateTime, r.idToken);
    } catch (e) {
      throw _failure(e);
    }
  }

  @override
  Future<OidcTokens> refresh(String refreshToken) async {
    try {
      final r = await _appAuth.token(
        TokenRequest(
          keycloakClientId,
          keycloakRedirectUri,
          issuer: issuer,
          refreshToken: refreshToken,
          scopes: keycloakScopes,
          allowInsecureConnections: allowInsecureConnections,
        ),
      );
      return _tokens(r.accessToken, r.refreshToken, r.accessTokenExpirationDateTime, r.idToken);
    } catch (e) {
      throw _failure(e);
    }
  }

  static OidcTokens _tokens(String? access, String? refresh, DateTime? expiry, String? id) {
    if (access == null || access.isEmpty) throw const OidcFailure(OidcFailureKind.unavailable);
    return OidcTokens(accessToken: access, refreshToken: refresh, accessTokenExpiry: expiry, idToken: id);
  }

  /// Sorts a library error without keeping its text (it may echo request data).
  /// A user cancel is `USER_CANCELLED`/`CANCELLED`; a refused refresh token carries
  /// `invalid_grant`. The exact codes are NOT verified on a device; anything
  /// unrecognised is treated as passing, so a session is never dropped by mistake.
  static OidcFailure _failure(Object e) {
    if (e is OidcFailure) return e;
    if (e is PlatformException) {
      final text = '${e.code} ${e.message} ${e.details}'.toLowerCase();
      if (text.contains('cancel')) return const OidcFailure(OidcFailureKind.cancelled);
      if (text.contains('invalid_grant')) return const OidcFailure(OidcFailureKind.rejected);
    }
    return const OidcFailure(OidcFailureKind.unavailable);
  }
}
