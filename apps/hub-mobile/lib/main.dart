// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'app/hub_app.dart';
import 'data/core/graphql_client.dart';
import 'data/demo_auth_service.dart';
import 'data/hub_config.dart';
import 'data/hub_repository.dart';
import 'data/http_hub_repository.dart';
import 'data/local_store.dart';
import 'data/mock_hub_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final config = HubConfig.fromEnvironment();
  final problem = config.problem;
  if (problem != null) {
    runApp(_ConfigProblem(problem));
    return;
  }
  final store = await LocalStore.open();
  final auth = DemoAuthService(store, devToken: config.devToken, devHouseholdId: config.devHouseholdId);
  // Default: sample data. The real repository reads the core and keeps the
  // sample repository for the Gian hàng features that have no backend yet.
  final HubRepository repository = config.useReal
      ? HttpHubRepository(
          core: GraphqlClient(baseUrl: config.baseUrl, client: http.Client(), bearer: auth.bearerToken),
          shop: MockHubRepository(),
        )
      : MockHubRepository();
  runApp(HubApp(repository: repository, auth: auth, store: store));
}

class _ConfigProblem extends StatelessWidget {
  const _ConfigProblem(this.message);
  final String message;
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    home: Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text('Cấu hình chưa đúng. $message', textAlign: TextAlign.center),
        ),
      ),
    ),
  );
}
