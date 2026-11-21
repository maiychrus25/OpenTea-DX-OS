// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:convert';

import 'package:hub_mobile/data/auth/oidc_client.dart';
import 'package:hub_mobile/data/auth/token_store.dart';

String _b64(Object? json) => base64Url.encode(utf8.encode(jsonEncode(json))).replaceAll('=', '');

/// An UNSIGNED test token: header, payload and a dummy signature. The app never
/// verifies signatures (the server does), so this is enough to test parsing.
String fakeJwt({
  String sub = 'user-1',
  Object? roles = const ['farmer'],
  String? name = 'Hoàng Văn Sáng',
  String? email = 'sang@example.test',
  String? htxCode = 'TC',
  DateTime? exp,
  Map<String, Object?> extra = const {},
}) {
  final payload = <String, Object?>{
    'sub': ?sub.isEmpty ? null : sub,
    'name': ?name,
    'email': ?email,
    'htx_code': ?htxCode,
    'exp': ?(exp == null ? null : exp.millisecondsSinceEpoch ~/ 1000),
    if (roles != null) 'realm_access': {'roles': roles},
    ...extra,
  };
  return '${_b64({'alg': 'RS256', 'kid': 'k1'})}.${_b64(payload)}.c2ln';
}

/// Fake OIDC library: answers from queues and records the calls.
class FakeOidc implements OidcClient {
  final authorizeResults = <Object>[];
  final refreshResults = <Object>[];
  final refreshCalls = <String>[];
  var authorizeCalls = 0;

  Future<OidcTokens> _next(List<Object> q) async {
    final r = q.removeAt(0);
    if (r is OidcTokens) return r;
    throw r;
  }

  @override
  Future<OidcTokens> authorize() {
    authorizeCalls++;
    return _next(authorizeResults);
  }

  @override
  Future<OidcTokens> refresh(String refreshToken) {
    refreshCalls.add(refreshToken);
    return _next(refreshResults);
  }
}

/// A store that remembers every write, to check what reached the "secure" store.
class SpyTokenStore extends MemoryTokenStore {
  SpyTokenStore([super.tokens]);
  var clears = 0;
  @override
  Future<void> clear() async {
    clears++;
    await super.clear();
  }
}
