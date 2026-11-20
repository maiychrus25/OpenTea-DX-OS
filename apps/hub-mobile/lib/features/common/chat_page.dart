// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/chat_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/staff_theme.dart';
import '../../data/models/chat.dart';
import '../../shared/soft_card.dart';

/// Colours of the page: the storefront palette for guests and customers, the DX-OS one inside the staff shell.
class _Palette {
  const _Palette({
    required this.page,
    required this.deep,
    required this.accent,
    required this.ink,
    required this.muted,
    required this.border,
    required this.soft,
  });
  final Color page, deep, accent, ink, muted, border, soft;

  static const customer = _Palette(
    page: AppColors.cream,
    deep: AppColors.teaDark,
    accent: AppColors.lime,
    ink: AppColors.ink,
    muted: AppColors.faint,
    border: AppColors.border,
    soft: AppColors.tile,
  );
  static const staff = _Palette(
    page: StaffColors.background,
    deep: StaffColors.sidebar,
    accent: StaffColors.lime,
    ink: StaffColors.ink,
    muted: StaffColors.muted,
    border: StaffColors.border,
    soft: StaffColors.secondary,
  );
}

/// "Trợ lý AI": one page for every role. The topic list comes from the role (see [ChatController.topics]).
class ChatPage extends StatefulWidget {
  const ChatPage({super.key, this.customer = false});

  /// True for guests and customers: the page brings its own scaffold and back button.
  final bool customer;

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  final _input = TextEditingController();

  _Palette get _p => widget.customer ? _Palette.customer : _Palette.staff;

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  void _send(ChatController chat, [String? question]) {
    final text = question ?? _input.text;
    if (text.trim().isEmpty || chat.conversation.streaming) return;
    _input.clear();
    chat.send(text);
  }

  @override
  Widget build(BuildContext context) {
    final chat = context.watch<ChatController>();
    final conversation = chat.conversation;
    final replies = conversation.replies;
    final p = _p;
    final body = ColoredBox(
      color: p.page,
      child: SafeArea(
        top: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: Column(
              children: [
                _Header(
                  palette: p,
                  chat: chat,
                  onClear: replies.isEmpty
                      ? null
                      : () {
                          _input.clear();
                          chat.clear();
                        },
                  onTopic: (t) {
                    _input.clear();
                    chat.selectTopic(t);
                  },
                ),
                Expanded(
                  child: replies.isEmpty
                      ? _Welcome(palette: p, topic: chat.topic, onSend: (q) => _send(chat, q))
                      : ListView.builder(
                          key: ValueKey('chat-messages-${chat.topic.name}'),
                          reverse: true,
                          padding: const EdgeInsets.fromLTRB(14, 16, 14, 8),
                          itemCount: replies.length,
                          itemBuilder: (context, index) {
                            final reply = replies[replies.length - index - 1];
                            return _Exchange(
                              palette: p,
                              reply: reply,
                              waiting: index == 0 && conversation.streaming,
                              onRetry: index == 0 && !conversation.streaming ? chat.retry : null,
                            );
                          },
                        ),
                ),
                _Composer(
                  palette: p,
                  controller: _input,
                  busy: conversation.streaming,
                  online: chat.online,
                  onSend: () => _send(chat),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (!widget.customer) return body; // StaffShell owns the scaffold, theme and back arrow.
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
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(color: palette.accent, shape: BoxShape.circle),
    child: Icon(Icons.auto_awesome, size: size * 0.55, color: palette.deep),
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
    final online = chat.online;
    return Container(
      margin: const EdgeInsets.fromLTRB(14, 10, 14, 0),
      padding: const EdgeInsets.fromLTRB(14, 12, 6, 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [p.deep, Color.lerp(p.deep, Colors.black, 0.25)!],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
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
                    const Text(
                      'Trợ lý AI',
                      style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Container(
                          width: 7,
                          height: 7,
                          decoration: BoxDecoration(
                            color: online ? p.accent : const Color(0xFFF5C451),
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            '${chat.topic.label} · ${online ? 'Trực tuyến' : 'Dữ liệu mẫu'}',
                            key: const Key('chat-mode'),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Colors.white70, fontSize: 12.5),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              IconButton(
                key: const Key('chat-clear'),
                tooltip: 'Xoá hội thoại',
                onPressed: onClear,
                color: Colors.white,
                disabledColor: Colors.white30,
                icon: const Icon(Icons.refresh_rounded),
              ),
            ],
          ),
          if (chat.topics.length > 1) ...[
            const SizedBox(height: 12),
            Container(
              margin: const EdgeInsets.only(right: 8),
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  for (final topic in chat.topics)
                    Expanded(
                      child: GestureDetector(
                        key: Key('chat-topic-${topic.wireValue}'),
                        onTap: () => onTopic(topic),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 180),
                          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
                          decoration: BoxDecoration(
                            color: chat.topic == topic ? p.accent : Colors.transparent,
                            borderRadius: BorderRadius.circular(9),
                          ),
                          child: Text(
                            topic.label,
                            textAlign: TextAlign.center,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: chat.topic == topic ? p.deep : Colors.white,
                            ),
                          ),
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

typedef _Suggestion = (IconData, String);

List<_Suggestion> _suggestionsFor(ChatTopic topic) => switch (topic) {
  ChatTopic.shop => const [
    (Icons.local_cafe_outlined, 'Sản phẩm và giá trong app'),
    (Icons.hiking, 'Có tour trải nghiệm nào?'),
    (Icons.place_outlined, 'HTX và điểm đến nổi bật'),
    (Icons.qr_code_2, 'Cách đặt hàng và thanh toán'),
  ],
  ChatTopic.market => const [
    (Icons.sell_outlined, 'Giá sản phẩm trong danh mục'),
    (Icons.receipt_long_outlined, 'HTX có bao nhiêu đơn hàng?'),
    (Icons.trending_up, 'Có giá thị trường hôm nay không?'),
  ],
  ChatTopic.technical => const [
    (Icons.coronavirus_outlined, 'Các bệnh lá chè trong mẫu'),
    (Icons.description_outlined, 'Cách ghi nhật ký đồng ruộng'),
    (Icons.eco_outlined, 'Thửa đất và lịch thu hái của tôi'),
  ],
  ChatTopic.tour => const [
    (Icons.groups_outlined, 'Các đoàn sắp đi'),
    (Icons.account_balance_outlined, 'HTX liên kết'),
    (Icons.route_outlined, 'Tour toàn vùng'),
    (Icons.bar_chart_outlined, 'Báo cáo doanh thu'),
  ],
};

String _introFor(ChatTopic topic) => switch (topic) {
  ChatTopic.shop => 'Hỏi về đặc sản chè, tour trải nghiệm, hợp tác xã và cách đặt hàng.',
  ChatTopic.market => 'Hỏi về giá trong danh mục, đơn hàng và số liệu thị trường có nguồn.',
  ChatTopic.technical => 'Hỏi về bệnh chè, nhật ký đồng ruộng và lịch thu hái của thửa đất.',
  ChatTopic.tour => 'Hỏi về đoàn khách sắp đến, HTX liên kết, tour và doanh thu.',
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
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 22, 14, 12),
      children: [
        Text(
          'Bạn muốn tìm hiểu điều gì?',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: p.ink),
        ),
        const SizedBox(height: 6),
        Text(_introFor(topic), style: TextStyle(color: p.muted, height: 1.4)),
        const SizedBox(height: 18),
        Text(
          'GỢI Ý CÂU HỎI',
          style: TextStyle(fontSize: 11.5, letterSpacing: 0.8, fontWeight: FontWeight.w700, color: p.muted),
        ),
        const SizedBox(height: 8),
        for (var i = 0; i < suggestions.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Material(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              child: InkWell(
                key: Key('chat-suggest-$i'),
                borderRadius: BorderRadius.circular(14),
                onTap: () => onSend(suggestions[i].$2),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: p.border),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 34,
                        height: 34,
                        decoration: BoxDecoration(color: p.soft, borderRadius: BorderRadius.circular(10)),
                        child: Icon(suggestions[i].$1, size: 18, color: p.deep),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          suggestions[i].$2,
                          style: TextStyle(fontWeight: FontWeight.w600, color: p.ink),
                        ),
                      ),
                      Icon(Icons.north_east, size: 16, color: p.muted),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _Exchange extends StatelessWidget {
  const _Exchange({required this.palette, required this.reply, required this.waiting, this.onRetry});
  final _Palette palette;
  final ChatReply reply;
  final bool waiting;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final p = palette;
    final error = reply.error;
    final shown = reply.sources.isEmpty ? reply.text : withoutSourceLines(reply.text);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Align(
          alignment: Alignment.centerRight,
          child: Container(
            margin: const EdgeInsets.only(left: 48, bottom: 10),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: p.deep,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(18),
                topRight: Radius.circular(18),
                bottomLeft: Radius.circular(18),
                bottomRight: Radius.circular(5),
              ),
            ),
            child: Text(reply.question, style: const TextStyle(color: Colors.white, height: 1.35)),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(right: 28, bottom: 16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              _BotAvatar(palette: p, size: 26),
              const SizedBox(width: 8),
              Flexible(
                child: Container(
                  padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                  decoration: BoxDecoration(
                    color: error != null ? const Color(0xFFFDF1EF) : Colors.white,
                    border: Border.all(color: error != null ? const Color(0xFFF3C9C3) : p.border),
                    borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(18),
                      topRight: Radius.circular(18),
                      bottomLeft: Radius.circular(5),
                      bottomRight: Radius.circular(18),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (shown.isNotEmpty) SelectableText(shown, style: TextStyle(color: p.ink, height: 1.45)),
                      if (waiting && reply.text.isEmpty) _TypingDots(key: const Key('chat-typing'), color: p.muted),
                      if (reply.sources.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            for (final source in reply.sources)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(color: p.soft, borderRadius: BorderRadius.circular(20)),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.bookmark_border, size: 12, color: p.deep),
                                    const SizedBox(width: 4),
                                    Flexible(
                                      child: Text(
                                        source,
                                        style: TextStyle(fontSize: 11.5, color: p.deep, fontWeight: FontWeight.w600),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ],
                      if (error != null) ...[
                        Row(
                          children: [
                            const Icon(Icons.error_outline, size: 16, color: AppColors.danger),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(error, style: const TextStyle(color: AppColors.danger)),
                            ),
                          ],
                        ),
                        if (onRetry != null)
                          Align(
                            alignment: Alignment.centerLeft,
                            child: TextButton.icon(
                              key: const Key('chat-retry'),
                              onPressed: onRetry,
                              style: TextButton.styleFrom(foregroundColor: p.deep, padding: EdgeInsets.zero),
                              icon: const Icon(Icons.refresh, size: 18),
                              label: const Text('Thử lại'),
                            ),
                          ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// The reply without its "Nguồn: …" lines, once the sources are shown as chips under it (server and local answers
/// both end with such a line).
String withoutSourceLines(String text) =>
    text.split('\n').where((line) => !line.trimLeft().startsWith('Nguồn:')).join('\n').trimRight();

/// Three dots that fade in turn while the reply has not started.
class _TypingDots extends StatefulWidget {
  const _TypingDots({super.key, required this.color});
  final Color color;

  @override
  State<_TypingDots> createState() => _TypingDotsState();
}

class _TypingDotsState extends State<_TypingDots> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Đang trả lời',
    child: SizedBox(
      height: 18,
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
    required this.onSend,
  });
  final _Palette palette;
  final TextEditingController controller;
  final bool busy;
  final bool online;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final p = palette;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
      decoration: BoxDecoration(
        color: p.page,
        border: Border(top: BorderSide(color: p.border)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(16, 4, 5, 4),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(26),
              border: Border.all(color: p.border),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: TextField(
                    key: const Key('chat-input'),
                    controller: controller,
                    minLines: 1,
                    maxLines: 4,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => onSend(),
                    style: TextStyle(color: p.ink),
                    decoration: InputDecoration(
                      hintText: 'Nhập câu hỏi…',
                      hintStyle: TextStyle(color: p.muted),
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      filled: false,
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(vertical: 11),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                ValueListenableBuilder<TextEditingValue>(
                  valueListenable: controller,
                  builder: (context, value, _) {
                    final enabled = value.text.trim().isNotEmpty && !busy;
                    return IconButton.filled(
                      key: const Key('chat-send'),
                      tooltip: 'Gửi câu hỏi',
                      onPressed: enabled ? onSend : null,
                      style: IconButton.styleFrom(
                        backgroundColor: p.deep,
                        foregroundColor: p.accent,
                        disabledBackgroundColor: p.soft,
                        disabledForegroundColor: p.muted,
                      ),
                      icon: const Icon(Icons.arrow_upward_rounded),
                    );
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          Text(
            online
                ? 'Trợ lý chỉ cung cấp thông tin, không quyết định thay bạn.'
                : 'Đang trả lời bằng dữ liệu mẫu · Trợ lý chỉ cung cấp thông tin, không quyết định thay bạn.',
            key: const Key('chat-note'),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11, color: p.muted, height: 1.3),
          ),
        ],
      ),
    );
  }
}
