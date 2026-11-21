// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:async';
import 'dart:js_interop';
import 'dart:typed_data';
import 'dart:ui_web' as ui_web;

import 'package:flutter/widgets.dart';
import 'package:web/web.dart' as web;

import 'live_camera.dart';

LiveCamera createLiveCamera() => _BrowserCamera();

/// The browser camera: a `<video>` fed by `getUserMedia`, shown with an [HtmlElementView]. The browser asks the person
/// for permission. It needs a secure page (https or localhost).
class _BrowserCamera implements LiveCamera {
  static int _count = 0;
  final String _viewType = 'hub-live-camera-${_count++}';
  final web.HTMLVideoElement _video = web.HTMLVideoElement();
  web.MediaStream? _stream;

  @override
  Future<void> start() async {
    _video
      ..autoplay = true
      ..muted = true
      ..setAttribute('playsinline', 'true');
    _video.style
      ..width = '100%'
      ..height = '100%'
      ..objectFit = 'cover';
    ui_web.platformViewRegistry.registerViewFactory(_viewType, (int viewId) => _video);
    final constraints =
        {
              'video': {
                'facingMode': {'ideal': 'environment'},
                'width': {'ideal': 1280},
                'height': {'ideal': 720},
              },
              'audio': false,
            }.jsify()!
            as web.MediaStreamConstraints;
    try {
      final stream = await web.window.navigator.mediaDevices.getUserMedia(constraints).toDart;
      _stream = stream;
      _video.srcObject = stream;
      await _video.play().toDart;
    } catch (e) {
      // ignore: invalid_runtime_check_with_js_interop_types
      final name = e is web.DOMException ? e.name : '';
      if (name == 'NotAllowedError' || name == 'PermissionDeniedError') {
        throw const LiveCameraException(
          'Chưa được phép dùng camera. Hãy bấm cho phép camera trên thanh địa chỉ của trình duyệt.',
        );
      }
      if (name == 'NotFoundError' || name == 'DevicesNotFoundError') {
        throw const LiveCameraException('Máy này không có camera.');
      }
      throw const LiveCameraException('Không mở được camera. Trang cần chạy trên https hoặc localhost.');
    }
  }

  @override
  Widget preview() => HtmlElementView(viewType: _viewType);

  @override
  Future<Uint8List> capture() async {
    final canvas = web.HTMLCanvasElement()
      ..width = _video.videoWidth
      ..height = _video.videoHeight;
    (canvas.getContext('2d')! as web.CanvasRenderingContext2D).drawImage(_video, 0, 0);
    final done = Completer<web.Blob?>();
    canvas.toBlob(((web.Blob? blob) => done.complete(blob)).toJS, 'image/jpeg', 0.85.toJS);
    final blob = await done.future;
    if (blob == null) throw const LiveCameraException('Không chụp được ảnh.');
    final buffer = await blob.arrayBuffer().toDart;
    return buffer.toDart.asUint8List();
  }

  @override
  Future<void> dispose() async {
    final stream = _stream;
    if (stream != null) {
      for (final track in stream.getTracks().toDart) {
        track.stop();
      }
    }
    _video.srcObject = null;
  }
}
