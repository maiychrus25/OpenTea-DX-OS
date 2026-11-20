// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/role/role.dart';
import '../../data/hub_repository.dart';
import '../../data/models/short_video.dart';

/// Heart, comments and share down the right side of a playing clip, like Reels.
/// [likeRequests] lets the player ask for a heart (double tap on the video).
class ReelActions extends StatefulWidget {
  const ReelActions({super.key, required this.video, required this.likeRequests});
  final ShortVideo video;
  final ValueNotifier<int> likeRequests;

  @override
  State<ReelActions> createState() => _ReelActionsState();
}

class _ReelActionsState extends State<ReelActions> {
  ShortReactions? _reactions;
  bool _following = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    widget.likeRequests.addListener(_onDoubleTap);
    _load();
  }

  @override
  void didUpdateWidget(ReelActions old) {
    super.didUpdateWidget(old);
    if (old.likeRequests != widget.likeRequests) {
      old.likeRequests.removeListener(_onDoubleTap);
      widget.likeRequests.addListener(_onDoubleTap);
    }
    if (old.video.id != widget.video.id) {
      _reactions = null;
      _load();
    }
  }

  @override
  void dispose() {
    widget.likeRequests.removeListener(_onDoubleTap);
    super.dispose();
  }

  Claims? get _viewer => context.read<AppState>().claims;

  Future<void> _load() async {
    final id = widget.video.id;
    try {
      final repository = context.read<HubRepository>();
      final viewer = _viewer;
      final r = await repository.shortReactions(id, viewer: viewer);
      final followed = viewer == null ? const <String>{} : await repository.followedChannels(viewer);
      if (mounted && widget.video.id == id) {
        setState(() {
          _reactions = r;
          _following = followed.contains(widget.video.ownerId);
        });
      }
    } catch (_) {
      // The clip still plays without its counters; nothing is invented.
    }
  }

  /// A double tap only ever adds a heart, as in Reels; the button toggles.
  void _onDoubleTap() {
    if (_reactions?.liked ?? false) return;
    _toggleLike();
  }

  bool get _own {
    final viewer = _viewer;
    return viewer != null && shortChannel(viewer) == widget.video.ownerId;
  }

  Future<void> _toggleFollow() async {
    final viewer = _viewer;
    if (viewer == null) return _askToSignIn('theo dõi kênh');
    if (_own || _busy) return;
    final before = _following;
    setState(() {
      _busy = true;
      _following = !before;
    });
    try {
      final now = await context.read<HubRepository>().toggleFollowChannel(widget.video.ownerId, viewer);
      if (!mounted) return;
      setState(() => _following = now);
      _snack(now ? 'Đã theo dõi ${widget.video.ownerName}.' : 'Đã bỏ theo dõi ${widget.video.ownerName}.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _following = before);
      _snack(error is HubException ? error.message : 'Không theo dõi được. Hãy thử lại.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _toggleLike() async {
    final viewer = _viewer;
    if (viewer == null) return _askToSignIn('thả tim');
    if (_busy) return;
    final before = _reactions;
    setState(() {
      _busy = true;
      if (before != null) {
        _reactions = ShortReactions(
          likes: before.likes + (before.liked ? -1 : 1),
          liked: !before.liked,
          comments: before.comments,
        );
      }
    });
    try {
      final r = await context.read<HubRepository>().toggleShortLike(widget.video.id, viewer);
      if (mounted) setState(() => _reactions = r);
    } catch (error) {
      if (!mounted) return;
      setState(() => _reactions = before);
      _snack(error is HubException ? error.message : 'Không thả tim được. Hãy thử lại.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _askToSignIn(String what) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text('Đăng nhập để $what.'),
          action: SnackBarAction(label: 'Đăng nhập', onPressed: () => context.go('/login')),
        ),
      );
  }

  void _snack(String text) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));

  Future<void> _openComments() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => ShortCommentsSheet(video: widget.video, viewer: _viewer, onSignIn: () => context.go('/login')),
    );
    if (mounted) _load();
  }

  Future<void> _share() async {
    await Clipboard.setData(ClipboardData(text: '${widget.video.title} · ${widget.video.ownerName} · Về Xứ Chè'));
    if (mounted) _snack('Đã chép tiêu đề video để chia sẻ.');
  }

  @override
  Widget build(BuildContext context) {
    final r = _reactions;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _ChannelFollow(name: widget.video.ownerName, own: _own, following: _following, onTap: _toggleFollow),
        const SizedBox(height: 16),
        _ActionButton(
          key: const Key('reel-like'),
          icon: r?.liked ?? false ? Icons.favorite : Icons.favorite_border,
          color: r?.liked ?? false ? const Color(0xFFFF3B5C) : Colors.white,
          label: r == null ? '' : shortCountLabel(r.likes),
          tooltip: r?.liked ?? false ? 'Bỏ tim' : 'Thả tim',
          onTap: _toggleLike,
        ),
        const SizedBox(height: 14),
        _ActionButton(
          key: const Key('reel-comments'),
          icon: Icons.mode_comment_outlined,
          color: Colors.white,
          label: r == null ? '' : shortCountLabel(r.comments),
          tooltip: 'Bình luận',
          onTap: _openComments,
        ),
        const SizedBox(height: 14),
        _ActionButton(
          key: const Key('reel-share'),
          icon: Icons.near_me_outlined,
          color: Colors.white,
          label: 'Chia sẻ',
          tooltip: 'Chia sẻ',
          onTap: _share,
        ),
      ],
    );
  }
}

/// The channel's avatar with a "+" (follow) or a check (following) on its lower edge, as on TikTok.
class _ChannelFollow extends StatelessWidget {
  const _ChannelFollow({required this.name, required this.own, required this.following, required this.onTap});
  final String name;
  final bool own;
  final bool following;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: own ? name : (following ? 'Bỏ theo dõi' : 'Theo dõi'),
    child: InkResponse(
      key: const Key('reel-follow'),
      onTap: own ? null : onTap,
      radius: 30,
      child: SizedBox(
        width: 56,
        height: 62,
        child: Stack(
          alignment: Alignment.topCenter,
          children: [
            CircleAvatar(
              radius: 23,
              backgroundColor: Colors.white,
              child: CircleAvatar(
                radius: 21,
                backgroundColor: const Color(0xFF17452F),
                child: Text(
                  name.characters.firstOrNull ?? 'V',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 17),
                ),
              ),
            ),
            if (!own)
              Positioned(
                bottom: 2,
                child: Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    color: following ? const Color(0xFF3F7D1A) : const Color(0xFFFF3B5C),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 1.5),
                  ),
                  child: Icon(following ? Icons.check : Icons.add, size: 14, color: Colors.white),
                ),
              ),
          ],
        ),
      ),
    ),
  );
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    super.key,
    required this.icon,
    required this.color,
    required this.label,
    required this.tooltip,
    required this.onTap,
  });
  final IconData icon;
  final Color color;
  final String label;
  final String tooltip;
  final VoidCallback onTap;

  static const _shadow = [Shadow(blurRadius: 8, color: Colors.black54)];

  @override
  Widget build(BuildContext context) => Tooltip(
    message: tooltip,
    child: InkResponse(
      onTap: onTap,
      radius: 28,
      child: SizedBox(
        width: 56,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 30, color: color, shadows: _shadow),
            const SizedBox(height: 3),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600, shadows: _shadow),
            ),
          ],
        ),
      ),
    ),
  );
}

/// Comments of a clip: the list, newest first, and a field to write one (signed-in accounts).
class ShortCommentsSheet extends StatefulWidget {
  const ShortCommentsSheet({super.key, required this.video, required this.viewer, required this.onSignIn});
  final ShortVideo video;
  final Claims? viewer;
  final VoidCallback onSignIn;

  @override
  State<ShortCommentsSheet> createState() => _ShortCommentsSheetState();
}

class _ShortCommentsSheetState extends State<ShortCommentsSheet> {
  final _input = TextEditingController();
  List<ShortComment>? _comments;
  String? _error;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final list = await context.read<HubRepository>().listShortComments(widget.video.id);
      if (mounted) setState(() => _comments = list);
    } catch (error) {
      if (mounted) setState(() => _error = error is HubException ? error.message : 'Không tải được bình luận.');
    }
  }

  Future<void> _send() async {
    final viewer = widget.viewer;
    if (viewer == null || _sending || _input.text.trim().isEmpty) return;
    setState(() => _sending = true);
    try {
      final comment = await context.read<HubRepository>().addShortComment(widget.video.id, viewer, _input.text);
      _input.clear();
      if (mounted) setState(() => _comments = [comment, ...?_comments]);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error is HubException ? error.message : 'Không gửi được bình luận.')));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final comments = _comments;
    final height = MediaQuery.sizeOf(context).height * 0.62;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SizedBox(
        height: height,
        child: Column(
          children: [
            const SizedBox(height: 8),
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(color: Colors.black12, borderRadius: BorderRadius.circular(2)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Text(
                comments == null ? 'Bình luận' : 'Bình luận · ${comments.length}',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: _error != null
                  ? Center(child: Text(_error!))
                  : comments == null
                  ? const Center(child: CircularProgressIndicator())
                  : comments.isEmpty
                  ? const Center(
                      child: Text('Chưa có bình luận. Hãy là người đầu tiên!', style: TextStyle(color: Colors.black54)),
                    )
                  : ListView.separated(
                      key: const Key('reel-comment-list'),
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                      itemCount: comments.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 14),
                      itemBuilder: (context, i) => _CommentRow(comment: comments[i]),
                    ),
            ),
            const Divider(height: 1),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
                child: widget.viewer == null
                    ? Row(
                        children: [
                          const Expanded(
                            child: Text('Đăng nhập để bình luận.', style: TextStyle(color: Colors.black54)),
                          ),
                          TextButton(onPressed: widget.onSignIn, child: const Text('Đăng nhập')),
                        ],
                      )
                    : Row(
                        children: [
                          Expanded(
                            child: TextField(
                              key: const Key('reel-comment-input'),
                              controller: _input,
                              maxLength: 300,
                              minLines: 1,
                              maxLines: 3,
                              textInputAction: TextInputAction.send,
                              onSubmitted: (_) => _send(),
                              decoration: const InputDecoration(
                                hintText: 'Viết bình luận…',
                                counterText: '',
                                isDense: true,
                                border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(22))),
                                contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              ),
                            ),
                          ),
                          ValueListenableBuilder<TextEditingValue>(
                            valueListenable: _input,
                            builder: (context, value, _) => IconButton(
                              key: const Key('reel-comment-send'),
                              tooltip: 'Gửi bình luận',
                              onPressed: value.text.trim().isEmpty || _sending ? null : _send,
                              icon: const Icon(Icons.send_rounded),
                            ),
                          ),
                        ],
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CommentRow extends StatelessWidget {
  const _CommentRow({required this.comment});
  final ShortComment comment;

  @override
  Widget build(BuildContext context) {
    final ago = DateTime.now().difference(comment.createdAt);
    final when = ago.inMinutes < 1
        ? 'Vừa xong'
        : ago.inHours < 1
        ? '${ago.inMinutes} phút'
        : ago.inDays < 1
        ? '${ago.inHours} giờ'
        : '${ago.inDays} ngày';
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CircleAvatar(
          radius: 16,
          backgroundColor: const Color(0xFFE4EFD9),
          child: Text(
            comment.authorName.characters.firstOrNull ?? '?',
            style: const TextStyle(color: Color(0xFF17452F), fontWeight: FontWeight.w700),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: comment.authorName,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                    ),
                    TextSpan(
                      text: '  $when',
                      style: const TextStyle(color: Colors.black45, fontSize: 12),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 2),
              Text(comment.text, style: const TextStyle(height: 1.35)),
            ],
          ),
        ),
      ],
    );
  }
}
