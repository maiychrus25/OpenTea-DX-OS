// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../data/hub_repository.dart';

/// A photo taken with the camera or chosen from the gallery.
class PickedPhoto {
  const PickedPhoto({required this.bytes, required this.name});
  final Uint8List bytes;
  final String name;
}

/// Where photos come from. The app uses the system camera; tests pass a fake.
abstract class PhotoSource {
  /// Opens the camera. Null when the person cancels.
  Future<PickedPhoto?> takePhoto();

  /// Opens the gallery. Null when the person cancels.
  Future<PickedPhoto?> pickPhoto();
}

/// Uses the system camera and gallery pickers: no photo library permission is asked on Android, and iOS shows its own
/// camera permission prompt (text in Info.plist).
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
  Future<PickedPhoto?> takePhoto() => _get(ImageSource.camera);

  @override
  Future<PickedPhoto?> pickPhoto() => _get(ImageSource.gallery);
}
