// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

enum ChatTopic {
  market('market', 'Thị trường'),
  technical('technical', 'Kỹ thuật'),
  shop('shop', 'Khám phá & mua sắm'),
  tour('tour', 'Điều phối du lịch');

  const ChatTopic(this.wireValue, this.label);
  final String wireValue;
  final String label;
}

enum ChatRole { user, assistant }

class ChatTurn {
  const ChatTurn(this.role, this.text);
  final ChatRole role;
  final String text;
  Map<String, String> toJson() => {'role': role.name, 'content': text};
}

/// Local-data scope only, never sent as authorization to the server.
/// Guests must use [localOnly] even when the app has an HTTP client configured.
class ChatContext {
  const ChatContext({this.localOnly = false, this.htxCode, this.householdId});
  final bool localOnly;
  final String? htxCode;
  final String? householdId;
}

sealed class ChatEvent {
  const ChatEvent();
}

class ChatText extends ChatEvent {
  const ChatText(this.text);
  final String text;
}

class ChatDone extends ChatEvent {
  const ChatDone({required this.sources, required this.model, this.sessionId});
  final List<String> sources;
  final String model;
  final String? sessionId;
}

class ChatError extends ChatEvent {
  const ChatError(this.message);
  final String message;
}

const chatUnavailable = 'Trợ lý AI tạm thời không khả dụng';
