// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';

import '../core/theme/staff_theme.dart';
import 'live_camera.dart';
import 'photo_source.dart';

/// Full-screen camera with a live preview, a guide frame for the leaf and a shutter button.
/// Pops with the [PickedPhoto], or null when the person closes it.
class CameraCaptureScreen extends StatefulWidget {
  const CameraCaptureScreen({super.key, this.camera});

  /// The camera to use; the device camera when null. Tests pass a fake.
  final LiveCamera? camera;

  @override
  State<CameraCaptureScreen> createState() => _CameraCaptureScreenState();
}

class _CameraCaptureScreenState extends State<CameraCaptureScreen> {
  late final LiveCamera _camera = widget.camera ?? LiveCamera();
  String? _error;
  bool _ready = false;
  bool _shooting = false;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    try {
      await _camera.start();
      if (mounted) setState(() => _ready = true);
    } on LiveCameraException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Không mở được camera.');
    }
  }

  @override
  void dispose() {
    _camera.dispose();
    super.dispose();
  }

  Future<void> _shoot() async {
    if (_shooting || !_ready) return;
    setState(() => _shooting = true);
    try {
      final bytes = await _camera.capture();
      if (mounted) Navigator.of(context).pop(PickedPhoto(bytes: bytes, name: 'leaf.jpg'));
    } catch (_) {
      if (mounted) {
        setState(() {
          _shooting = false;
          _error = 'Không chụp được ảnh. Hãy thử lại.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.black,
    body: SafeArea(
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (_ready)
            Positioned.fill(child: _camera.preview())
          else if (_error == null)
            const Center(child: CircularProgressIndicator(color: StaffColors.lime)),
          if (_ready) const IgnorePointer(child: _GuideFrame()),
          Positioned(
            top: 8,
            left: 8,
            child: IconButton(
              key: const Key('camera-close'),
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.close, color: Colors.white, size: 28),
            ),
          ),
          if (_error != null)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Text(
                  _error!,
                  key: const Key('camera-error'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 16, height: 1.45),
                ),
              ),
            ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 28,
            child: Column(
              children: [
                const Text('Đặt lá chè vào giữa khung', style: TextStyle(color: Colors.white)),
                const SizedBox(height: 14),
                GestureDetector(
                  key: const Key('camera-shutter'),
                  onTap: _shoot,
                  child: Container(
                    width: 78,
                    height: 78,
                    padding: const EdgeInsets.all(5),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 4),
                    ),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: _ready && !_shooting ? StaffColors.lime : Colors.white38,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class _GuideFrame extends StatelessWidget {
  const _GuideFrame();

  @override
  Widget build(BuildContext context) => Center(
    child: FractionallySizedBox(
      widthFactor: 0.72,
      child: AspectRatio(
        aspectRatio: 1,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: StaffColors.lime, width: 2.5),
          ),
        ),
      ),
    ),
  );
}
