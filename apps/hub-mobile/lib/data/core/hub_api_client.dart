// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart' show MediaType;

import '../auth_service.dart';
import 'core_exception.dart';
import 'graphql_client.dart' show BearerProvider, BearerRefresher;

/// JSON calls to the web API (`{base}/api/...`) with `Authorization: Bearer`.
///
/// Used for the writes the web exposes to mobile apps (see "Bearer token (mobile
/// apps)" in `docs/api-contract.md`): journal and notification routes. The web
/// verifies the token and the role; nothing here is a security check.
///
/// Answers are `{data: ...}` or `{error: {code, message}}`. Only the error
/// `code` is read; the server's text, the token and the request body never end
/// up in an exception.
class HubApiClient {
  HubApiClient({
    required String baseUrl,
    required http.Client client,
    required BearerProvider bearer,
    BearerRefresher? refresh,
    this.timeout = const Duration(seconds: 15),
  }) : _client = client,
       _bearer = bearer,
       _refresh = refresh,
       _base = baseUrl.replaceFirst(RegExp(r'/+$'), '');

  final String _base;
  final Duration timeout;
  final http.Client _client;
  final BearerProvider _bearer;
  final BearerRefresher? _refresh;

  /// Sends [method] [path] with an optional JSON [body] and returns the `data` of the answer.
  ///
  /// On 401 it asks for a new token once and repeats the request; a second 401,
  /// or no new token, throws [CoreException.unauthorized] (sign in again).
  Future<Object?> send(String method, String path, {Map<String, Object?>? body}) async {
    final first = await _bearer();
    if (first == null || first.token.isEmpty) throw const CoreException.unauthorized();

    var response = await _once(first, method, path, body);
    if (response.statusCode == 401) {
      final refresh = _refresh;
      final fresh = refresh == null ? null : await refresh();
      if (fresh == null || fresh.token.isEmpty) throw const CoreException.unauthorized();
      response = await _once(fresh, method, path, body);
    }
    return _result(response);
  }

  /// Sends a `multipart/form-data` POST with text [fields] and one file, and returns the `data` of the answer.
  /// Same token handling as [send]: one refresh on 401.
  Future<Object?> sendFile(
    String path, {
    required Map<String, String> fields,
    required String fileField,
    required List<int> bytes,
    required String filename,
    required String contentType,
  }) async {
    Future<http.Response> once(BearerToken bearer) async {
      final request = http.MultipartRequest('POST', Uri.parse('$_base$path'))
        ..headers.addAll({'Authorization': 'Bearer ${bearer.token}', 'Accept': 'application/json'})
        ..fields.addAll(fields)
        ..files.add(
          http.MultipartFile.fromBytes(fileField, bytes, filename: filename, contentType: MediaType.parse(contentType)),
        );
      try {
        // A photo takes longer than a JSON call: twice the usual wait.
        return await http.Response.fromStream(await _client.send(request).timeout(timeout * 2));
      } catch (_) {
        throw const CoreException.network();
      }
    }

    final first = await _bearer();
    if (first == null || first.token.isEmpty) throw const CoreException.unauthorized();
    var response = await once(first);
    if (response.statusCode == 401) {
      final refresh = _refresh;
      final fresh = refresh == null ? null : await refresh();
      if (fresh == null || fresh.token.isEmpty) throw const CoreException.unauthorized();
      response = await once(fresh);
    }
    return _result(response);
  }

  Future<http.Response> _once(BearerToken bearer, String method, String path, Map<String, Object?>? body) async {
    final request = http.Request(method, Uri.parse('$_base$path'))
      ..headers.addAll({
        'Authorization': 'Bearer ${bearer.token}',
        'Accept': 'application/json',
        if (body != null) 'Content-Type': 'application/json',
      });
    if (body != null) request.body = jsonEncode(body);
    try {
      return await http.Response.fromStream(await _client.send(request).timeout(timeout));
    } catch (_) {
      // Timeout, DNS, refused connection, TLS: one clear message, no raw text.
      throw const CoreException.network();
    }
  }

  Object? _result(http.Response response) {
    final status = response.statusCode;
    final decoded = _json(response);
    if (status >= 200 && status < 300) {
      if (decoded is! Map || !decoded.containsKey('data')) throw const CoreException.badResponse();
      return decoded['data'];
    }
    final error = decoded is Map ? decoded['error'] : null;
    final code = error is Map && error['code'] is String ? error['code'] as String : '';
    switch (status) {
      case 401:
        throw const CoreException.unauthorized();
      case 403:
        throw code == 'NO_HTX' ? const CoreException.noHtx() : const CoreException.writeForbidden();
      case 404:
        throw const CoreException.notFound();
      case 409:
        throw const CoreException.conflict();
      case 400 || 422:
        throw const CoreException.validation();
      case 503:
        throw const CoreException.unavailable();
    }
    if (status >= 500) throw CoreException.server(status);
    throw const CoreException.badResponse();
  }

  static Object? _json(http.Response response) {
    try {
      return jsonDecode(utf8.decode(response.bodyBytes));
    } catch (_) {
      return null;
    }
  }

  void close() => _client.close();
}
