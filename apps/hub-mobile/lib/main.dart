// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'app/hub_app.dart';
import 'data/auth/appauth_oidc_client.dart';
import 'data/auth/token_store.dart';
import 'data/auth_service.dart';
import 'data/core/graphql_client.dart';
import 'data/core/hub_api_client.dart';
import 'data/demo_auth_service.dart';
import 'data/hub_config.dart';
import 'data/hub_repository.dart';
import 'data/http_hub_repository.dart';
import 'data/keycloak_auth_service.dart';
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
  // Mock mode and the debug dev token keep the demo accounts; real mode with an
  // issuer signs in through Keycloak (PKCE, tokens in the platform secure store).
  final AuthService auth = config.useKeycloak
      ? KeycloakAuthService(
          oidc: AppAuthOidcClient(
            issuer: config.keycloakIssuer.trim(),
            // Plain http only for a dev stack in a debug build; release builds stay on https.
            allowInsecureConnections: kDebugMode && config.keycloakIssuer.trim().startsWith('http://'),
          ),
          store: SecureTokenStore(),
        )
      : DemoAuthService(store, devToken: config.devToken, devHouseholdId: config.devHouseholdId);
  // Default: sample data. The real repository reads the core and keeps the
  // sample repository for the Gian hàng features that have no backend yet.
  final HubRepository repository;
  if (config.useReal) {
    final client = http.Client();
    repository = HttpHubRepository(
      core: GraphqlClient(
        baseUrl: config.baseUrl,
        client: client,
        bearer: auth.bearerToken,
        refresh: auth.refreshBearer,
      ),
      api: HubApiClient(baseUrl: config.baseUrl, client: client, bearer: auth.bearerToken, refresh: auth.refreshBearer),
      shop: MockHubRepository(),
    );
  } else {
    repository = MockHubRepository();
  }
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
