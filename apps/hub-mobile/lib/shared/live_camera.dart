// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:typed_data';

import 'package:flutter/widgets.dart';

import 'live_camera_io.dart' if (dart.library.js_interop) 'live_camera_web.dart' as impl;

/// A camera with a live preview. Phones use the `camera` package; browsers use `getUserMedia` directly, because the
/// browser camera is a video element, not a texture.
abstract class LiveCamera {
  /// The camera of this device: phones and browsers.
  factory LiveCamera() => impl.createLiveCamera();

  /// Opens the camera. Throws [LiveCameraException] with a message safe to show.
  Future<void> start();

  /// The live picture.
  Widget preview();

  /// A JPEG of the current picture.
  Future<Uint8List> capture();

  /// Releases the camera.
  Future<void> dispose();
}

/// The camera could not be used; [message] is Vietnamese and safe to show.
class LiveCameraException implements Exception {
  const LiveCameraException(this.message);
  final String message;

  @override
  String toString() => message;
}
