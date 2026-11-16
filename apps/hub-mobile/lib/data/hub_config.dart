// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/// Build-time choice of data source, from `--dart-define`:
///   HUB_USE_MOCK=true|false  (default true: sample data, the demo works offline)
///   HUB_API_BASE_URL=...     gateway base URL (the app calls `{base}/api/data/graphql`)
///   HUB_DEV_TOKEN=...        access token pasted from a dev stack; honoured in debug builds only (see DemoAuthService)
///   HUB_DEV_HOUSEHOLD_ID=... household id of that token's farmer (dev only)
class HubConfig {
  const HubConfig({this.useMock = true, this.baseUrl = '', this.devToken = '', this.devHouseholdId = ''});

  factory HubConfig.fromEnvironment() => const HubConfig(
    useMock: bool.fromEnvironment('HUB_USE_MOCK', defaultValue: true),
    baseUrl: String.fromEnvironment('HUB_API_BASE_URL'),
    devToken: String.fromEnvironment('HUB_DEV_TOKEN'),
    devHouseholdId: String.fromEnvironment('HUB_DEV_HOUSEHOLD_ID'),
  );

  final bool useMock;
  final String baseUrl;
  final String devToken;
  final String devHouseholdId;

  /// Real repository only when asked for and an address is given.
  bool get useReal => !useMock && baseUrl.trim().isNotEmpty;

  /// Why the combination cannot start, in Vietnamese, or null when it is fine.
  String? get problem {
    if (!useMock && baseUrl.trim().isEmpty) {
      return 'Đã tắt dữ liệu mẫu (HUB_USE_MOCK=false) nhưng chưa có HUB_API_BASE_URL.';
    }
    final uri = Uri.tryParse(baseUrl.trim());
    if (useReal && (uri == null || !uri.hasScheme || uri.host.isEmpty || !{'http', 'https'}.contains(uri.scheme))) {
      return 'HUB_API_BASE_URL phải là địa chỉ http(s) đầy đủ.';
    }
    return null;
  }
}
