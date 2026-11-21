// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:hub_mobile/shared/live_camera.dart';
import 'package:hub_mobile/shared/photo_source.dart';
import 'package:shared_preferences/shared_preferences.dart';

// A 1x1 PNG: a real picture, so Image.memory can decode it.
final _png = Uint8List.fromList([
  0x89,
  0x50,
  0x4E,
  0x47,
  0x0D,
  0x0A,
  0x1A,
  0x0A,
  0x00,
  0x00,
  0x00,
  0x0D,
  0x49,
  0x48,
  0x44,
  0x52,
  0x00,
  0x00,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00,
  0x01,
  0x08,
  0x06,
  0x00,
  0x00,
  0x00,
  0x1F,
  0x15,
  0xC4,
  0x89,
  0x00,
  0x00,
  0x00,
  0x0D,
  0x49,
  0x44,
  0x41,
  0x54,
  0x78,
  0x9C,
  0x63,
  0xF8,
  0xFF,
  0xFF,
  0x3F,
  0x00,
  0x05,
  0xFE,
  0x02,
  0xFE,
  0xA7,
  0x35,
  0x81,
  0x84,
  0x00,
  0x00,
  0x00,
  0x00,
  0x49,
  0x45,
  0x4E,
  0x44,
  0xAE,
  0x42,
  0x60,
  0x82,
]);

class _FakeCamera implements LiveCamera {
  _FakeCamera(this.failWith);
  final String? failWith;
  int shots = 0;
  bool disposed = false;

  @override
  Future<void> start() async {
    if (failWith != null) throw LiveCameraException(failWith!);
  }

  @override
  Widget preview() => const ColoredBox(key: Key('fake-preview'), color: Colors.green);

  @override
  Future<Uint8List> capture() async {
    shots++;
    return _png;
  }

  @override
  Future<void> dispose() async => disposed = true;
}

class _FakePhotos implements PhotoSource {
  _FakePhotos({this.cameraError});
  final String? cameraError;
  final cameras = <_FakeCamera>[];
  int gallery = 0;
  bool cancelGallery = false;

  @override
  LiveCamera createCamera() {
    final c = _FakeCamera(cameraError);
    cameras.add(c);
    return c;
  }

  @override
  Future<PickedPhoto?> pickPhoto() async {
    gallery++;
    return cancelGallery ? null : PickedPhoto(bytes: _png, name: 'leaf.png');
  }
}

Future<_FakePhotos> _openFarmer(WidgetTester tester, {String? cameraError}) async {
  SharedPreferences.setMockInitialValues({});
  final store = await LocalStore.open();
  final photos = _FakePhotos(cameraError: cameraError);
  tester.view.physicalSize = const Size(390, 1600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(
    HubApp(repository: MockHubRepository(), auth: DemoAuthService(store), store: store, photoSource: photos),
  );
  await tester.pumpAndSettle();
  await tester.enterText(find.byKey(const Key('login-email')), 'farmer@demo.vn');
  await tester.enterText(find.byKey(const Key('login-password')), DemoAuthService.demoPassword);
  await tester.tap(find.byKey(const Key('login-submit')));
  await tester.pumpAndSettle();
  return photos;
}

Finder _tab(String path) => find.byKey(Key('bottom-$path'));

void main() {
  testWidgets('the farmer bottom bar has a camera tab "Quét" where the schedule was', (tester) async {
    await _openFarmer(tester);
    expect(_tab('/farmer/scan'), findsOneWidget);
    expect(find.descendant(of: _tab('/farmer/scan'), matching: find.text('Quét')), findsOneWidget);
    expect(_tab('/farmer/schedule'), findsNothing);
  });

  testWidgets('the camera tab shows the live picture in the frame, not full screen', (tester) async {
    final photos = await _openFarmer(tester);
    await tester.tap(_tab('/farmer/scan'));
    await tester.pumpAndSettle();
    expect(photos.cameras, hasLength(1));
    expect(
      find.descendant(of: find.byKey(const Key('scan-frame')), matching: find.byKey(const Key('fake-preview'))),
      findsOneWidget,
    );
    // The page and its tab bar stay around the frame.
    expect(_tab('/farmer/scan'), findsOneWidget);
    expect(find.byKey(const Key('scan-result')), findsNothing);
  });

  testWidgets('the shutter sends the picture and shows the result without treatment advice', (tester) async {
    final photos = await _openFarmer(tester);
    await tester.tap(_tab('/farmer/scan'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('scan-camera')));
    await tester.pumpAndSettle();
    expect(photos.cameras.single.shots, 1);
    expect(find.byKey(const Key('scan-result')), findsOneWidget);
    expect(find.byKey(const Key('scan-disease')), findsOneWidget);
    expect(find.text('Chờ cán bộ HTX xác nhận'), findsOneWidget);
    expect(find.textContaining('không đưa ra cách chữa'), findsOneWidget);
    expect(find.byKey(const Key('scan-sample-note')), findsOneWidget);
    // The frame stops on the photo taken; "Chụp lại" brings the live picture back.
    expect(find.byKey(const Key('scan-frozen')), findsOneWidget);
    expect(find.byKey(const Key('scan-camera')), findsNothing);
    await tester.tap(find.byKey(const Key('scan-retake')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('scan-frozen')), findsNothing);
    expect(find.byKey(const Key('scan-result')), findsNothing);
    expect(find.byKey(const Key('scan-camera')), findsOneWidget);
  });

  testWidgets('when the camera cannot start the frame says why and can retry', (tester) async {
    final photos = await _openFarmer(tester, cameraError: 'Chưa được phép dùng camera.');
    await tester.tap(_tab('/farmer/scan'));
    await tester.pumpAndSettle();
    expect(find.text('Chưa được phép dùng camera.'), findsOneWidget);
    expect(find.byKey(const Key('fake-preview')), findsNothing);
    await tester.tap(find.byKey(const Key('camera-retry')));
    await tester.pumpAndSettle();
    expect(photos.cameras, hasLength(2));
  });

  testWidgets('a photo can also be chosen from the gallery', (tester) async {
    final photos = await _openFarmer(tester);
    await tester.tap(_tab('/farmer/scan'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('scan-gallery')));
    await tester.pumpAndSettle();
    expect(photos.gallery, 1);
    expect(find.byKey(const Key('scan-result')), findsOneWidget);
  });

  testWidgets('leaving the tab turns the camera off', (tester) async {
    final photos = await _openFarmer(tester);
    await tester.tap(_tab('/farmer/scan'));
    await tester.pumpAndSettle();
    await tester.tap(_tab('/farmer'));
    await tester.pumpAndSettle();
    expect(photos.cameras.single.disposed, isTrue);
  });

  test('the sample repository reports the disease name and confidence only', () async {
    final repo = MockHubRepository();
    final r = await repo.submitDiagnosis(_png, parcelCode: 'P-TC-001');
    expect(r.diseaseName, isNotEmpty);
    expect(r.confidence, inInclusiveRange(0, 1));
    expect(r.parcelCode, 'P-TC-001');
    expect((await repo.listDiagnoses()).single.id, r.id);
  });
}
