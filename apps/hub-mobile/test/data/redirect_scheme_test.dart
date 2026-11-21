// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/data/auth/appauth_oidc_client.dart';

void main() {
  // Keycloak refuses a client whose redirect URI has a scheme outside RFC 3986 (an underscore, for example), which
  // makes the whole realm import fail. The same scheme must appear in the Dart constant, Android and iOS.
  final scheme = Uri.parse(keycloakRedirectUri).scheme;

  test('the redirect scheme is a valid RFC 3986 scheme', () {
    expect(RegExp(r'^[A-Za-z][A-Za-z0-9+.-]*$').hasMatch(scheme), isTrue, reason: scheme);
    expect(keycloakRedirectUri, '$scheme:/oauth2redirect');
  });

  test('Android and iOS register the same scheme', () {
    final gradle = File('android/app/build.gradle.kts').readAsStringSync();
    expect(gradle, contains('manifestPlaceholders["appAuthRedirectScheme"] = "$scheme"'));
    final plist = File('ios/Runner/Info.plist').readAsStringSync();
    expect(plist, contains('<string>$scheme</string>'));
  });
}
