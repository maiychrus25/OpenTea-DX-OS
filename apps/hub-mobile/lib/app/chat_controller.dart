// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/role/role.dart';
import '../data/hub_repository.dart';
import '../data/models/chat.dart';

class ChatReply {
  ChatReply(this.question);
  final String question;
  String text = '';
  List<String> sources = const [];
  String? model;
  String? error;
  bool complete = false;
}

class ChatConversation {
  final List<ChatReply> _replies = [];
  List<ChatReply> get replies => List.unmodifiable(_replies);
  String? sessionId;
  bool streaming = false;
  StreamIterator<ChatEvent>? _iterator;
}

/// In-memory conversations for the active identity/role, independently per topic.
/// Leaving a route keeps the conversation; changing identity cancels and clears it.
class ChatController extends ChangeNotifier {
  ChatController(this.repository);
  final HubRepository repository;
  Claims? _claims;
  bool _disposed = false;
  final _conversations = <ChatTopic, ChatConversation>{};
  ChatTopic _topic = ChatTopic.shop;

  ChatTopic get topic => _topic;
  bool get online => _claims != null && repository.canChatOnline;
  List<ChatTopic> get topics => switch (roleFromClaims(_claims)) {
    AppRole.manager =>
      _claims!.canWriteHtx
          ? const [ChatTopic.market, ChatTopic.technical, ChatTopic.tour]
          : const [ChatTopic.technical, ChatTopic.market],
    AppRole.farmer => const [ChatTopic.technical],
    AppRole.guide => const [ChatTopic.tour],
    _ => const [ChatTopic.shop],
  };
  ChatConversation get conversation => _conversations.putIfAbsent(topic, ChatConversation.new);

  void bind(Claims? claims) {
    if (identical(_claims, claims)) return;
    _cancelAll();
    _claims = claims;
    _topic = topics.first;
    notifyListeners();
  }

  void selectTopic(ChatTopic value) {
    if (!topics.contains(value) || value == _topic) return;
    _topic = value;
    notifyListeners();
  }

  void clear() {
    final old = _conversations.remove(topic);
    unawaited(old?._iterator?.cancel());
    notifyListeners();
  }

  Future<void> retry() async {
    final c = conversation;
    if (c.streaming || c._replies.isEmpty || c._replies.last.error == null) return;
    final question = c._replies.removeLast().question;
    await send(question);
  }

  Future<void> send(String input) async {
    final message = input.trim();
    final currentTopic = topic;
    final c = conversation;
    if (message.isEmpty || c.streaming || _disposed) return;
    final history = <ChatTurn>[
      for (final reply in c._replies.where((r) => r.complete)) ...[
        ChatTurn(ChatRole.user, reply.question),
        ChatTurn(ChatRole.assistant, reply.text),
      ],
    ];
    final reply = ChatReply(message);
    c._replies.add(reply);
    c.streaming = true;
    notifyListeners();
    bool active() => !_disposed && identical(_conversations[currentTopic], c);
    StreamIterator<ChatEvent>? iterator;
    try {
      iterator = StreamIterator(
        repository.chat(
          topic: currentTopic,
          message: message,
          history: history,
          sessionId: c.sessionId,
          context: ChatContext(
            localOnly: _claims == null,
            guideId: roleFromClaims(_claims) == AppRole.guide ? _claims?.subject : null,
            htxCode: _claims?.htxCode,
            householdId: _claims?.householdId,
          ),
        ),
      );
      c._iterator = iterator;
      while (await iterator.moveNext()) {
        if (!active()) return;
        switch (iterator.current) {
          case ChatText(:final text):
            reply.text += text;
          case ChatDone(:final sources, :final model, :final sessionId):
            reply.sources = sources;
            reply.model = model;
            reply.complete = true;
            c.sessionId = sessionId ?? c.sessionId;
          case ChatError(:final message):
            reply.error = message;
        }
        notifyListeners();
        if (reply.complete || reply.error != null) break;
      }
      if (active() && !reply.complete && reply.error == null) reply.error = chatUnavailable;
    } catch (_) {
      if (active()) reply.error = chatUnavailable;
    } finally {
      // Free the page first: closing a server stream can take a while and must not keep "đang trả lời" on screen.
      if (active()) {
        c._iterator = null;
        c.streaming = false;
        notifyListeners();
      }
      unawaited(iterator?.cancel());
    }
  }

  void _cancelAll() {
    for (final c in _conversations.values) {
      unawaited(c._iterator?.cancel());
    }
    _conversations.clear();
  }

  @override
  void dispose() {
    _disposed = true;
    _cancelAll();
    super.dispose();
  }
}
