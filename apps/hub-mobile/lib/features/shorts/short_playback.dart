// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../data/hub_repository.dart';
import '../../data/models/short_video.dart';
import '../../shared/video_source.dart';

/// One mounted playback owns one controller. Non-current PageView pages never mount this widget.
class ShortPlayback extends StatefulWidget {
  const ShortPlayback({
    super.key,
    required this.video,
    this.suspended = false,
    this.onStarted,
    this.onReady,
    this.validateUpload = false,
    this.onDoubleTap,
  });
  final ShortVideo video;

  /// Double tap on the video (the player gives a heart, like Reels).
  final VoidCallback? onDoubleTap;
  final bool suspended;
  final VoidCallback? onStarted;
  final ValueChanged<Duration?>? onReady;
  final bool validateUpload;
  @override
  State<ShortPlayback> createState() => _ShortPlaybackState();
}

class _ShortPlaybackState extends State<ShortPlayback> with WidgetsBindingObserver {
  ShortPlayer? _player;
  bool _ready = false;
  bool _wantsPlay = true;
  bool _foreground = true;
  bool _counted = false;
  bool _muted = kIsWeb;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _start();
  }

  Future<void> _start() async {
    try {
      final player = context.read<VideoSource>().createPlayer(widget.video);
      _player = player;
      player.addListener(_changed);
      await player.initialize();
      if (!mounted || _player != player) return;
      if (player.hasError || player.duration <= Duration.zero || player.size.isEmpty) {
        throw const HubException('Không đọc được video. Hãy chọn một video khác.');
      }
      if (widget.validateUpload && player.duration > const Duration(seconds: 60)) {
        throw const HubException('Video dài quá 60 giây. Hãy chọn video ngắn hơn.');
      }
      setState(() => _ready = true);
      widget.onReady?.call(player.duration);
      await _syncPlayback();
    } catch (error) {
      if (mounted) _fail(error);
    }
  }

  void _fail(Object error) {
    final player = _player;
    _player = null;
    player?.removeListener(_changed);
    player?.dispose();
    setState(() {
      _ready = false;
      _error = error is HubException ? error.message : 'Không phát được video. Hãy thử lại hoặc chọn video khác.';
    });
    widget.onReady?.call(null);
  }

  void _changed() {
    if (!mounted) return;
    // Controller notifications may arrive during a widget update; render via ListenableBuilder instead.
    if (_player?.hasError == true && _error == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _player?.hasError == true) _fail(const HubException('Không phát được video. Hãy thử lại.'));
      });
    }
  }

  Future<void> _syncPlayback() async {
    final player = _player;
    if (!_ready || player == null) return;
    try {
      if (_wantsPlay && _foreground && !widget.suspended) {
        await player.play();
        if (!mounted || player != _player) return;
        if (_foreground && !widget.suspended && player.isPlaying && !_counted) {
          _counted = true;
          widget.onStarted?.call();
        }
      } else {
        await player.pause();
      }
    } catch (error) {
      if (mounted && player == _player) _fail(error);
    }
  }

  @override
  void didUpdateWidget(ShortPlayback oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.suspended != widget.suspended) unawaited(_syncPlayback());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    unawaited(_syncPlayback());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _player?.removeListener(_changed);
    _player?.dispose();
    _player = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return ColoredBox(
        color: Colors.black,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.videocam_off_outlined, color: Colors.white, size: 40),
                const SizedBox(height: 12),
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white),
                ),
                TextButton(
                  onPressed: () {
                    setState(() => _error = null);
                    _start();
                  },
                  child: const Text('Thử lại'),
                ),
              ],
            ),
          ),
        ),
      );
    }
    final player = _player;
    if (!_ready || player == null) return const Center(child: CircularProgressIndicator(color: Colors.white));
    return ListenableBuilder(
      listenable: player,
      builder: (context, _) => Stack(
        fit: StackFit.expand,
        children: [
          ClipRect(
            child: FittedBox(
              fit: BoxFit.cover,
              child: SizedBox(width: player.size.width, height: player.size.height, child: player.preview()),
            ),
          ),
          Material(
            color: Colors.transparent,
            child: InkWell(
              key: const Key('short-toggle'),
              onDoubleTap: widget.onDoubleTap,
              onTap: () {
                _wantsPlay = !player.isPlaying;
                unawaited(_syncPlayback());
              },
              child: Semantics(
                button: true,
                label: player.isPlaying ? 'Tạm dừng video' : 'Phát video',
                child: Center(
                  child: player.isPlaying
                      ? const SizedBox.shrink()
                      : const Icon(Icons.play_circle_fill, color: Colors.white, size: 72),
                ),
              ),
            ),
          ),
          Positioned(
            bottom: 24,
            right: 8,
            child: IconButton(
              tooltip: _muted ? 'Bật âm thanh' : 'Tắt âm thanh',
              onPressed: () async {
                try {
                  await player.setMuted(!_muted);
                  if (mounted) setState(() => _muted = !_muted);
                } catch (error) {
                  if (mounted) _fail(error);
                }
              },
              icon: Icon(_muted ? Icons.volume_off : Icons.volume_up, color: Colors.white),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: LinearProgressIndicator(
              value: player.duration.inMilliseconds == 0
                  ? 0
                  : (player.position.inMilliseconds / player.duration.inMilliseconds).clamp(0, 1),
              minHeight: 3,
              color: Colors.white,
              backgroundColor: Colors.white24,
              semanticsLabel: 'Tiến trình video',
            ),
          ),
        ],
      ),
    );
  }
}
