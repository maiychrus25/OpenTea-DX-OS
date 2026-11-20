// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:hub_mobile/data/models/chat.dart';
import 'package:hub_mobile/features/common/chat_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Fails the first answer, then answers normally: to test the retry button.
class _FlakyRepository extends MockHubRepository {
  int calls = 0;

  @override
  Stream<ChatEvent> chat({
    required ChatTopic topic,
    required String message,
    required List<ChatTurn> history,
    String? sessionId,
    ChatContext context = const ChatContext(),
  }) {
    calls++;
    if (calls == 1) return Stream.value(const ChatError(chatUnavailable));
    return super.chat(topic: topic, message: message, history: history, sessionId: sessionId, context: context);
  }
}

Future<GoRouter> _open(
  WidgetTester tester, {
  String? email,
  MockHubRepository? repository,
  double width = 390,
  double text = 1,
}) async {
  SharedPreferences.setMockInitialValues({});
  final store = await LocalStore.open();
  tester.view.physicalSize = Size(width, 1800);
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = text;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(
    HubApp(repository: repository ?? MockHubRepository(), auth: DemoAuthService(store), store: store),
  );
  await tester.pumpAndSettle();
  if (email == null) {
    await tester.tap(find.byKey(const Key('login-guest')));
  } else {
    await tester.enterText(find.byKey(const Key('login-email')), email);
    await tester.enterText(find.byKey(const Key('login-password')), DemoAuthService.demoPassword);
    await tester.tap(find.byKey(const Key('login-submit')));
  }
  await tester.pumpAndSettle();
  return GoRouter.of(tester.element(find.byType(Scaffold).first));
}

Future<void> _openFromStaffMenu(WidgetTester tester, String path) async {
  await tester.tap(find.byKey(const Key('menu-button')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(Key('menu-$path')));
  await tester.pumpAndSettle();
}

Future<void> _ask(WidgetTester tester, String question) async {
  await tester.enterText(find.byKey(const Key('chat-input')), question);
  await tester.pump();
  await tester.tap(find.byKey(const Key('chat-send')));
  await tester.pumpAndSettle();
}

String _path(GoRouter router) => router.routeInformationProvider.value.uri.path;

void main() {
  test('source lines are dropped from the shown text', () {
    expect(withoutSourceLines('Trả lời.\n\nNguồn: FAO 2026, Bộ NN&PTNT'), 'Trả lời.');
    expect(withoutSourceLines('Không có nguồn'), 'Không có nguồn');
  });

  testWidgets('a guest opens the assistant from the home tab and gets an answer with its source', (tester) async {
    final router = await _open(tester);
    await tester.ensureVisible(find.byKey(const Key('home-chat')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('home-chat')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('chat-input')), findsOneWidget);
    expect(find.textContaining('Dữ liệu mẫu'), findsWidgets);
    expect(find.byKey(const Key('chat-topic-market')), findsNothing); // one topic only

    await tester.tap(find.byKey(const Key('chat-suggest-1'))); // tours
    await tester.pumpAndSettle();
    expect(find.text('Có tour trải nghiệm nào?'), findsOneWidget);
    expect(find.textContaining('Tour trong app'), findsOneWidget);
    expect(find.text('Dữ liệu mẫu trong app'), findsOneWidget); // source chip
    expect(find.textContaining('Nguồn:'), findsNothing); // not repeated in the text

    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(_path(router), '/shop');
  });

  testWidgets('a customer finds the assistant in the drawer', (tester) async {
    final router = await _open(tester, email: 'customer@demo.vn');
    await tester.tap(find.byKey(const Key('home-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('menu-chat')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('chat-input')), findsOneWidget);
    expect(router, isNotNull);
    await _ask(tester, 'Cách thanh toán');
    expect(find.textContaining('VietQR'), findsOneWidget);
  });

  testWidgets('the send button is off while the field is empty', (tester) async {
    final router = await _open(tester);
    router.push('/shop/chat');
    await tester.pumpAndSettle();
    IconButton send() => tester.widget<IconButton>(find.byKey(const Key('chat-send')));
    expect(send().onPressed, isNull);
    await tester.enterText(find.byKey(const Key('chat-input')), '   ');
    await tester.pump();
    expect(send().onPressed, isNull);
    await tester.enterText(find.byKey(const Key('chat-input')), 'Tour');
    await tester.pump();
    expect(send().onPressed, isNotNull);
  });

  testWidgets('a manager switches between market and technical, each with its own conversation', (tester) async {
    await _open(tester, email: 'manager@demo.vn');
    await _openFromStaffMenu(tester, '/manager/chat');
    expect(find.byKey(const Key('staff-back')), findsOneWidget);
    expect(find.byKey(const Key('chat-topic-market')), findsOneWidget);
    expect(find.byKey(const Key('chat-topic-technical')), findsOneWidget);

    await _ask(tester, 'Giá thị trường hôm nay?');
    expect(find.textContaining('Tôi không có dữ liệu cập nhật'), findsOneWidget);

    await tester.tap(find.byKey(const Key('chat-topic-technical')));
    await tester.pumpAndSettle();
    expect(find.text('Giá thị trường hôm nay?'), findsNothing);
    expect(find.byKey(const Key('chat-suggest-0')), findsOneWidget);
    await _ask(tester, 'Giá thuốc bao nhiêu?');
    expect(find.textContaining('Chủ đề Kỹ thuật không trả lời giá cả'), findsOneWidget);

    await tester.tap(find.byKey(const Key('chat-topic-market')));
    await tester.pumpAndSettle();
    expect(find.text('Giá thị trường hôm nay?'), findsOneWidget);

    await tester.tap(find.byKey(const Key('chat-clear')));
    await tester.pumpAndSettle();
    expect(find.text('Giá thị trường hôm nay?'), findsNothing);
    expect(find.byKey(const Key('chat-suggest-0')), findsOneWidget);
  });

  testWidgets('an officer starts on the technical topic', (tester) async {
    await _open(tester, email: 'officer@demo.vn');
    await _openFromStaffMenu(tester, '/manager/chat');
    expect(find.textContaining('Kỹ thuật ·'), findsOneWidget);
  });

  testWidgets('a farmer asks about their own parcels', (tester) async {
    await _open(tester, email: 'farmer@demo.vn');
    await _openFromStaffMenu(tester, '/farmer/chat');
    expect(find.byKey(const Key('chat-topic-market')), findsNothing);
    await tester.tap(find.byKey(const Key('chat-suggest-2')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Thửa đất của hộ'), findsOneWidget);
  });

  testWidgets('the tour company asks about its next groups', (tester) async {
    await _open(tester, email: 'operator@demo.vn');
    await _openFromStaffMenu(tester, '/operator/chat');
    await tester.tap(find.byKey(const Key('chat-suggest-1')));
    await tester.pumpAndSettle();
    expect(find.textContaining('HTX liên kết trong dữ liệu mẫu'), findsOneWidget);
  });

  testWidgets('a failed answer can be retried', (tester) async {
    final repository = _FlakyRepository();
    final router = await _open(tester, repository: repository);
    router.push('/shop/chat');
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('chat-input')), 'Tour');
    await tester.pump();
    await tester.tap(find.byKey(const Key('chat-send')));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.text(chatUnavailable), findsOneWidget);
    expect(find.byKey(const Key('chat-typing')), findsNothing);
    await tester.tap(find.byKey(const Key('chat-retry')));
    await tester.pumpAndSettle();
    expect(repository.calls, 2);
    expect(find.text(chatUnavailable), findsNothing);
    expect(find.textContaining('Tour trong app'), findsOneWidget);
  });

  for (final (email, path) in [
    (null, '/shop/chat'),
    ('manager@demo.vn', '/manager/chat'),
    ('operator@demo.vn', '/operator/chat'),
  ]) {
    testWidgets('no overflow at 320 px with large text: ${email ?? 'guest'}', (tester) async {
      final router = await _open(tester, email: email, width: 320, text: 1.3);
      router.go(path);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.tap(find.byKey(const Key('chat-suggest-0')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await _ask(tester, 'Một câu hỏi rất dài để kiểm tra khung trò chuyện khi chữ lớn trên màn hình hẹp');
      expect(tester.takeException(), isNull);
    });
  }
}
