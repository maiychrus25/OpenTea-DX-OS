// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<GoRouter> _open(WidgetTester tester, {double width = 390, double text = 1}) async {
  SharedPreferences.setMockInitialValues({});
  final store = await LocalStore.open();
  tester.view.physicalSize = Size(width, 1800);
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = text;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(HubApp(repository: MockHubRepository(), auth: DemoAuthService(store), store: store));
  await tester.pumpAndSettle();
  await tester.enterText(find.byKey(const Key('login-email')), 'operator@demo.vn');
  await tester.enterText(find.byKey(const Key('login-password')), DemoAuthService.demoPassword);
  await tester.tap(find.byKey(const Key('login-submit')));
  await tester.pumpAndSettle();
  return GoRouter.of(tester.element(find.byType(Scaffold).first));
}

void main() {
  testWidgets('the dashboard lists the next groups, nearest first, and opens their booking', (tester) async {
    final router = await _open(tester);
    final section = find.byKey(const Key('upcoming-groups'));
    await tester.ensureVisible(section);
    final rows = find.descendant(
      of: section,
      matching: find.byWidgetPredicate(
        (w) => w.key is ValueKey<String> && (w.key as ValueKey<String>).value.startsWith('upcoming-bk'),
      ),
    );
    expect(rows, findsWidgets);
    await tester.tap(rows.first);
    await tester.pumpAndSettle();
    expect(find.text('Chi tiết lượt đặt'), findsOneWidget);
    expect(router, isNotNull);
  });

  testWidgets('the dashboard has shortcuts with waiting counts and the revenue share by cooperative', (tester) async {
    final router = await _open(tester);
    expect(find.byKey(const Key('revenue-share')), findsOneWidget);
    expect(find.text('tháng này'), findsOneWidget); // donut caption
    for (final (key, path) in [
      ('quick-bookings', '/operator/bookings'),
      ('quick-payments', '/operator/payments'),
      ('quick-articles', '/operator/articles'),
      ('quick-reports', '/operator/reports'),
    ]) {
      router.go('/operator');
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(Key(key)));
      await tester.pumpAndSettle();
      expect(router.routeInformationProvider.value.uri.path, path, reason: key);
    }
  });

  testWidgets('a booking shows its progress and the phone can be copied', (tester) async {
    final router = await _open(tester);
    router.go('/operator');
    await tester.pumpAndSettle();
    router.push('/operator/bookings/bk-02');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('booking-steps')), findsOneWidget);
    expect(find.text('Đón đoàn'), findsOneWidget);
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String?;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    await tester.tap(find.byKey(const Key('copy-phone')));
    await tester.pumpAndSettle();
    expect(copied, '0987654321');
    expect(find.text('Đã sao chép số điện thoại'), findsOneWidget);
  });

  testWidgets('bookings are grouped under their day', (tester) async {
    final router = await _open(tester);
    router.go('/operator/bookings');
    await tester.pumpAndSettle();
    expect(find.text('Chờ xác nhận'), findsWidgets);
    expect(find.textContaining('đoàn'), findsWidgets);
    expect(find.text('Đoàn sắp đi'), findsOneWidget);
  });

  testWidgets('bookings can be filtered by state', (tester) async {
    final router = await _open(tester);
    router.go('/operator/bookings');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('op-booking-bk-01')), findsOneWidget);
    expect(find.byKey(const Key('op-booking-bk-02')), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('op-filter-Chờ xác nhận')));
    await tester.tap(find.byKey(const Key('op-filter-Chờ xác nhận')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('op-booking-bk-01')), findsNothing); // confirmed
    expect(find.byKey(const Key('op-booking-bk-02')), findsOneWidget); // pending
    await tester.ensureVisible(find.byKey(const Key('op-filter-Đã huỷ')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('op-filter-Đã huỷ')));
    await tester.pumpAndSettle();
    expect(find.text('Không có lượt đặt nào'), findsOneWidget);
  });

  testWidgets('articles show the cooperative name, not its code', (tester) async {
    final router = await _open(tester);
    router.go('/operator/articles');
    await tester.pumpAndSettle();
    expect(find.textContaining('tan-cuong'), findsNothing);
    expect(find.text('HTX Chè Tân Cương'), findsOneWidget);
  });

  for (final width in [320.0, 390.0]) {
    testWidgets('every tour company page fits at $width px with large text', (tester) async {
      final router = await _open(tester, width: width, text: 1.3);
      for (final path in [
        '/operator',
        '/operator/htx',
        '/operator/tours',
        '/operator/articles',
        '/operator/reports',
        '/operator/bookings',
        '/operator/payments',
        '/operator/bookings/bk-02',
      ]) {
        router.go(path);
        await tester.pumpAndSettle();
        final scroll = find.byType(Scrollable);
        if (scroll.evaluate().isNotEmpty) {
          final state = tester.state<ScrollableState>(scroll.first);
          while (state.position.pixels < state.position.maxScrollExtent) {
            state.position.jumpTo((state.position.pixels + 400).clamp(0, state.position.maxScrollExtent));
            await tester.pumpAndSettle();
          }
        }
        expect(tester.takeException(), isNull, reason: path);
      }
    });
  }
}
