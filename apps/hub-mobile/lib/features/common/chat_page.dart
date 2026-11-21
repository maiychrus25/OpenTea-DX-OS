// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../app/chat_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/staff_theme.dart';
import '../../data/models/chat.dart';
import '../../shared/soft_card.dart';

/// Keep the storefront and staff identities, without adding a page-specific theme.
class _Palette {
  const _Palette({
    required this.page,
    required this.surface,
    required this.deep,
    required this.ink,
    required this.muted,
    required this.border,
    required this.soft,
    required this.error,
  });
  final Color page, surface, deep, ink, muted, border, soft, error;

  static const customer = _Palette(
    page: AppColors.cream,
    surface: AppColors.paper,
    deep: AppColors.teaDark,
    ink: AppColors.ink,
    muted: AppColors.faint,
    border: AppColors.border,
    soft: AppColors.tileLight,
    error: AppColors.danger,
  );
  static const staff = _Palette(
    page: StaffColors.background,
    surface: StaffColors.card,
    deep: StaffColors.primary,
    ink: StaffColors.ink,
    muted: StaffColors.muted,
    border: StaffColors.border,
    soft: StaffColors.secondary,
    error: StaffColors.bad,
  );
}

/// One page for every role. Topics and answering policy belong to [ChatController].
class ChatPage extends StatefulWidget {
  const ChatPage({super.key, this.customer = false});

  /// Guests/customers bring their own scaffold; StaffShell supplies the staff one.
  final bool customer;

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  bool _followingBottom = true;
  bool _userScrolling = false;
  bool _scrollQueued = false;

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _followBottom() {
    if (_scrollQueued || !_followingBottom) return;
    _scrollQueued = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scrollQueued = false;
      if (!mounted || !_followingBottom || !_scroll.hasClients) return;
      // No repeated scroll animation per token: the text grows at the stream's pace.
      _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  bool _onScroll(ScrollNotification notification) {
    if (notification.depth != 0) return false;
    if (notification is UserScrollNotification) {
      _userScrolling = notification.direction != ScrollDirection.idle;
    }
    if (_userScrolling) {
      final following = notification.metrics.extentAfter < 96;
      if (following != _followingBottom) setState(() => _followingBottom = following);
    }
    return false;
  }

  void _resetScroll() {
    _userScrolling = false;
    _followingBottom = true;
  }

  void _jumpToBottom() {
    setState(_resetScroll);
    if (!_scroll.hasClients) return;
    if (MediaQuery.disableAnimationsOf(context)) {
      _scroll.jumpTo(_scroll.position.maxScrollExtent);
    } else {
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    }
  }

  void _send(ChatController chat, [String? question]) {
    final text = question ?? _input.text;
    if (text.trim().isEmpty || chat.conversation.streaming) return;
    _input.clear();
    _resetScroll();
    chat.send(text);
  }

  @override
  Widget build(BuildContext context) {
    final chat = context.watch<ChatController>();
    final conversation = chat.conversation;
    final replies = conversation.replies;
    final p = widget.customer ? _Palette.customer : _Palette.staff;
    _followBottom();
    final body = ColoredBox(
      color: p.page,
      child: SafeArea(
        top: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: LayoutBuilder(
              builder: (context, constraints) => Column(
                children: [
                  _Header(
                    palette: p,
                    chat: chat,
                    onClear: replies.isEmpty
                        ? null
                        : () {
                            _input.clear();
                            _resetScroll();
                            chat.clear();
                          },
                    onTopic: (t) {
                      _input.clear();
                      _resetScroll();
                      chat.selectTopic(t);
                    },
                  ),
                  Expanded(
                    child: replies.isEmpty
                        ? _Welcome(palette: p, topic: chat.topic, onSend: (q) => _send(chat, q))
                        : Stack(
                            children: [
                              NotificationListener<ScrollMetricsNotification>(
                                onNotification: (_) {
                                  _followBottom();
                                  return false;
                                },
                                child: NotificationListener<ScrollNotification>(
                                  onNotification: _onScroll,
                                  child: ListView.builder(
                                    key: ValueKey('chat-messages-${chat.topic.name}'),
                                    controller: _scroll,
                                    padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
                                    itemCount: replies.length,
                                    itemBuilder: (context, index) => _Exchange(
                                      key: ObjectKey(replies[index]),
                                      palette: p,
                                      reply: replies[index],
                                      waiting: index == replies.length - 1 && conversation.streaming,
                                      onRetry: index == replies.length - 1 && !conversation.streaming
                                          ? chat.retry
                                          : null,
                                    ),
                                  ),
                                ),
                              ),
                              if (!_followingBottom)
                                Positioned(
                                  bottom: 12,
                                  left: 0,
                                  right: 0,
                                  child: Center(
                                    child: FilledButton.icon(
                                      key: const Key('chat-jump-bottom'),
                                      onPressed: _jumpToBottom,
                                      style: FilledButton.styleFrom(
                                        backgroundColor: p.deep,
                                        foregroundColor: Colors.white,
                                        minimumSize: const Size(44, 44),
                                        textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                                      ),
                                      icon: const Icon(Icons.arrow_downward_rounded, size: 18),
                                      label: const Text('Tin mới'),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                  ),
                  _Composer(
                    palette: p,
                    controller: _input,
                    busy: conversation.streaming,
                    online: chat.online,
                    maxInputHeight: constraints.maxHeight * 0.25,
                    onSend: () => _send(chat),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    if (!widget.customer) return body;
    return Scaffold(
      backgroundColor: p.page,
      resizeToAvoidBottomInset: true,
      appBar: AppBar(
        backgroundColor: p.page,
        surfaceTintColor: Colors.transparent,
        leading: const SafeBackButton(fallback: '/shop'),
        toolbarHeight: 48,
      ),
      body: body,
    );
  }
}

class _BotAvatar extends StatelessWidget {
  const _BotAvatar({required this.palette, this.size = 30});
  final _Palette palette;
  final double size;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: palette.soft, shape: BoxShape.circle),
      child: Icon(Icons.eco_rounded, size: size * 0.55, color: palette.deep),
    ),
  );
}

class _Header extends StatelessWidget {
  const _Header({required this.palette, required this.chat, required this.onClear, required this.onTopic});
  final _Palette palette;
  final ChatController chat;
  final VoidCallback? onClear;
  final ValueChanged<ChatTopic> onTopic;

  @override
  Widget build(BuildContext context) {
    final p = palette;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.fromLTRB(12, 12, 4, 12),
      decoration: BoxDecoration(
        color: p.surface,
        border: Border.all(color: p.border),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _BotAvatar(palette: p, size: 40),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Trợ lý OpenTea',
                      style: TextStyle(color: p.ink, fontSize: 16, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      chat.conversation.streaming
                          ? 'Đang trả lời…'
                          : '${chat.topic.label} · ${chat.online ? 'Trực tuyến' : 'Dữ liệu mẫu'}',
                      key: const Key('chat-mode'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: p.muted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              IconButton(
                key: const Key('chat-clear'),
                tooltip: 'Xoá hội thoại',
                onPressed: onClear,
                color: p.deep,
                disabledColor: p.muted,
                constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                icon: const Icon(Icons.playlist_remove_rounded),
              ),
            ],
          ),
          if (chat.topics.length > 1) ...[
            const SizedBox(height: 12),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final topic in chat.topics)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: Semantics(
                        label: 'Chủ đề ${topic.label}',
                        selected: chat.topic == topic,
                        child: TextButton(
                          key: Key('chat-topic-${topic.wireValue}'),
                          onPressed: () => onTopic(topic),
                          style: TextButton.styleFrom(
                            foregroundColor: chat.topic == topic ? p.deep : p.muted,
                            backgroundColor: chat.topic == topic ? p.soft : p.surface,
                            minimumSize: const Size(44, 44),
                            textStyle: Theme.of(context).textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600),
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            shape: const StadiumBorder(),
                          ),
                          child: Text(topic.label),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// The prompt is kept separate from display copy: visual edits never change what is sent.
typedef _Suggestion = (IconData, String, String, String);

List<_Suggestion> _suggestionsFor(ChatTopic topic) => switch (topic) {
  ChatTopic.shop => const [
    (Icons.local_cafe_outlined, 'Sản phẩm và giá trong app', 'Khám phá đặc sản', 'Sản phẩm và giá trong app'),
    (Icons.hiking, 'Có tour trải nghiệm nào?', 'Một chuyến về xứ chè', 'Tìm tour trải nghiệm trong app'),
    (Icons.place_outlined, 'HTX và điểm đến nổi bật', 'Ghé thăm hợp tác xã', 'HTX và những điểm đến nổi bật'),
    (Icons.qr_code_2, 'Cách đặt hàng và thanh toán', 'Đặt hàng dễ dàng', 'Tìm hiểu đặt hàng và thanh toán'),
  ],
  ChatTopic.market => const [
    (Icons.sell_outlined, 'Giá sản phẩm trong danh mục', 'Giá trong danh mục', 'Tra cứu sản phẩm đang có'),
    (Icons.receipt_long_outlined, 'HTX có bao nhiêu đơn hàng?', 'Đơn hàng của HTX', 'Xem số liệu đơn hàng'),
    (Icons.trending_up, 'Có giá thị trường hôm nay không?', 'Thông tin thị trường', 'Chỉ dùng số liệu có nguồn'),
  ],
  ChatTopic.technical => const [
    (Icons.coronavirus_outlined, 'Các bệnh lá chè trong mẫu', 'Tìm hiểu bệnh chè', 'Các bệnh lá chè trong mẫu'),
    (Icons.description_outlined, 'Cách ghi nhật ký đồng ruộng', 'Nhật ký đồng ruộng', 'Hướng dẫn cách ghi nhật ký'),
    (Icons.eco_outlined, 'Thửa đất và lịch thu hái của tôi', 'Thăm nương chè', 'Thửa đất và lịch thu hái của tôi'),
  ],
  ChatTopic.tour => const [
    (Icons.groups_outlined, 'Các đoàn sắp đi', 'Đón đoàn sắp tới', 'Xem các đoàn khách sắp đi'),
    (Icons.account_balance_outlined, 'HTX nào giao tour cho tôi', 'HTX đồng hành', 'HTX nào giao tour cho tôi'),
    (Icons.route_outlined, 'Các tour được giao', 'Lịch tour của bạn', 'Tìm các tour được phân công'),
  ],
};

String _introFor(ChatTopic topic) => switch (topic) {
  ChatTopic.shop => 'Hỏi về đặc sản chè, tour trải nghiệm, hợp tác xã và cách đặt hàng.',
  ChatTopic.market => 'Hỏi về giá trong danh mục, đơn hàng và số liệu thị trường có nguồn.',
  ChatTopic.technical => 'Hỏi về bệnh chè, nhật ký đồng ruộng và lịch thu hái của thửa đất.',
  ChatTopic.tour => 'Hỏi về đoàn khách sắp đến, HTX giao tour và các tour của bạn.',
};

class _Welcome extends StatelessWidget {
  const _Welcome({required this.palette, required this.topic, required this.onSend});
  final _Palette palette;
  final ChatTopic topic;
  final ValueChanged<String> onSend;

  @override
  Widget build(BuildContext context) {
    final p = palette;
    final suggestions = _suggestionsFor(topic);
    final name = (context.select<AppState, String?>((app) => app.claims?.name) ?? '').trim();
    final firstName = name.isEmpty ? 'bạn' : name.split(RegExp(r'\s+')).last;
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 600 ? 2 : 1;
        final width = (constraints.maxWidth - 32 - (columns - 1) * 12) / columns;
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 28, 16, 16),
          children: [
            Text(
              'Chào $firstName!',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: p.ink),
            ),
            const SizedBox(height: 8),
            Text(
              'Bạn muốn tìm hiểu điều gì?',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: p.ink),
            ),
            const SizedBox(height: 8),
            Text(_introFor(topic), style: TextStyle(color: p.muted, height: 1.5)),
            const SizedBox(height: 24),
            Text(
              'Gợi ý cho bạn',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: p.muted),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                for (var i = 0; i < suggestions.length; i++)
                  SizedBox(
                    width: width,
                    child: _SuggestionCard(
                      key: Key('chat-suggest-$i'),
                      palette: p,
                      suggestion: suggestions[i],
                      onTap: () => onSend(suggestions[i].$2),
                    ),
                  ),
              ],
            ),
          ],
        );
      },
    );
  }
}

class _SuggestionCard extends StatelessWidget {
  const _SuggestionCard({super.key, required this.palette, required this.suggestion, required this.onTap});
  final _Palette palette;
  final _Suggestion suggestion;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: palette.surface,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(14),
      side: BorderSide(color: palette.border),
    ),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(suggestion.$1, size: 24, color: palette.deep),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    suggestion.$3,
                    style: TextStyle(fontWeight: FontWeight.w600, color: palette.ink, height: 1.4),
                  ),
                  const SizedBox(height: 4),
                  Text(suggestion.$4, style: TextStyle(fontSize: 12, color: palette.muted, height: 1.4)),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _Exchange extends StatelessWidget {
  const _Exchange({super.key, required this.palette, required this.reply, required this.waiting, this.onRetry});
  final _Palette palette;
  final ChatReply reply;
  final bool waiting;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final p = palette;
    final error = reply.error;
    final shown = reply.sources.isEmpty ? reply.text : withoutSourceLines(reply.text);
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: MediaQuery.disableAnimationsOf(context) ? Duration.zero : const Duration(milliseconds: 200),
      builder: (context, value, child) => Opacity(
        opacity: value,
        child: Transform.translate(offset: Offset(0, 6 * (1 - value)), child: child),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: constraints.maxWidth * 0.82),
                child: Semantics(
                  label: 'Bạn',
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: p.deep,
                      borderRadius: const BorderRadius.only(
                        topLeft: Radius.circular(20),
                        topRight: Radius.circular(20),
                        bottomLeft: Radius.circular(20),
                        bottomRight: Radius.circular(4),
                      ),
                    ),
                    child: SelectableText(reply.question, style: const TextStyle(color: Colors.white, height: 1.5)),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 24),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _BotAvatar(palette: p, size: 28),
                  const SizedBox(width: 8),
                  ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: constraints.maxWidth * 0.82),
                    child: Semantics(
                      label: 'Trợ lý OpenTea',
                      child: Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: p.surface,
                          border: Border.all(color: error != null ? p.error.withValues(alpha: 0.3) : p.border),
                          borderRadius: const BorderRadius.only(
                            topLeft: Radius.circular(4),
                            topRight: Radius.circular(20),
                            bottomLeft: Radius.circular(20),
                            bottomRight: Radius.circular(20),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (shown.isNotEmpty) SelectableText(shown, style: TextStyle(color: p.ink, height: 1.55)),
                            if (waiting && reply.text.isEmpty)
                              _TypingDots(key: const Key('chat-typing'), color: p.muted),
                            if (reply.sources.isNotEmpty) ...[
                              const SizedBox(height: 12),
                              _Sources(palette: p, sources: reply.sources),
                            ],
                            if (error != null) ...[
                              if (shown.isNotEmpty) const SizedBox(height: 12),
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Icon(Icons.error_outline, size: 18, color: p.error),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(error, style: TextStyle(color: p.error, height: 1.5)),
                                  ),
                                ],
                              ),
                              if (onRetry != null)
                                TextButton.icon(
                                  key: const Key('chat-retry'),
                                  onPressed: onRetry,
                                  style: TextButton.styleFrom(foregroundColor: p.deep, minimumSize: const Size(44, 44)),
                                  icon: const Icon(Icons.refresh, size: 18),
                                  label: const Text('Thử lại'),
                                ),
                            ],
                          ],
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
}

class _Sources extends StatelessWidget {
  const _Sources({required this.palette, required this.sources});
  final _Palette palette;
  final List<String> sources;

  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 6,
    runSpacing: 6,
    children: [
      for (final source in sources)
        Semantics(
          container: true,
          label: 'Nguồn: $source',
          excludeSemantics: true,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            decoration: BoxDecoration(color: palette.soft, borderRadius: BorderRadius.circular(14)),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.menu_book_outlined, size: 14, color: palette.deep),
                const SizedBox(width: 6),
                Flexible(
                  child: Tooltip(
                    message: source,
                    child: Text(
                      source,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11.5, color: palette.deep, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
    ],
  );
}

/// Remove source lines only when the actual sources are rendered as chips.
String withoutSourceLines(String text) =>
    text.split('\n').where((line) => !line.trimLeft().startsWith('Nguồn:')).join('\n').trimRight();

class _TypingDots extends StatefulWidget {
  const _TypingDots({super.key, required this.color});
  final Color color;

  @override
  State<_TypingDots> createState() => _TypingDotsState();
}

class _TypingDotsState extends State<_TypingDots> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _c.stop();
      _c.value = 0;
    } else {
      _c.repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Đang trả lời',
    child: SizedBox(
      height: 20,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < 3; i++)
              Container(
                width: 7,
                height: 7,
                margin: const EdgeInsets.symmetric(horizontal: 2),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: widget.color.withValues(alpha: (((_c.value * 3 - i) % 3) < 1) ? 0.9 : 0.3),
                ),
              ),
          ],
        ),
      ),
    ),
  );
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.palette,
    required this.controller,
    required this.busy,
    required this.online,
    required this.maxInputHeight,
    required this.onSend,
  });
  final _Palette palette;
  final TextEditingController controller;
  final bool busy;
  final bool online;
  final double maxInputHeight;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final p = palette;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      decoration: BoxDecoration(
        color: p.page,
        border: Border(top: BorderSide(color: p.border)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(16, 4, 4, 4),
            decoration: BoxDecoration(
              color: p.surface,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: p.border),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxHeight: maxInputHeight),
                    child: TextField(
                      key: const Key('chat-input'),
                      controller: controller,
                      enabled: !busy,
                      minLines: 1,
                      maxLines: 5,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => onSend(),
                      style: TextStyle(color: p.ink, height: 1.5),
                      decoration: InputDecoration(
                        hintText: busy ? 'Đang trả lời…' : 'Nhập câu hỏi…',
                        hintStyle: TextStyle(color: p.muted, fontSize: 14),
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        disabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        filled: false,
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                ValueListenableBuilder<TextEditingValue>(
                  valueListenable: controller,
                  builder: (context, value, _) {
                    final enabled = value.text.trim().isNotEmpty && !busy;
                    return IconButton.filled(
                      key: const Key('chat-send'),
                      tooltip: busy ? 'Đang trả lời' : 'Gửi câu hỏi',
                      onPressed: enabled ? onSend : null,
                      style: IconButton.styleFrom(
                        minimumSize: const Size(48, 48),
                        backgroundColor: p.deep,
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: p.soft,
                        disabledForegroundColor: p.muted,
                      ),
                      icon: busy
                          ? SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: p.deep,
                                value: MediaQuery.disableAnimationsOf(context) ? 0.75 : null,
                              ),
                            )
                          : const Icon(Icons.arrow_upward_rounded),
                    );
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            online
                ? 'Trợ lý chỉ cung cấp thông tin, không quyết định thay bạn.'
                : 'Đang trả lời bằng dữ liệu mẫu · Trợ lý chỉ cung cấp thông tin, không quyết định thay bạn.',
            key: const Key('chat-note'),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11, color: p.muted, height: 1.4),
          ),
        ],
      ),
    );
  }
}
