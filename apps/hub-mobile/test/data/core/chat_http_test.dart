// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:hub_mobile/data/auth_service.dart';
import 'package:hub_mobile/data/core/graphql_client.dart';
import 'package:hub_mobile/data/core/hub_api_client.dart';
import 'package:hub_mobile/data/http_hub_repository.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:hub_mobile/data/models/chat.dart';

class _StreamingClient extends http.BaseClient {
  _StreamingClient(this.reply);
  final http.StreamedResponse Function(int) reply;
  final calls = <http.Request>[];
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    calls.add(request as http.Request);
    return reply(calls.length);
  }
}

http.StreamedResponse _response(String text, {int status = 200}) => http.StreamedResponse(
  // One byte per chunk deliberately splits Vietnamese UTF-8 and every NDJSON line.
  Stream.fromIterable(utf8.encode(text).map((b) => [b])),
  status,
  headers: {'content-type': 'text/event-stream', 'x-chat-session-id': 'session-1'},
);
const _success =
    '\n{"text":"Chào "}\r\n{"text":"bạn"}\n{"done":true,"sources":["Tài liệu HTX"],"model":"server-model"}';

HttpHubRepository _repo(_StreamingClient client, {BearerRefresher? refresh, bool api = true, Duration? timeout}) {
  Future<BearerToken?> bearer() async => const BearerToken('old-token', hasuraRole: 'manager');
  return HttpHubRepository(
    core: GraphqlClient(baseUrl: 'https://gateway.test', client: client, bearer: bearer),
    api: api
        ? HubApiClient(
            baseUrl: 'https://gateway.test',
            client: client,
            bearer: bearer,
            refresh: refresh,
            timeout: timeout ?? const Duration(seconds: 1),
          )
        : null,
    shop: MockHubRepository(),
  );
}

void main() {
  test('parses chunked UTF8 NDJSON and reuses session header on next turn', () async {
    final client = _StreamingClient((_) => _response(_success));
    final repo = _repo(client);
    final events = await repo.chat(topic: ChatTopic.market, message: 'Giá danh mục', history: []).toList();
    expect(events.whereType<ChatText>().map((e) => e.text).join(), 'Chào bạn');
    final done = events.last as ChatDone;
    expect(done.sources, ['Tài liệu HTX']);
    expect(done.model, 'server-model');
    expect(done.sessionId, 'session-1');
    await repo
        .chat(
          topic: ChatTopic.market,
          message: 'Còn gì?',
          history: const [ChatTurn(ChatRole.user, 'Giá danh mục'), ChatTurn(ChatRole.assistant, 'Chào bạn')],
          sessionId: done.sessionId,
        )
        .toList();
    final request = client.calls.last;
    expect(request.method, 'POST');
    expect(request.url.path, '/api/chatbot');
    expect(request.headers['Authorization'], 'Bearer old-token');
    expect(request.followRedirects, isFalse);
    expect(jsonDecode(request.body), {
      'message': 'Còn gì?',
      'type': 'market',
      'session_id': 'session-1',
      'history': [
        {'role': 'user', 'content': 'Giá danh mục'},
        {'role': 'assistant', 'content': 'Chào bạn'},
      ],
    });
  });
  for (final topic in ChatTopic.values) {
    test('sends ${topic.name} wire value', () async {
      final client = _StreamingClient((_) => _response(_success));
      await _repo(client).chat(topic: topic, message: 'Câu hỏi', history: []).toList();
      expect(jsonDecode(client.calls.single.body)['type'], topic.wireValue);
    });
  }
  test('refreshes exactly once on 401 and retries with new Bearer', () async {
    var refreshes = 0;
    final client = _StreamingClient((n) => n == 1 ? _response('', status: 401) : _response(_success));
    final repo = _repo(
      client,
      refresh: () async {
        refreshes++;
        return const BearerToken('new-token', hasuraRole: 'manager');
      },
    );
    final events = await repo.chat(topic: ChatTopic.market, message: 'Giá', history: []).toList();
    expect(events.last, isA<ChatDone>());
    expect(refreshes, 1);
    expect(client.calls.last.headers['Authorization'], 'Bearer new-token');
  });
  for (final renewable in [true, false]) {
    test('401 failure asks to sign in without repeated refresh ($renewable)', () async {
      var refreshes = 0;
      final client = _StreamingClient((_) => _response('secret diagnostics', status: 401));
      final repo = _repo(
        client,
        refresh: () async {
          refreshes++;
          return renewable ? const BearerToken('fresh', hasuraRole: 'manager') : null;
        },
      );
      final events = await repo.chat(topic: ChatTopic.market, message: 'Giá', history: []).toList();
      expect((events.single as ChatError).message, contains('đăng nhập lại'));
      expect(refreshes, 1);
      expect(client.calls.length, renewable ? 2 : 1);
    });
  }
  for (final status in [403, 503, 500, 400, 302]) {
    test('maps status $status without leaking raw response', () async {
      final client = _StreamingClient((_) => _response('private diagnostics', status: status));
      final events = await _repo(client).chat(topic: ChatTopic.market, message: 'Hi', history: []).toList();
      expect(
        (events.single as ChatError).message,
        status == 403 ? 'Vai của bạn chưa được dùng trợ lý trên máy chủ' : chatUnavailable,
      );
    });
  }
  for (final body in [
    '{"error":true,"message":"internal secret"}\n',
    '{"text":"partial"}\n',
    'data: {"text":"wrong framing"}\n',
    '{"done":true,"sources":[42],"model":"m"}\n',
    '{"text":null}\n',
  ]) {
    test('handles error or malformed/incomplete stream: $body', () async {
      final events = await _repo(
        _StreamingClient((_) => _response(body)),
      ).chat(topic: ChatTopic.market, message: 'Hi', history: []).toList();
      expect((events.last as ChatError).message, chatUnavailable);
    });
  }
  test('guest with an API configured never calls network', () async {
    final client = _StreamingClient((_) => throw StateError('must not call'));
    final events = await _repo(client)
        .chat(topic: ChatTopic.shop, message: 'Sản phẩm', history: [], context: const ChatContext(localOnly: true))
        .toList();
    expect((events.last as ChatDone).model, 'local-data');
    expect(client.calls, isEmpty);
  });
  test('no API falls back locally', () async {
    final client = _StreamingClient((_) => throw StateError('must not call'));
    final repo = _repo(client, api: false);
    expect(repo.canChatOnline, isFalse);
    expect((await repo.chat(topic: ChatTopic.shop, message: 'Tour', history: []).last), isA<ChatDone>());
    expect(client.calls, isEmpty);
  });
  test('idle stream times out with friendly retryable error', () async {
    final stream = StreamController<List<int>>();
    final client = _StreamingClient((_) => http.StreamedResponse(stream.stream, 200));
    final events = await _repo(
      client,
      timeout: const Duration(milliseconds: 5),
    ).chat(topic: ChatTopic.market, message: 'Hi', history: []).toList();
    expect((events.single as ChatError).message, chatUnavailable);
    await stream.close();
  });
}
