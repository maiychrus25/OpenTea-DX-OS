// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:hub_mobile/app/app_state.dart';
import 'package:provider/provider.dart';
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

class _ControlledRepository extends MockHubRepository {
  final events = StreamController<ChatEvent>.broadcast();

  @override
  Stream<ChatEvent> chat({
    required ChatTopic topic,
    required String message,
    required List<ChatTurn> history,
    String? sessionId,
    ChatContext context = const ChatContext(),
  }) => events.stream;
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

    await _ask(tester, 'Có tour trải nghiệm nào?');
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

  testWidgets('welcome greets the signed-in user by given name and guests without a fake name', (tester) async {
    var router = await _open(tester, email: 'customer@demo.vn');
    router.push('/shop/chat');
    await tester.pumpAndSettle();
    final name = tester.element(find.byType(ChatPage)).read<AppState>().claims!.name.split(' ').last;
    expect(find.text('Chào $name!'), findsOneWidget);
    expect(find.text('Trợ lý OpenTea'), findsOneWidget);
    router = await _open(tester);
    router.push('/shop/chat');
    await tester.pumpAndSettle();
    expect(find.text('Chào bạn!'), findsOneWidget);
  });

  testWidgets('streaming locks the composer, shows progress and restores sending after source chips', (tester) async {
    final repository = _ControlledRepository();
    addTearDown(repository.events.close);
    final router = await _open(tester, repository: repository);
    router.push('/shop/chat');
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('chat-input')), 'Tour');
    await tester.pump();
    await tester.tap(find.byKey(const Key('chat-send')));
    await tester.pump(const Duration(milliseconds: 250));
    expect(tester.widget<TextField>(find.byKey(const Key('chat-input'))).enabled, isFalse);
    expect(find.text('Đang trả lời…'), findsWidgets);
    expect(find.byKey(const Key('chat-typing')), findsOneWidget);
    expect(
      find.descendant(of: find.byKey(const Key('chat-send')), matching: find.byType(CircularProgressIndicator)),
      findsOneWidget,
    );
    repository.events.add(const ChatText('Thông tin tour.\nNguồn: Tài liệu HTX'));
    repository.events.add(const ChatDone(sources: ['Tài liệu HTX', 'Danh mục tour'], model: 'test'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Nguồn:'), findsNothing);
    for (final source in ['Tài liệu HTX', 'Danh mục tour']) {
      final chip = find.bySemanticsLabel('Nguồn: $source');
      expect(chip, findsOneWidget);
      expect(find.descendant(of: chip, matching: find.byIcon(Icons.menu_book_outlined)), findsOneWidget);
    }
    expect(tester.widget<TextField>(find.byKey(const Key('chat-input'))).enabled, isTrue);
    expect(tester.widget<IconButton>(find.byKey(const Key('chat-send'))).onPressed, isNull);
    await tester.enterText(find.byKey(const Key('chat-input')), 'Hỏi tiếp');
    await tester.pump();
    expect(tester.widget<IconButton>(find.byKey(const Key('chat-send'))).onPressed, isNotNull);
  });

  testWidgets('streaming follows the bottom but preserves reading position until jump is tapped', (tester) async {
    final repository = _ControlledRepository();
    addTearDown(repository.events.close);
    final router = await _open(tester, repository: repository);
    router.push('/shop/chat');
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('chat-input')), 'Tour');
    await tester.pump();
    await tester.tap(find.byKey(const Key('chat-send')));
    await tester.pump(const Duration(milliseconds: 250));
    repository.events.add(ChatText(List.filled(90, 'Thông tin có nguồn về tour.').join('\n')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    final list = find.byKey(const Key('chat-messages-shop'));
    final scroll = tester.state<ScrollableState>(find.descendant(of: list, matching: find.byType(Scrollable)).first);
    expect(scroll.position.extentAfter, lessThan(2));
    await tester.drag(list, const Offset(0, 500));
    await tester.pump(const Duration(milliseconds: 300));
    final offset = scroll.position.pixels;
    expect(find.byKey(const Key('chat-jump-bottom')), findsOneWidget);
    repository.events.add(const ChatText('\nNội dung mới khi đang đọc phía trên.'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(scroll.position.pixels, closeTo(offset, 1));
    await tester.tap(find.byKey(const Key('chat-jump-bottom')));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump();
    expect(scroll.position.extentAfter, lessThan(2));
    expect(find.byKey(const Key('chat-jump-bottom')), findsNothing);
    repository.events.add(const ChatDone(sources: [], model: 'test'));
    await tester.pumpAndSettle();
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
    expect(find.text('Bạn muốn tìm hiểu điều gì?'), findsOneWidget);
    await _ask(tester, 'Giá thuốc bao nhiêu?');
    expect(find.textContaining('Chủ đề Kỹ thuật không trả lời giá cả'), findsOneWidget);

    await tester.tap(find.byKey(const Key('chat-topic-market')));
    await tester.pumpAndSettle();
    expect(find.text('Giá thị trường hôm nay?'), findsOneWidget);

    await tester.tap(find.byKey(const Key('chat-clear')));
    await tester.pumpAndSettle();
    expect(find.text('Giá thị trường hôm nay?'), findsNothing);
    expect(find.text('Bạn muốn tìm hiểu điều gì?'), findsOneWidget);
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
    await _ask(tester, 'Thửa đất và lịch thu hái của tôi');
    expect(find.textContaining('Thửa đất của hộ'), findsOneWidget);
  });

  testWidgets('a tour guide asks which HTX assigned them', (tester) async {
    await _open(tester, email: 'guide@demo.vn');
    await _openFromStaffMenu(tester, '/guide/chat');
    await _ask(tester, 'HTX nào giao tour cho tôi');
    expect(find.textContaining('HTX tổ chức các tour của bạn'), findsOneWidget);
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
    ('customer@demo.vn', '/shop/chat'),
    ('farmer@demo.vn', '/farmer/chat'),
    ('manager@demo.vn', '/manager/chat'),
    ('officer@demo.vn', '/manager/chat'),
    ('guide@demo.vn', '/guide/chat'),
  ]) {
    for (final width in [320.0, 1280.0]) {
      for (final brightness in Brightness.values) {
        testWidgets('stress round one: $email at $width, $brightness, large text and keyboard', (tester) async {
          tester.platformDispatcher.platformBrightnessTestValue = brightness;
          addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
          final router = await _open(tester, email: email, width: width, text: 1.3);
          router.go(path);
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          // Both existing themes deliberately remain light under a dark OS preference.
          expect(Theme.of(tester.element(find.byType(ChatPage))).brightness, Brightness.light);
          for (final key in ['chat-send', 'chat-clear']) {
            final size = tester.getSize(find.byKey(Key(key)));
            expect(size.width, greaterThanOrEqualTo(44));
            expect(size.height, greaterThanOrEqualTo(44));
          }
          tester.view.physicalSize = Size(width, 800);
          await tester.pumpAndSettle();
          await _ask(tester, 'Xin chào');
          expect(find.text('Bạn muốn tìm hiểu điều gì?'), findsNothing);
          expect(tester.takeException(), isNull);
          tester.view.viewInsets = const FakeViewPadding(bottom: 280);
          await tester.enterText(
            find.byKey(const Key('chat-input')),
            'Dòng một\nDòng hai\nDòng ba\nDòng bốn\nDòng năm',
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          expect(tester.getRect(find.byKey(const Key('chat-send'))).bottom, lessThanOrEqualTo(520));
          await tester.tap(find.byKey(const Key('chat-send')));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        });
      }
      testWidgets('stress round two: $email at $width, reduced motion, long sources and inline error', (tester) async {
        tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(
          disableAnimations: true,
        );
        addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
        final repository = _ControlledRepository();
        addTearDown(repository.events.close);
        final router = await _open(tester, email: email, repository: repository, width: width, text: 1.3);
        router.go(path);
        tester.view.physicalSize = Size(width, 800);
        await tester.pumpAndSettle();
        await tester.enterText(
          find.byKey(const Key('chat-input')),
          'Một câu hỏi dài về thông tin đã có nguồn trong app',
        );
        await tester.pump();
        await tester.tap(find.byKey(const Key('chat-send')));
        await tester.pumpAndSettle(); // No perpetual animations with reduced motion, even while waiting.
        expect(find.byKey(const Key('chat-typing')), findsOneWidget);
        expect(tester.binding.hasScheduledFrame, isFalse);
        repository.events.add(ChatText(List.filled(35, 'Thông tin đang được trả lời.').join('\n')));
        await tester.pumpAndSettle();
        repository.events.add(const ChatError(chatUnavailable));
        await tester.pumpAndSettle();
        expect(find.text(chatUnavailable), findsOneWidget);
        expect(find.byKey(const Key('chat-retry')), findsOneWidget);
        expect(find.byType(SnackBar), findsNothing);
        expect(tester.takeException(), isNull);
        await tester.tap(find.byKey(const Key('chat-clear')));
        await tester.pumpAndSettle();
        await _ask(tester, 'Xin chào');
        final longSource = List.filled(15, 'Tài liệu tham khảo của hợp tác xã').join(' ');
        repository.events.add(const ChatText('Câu trả lời có nguồn tham khảo.'));
        repository.events.add(ChatDone(sources: [longSource, 'Danh mục trong app'], model: 'test'));
        await tester.pumpAndSettle();
        expect(find.text(longSource), findsOneWidget);
        expect(find.byIcon(Icons.menu_book_outlined), findsNWidgets(2));
        expect(tester.takeException(), isNull);
      });
    }
  }

  for (final (email, path) in [
    (null, '/shop/chat'),
    ('manager@demo.vn', '/manager/chat'),
    ('guide@demo.vn', '/guide/chat'),
  ]) {
    testWidgets('no overflow at 320 px with large text: ${email ?? 'guest'}', (tester) async {
      final router = await _open(tester, email: email, width: 320, text: 1.3);
      router.go(path);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await _ask(tester, 'Xin chào');
      expect(tester.takeException(), isNull);
      await _ask(tester, 'Một câu hỏi rất dài để kiểm tra khung trò chuyện khi chữ lớn trên màn hình hẹp');
      expect(tester.takeException(), isNull);
    });
  }
}
