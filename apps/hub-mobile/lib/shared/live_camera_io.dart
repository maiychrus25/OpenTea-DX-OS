// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:flutter/widgets.dart';

import 'live_camera.dart';

LiveCamera createLiveCamera() => _PhoneCamera();

/// The back camera of a phone, through the `camera` package (CameraX on Android, AVFoundation on iOS).
class _PhoneCamera implements LiveCamera {
  CameraController? _controller;

  @override
  Future<void> start() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) throw const LiveCameraException('Máy này không có camera.');
      final back = cameras.firstWhere((c) => c.lensDirection == CameraLensDirection.back, orElse: () => cameras.first);
      final controller = CameraController(
        back,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      _controller = controller;
      await controller.initialize();
    } on LiveCameraException {
      rethrow;
    } on CameraException catch (e) {
      throw LiveCameraException(
        e.code.toLowerCase().contains('denied')
            ? 'Chưa được phép dùng camera. Hãy cho phép camera trong phần cài đặt của máy.'
            : 'Không mở được camera.',
      );
    } catch (_) {
      throw const LiveCameraException('Không mở được camera.');
    }
  }

  @override
  Widget preview() => CameraPreview(_controller!);

  @override
  Future<Uint8List> capture() async => (await _controller!.takePicture()).readAsBytes();

  @override
  Future<void> dispose() async => _controller?.dispose();
}
