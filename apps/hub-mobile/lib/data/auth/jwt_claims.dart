// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:convert';

import '../../core/role/role.dart';

/// Realm roles accepted for navigation; servers validate actual permissions.
const acceptedRealmRoles = [roleManager, roleOfficer, roleGuide, roleFarmer, roleCustomer];

/// The staff role to act as in Hasura (`x-hasura-role`), by the same priority
/// as the web's `roleFromRealmRoles`: manager > officer > farmer. Null for a
/// customer, who has no access to the core.
String? staffRoleOf(Claims claims) => [roleManager, roleOfficer, roleFarmer].where(claims.hasRole).firstOrNull;

/// Reads the payload of an access token, **without verifying anything**.
///
/// The result is for display (name) and for choosing the interface (role) only.
/// It is not a security decision: the web API verifies the signature, issuer,
/// expiry and `azp` of every token it receives, and Hasura enforces the rows
/// each role may see. A forged payload on the phone gains nothing from them.
///
/// Returns null when [accessToken] is not a JWT with a JSON payload, has no
/// `sub`, or its realm roles contain none of [acceptedRealmRoles] (the user is
/// then refused: a verified account without a known role is not a customer).
/// A user is a `customer` only if the token says so.
Claims? claimsFromAccessToken(String accessToken) {
  final payload = jwtPayload(accessToken);
  if (payload == null) return null;
  final sub = payload['sub'];
  if (sub is! String || sub.isEmpty) return null;

  final realmAccess = payload['realm_access'];
  final rawRoles = realmAccess is Map ? realmAccess['roles'] : null;
  final roles = [
    if (rawRoles is List)
      for (final r in rawRoles)
        if (r is String && acceptedRealmRoles.contains(r)) r,
  ];
  if (roles.isEmpty) return null;

  String text(String key) => payload[key] is String ? payload[key] as String : '';
  final email = text('email');
  final name = [text('name'), text('preferred_username'), email].firstWhere((s) => s.isNotEmpty, orElse: () => '');
  final htx = text('htx_code');
  return Claims(
    subject: sub,
    name: name.isEmpty ? 'Tài khoản HTX' : name,
    email: email,
    roles: roles,
    htxCode: htx.isEmpty ? null : htx,
  );
}

/// Expiry (`exp`) of a token, or null when it has none.
DateTime? tokenExpiry(String accessToken) {
  final exp = jwtPayload(accessToken)?['exp'];
  return exp is num ? DateTime.fromMillisecondsSinceEpoch(exp.toInt() * 1000, isUtc: true) : null;
}

/// Decoded JSON payload (second part) of a JWT; null when it is not one.
Map<String, Object?>? jwtPayload(String token) {
  final parts = token.split('.');
  if (parts.length != 3) return null;
  try {
    final json = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))));
    return json is Map ? json.cast<String, Object?>() : null;
  } catch (_) {
    return null;
  }
}
