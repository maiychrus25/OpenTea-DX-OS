// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../data/hub_repository.dart';
import '../../data/models/short_video.dart';
import '../../shared/video_source.dart';
import 'short_playback.dart';
import 'shorts_section.dart';

class ShortPostPage extends StatefulWidget {
  const ShortPostPage({super.key, this.picked});
  final PickedVideo? picked;
  @override
  State<ShortPostPage> createState() => _ShortPostPageState();
}

class _ShortPostPageState extends State<ShortPostPage> {
  final _title = TextEditingController();
  final _form = GlobalKey<FormState>();
  late PickedVideo? _picked = widget.picked;
  Duration? _duration;
  bool _busy = false;

  Future<void> _pick() async {
    setState(() => _busy = true);
    try {
      final picked = await context.read<VideoSource>().pickVideo();
      if (mounted && picked != null) {
        setState(() {
          _picked = picked;
          _duration = null;
        });
      }
    } catch (error) {
      if (mounted) shortError(context, error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate() || _duration == null || _picked == null) return;
    setState(() => _busy = true);
    try {
      await context.read<HubRepository>().postShort(
        context.read<AppState>().claims!,
        title: _title.text,
        source: _picked!.source,
        durationSeconds: (_duration!.inMilliseconds / 1000).ceil(),
      );
      if (mounted) shortsBack(context);
    } catch (error) {
      if (mounted) shortError(context, error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final actor = context.watch<AppState>().claims;
    final repo = context.read<HubRepository>();
    final allowed = actor != null && canManageShorts(actor) && repo.canPostShorts;
    final picked = _picked;
    return shortsTheme(
      context,
      Scaffold(
        appBar: AppBar(
          title: const Text('Đăng video'),
          leading: BackButton(onPressed: () => shortsBack(context)),
        ),
        body: !allowed
            ? const Center(
                child: Padding(padding: EdgeInsets.all(24), child: Text('Bạn chỉ có quyền xem video của kênh này.')),
              )
            : SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 480),
                    child: Form(
                      key: _form,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (repo.shortsAreSample)
                            const Padding(
                              padding: EdgeInsets.only(bottom: 16),
                              child: Text('Dữ liệu mẫu · Video chỉ lưu trong phiên này, chưa tải lên máy chủ.'),
                            ),
                          if (picked != null)
                            Center(
                              child: SizedBox(
                                width: 200,
                                height: 320,
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(16),
                                  child: ColoredBox(
                                    color: Colors.black,
                                    child: ShortPlayback(
                                      key: ObjectKey(picked),
                                      video: ShortVideo(
                                        id: 'preview',
                                        ownerId: shortChannel(actor),
                                        ownerName: actor.name,
                                        title: '',
                                        source: picked.source,
                                        views: 0,
                                        createdAt: DateTime.now(),
                                        durationSeconds: 0,
                                      ),
                                      validateUpload: true,
                                      suspended: _busy,
                                      onReady: (duration) {
                                        if (mounted) setState(() => _duration = duration);
                                      },
                                    ),
                                  ),
                                ),
                              ),
                            )
                          else
                            const Text('Chọn một video từ thư viện để chia sẻ khoảnh khắc của bạn.'),
                          const SizedBox(height: 12),
                          TextButton.icon(
                            onPressed: _busy ? null : _pick,
                            icon: const Icon(Icons.video_library_outlined),
                            label: Text(picked == null ? 'Chọn video' : 'Chọn video khác'),
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            key: const Key('short-title'),
                            controller: _title,
                            maxLength: 80,
                            minLines: 1,
                            maxLines: 3,
                            enabled: !_busy,
                            decoration: const InputDecoration(
                              labelText: 'Tiêu đề video',
                              hintText: 'Một khoảnh khắc ở xứ chè…',
                            ),
                            validator: (value) =>
                                value == null || value.trim().isEmpty ? 'Hãy nhập tiêu đề video.' : null,
                          ),
                          const SizedBox(height: 12),
                          const Text('Video tối đa 60 giây. Chỉ chia sẻ nội dung bạn có quyền sử dụng.'),
                          const SizedBox(height: 16),
                          FilledButton(
                            key: const Key('short-submit'),
                            onPressed: _busy || _duration == null ? null : _submit,
                            child: Text(_busy ? 'Đang đăng…' : 'Đăng'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
      ),
    );
  }
}
