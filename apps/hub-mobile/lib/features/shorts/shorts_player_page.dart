// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/gestures.dart' show PointerDeviceKind;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../data/hub_repository.dart';
import '../../data/models/short_video.dart';
import 'reel_actions.dart';
import 'short_playback.dart';
import 'shorts_section.dart';

class ShortsPlayerPage extends StatefulWidget {
  const ShortsPlayerPage({super.key, required this.initialId}) : feed = false;

  /// The bottom bar's "Video" feed: every channel, newest first, starting at [initialId] or the first clip.
  const ShortsPlayerPage.feed({super.key, this.initialId}) : feed = true;

  final String? initialId;
  final bool feed;
  @override
  State<ShortsPlayerPage> createState() => _ShortsPlayerPageState();
}

class _ShortsPlayerPageState extends State<ShortsPlayerPage> {
  List<ShortVideo>? _clips;
  PageController? _pages;
  int _index = 0;
  bool _deleting = false;
  String? _error;

  /// Double taps on the video, passed to the heart button; [_heart] shows the big heart for a moment.
  final _likeRequests = ValueNotifier<int>(0);
  bool _heart = false;

  void _doubleTap() {
    _likeRequests.value++;
    setState(() => _heart = true);
    Future<void>.delayed(const Duration(milliseconds: 650), () {
      if (mounted) setState(() => _heart = false);
    });
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final repository = context.read<HubRepository>();
      final claims = context.read<AppState>().claims;
      final clips = widget.feed ? await repository.listAllShorts() : await repository.listShorts(shortChannel(claims!));
      if (!mounted) return;
      if (clips.isEmpty) throw const HubException('Chưa có video nào.');
      final found = clips.indexWhere((v) => v.id == widget.initialId);
      final index = widget.initialId == null && widget.feed ? 0 : found;
      if (index < 0) throw const HubException('Video không còn tồn tại trong kênh này.');
      setState(() {
        _clips = clips;
        _index = index;
        _pages = PageController(initialPage: index);
      });
    } catch (error) {
      if (mounted) {
        setState(() => _error = error is HubException ? error.message : 'Không tải được video. Hãy thử lại.');
      }
    }
  }

  Future<void> _view(ShortVideo clip) async {
    try {
      final viewed = await context.read<HubRepository>().recordShortView(clip.id);
      if (!mounted) return;
      setState(() => _clips = [for (final v in _clips!) v.id == viewed.id ? viewed : v]);
    } catch (_) {
      // Playback is still useful when a view counter is unavailable. Never fabricate a successful count.
    }
  }

  Future<void> _delete(ShortVideo clip) async {
    setState(() => _deleting = true);
    final actor = context.read<AppState>().claims!;
    try {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Xoá video này?'),
          content: const Text('Video sẽ bị xoá khỏi kênh. Không thể hoàn tác thao tác này.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Giữ lại')),
            TextButton(
              key: const Key('short-delete-confirm'),
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Xoá video'),
            ),
          ],
        ),
      );
      if (!mounted || confirmed != true) return;
      await context.read<HubRepository>().deleteShort(clip.id, actor: actor);
      if (mounted) shortsBack(context);
    } catch (error) {
      if (mounted) shortError(context, error);
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  @override
  void dispose() {
    _likeRequests.dispose();
    _pages?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final claims = context.watch<AppState>().claims;
    final clips = _clips;
    final clip = clips == null ? null : clips[_index];
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (_error != null)
              Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white),
                      ),
                      TextButton(
                        onPressed: () {
                          setState(() => _error = null);
                          _load();
                        },
                        child: const Text('Thử lại'),
                      ),
                    ],
                  ),
                ),
              )
            else if (clips == null)
              const Center(child: CircularProgressIndicator(color: Colors.white))
            else
              // Dragging with a mouse also turns the page (the browser demo on a computer).
              ScrollConfiguration(
                behavior: ScrollConfiguration.of(
                  context,
                ).copyWith(dragDevices: {PointerDeviceKind.touch, PointerDeviceKind.mouse, PointerDeviceKind.trackpad}),
                child: PageView.builder(
                  key: const Key('shorts-player'),
                  controller: _pages,
                  scrollDirection: Axis.vertical,
                  physics: _deleting ? const NeverScrollableScrollPhysics() : null,
                  itemCount: clips.length,
                  onPageChanged: (index) => setState(() => _index = index),
                  itemBuilder: (context, index) => index == _index
                      ? ShortPlayback(
                          key: ValueKey(clips[index].id),
                          video: clips[index],
                          suspended: _deleting,
                          onStarted: () => _view(clips[index]),
                          onDoubleTap: _doubleTap,
                        )
                      : const ColoredBox(color: Colors.black),
                ),
              ),
            if (clip != null) ...[
              IgnorePointer(
                child: Center(
                  child: AnimatedScale(
                    scale: _heart ? 1 : 0.4,
                    duration: const Duration(milliseconds: 220),
                    curve: Curves.easeOutBack,
                    child: AnimatedOpacity(
                      opacity: _heart ? 1 : 0,
                      duration: const Duration(milliseconds: 220),
                      child: const Icon(
                        Icons.favorite,
                        key: Key('reel-big-heart'),
                        size: 110,
                        color: Color(0xFFFF3B5C),
                        shadows: [Shadow(blurRadius: 16, color: Colors.black38)],
                      ),
                    ),
                  ),
                ),
              ),
              Positioned(
                right: 4,
                bottom: 84,
                child: ReelActions(video: clip, likeRequests: _likeRequests),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 4,
                child: IgnorePointer(
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(16, 48, 64, 24),
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Colors.transparent, Colors.black87],
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            CircleAvatar(
                              radius: 18,
                              backgroundColor: Colors.white24,
                              child: Text(
                                clip.ownerName.characters.firstOrNull ?? 'V',
                                style: const TextStyle(color: Colors.white),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                clip.ownerName,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Text(
                          clip.title,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 6),
                        Text(shortViewsLabel(clip.views), style: const TextStyle(color: Colors.white, fontSize: 12)),
                      ],
                    ),
                  ),
                ),
              ),
              if (claims != null && canManageShorts(claims) && clip.ownerId == shortChannel(claims))
                Positioned(
                  top: 8,
                  right: 8,
                  child: IconButton.filledTonal(
                    key: const Key('short-delete'),
                    tooltip: 'Xoá video',
                    onPressed: _deleting ? null : () => _delete(clip),
                    style: IconButton.styleFrom(backgroundColor: Colors.black54, foregroundColor: Colors.white),
                    icon: const Icon(Icons.delete_outline),
                  ),
                ),
            ],
            Positioned(
              top: 8,
              left: 8,
              child: IconButton.filledTonal(
                key: const Key('shorts-back'),
                tooltip: 'Quay lại',
                onPressed: () => shortsBack(context),
                style: IconButton.styleFrom(backgroundColor: Colors.black54, foregroundColor: Colors.white),
                icon: const Icon(Icons.arrow_back),
              ),
            ),
            if (context.read<HubRepository>().shortsAreSample)
              const Positioned(
                top: 20,
                left: 64,
                right: 64,
                child: IgnorePointer(
                  child: Text(
                    'Dữ liệu mẫu',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      shadows: [Shadow(blurRadius: 8, color: Colors.black)],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
