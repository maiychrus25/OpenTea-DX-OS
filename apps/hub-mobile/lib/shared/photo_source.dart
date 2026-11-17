// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../data/hub_repository.dart';
import 'camera_capture_screen.dart';

/// A photo taken with the camera or chosen from the gallery.
class PickedPhoto {
  const PickedPhoto({required this.bytes, required this.name});
  final Uint8List bytes;
  final String name;
}

/// Where photos come from. The app uses the system camera; tests pass a fake.
abstract class PhotoSource {
  /// Opens the camera with a live preview. Null when the person cancels.
  Future<PickedPhoto?> takePhoto(BuildContext context);

  /// Opens the gallery. Null when the person cancels.
  Future<PickedPhoto?> pickPhoto();
}

/// The camera shows a live preview inside the app (see [LiveCamera]); the gallery uses the system picker.
class SystemPhotoSource implements PhotoSource {
  final ImagePicker _picker = ImagePicker();

  Future<PickedPhoto?> _get(ImageSource source) async {
    try {
      // 1600 px and quality 85 keep a leaf photo well under the 5 MB the server accepts.
      final file = await _picker.pickImage(source: source, maxWidth: 1600, imageQuality: 85);
      if (file == null) return null;
      return PickedPhoto(bytes: await file.readAsBytes(), name: file.name);
    } on PlatformException {
      throw const HubException('Không mở được camera. Hãy cho phép dùng camera trong phần cài đặt của máy.');
    }
  }

  @override
  Future<PickedPhoto?> takePhoto(BuildContext context) {
    // The root navigator, so the camera covers the whole screen, above the bars of the staff shell.
    return Navigator.of(
      context,
      rootNavigator: true,
    ).push<PickedPhoto>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => const CameraCaptureScreen()));
  }

  @override
  Future<PickedPhoto?> pickPhoto() => _get(ImageSource.gallery);
}
