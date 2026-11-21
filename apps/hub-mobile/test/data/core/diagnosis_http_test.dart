// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:hub_mobile/data/auth_service.dart';
import 'package:hub_mobile/data/core/core_exception.dart';
import 'package:hub_mobile/data/core/graphql_client.dart';
import 'package:hub_mobile/data/core/hub_api_client.dart';
import 'package:hub_mobile/data/hub_repository.dart';
import 'package:hub_mobile/data/http_hub_repository.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';

const _token = 'tok-SECRET-123';
const _renewed = 'tok-RENEWED-456';
final _jpeg = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]);
final _png = Uint8List.fromList([0x89, 0x50, 0x4E, 0x47, 1, 2, 3]);

http.Response _json(int status, Object body) =>
    http.Response.bytes(utf8.encode(jsonEncode(body)), status, headers: {'content-type': 'application/json'});

const _answer = {
  'data': {
    'report_id': 'r-1',
    'disease_name': 'Đốm nâu',
    'confidence_score': 0.91,
    'image_url': 'https://minio/disease/r-1.jpg',
    'submitted_at': '2026-11-18T01:02:03Z',
    'uncertain': false,
  },
};

({HttpHubRepository repo, List<http.Request> calls, List<String> bearers}) _setup(
  http.Response Function(http.Request) reply, {
  bool withApi = true,
  bool renewable = true,
}) {
  final calls = <http.Request>[];
  final bearers = <String>[];
  var current = const BearerToken(_token, hasuraRole: 'farmer');
  Future<BearerToken?> bearer() async => current;
  Future<BearerToken?> refresh() async {
    if (!renewable) return null;
    return current = const BearerToken(_renewed, hasuraRole: 'farmer');
  }

  final client = MockClient((request) async {
    calls.add(request);
    bearers.add(request.headers['Authorization'] ?? '');
    return reply(request);
  });
  final repo = HttpHubRepository(
    core: GraphqlClient(baseUrl: 'https://gateway.test', client: client, bearer: bearer, refresh: refresh),
    api: withApi
        ? HubApiClient(
            baseUrl: 'https://gateway.test/',
            client: client,
            bearer: bearer,
            refresh: refresh,
            timeout: const Duration(milliseconds: 200),
          )
        : null,
    shop: MockHubRepository(),
  );
  return (repo: repo, calls: calls, bearers: bearers);
}

void main() {
  test('the photo goes to /api/diagnosis as multipart with the parcel and the Bearer token', () async {
    final s = _setup((_) => _json(200, _answer));
    final report = await s.repo.submitDiagnosis(_jpeg, parcelId: 'clh0000000000000000000000', parcelCode: 'P-TC-001');
    final call = s.calls.single;
    expect(call.method, 'POST');
    expect(call.url.path, '/api/diagnosis');
    expect(call.headers['content-type'], startsWith('multipart/form-data'));
    expect(s.bearers.single, 'Bearer $_token');
    final body = latin1.decode(call.bodyBytes);
    expect(body, contains('name="parcel_id"'));
    expect(body, contains('clh0000000000000000000000'));
    expect(body, contains('name="image"'));
    expect(body, contains('filename="leaf.jpg"'));
    expect(body, contains('image/jpeg'));
    expect(report.diseaseName, 'Đốm nâu');
    expect(report.confidence, closeTo(0.91, 1e-9));
    expect(report.uncertain, isFalse);
    expect(report.parcelCode, 'P-TC-001');
    expect(report.image, _jpeg);
    expect((await s.repo.listDiagnoses()).single.id, 'r-1');
  });

  test('a PNG is sent as image/png', () async {
    final s = _setup((_) => _json(200, _answer));
    await s.repo.submitDiagnosis(_png, parcelId: 'p');
    final body = latin1.decode(s.calls.single.bodyBytes);
    expect(body, contains('filename="leaf.png"'));
    expect(body, contains('image/png'));
  });

  test('the server verdict "uncertain" is kept', () async {
    final s = _setup(
      (_) => _json(200, {
        'data': {...(_answer['data']! as Map<String, Object?>), 'confidence_score': 0.9, 'uncertain': true},
      }),
    );
    expect((await s.repo.submitDiagnosis(_jpeg, parcelId: 'p')).uncertain, isTrue);
  });

  test('without a parcel nothing is sent', () async {
    final s = _setup((_) => _json(200, _answer));
    await expectLater(s.repo.submitDiagnosis(_jpeg), throwsA(isA<HubException>()));
    expect(s.calls, isEmpty);
  });

  test('an expired token is renewed once and the photo sent again', () async {
    var n = 0;
    final s = _setup(
      (_) => ++n == 1
          ? _json(401, {
              'error': {'code': 'UNAUTHORIZED', 'message': 'x'},
            })
          : _json(200, _answer),
    );
    await s.repo.submitDiagnosis(_jpeg, parcelId: 'p');
    expect(s.bearers, ['Bearer $_token', 'Bearer $_renewed']);
  });

  test('a maintenance answer and a bad image are explained in Vietnamese, without the server text', () async {
    final down = _setup(
      (_) => _json(503, {
        'error': {'code': 'AI_UNAVAILABLE', 'message': 'SERVER-SECRET'},
      }),
    );
    await expectLater(
      down.repo.submitDiagnosis(_jpeg, parcelId: 'p'),
      throwsA(
        isA<HubException>().having((e) => e.message, 'message', allOf(contains('bảo trì'), isNot(contains('SECRET')))),
      ),
    );
    final bad = _setup(
      (_) => _json(400, {
        'error': {'code': 'VALIDATION_ERROR', 'message': 'SERVER-SECRET'},
      }),
    );
    await expectLater(
      bad.repo.submitDiagnosis(_jpeg, parcelId: 'p'),
      throwsA(isA<HubException>().having((e) => e.message, 'message', contains('5 MB'))),
    );
  });

  test('a farmer without a role on the server gets the usual permission message', () async {
    final s = _setup(
      (_) => _json(403, {
        'error': {'code': 'FORBIDDEN', 'message': 'x'},
      }),
    );
    await expectLater(
      s.repo.submitDiagnosis(_jpeg, parcelId: 'p'),
      throwsA(isA<CoreException>().having((e) => e.kind, 'kind', CoreErrorKind.forbidden)),
    );
  });

  test('canDiagnose follows the Bearer client; without it nothing is sent', () async {
    expect(_setup((_) => _json(200, _answer)).repo.canDiagnose, isTrue);
    final ro = _setup((_) => _json(200, _answer), withApi: false);
    expect(ro.repo.canDiagnose, isFalse);
    await expectLater(ro.repo.submitDiagnosis(_jpeg, parcelId: 'p'), throwsA(isA<CoreException>()));
    expect(ro.calls, isEmpty);
  });
}
