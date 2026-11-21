// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../auth_service.dart';
import 'core_exception.dart';

/// Source of the bearer token for each call. Production: the Keycloak access
/// token of client `dxos-mobile` (not implemented yet, see [AuthService]).
typedef BearerProvider = Future<BearerToken?> Function();

/// Asks the auth service for a new token after a 401; null when the session is over.
typedef BearerRefresher = Future<BearerToken?> Function();

/// GraphQL over HTTP to the core: Hasura behind the APISIX gateway.
///
/// Same contract as `apps/web/src/infrastructure/core/core-gateway.client.ts`:
/// `POST {base}/api/data/graphql`, header `Authorization: Bearer <token>`,
/// header `x-hasura-role`, JSON body `{query, variables}`.
///
/// Security note: this client is only transport. The real guard is Hasura's
/// row permissions in `platform/hasura/metadata` (farmer: own household by
/// `keycloak_user_id`; manager/officer: the HTX of the token's `htx_code`).
/// Filters added by callers narrow the result for the screen; they are never
/// what keeps one household's data away from another.
class GraphqlClient {
  GraphqlClient({
    required String baseUrl,
    required http.Client client,
    required BearerProvider bearer,
    BearerRefresher? refresh,
    this.timeout = const Duration(seconds: 10),
  }) : _client = client,
       _bearer = bearer,
       _refresh = refresh,
       endpoint = Uri.parse('${baseUrl.replaceFirst(RegExp(r'/+$'), '')}/api/data/graphql');

  final Uri endpoint;
  final Duration timeout;
  final http.Client _client;
  final BearerProvider _bearer;
  final BearerRefresher? _refresh;

  /// Runs [query] and returns its `data` object. Throws [CoreException] with a
  /// Vietnamese message for every failure.
  ///
  /// On a 401 (or a Hasura invalid-jwt error) it asks for a new token once and
  /// repeats the request; if that fails too the user must sign in again.
  Future<Map<String, Object?>> query(String query, {Map<String, Object?> variables = const {}}) async {
    final bearer = await _bearer();
    if (bearer == null || bearer.token.isEmpty) throw const CoreException.unauthorized();
    try {
      return await _run(bearer, query, variables);
    } on CoreException catch (e) {
      final refresh = _refresh;
      if (e.kind != CoreErrorKind.unauthorized || refresh == null) rethrow;
      final fresh = await refresh();
      if (fresh == null || fresh.token.isEmpty) rethrow;
      return _run(fresh, query, variables);
    }
  }

  Future<Map<String, Object?>> _run(BearerToken bearer, String query, Map<String, Object?> variables) async {
    final http.Response response;
    try {
      response = await _client
          .post(
            endpoint,
            headers: {
              'Authorization': 'Bearer ${bearer.token}',
              if (bearer.hasuraRole != null) 'x-hasura-role': bearer.hasuraRole!,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: jsonEncode({'query': query, 'variables': variables}),
          )
          .timeout(timeout);
    } on CoreException {
      rethrow;
    } catch (_) {
      // Timeout, DNS, refused connection, TLS: one clear message, no raw text.
      throw const CoreException.network();
    }

    final status = response.statusCode;
    if (status == 401) throw const CoreException.unauthorized();
    if (status == 403) throw const CoreException.forbidden();
    if (status >= 500) throw CoreException.server(status);

    final Object? body;
    try {
      body = jsonDecode(utf8.decode(response.bodyBytes));
    } catch (_) {
      throw status >= 400 ? const CoreException.graphql() : const CoreException.badResponse();
    }
    if (body is! Map) throw const CoreException.badResponse();

    final errors = body['errors'];
    if (errors is List && errors.isNotEmpty) throw _fromGraphqlErrors(errors);
    if (status >= 400) throw const CoreException.graphql();

    final data = body['data'];
    if (data is! Map) throw const CoreException.badResponse();
    return data.cast<String, Object?>();
  }

  /// Hasura reports bad or expired tokens as GraphQL errors with a code, often
  /// with HTTP 200, so the code decides, not the status.
  static CoreException _fromGraphqlErrors(List<Object?> errors) {
    for (final e in errors) {
      if (e is! Map) continue;
      final extensions = e['extensions'];
      final code = extensions is Map ? extensions['code'] : null;
      switch (code) {
        case 'invalid-jwt' || 'jwt-missing-role-claims' || 'jwt-invalid-claims':
          return const CoreException.unauthorized();
        case 'access-denied':
          return const CoreException.forbidden();
      }
    }
    return const CoreException.graphql();
  }

  void close() => _client.close();
}
