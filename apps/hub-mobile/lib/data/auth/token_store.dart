// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'oidc_client.dart';

/// Where the tokens live between runs. Implementations must be a platform
/// secure store (Android Keystore, iOS Keychain), never `shared_preferences`.
abstract class TokenStore {
  Future<OidcTokens?> read();
  Future<void> write(OidcTokens tokens);
  Future<void> clear();
}

/// [TokenStore] on `flutter_secure_storage`: Android Keystore (AES key) and iOS Keychain.
class SecureTokenStore implements TokenStore {
  SecureTokenStore({FlutterSecureStorage storage = const FlutterSecureStorage()}) : _storage = storage;
  final FlutterSecureStorage _storage;

  static const _key = 'hub_mobile.oidc_tokens';

  @override
  Future<OidcTokens?> read() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null) return null;
      final j = jsonDecode(raw) as Map;
      final access = j['access'];
      if (access is! String || access.isEmpty) return null;
      final expiry = j['expiry'];
      return OidcTokens(
        accessToken: access,
        refreshToken: j['refresh'] as String?,
        accessTokenExpiry: expiry is int ? DateTime.fromMillisecondsSinceEpoch(expiry, isUtc: true) : null,
        idToken: j['id'] as String?,
      );
    } catch (_) {
      // A damaged or unreadable entry means "signed out", not a crash.
      return null;
    }
  }

  @override
  Future<void> write(OidcTokens t) => _storage.write(
    key: _key,
    value: jsonEncode({
      'access': t.accessToken,
      'refresh': t.refreshToken,
      'expiry': t.accessTokenExpiry?.millisecondsSinceEpoch,
      'id': t.idToken,
    }),
  );

  @override
  Future<void> clear() => _storage.delete(key: _key);
}

/// Keeps tokens in memory only. For tests.
class MemoryTokenStore implements TokenStore {
  MemoryTokenStore([this.tokens]);
  OidcTokens? tokens;

  @override
  Future<OidcTokens?> read() async => tokens;
  @override
  Future<void> write(OidcTokens t) async => tokens = t;
  @override
  Future<void> clear() async => tokens = null;
}
