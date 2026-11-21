// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../data/hub_repository.dart';
import 'live_camera.dart';

/// A photo taken with the camera or chosen from the gallery.
class PickedPhoto {
  const PickedPhoto({required this.bytes, required this.name});
  final Uint8List bytes;
  final String name;
}

/// Where photos come from. The app uses the device camera and gallery; tests pass a fake.
abstract class PhotoSource {
  /// A new live camera for the scan page. The page starts it, shows its preview and disposes it.
  LiveCamera createCamera();

  /// Opens the gallery. Null when the person cancels.
  Future<PickedPhoto?> pickPhoto();
}

/// The device camera (see [LiveCamera]); the gallery uses the system picker.
class SystemPhotoSource implements PhotoSource {
  final ImagePicker _picker = ImagePicker();

  @override
  LiveCamera createCamera() => LiveCamera();

  @override
  Future<PickedPhoto?> pickPhoto() async {
    try {
      // 1600 px and quality 85 keep a leaf photo well under the 5 MB the server accepts.
      final file = await _picker.pickImage(source: ImageSource.gallery, maxWidth: 1600, imageQuality: 85);
      if (file == null) return null;
      return PickedPhoto(bytes: await file.readAsBytes(), name: file.name);
    } on PlatformException {
      throw const HubException('Không mở được thư viện ảnh. Hãy cho phép truy cập ảnh trong phần cài đặt của máy.');
    }
  }
}
