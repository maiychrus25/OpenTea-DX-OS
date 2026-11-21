// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:hub_mobile/data/models/short_video.dart';
import 'package:hub_mobile/shared/video_source.dart';

class FakeVideoSource implements VideoSource {
  PickedVideo? picked = const PickedVideo('picked.mp4');
  Object? pickError;
  bool failInitialize = false;
  Duration pickedDuration = const Duration(seconds: 12);
  Completer<void>? initialization;
  final players = <FakeShortPlayer>[];

  @override
  Future<PickedVideo?> pickVideo() async {
    if (pickError != null) throw pickError!;
    return picked;
  }

  @override
  ShortPlayer createPlayer(ShortVideo video) {
    final player = FakeShortPlayer(
      video,
      clipDuration: video.source == 'picked.mp4' ? pickedDuration : const Duration(seconds: 6),
      initialization: initialization,
      failInitialize: failInitialize,
    );
    players.add(player);
    return player;
  }
}

class FakeShortPlayer extends ShortPlayer {
  FakeShortPlayer(this.video, {required this.clipDuration, this.initialization, this.failInitialize = false});
  final ShortVideo video;
  final Duration clipDuration;
  final Completer<void>? initialization;
  final bool failInitialize;
  bool disposed = false;
  int plays = 0;
  int pauses = 0;
  @override
  bool isPlaying = false;
  @override
  bool hasError = false;
  @override
  Duration get duration => clipDuration;
  @override
  Duration get position => Duration.zero;
  @override
  Size get size => const Size(540, 960);
  @override
  Future<void> initialize() async {
    await initialization?.future;
    if (failInitialize) throw StateError('invalid video');
  }

  @override
  Future<void> play() async {
    if (disposed) throw StateError('play after dispose');
    isPlaying = true;
    plays++;
    notifyListeners();
  }

  @override
  Future<void> pause() async {
    if (disposed) throw StateError('pause after dispose');
    isPlaying = false;
    pauses++;
    notifyListeners();
  }

  @override
  Future<void> setMuted(bool muted) async {}
  @override
  Widget preview() => const ColoredBox(color: Color(0xFF123123));
  @override
  void dispose() {
    disposed = true;
    isPlaying = false;
    super.dispose();
  }
}
