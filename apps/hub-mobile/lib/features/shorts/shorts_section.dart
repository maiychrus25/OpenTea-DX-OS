// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/gestures.dart' show PointerDeviceKind;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/role/role.dart';
import '../../core/theme/staff_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/short_video.dart';
import '../../shared/video_source.dart';

String shortsBase(BuildContext context) => '${homeRouteFor(context.read<AppState>().role)}/shorts';

void shortsBack(BuildContext context) {
  if (context.canPop()) {
    context.pop();
  } else {
    context.go('${homeRouteFor(context.read<AppState>().role)}/me');
  }
}

void shortError(BuildContext context, Object error) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(error is HubException ? error.message : 'Không thực hiện được. Anh chị vui lòng thử lại.')),
  );
}

/// Outside the staff shell, explicitly retain the staff design rather than the storefront theme.
Widget shortsTheme(BuildContext context, Widget child) =>
    context.read<AppState>().role == AppRole.customer ? child : Theme(data: buildStaffTheme(), child: child);

class ShortsGridPage extends StatelessWidget {
  const ShortsGridPage({super.key});
  @override
  Widget build(BuildContext context) => shortsTheme(
    context,
    Scaffold(
      appBar: AppBar(
        leading: BackButton(onPressed: () => shortsBack(context)),
        title: const Text('Video ngắn'),
      ),
      body: SingleChildScrollView(
        key: const Key('shorts-grid'),
        padding: const EdgeInsets.all(16),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: const ShortsSection(grid: true),
          ),
        ),
      ),
    ),
  );
}

class ShortsSection extends StatefulWidget {
  const ShortsSection({super.key, this.grid = false});
  final bool grid;
  @override
  State<ShortsSection> createState() => _ShortsSectionState();
}

class _ShortsSectionState extends State<ShortsSection> {
  late Future<List<ShortVideo>> _clips;
  String? _channel;
  bool _picking = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final claims = context.watch<AppState>().claims;
    final channel = claims == null ? '' : shortChannel(claims);
    if (_channel != channel) {
      _channel = channel;
      _clips = context.read<HubRepository>().listShorts(channel);
    }
  }

  void _reload() {
    if (mounted) {
      final clips = context.read<HubRepository>().listShorts(_channel!);
      setState(() {
        _clips = clips;
      });
    }
  }

  Future<void> _open(String path, {Object? extra}) async {
    await context.push(path, extra: extra);
    _reload();
  }

  Future<void> _post() async {
    setState(() => _picking = true);
    try {
      final picked = await context.read<VideoSource>().pickVideo();
      if (!mounted || picked == null) return;
      await _open('${shortsBase(context)}/new', extra: picked);
    } catch (error) {
      if (mounted) shortError(context, error);
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final claims = context.watch<AppState>().claims;
    if (claims == null) return const SizedBox.shrink();
    final repo = context.read<HubRepository>();
    final writable = repo.canPostShorts && canManageShorts(claims);
    return FutureBuilder<List<ShortVideo>>(
      future: _clips,
      builder: (context, snapshot) {
        final clips = snapshot.data ?? const <ShortVideo>[];
        return Padding(
          key: const Key('shorts-section'),
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Video ngắn · ${clips.length}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
              if (repo.shortsAreSample) ...[
                const SizedBox(height: 4),
                Text(
                  'Dữ liệu mẫu · Video đăng chỉ lưu trong phiên này.',
                  style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
                ),
              ],
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  if (writable)
                    OutlinedButton.icon(
                      key: const Key('shorts-post'),
                      onPressed: _picking ? null : _post,
                      icon: const Icon(Icons.add, size: 20),
                      label: Text(_picking ? 'Đang mở…' : 'Đăng video'),
                    ),
                  if (!widget.grid)
                    TextButton(
                      key: const Key('shorts-all'),
                      onPressed: () => _open(shortsBase(context)),
                      child: const Text('Xem tất cả'),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              if (snapshot.hasError)
                TextButton.icon(
                  onPressed: _reload,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Không tải được video. Thử lại'),
                )
              else if (snapshot.connectionState != ConnectionState.done)
                const SizedBox(height: 80, child: Center(child: CircularProgressIndicator()))
              else if (clips.isEmpty)
                Container(
                  key: const Key('shorts-empty'),
                  width: double.infinity,
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surfaceContainerLow,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    children: [
                      Icon(Icons.video_library_outlined, size: 32, color: Theme.of(context).colorScheme.primary),
                      const SizedBox(height: 12),
                      Text(
                        writable
                            ? 'Chia sẻ khoảnh khắc đầu tiên của bạn ở xứ chè.'
                            : 'Kênh chưa có video. Hãy ghé lại sau nhé!',
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                )
              else if (widget.grid)
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: clips.length,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    crossAxisSpacing: 8,
                    mainAxisSpacing: 8,
                    childAspectRatio: 9 / 16,
                  ),
                  itemBuilder: (context, i) =>
                      ShortTile(video: clips[i], onTap: () => _open('${shortsBase(context)}/watch/${clips[i].id}')),
                )
              else
                SizedBox(
                  height: 256,
                  // The row also scrolls with a mouse drag (the browser demo on a computer).
                  child: ScrollConfiguration(
                    behavior: ScrollConfiguration.of(context).copyWith(
                      dragDevices: {PointerDeviceKind.touch, PointerDeviceKind.mouse, PointerDeviceKind.trackpad},
                    ),
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: clips.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 12),
                      itemBuilder: (context, i) => SizedBox(
                        width: 144,
                        child: ShortTile(
                          video: clips[i],
                          onTap: () => _open('${shortsBase(context)}/watch/${clips[i].id}'),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class ShortTile extends StatelessWidget {
  const ShortTile({super.key, required this.video, required this.onTap});
  final ShortVideo video;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    label: '${video.title}, ${shortViewsLabel(video.views)}',
    button: true,
    child: Material(
      key: Key('short-${video.id}'),
      color: Theme.of(context).colorScheme.primary,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (video.poster != null)
              Image.asset(
                video.poster!,
                fit: BoxFit.cover,
                excludeFromSemantics: true,
                errorBuilder: (_, _, _) => const Center(child: Icon(Icons.videocam_outlined, color: Colors.white)),
              ),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Colors.black87],
                  stops: [0.25, 1],
                ),
              ),
            ),
            const Positioned(top: 8, right: 8, child: Icon(Icons.play_arrow_rounded, color: Colors.white, size: 24)),
            Positioned(
              left: 8,
              right: 8,
              bottom: 10,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    video.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      height: 1.25,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    shortViewsLabel(video.views),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white, fontSize: 11, height: 1.2),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
