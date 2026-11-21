// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import '../core/role/role.dart';
import 'auth/jwt_claims.dart';
import 'auth/oidc_client.dart';
import 'auth/token_store.dart';
import 'auth_service.dart';

/// Real sign-in: Keycloak OIDC authorization code flow with PKCE (S256), public
/// client `dxos-mobile`, in the system browser. No client secret exists.
///
/// Tokens are kept only in [TokenStore] (the platform secure store) and in
/// memory; they are never logged and never put in an error message.
///
/// The claims shown in the app (name, role) are read from the access token
/// **without verifying it**. They only choose the interface. The web API verifies
/// every token it receives and Hasura enforces which rows a role sees, so a
/// tampered payload on the phone cannot widen access.
///
/// NOT run against a real Keycloak.
class KeycloakAuthService implements AuthService {
  KeycloakAuthService({
    required OidcClient oidc,
    required TokenStore store,
    DateTime Function() now = DateTime.now,
    this.renewBefore = const Duration(seconds: 60),
  }) : _oidc = oidc,
       _store = store,
       _now = now;

  final OidcClient _oidc;
  final TokenStore _store;
  final DateTime Function() _now;

  /// A token that expires within this time is renewed before it is used.
  final Duration renewBefore;

  OidcTokens? _tokens;
  Claims? _claims;
  Future<BearerToken?>? _renewing;

  @override
  bool get usesPasswordForm => false;

  @override
  void Function()? onSessionLost;

  @override
  Future<Session?> restore() async {
    final stored = await _store.read();
    if (stored == null) return null;
    _tokens = stored;
    if (_isDue(stored)) {
      // A refused token ends the session; a network failure keeps it, and the
      // next call renews again.
      if (await _renew(silent: true) == null && _tokens == null) return null;
    }
    final claims = claimsFromAccessToken(_tokens!.accessToken);
    if (claims == null) {
      await _drop();
      return null;
    }
    _claims = claims;
    return Session(claims: claims);
  }

  @override
  Future<Session> signIn(String email, String password) async {
    final OidcTokens tokens;
    try {
      tokens = await _oidc.authorize();
    } on OidcFailure catch (e) {
      throw AuthException(switch (e.kind) {
        OidcFailureKind.cancelled => 'Bạn đã huỷ đăng nhập.',
        OidcFailureKind.rejected => 'Máy chủ từ chối đăng nhập. Thử lại sau.',
        OidcFailureKind.unavailable => 'Không đăng nhập được. Kiểm tra mạng rồi thử lại.',
      });
    }
    final claims = claimsFromAccessToken(tokens.accessToken);
    if (claims == null) {
      // Valid sign-in but no role the app knows (not even `customer`): refused, nothing kept.
      await _drop();
      throw const AuthException('Tài khoản này chưa được cấp quyền dùng ứng dụng. Liên hệ HTX của bạn.');
    }
    _tokens = tokens;
    _claims = claims;
    await _store.write(tokens);
    return Session(claims: claims);
  }

  @override
  Future<void> signOut() => _drop();

  @override
  Future<BearerToken?> bearerToken() async {
    var tokens = _tokens;
    if (tokens == null) return null;
    if (_isDue(tokens)) {
      final renewed = await _renew();
      if (renewed != null) return renewed;
      tokens = _tokens;
      // Renewal failed for a passing reason: an unexpired token is still good.
      if (tokens == null || _isExpired(tokens)) return null;
    }
    return _bearer(tokens);
  }

  @override
  Future<BearerToken?> refreshBearer() => _renew(force: true) ?? Future.value();

  bool _isDue(OidcTokens t) {
    final expiry = t.accessTokenExpiry ?? tokenExpiry(t.accessToken);
    return expiry != null && !expiry.isAfter(_now().add(renewBefore));
  }

  bool _isExpired(OidcTokens t) {
    final expiry = t.accessTokenExpiry ?? tokenExpiry(t.accessToken);
    return expiry != null && !expiry.isAfter(_now());
  }

  BearerToken _bearer(OidcTokens t) {
    final claims = _claims;
    return BearerToken(t.accessToken, hasuraRole: claims == null ? null : staffRoleOf(claims));
  }

  /// One renewal at a time: callers that arrive meanwhile share its result.
  Future<BearerToken?>? _renew({bool force = false, bool silent = false}) {
    final running = _renewing;
    if (running != null) return running;
    final refresh = _tokens?.refreshToken;
    if (refresh == null || refresh.isEmpty) {
      // Nothing to renew with: an expired token ends the session, a live one stays.
      if (force || (_tokens != null && _isExpired(_tokens!))) return _lose(silent);
      return null;
    }
    final run = _doRenew(refresh, silent).whenComplete(() => _renewing = null);
    return _renewing = run;
  }

  Future<BearerToken?> _doRenew(String refresh, bool silent) async {
    try {
      final next = await _oidc.refresh(refresh);
      final tokens = OidcTokens(
        accessToken: next.accessToken,
        // The server may keep the same refresh token.
        refreshToken: next.refreshToken ?? refresh,
        accessTokenExpiry: next.accessTokenExpiry,
        idToken: next.idToken ?? _tokens?.idToken,
      );
      final claims = claimsFromAccessToken(tokens.accessToken);
      if (claims == null) return _lose(silent);
      _tokens = tokens;
      _claims = claims;
      await _store.write(tokens);
      return _bearer(tokens);
    } on OidcFailure catch (e) {
      if (e.kind == OidcFailureKind.rejected) return _lose(silent);
      return null;
    }
  }

  /// The session is over without the user asking: forget the tokens and tell the app.
  Future<BearerToken?> _lose(bool silent) async {
    await _drop();
    if (!silent) onSessionLost?.call();
    return null;
  }

  Future<void> _drop() async {
    _tokens = null;
    _claims = null;
    await _store.clear();
  }
}
