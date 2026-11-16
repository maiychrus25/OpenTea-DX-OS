// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/// Build-time choice of data source, from `--dart-define`:
///   HUB_USE_MOCK=true|false  (default true: sample data, the demo works offline)
///   HUB_API_BASE_URL=...     gateway base URL (the app calls `{base}/api/data/graphql`)
///   HUB_KEYCLOAK_ISSUER=...  realm URL, e.g. http://host:8080/realms/agrimarket; with HUB_USE_MOCK=false the app signs in
///                            through Keycloak (client `dxos-mobile`, PKCE) instead of the demo accounts
///   HUB_DEV_TOKEN=...        access token pasted from a dev stack; honoured in debug builds only (see DemoAuthService)
///   HUB_DEV_HOUSEHOLD_ID=... household id of that token's farmer (dev only)
class HubConfig {
  const HubConfig({
    this.useMock = true,
    this.baseUrl = '',
    this.keycloakIssuer = '',
    this.devToken = '',
    this.devHouseholdId = '',
  });

  factory HubConfig.fromEnvironment() => const HubConfig(
    useMock: bool.fromEnvironment('HUB_USE_MOCK', defaultValue: true),
    baseUrl: String.fromEnvironment('HUB_API_BASE_URL'),
    keycloakIssuer: String.fromEnvironment('HUB_KEYCLOAK_ISSUER'),
    devToken: String.fromEnvironment('HUB_DEV_TOKEN'),
    devHouseholdId: String.fromEnvironment('HUB_DEV_HOUSEHOLD_ID'),
  );

  final bool useMock;
  final String baseUrl;
  final String keycloakIssuer;
  final String devToken;
  final String devHouseholdId;

  /// Real repository only when asked for and an address is given.
  bool get useReal => !useMock && baseUrl.trim().isNotEmpty;

  /// Real mode signs in through Keycloak unless a debug dev token stands in for it.
  /// A dev token wins so the debug-only path keeps working as before.
  bool get useKeycloak => useReal && keycloakIssuer.trim().isNotEmpty && devToken.isEmpty;

  /// Why the combination cannot start, in Vietnamese, or null when it is fine.
  String? get problem {
    if (!useMock && baseUrl.trim().isEmpty) {
      return 'Đã tắt dữ liệu mẫu (HUB_USE_MOCK=false) nhưng chưa có HUB_API_BASE_URL.';
    }
    final uri = Uri.tryParse(baseUrl.trim());
    if (useReal && (uri == null || !uri.hasScheme || uri.host.isEmpty || !{'http', 'https'}.contains(uri.scheme))) {
      return 'HUB_API_BASE_URL phải là địa chỉ http(s) đầy đủ.';
    }
    if (useReal && keycloakIssuer.trim().isEmpty && devToken.isEmpty) {
      return 'Đã tắt dữ liệu mẫu nhưng chưa có HUB_KEYCLOAK_ISSUER (hoặc HUB_DEV_TOKEN ở bản debug).';
    }
    final issuer = Uri.tryParse(keycloakIssuer.trim());
    if (keycloakIssuer.trim().isNotEmpty &&
        (issuer == null || !issuer.hasScheme || issuer.host.isEmpty || !{'http', 'https'}.contains(issuer.scheme))) {
      return 'HUB_KEYCLOAK_ISSUER phải là địa chỉ http(s) đầy đủ của realm.';
    }
    return null;
  }
}
