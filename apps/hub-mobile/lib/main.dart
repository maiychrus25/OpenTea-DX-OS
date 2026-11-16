// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/widgets.dart';

import 'app/hub_app.dart';
import 'data/demo_auth_service.dart';
import 'data/local_store.dart';
import 'data/mock_hub_repository.dart';

// TODO: base URL of the platform gateway for the real API client (milestone M2).
// Not used yet: the app runs on MockHubRepository and DemoAuthService.
const apiBaseUrl = String.fromEnvironment('HUB_API_BASE_URL');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final store = await LocalStore.open();
  runApp(HubApp(repository: MockHubRepository(), auth: DemoAuthService(store), store: store));
}
