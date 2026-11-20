// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:image_picker/image_picker.dart';
import 'package:video_player/video_player.dart';

import '../data/hub_repository.dart';
import '../data/models/short_video.dart';
import 'video_file_io.dart' if (dart.library.js_interop) 'video_file_web.dart';

class PickedVideo {
  const PickedVideo(this.source);
  final String source;
}

/// Platform boundary: widgets own the player and always dispose it; tests inject a fake.
abstract class ShortPlayer extends ChangeNotifier {
  bool get isPlaying;
  bool get hasError;
  Duration get duration;
  Duration get position;
  Size get size;
  Future<void> initialize();
  Future<void> play();
  Future<void> pause();
  Future<void> setMuted(bool muted);
  Widget preview();
}

abstract class VideoSource {
  ShortPlayer createPlayer(ShortVideo video);
  Future<PickedVideo?> pickVideo();
}

class SystemVideoSource implements VideoSource {
  final _picker = ImagePicker();

  @override
  ShortPlayer createPlayer(ShortVideo video) {
    final source = video.source;
    final uri = Uri.tryParse(source);
    return _SystemShortPlayer(
      source.startsWith('assets/')
          ? VideoPlayerController.asset(source)
          : uri != null && (uri.scheme == 'https' || uri.scheme == 'http' || uri.scheme == 'blob')
          ? VideoPlayerController.networkUrl(uri)
          : fileVideoController(source),
    );
  }

  @override
  Future<PickedVideo?> pickVideo() async {
    try {
      final file = await _picker.pickVideo(source: ImageSource.gallery, maxDuration: const Duration(seconds: 60));
      return file == null ? null : PickedVideo(file.path);
    } on PlatformException {
      throw const HubException(
        'Không mở được thư viện video. Hãy cho phép truy cập ảnh và video trong cài đặt của máy.',
      );
    } catch (_) {
      throw const HubException('Không mở được thư viện video. Hãy thử lại trên điện thoại hoặc trình duyệt hỗ trợ.');
    }
  }
}

class _SystemShortPlayer extends ShortPlayer {
  _SystemShortPlayer(this._controller) {
    _controller.addListener(_changed);
  }
  final VideoPlayerController _controller;
  bool _disposed = false;

  void _changed() {
    if (!_disposed) notifyListeners();
  }

  @override
  bool get isPlaying => _controller.value.isPlaying;
  @override
  bool get hasError => _controller.value.hasError;
  @override
  Duration get duration => _controller.value.duration;
  @override
  Duration get position => _controller.value.position;
  @override
  Size get size => _controller.value.size;

  @override
  Future<void> initialize() async {
    await _controller.initialize();
    if (_disposed) return;
    await _controller.setLooping(true);
    if (_disposed) return;
    await _controller.setVolume(kIsWeb ? 0 : 1);
  }

  @override
  Future<void> play() async {
    if (!_disposed) await _controller.play();
  }

  @override
  Future<void> pause() async {
    if (!_disposed) await _controller.pause();
  }

  @override
  Future<void> setMuted(bool muted) async {
    if (!_disposed) await _controller.setVolume(muted ? 0 : 1);
  }

  @override
  Widget preview() => VideoPlayer(_controller);

  @override
  void dispose() {
    _disposed = true;
    _controller.removeListener(_changed);
    unawaited(_controller.dispose());
    super.dispose();
  }
}
