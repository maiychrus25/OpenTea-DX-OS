// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/shared/camera_capture_screen.dart';
import 'package:hub_mobile/shared/live_camera.dart';
import 'package:hub_mobile/shared/photo_source.dart';

class _FakeCamera implements LiveCamera {
  _FakeCamera({this.failWith});
  final String? failWith;
  bool disposed = false;

  @override
  Future<void> start() async {
    if (failWith != null) throw LiveCameraException(failWith!);
  }

  @override
  Widget preview() => const ColoredBox(key: Key('fake-preview'), color: Colors.green);

  @override
  Future<Uint8List> capture() async => Uint8List.fromList([1, 2, 3]);

  @override
  Future<void> dispose() async => disposed = true;
}

Future<void> _open(WidgetTester tester, _FakeCamera camera, void Function(Object?) onResult) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () async {
                onResult(
                  await Navigator.of(
                    context,
                  ).push<PickedPhoto>(MaterialPageRoute(builder: (_) => CameraCaptureScreen(camera: camera))),
                );
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the shutter takes the picture of the live camera and returns it', (tester) async {
    final camera = _FakeCamera();
    Object? result = 'waiting';
    await _open(tester, camera, (r) => result = r);
    expect(find.byKey(const Key('fake-preview')), findsOneWidget);
    await tester.tap(find.byKey(const Key('camera-shutter')));
    await tester.pumpAndSettle();
    expect(result, isA<PickedPhoto>());
    expect((result! as PickedPhoto).bytes, [1, 2, 3]);
    expect(camera.disposed, isTrue);
  });

  testWidgets('when the camera cannot start the screen says why and can be closed', (tester) async {
    final camera = _FakeCamera(failWith: 'Chưa được phép dùng camera.');
    Object? result = 'waiting';
    await _open(tester, camera, (r) => result = r);
    expect(find.text('Chưa được phép dùng camera.'), findsOneWidget);
    expect(find.byKey(const Key('fake-preview')), findsNothing);
    await tester.tap(find.byKey(const Key('camera-close')));
    await tester.pumpAndSettle();
    expect(result, isNull);
  });
}
