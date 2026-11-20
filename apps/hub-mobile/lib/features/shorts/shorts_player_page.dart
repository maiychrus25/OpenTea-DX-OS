// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/gestures.dart' show PointerDeviceKind;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
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

  /// The feed's two tabs: clips of the channels the viewer follows, or every channel ("Dành cho bạn").
  bool _followingTab = false;
  bool _firstLoad = true;

  Future<void> _switchTab(bool following) async {
    if (following == _followingTab) return;
    _pages?.dispose();
    setState(() {
      _followingTab = following;
      _clips = null;
      _pages = null;
      _error = null;
      _index = 0;
    });
    await _load();
  }

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
      var clips = widget.feed ? await repository.listAllShorts() : await repository.listShorts(shortChannel(claims!));
      if (widget.feed && _followingTab) {
        final followed = claims == null ? const <String>{} : await repository.followedChannels(claims);
        clips = [
          for (final v in clips)
            if (followed.contains(v.ownerId)) v,
        ];
      }
      if (!mounted) return;
      final wantsInitial = _firstLoad && widget.initialId != null;
      _firstLoad = false;
      if (clips.isEmpty && !(widget.feed && _followingTab)) throw const HubException('Chưa có video nào.');
      final found = clips.indexWhere((v) => v.id == widget.initialId);
      final index = !wantsInitial && widget.feed || clips.isEmpty ? 0 : found;
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
    final clip = clips == null || clips.isEmpty ? null : clips[_index];
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
            else if (clips.isEmpty)
              _FollowingEmpty(signedIn: claims != null, onSignIn: () => context.go('/login'))
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
            if (widget.feed && context.watch<AppState>().claims != null)
              Positioned(
                top: 8,
                right: 8,
                child: IconButton.filledTonal(
                  key: const Key('reel-mine'),
                  tooltip: 'Video của tôi',
                  onPressed: () => context.push(shortsBase(context)),
                  style: IconButton.styleFrom(backgroundColor: Colors.black54, foregroundColor: Colors.white),
                  icon: const Icon(Icons.add_circle_outline),
                ),
              ),
            if (widget.feed)
              Positioned(
                top: 10,
                left: 64,
                right: 64,
                child: Center(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: _FeedTabs(following: _followingTab, onChanged: _switchTab),
                  ),
                ),
              ),
            if (context.read<HubRepository>().shortsAreSample)
              Positioned(
                top: widget.feed ? 52 : 20,
                left: 64,
                right: 64,
                child: const IgnorePointer(
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

/// "Theo dõi | Dành cho bạn" at the top of the feed, the selected one underlined (TikTok style).
class _FeedTabs extends StatelessWidget {
  const _FeedTabs({required this.following, required this.onChanged});
  final bool following;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      _tab('Theo dõi', const Key('feed-tab-following'), following, () => onChanged(true)),
      const SizedBox(width: 22),
      _tab('Dành cho bạn', const Key('feed-tab-foryou'), !following, () => onChanged(false)),
    ],
  );

  Widget _tab(String label, Key key, bool selected, VoidCallback onTap) => GestureDetector(
    key: key,
    behavior: HitTestBehavior.opaque,
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withValues(alpha: selected ? 1 : 0.66),
              fontSize: 16,
              fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
              shadows: const [Shadow(blurRadius: 8, color: Colors.black54)],
            ),
          ),
          const SizedBox(height: 4),
          Container(
            width: 26,
            height: 2.5,
            decoration: BoxDecoration(
              color: selected ? Colors.white : Colors.transparent,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ],
      ),
    ),
  );
}

class _FollowingEmpty extends StatelessWidget {
  const _FollowingEmpty({required this.signedIn, required this.onSignIn});
  final bool signedIn;
  final VoidCallback onSignIn;

  @override
  Widget build(BuildContext context) => Center(
    key: const Key('feed-empty'),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 36),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.person_add_alt_1_outlined, color: Colors.white70, size: 44),
          const SizedBox(height: 14),
          Text(
            signedIn
                ? 'Bạn chưa theo dõi kênh nào. Mở "Dành cho bạn" và bấm dấu + trên ảnh kênh để theo dõi.'
                : 'Đăng nhập để theo dõi những kênh bạn thích và xem video của họ ở đây.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white, fontSize: 15, height: 1.4),
          ),
          if (!signedIn) ...[
            const SizedBox(height: 12),
            FilledButton(onPressed: onSignIn, child: const Text('Đăng nhập')),
          ],
        ],
      ),
    ),
  );
}
