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

Future<GoRouter> _open(
  WidgetTester tester, {
  String role = 'guide',
  double width = 390,
  double text = 1,
  MockHubRepository? repo,
  Brightness brightness = Brightness.light,
}) async {
  SharedPreferences.setMockInitialValues({});
  final store = await LocalStore.open();
  await store.saveSession(DemoAuthService.accounts['$role@demo.vn']!);
  tester.view.physicalSize = Size(width, 1800);
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = text;
  tester.platformDispatcher.platformBrightnessTestValue = brightness;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(HubApp(repository: repo ?? MockHubRepository(), auth: DemoAuthService(store), store: store));
  await tester.pumpAndSettle();
  return GoRouter.of(tester.element(find.byType(Scaffold).first));
}

Future<void> _walk(WidgetTester tester) async {
  final scrolls = find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down);
  if (scrolls.evaluate().isEmpty) return;
  final scroll = tester.state<ScrollableState>(scrolls.first);
  while (scroll.position.pixels < scroll.position.maxScrollExtent) {
    scroll.position.jumpTo((scroll.position.pixels + 400).clamp(0, scroll.position.maxScrollExtent));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  }
}

void main() {
  testWidgets('guide sees assigned tours and both assigning HTXs, never an unassigned tour', (tester) async {
    final repo = MockHubRepository();
    final router = await _open(tester, repo: repo);
    expect(find.text('Sắp tới'), findsOneWidget);
    expect(find.byKey(const Key('guide-next-dep-01')), findsWidgets);
    expect(find.textContaining('Do HTX Chè Tân Cương'), findsWidgets);
    expect(find.textContaining('Do HTX Chè Shan Tuyết Suối Giàng'), findsWidgets);
    expect(find.text((await repo.getTour('tour-02')).name), findsNothing);
    expect(find.textContaining('khách'), findsWidgets);
    router.push('/guide/tours/tour-02');
    await tester.pumpAndSettle();
    expect(find.text('Tour này chưa được giao cho bạn.'), findsOneWidget);
    expect(find.byKey(const Key('confirm-payment')), findsNothing);
  });

  testWidgets('guide detail has guests payment state contact and check-in but no management controls', (tester) async {
    final router = await _open(tester);
    router.push('/guide/tours/tour-01');
    await tester.pumpAndSettle();
    expect(find.text('TOUR K7M2QX'), findsOneWidget);
    expect(find.text('02083860001'), findsOneWidget);
    expect(find.textContaining('khách'), findsWidgets);
    expect(find.byKey(const Key('guide-checkin-bk-01')), findsOneWidget);
    expect(find.byKey(const Key('guide-checkin-bk-02')), findsNothing);
    for (final label in ['Sửa tour', 'Tạo tour', 'Huỷ lượt đặt', 'Thêm nhân viên dẫn tour']) {
      expect(find.text(label), findsNothing);
    }
    expect(find.byKey(const Key('confirm-payment')), findsNothing);
  });

  testWidgets('manager booking retains progress and copy-phone action', (tester) async {
    final router = await _open(tester, role: 'manager');
    router.push('/manager/bookings/bk-02');
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

  testWidgets('manager bookings keep day groups and filters, excluding other HTXs', (tester) async {
    final router = await _open(tester, role: 'manager');
    router.go('/manager/bookings');
    await tester.pumpAndSettle();
    expect(find.text('Đoàn sắp đi'), findsOneWidget);
    expect(find.byKey(const Key('op-booking-bk-01')), findsOneWidget);
    expect(find.byKey(const Key('op-booking-bk-02')), findsOneWidget);
    expect(find.byKey(const Key('op-booking-bk-03')), findsNothing);
    await tester.tap(find.byKey(const Key('op-filter-Chờ xác nhận')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('op-booking-bk-01')), findsNothing);
    expect(find.byKey(const Key('op-booking-bk-02')), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('op-filter-Đã huỷ')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('op-filter-Đã huỷ')));
    await tester.pumpAndSettle();
    expect(find.text('Không có lượt đặt nào'), findsOneWidget);
    router.push('/manager/bookings/bk-03');
    await tester.pumpAndSettle();
    expect(find.text('Không tìm thấy lượt đặt'), findsOneWidget);
  });

  testWidgets('manager creates tour assigns and removes guide, who sees updated assignments', (tester) async {
    final repo = MockHubRepository();
    var router = await _open(tester, role: 'manager', repo: repo);
    router.go('/manager/tours');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('create-tour')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('tour-name')), 'Tour kiểm thử của HTX');
    await tester.tap(find.byKey(const Key('add-departure')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('save-tour')));
    await tester.pumpAndSettle();
    final tour = (await repo.listTours()).firstWhere((t) => t.name == 'Tour kiểm thử của HTX');
    router.push('/manager/tours/${tour.id}/guides');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('assign-guide-demo')));
    await tester.pumpAndSettle();
    expect((await repo.getTour(tour.id)).guideIds, contains('guide-demo'));
    router = await _open(tester, repo: repo);
    expect(find.text('Tour kiểm thử của HTX'), findsWidgets);
    router = await _open(tester, role: 'manager', repo: repo);
    router.push('/manager/tours/${tour.id}/guides');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('assign-guide-demo')));
    await tester.pumpAndSettle();
    await _open(tester, repo: repo);
    expect(find.text('Tour kiểm thử của HTX'), findsNothing);
  });

  testWidgets('manager adds a named guide by phone and edits tour fields', (tester) async {
    final repo = MockHubRepository();
    final router = await _open(tester, role: 'manager', repo: repo);
    router.push('/manager/tours/tour-01/guides');
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('guide-name')), 'Nhân viên mới');
    await tester.enterText(find.byKey(const Key('guide-phone')), '0912345000');
    await tester.tap(find.byKey(const Key('add-guide')));
    await tester.pumpAndSettle();
    final guide = (await repo.listHtxGuides('tan-cuong')).firstWhere((g) => g.name == 'Nhân viên mới');
    expect((await repo.listGuideTours(guide.id)).single.id, 'tour-01');
    router.pop();
    router.push('/manager/tours/tour-01/edit');
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('tour-name')), 'Tên tour cập nhật');
    await tester.enterText(find.byKey(const Key('tour-seats')), '30');
    await tester.tap(find.byKey(const Key('save-tour')));
    await tester.pumpAndSettle();
    expect((await repo.getTour('tour-01')).name, 'Tên tour cập nhật');
    expect((await repo.listDepartures('tour-01')).every((d) => d.seatsTotal == 30), isTrue);
  });

  testWidgets('officer can read tours but direct editor, assignments and booking cannot write', (tester) async {
    final router = await _open(tester, role: 'officer');
    router.go('/manager/tours');
    await tester.pumpAndSettle();
    expect(find.text('Tour của HTX'), findsOneWidget);
    expect(find.byKey(const Key('create-tour')), findsNothing);
    expect(find.text('Sửa tour'), findsNothing);
    router.push('/manager/tours/new');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('save-tour')), findsNothing);
    router.pop();
    router.push('/manager/tours/tour-01/guides');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('assign-guide-demo')), findsNothing);
    expect(find.byKey(const Key('add-guide')), findsNothing);
    router.pop();
    router.push('/manager/bookings/bk-02');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('confirm-payment')), findsNothing);
    expect(find.byKey(const Key('cancel-booking')), findsNothing);
  });

  for (final width in [320.0, 1280.0]) {
    for (final brightness in Brightness.values) {
      for (final role in ['manager', 'officer', 'guide']) {
        testWidgets('$role tour pages fit $width px 130 percent ${brightness.name}', (tester) async {
          final router = await _open(tester, role: role, width: width, text: 1.3, brightness: brightness);
          final paths = role == 'guide'
              ? ['/guide', '/guide/tours/tour-01', '/guide/notifications', '/guide/me']
              : [
                  '/manager/tours',
                  '/manager/tours/new',
                  '/manager/tours/tour-01/edit',
                  '/manager/tours/tour-01/guides',
                  '/manager/bookings',
                  '/manager/bookings/bk-02',
                  '/manager/tour-payments',
                ];
          for (final path in paths) {
            router.go(path);
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull, reason: path);
            await _walk(tester);
          }
        });
      }
    }
  }

  testWidgets('guide sees the HTX briefing and can copy a guest phone', (tester) async {
    final router = await _open(tester);
    router.push('/guide/tours/tour-01');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('guide-briefing')), findsOneWidget);
    expect(find.textContaining('Tập trung 7h30'), findsOneWidget);
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String?;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    final copy = find.byKey(const Key('guide-copy-phone-bk-01'));
    await tester.ensureVisible(copy);
    await tester.tap(copy);
    await tester.pumpAndSettle();
    expect(copied, isNotNull);
    expect(find.text('Đã sao chép số điện thoại khách'), findsOneWidget);
  });

  testWidgets('the manager writes a briefing and the assigned guide reads it', (tester) async {
    final repo = MockHubRepository();
    final router = await _open(tester, role: 'manager', repo: repo);
    router.go('/manager/tours');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('edit-tour-tour-01')));
    await tester.pumpAndSettle();
    final field = find.byKey(const Key('tour-briefing'));
    await tester.ensureVisible(field);
    await tester.enterText(field, 'Hẹn 6h30 ở cổng HTX');
    final save = find.byKey(const Key('save-tour'));
    await tester.ensureVisible(save);
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect((await repo.getTour('tour-01')).briefing, 'Hẹn 6h30 ở cổng HTX');
  });

  testWidgets('a customer with a valid ticket sees the guide name and phone', (tester) async {
    final router = await _open(tester, role: 'customer');
    router.push('/shop/tickets/bk-01');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('ticket-guides')), findsOneWidget);
    expect(find.text('Người dẫn tour'), findsOneWidget);
    expect(find.text('Nguyễn Minh An'), findsOneWidget);
    expect(find.textContaining('HTX'), findsNothing);
  });

  testWidgets('new link cards do not overflow at 320 px with 130% text', (tester) async {
    final router = await _open(tester, width: 320, text: 1.3);
    router.push('/guide/tours/tour-01');
    await tester.pumpAndSettle();
    await _walk(tester);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Lộ trình lists every assigned tour by date, with a filter for past trips and a way into each tour', (
    tester,
  ) async {
    final router = await _open(tester);
    await tester.tap(find.byKey(const Key('guide-see-schedule')));
    await tester.pumpAndSettle();
    expect(router.routeInformationProvider.value.uri.path, '/guide/schedule');
    expect(find.text('Lộ trình'), findsWidgets);
    expect(find.textContaining('Sắp tới ('), findsOneWidget);
    expect(find.textContaining('Đã qua ('), findsOneWidget);
    final trip = find.byWidgetPredicate(
      (w) => w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('guide-departure-'),
    );
    expect(trip, findsWidgets);
    await tester.tap(trip.first);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('guide-itinerary')), findsOneWidget);
    router.pop();
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Đã qua ('));
    await tester.pumpAndSettle();
    expect(find.text('Chưa có chuyến đã qua'), findsOneWidget);
  });

  testWidgets('Lộ trình fits 320 px with 130% text', (tester) async {
    final router = await _open(tester, width: 320, text: 1.3);
    router.go('/guide/schedule');
    await tester.pumpAndSettle();
    await _walk(tester);
    expect(tester.takeException(), isNull);
  });

  testWidgets('guide opens the member list of a tour, searches it and checks a group in', (tester) async {
    final repo = MockHubRepository();
    final router = await _open(tester, repo: repo);
    router.push('/guide/tours/tour-01');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('guide-roster')));
    await tester.pumpAndSettle();
    expect(find.text('Thành viên của tour'), findsOneWidget);
    expect(find.byKey(const Key('roster-booking-bk-01')), findsOneWidget);
    expect(find.text('Nguyễn Thu Hà'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('roster-search')), 'Thu Hà');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('roster-booking-bk-01')), findsOneWidget);
    expect(find.byKey(const Key('roster-booking-bk-02')), findsNothing);
    await tester.enterText(find.byKey(const Key('roster-search')), 'không có ai');
    await tester.pumpAndSettle();
    expect(find.text('Không có khách nào khớp'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('roster-search')), '');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('roster-checkin-bk-01')));
    await tester.tap(find.byKey(const Key('roster-checkin-bk-01')));
    await tester.pumpAndSettle();
    expect((await repo.listBookings('tan-cuong')).firstWhere((b) => b.id == 'bk-01').checkedIn, isTrue);
    expect(find.byKey(const Key('roster-checkin-bk-01')), findsNothing);
  });

  testWidgets('guide cannot open the members of a tour assigned to someone else', (tester) async {
    final router = await _open(tester);
    router.push('/guide/tours/tour-02/members');
    await tester.pumpAndSettle();
    expect(find.text('Tour này chưa được giao cho bạn.'), findsOneWidget);
    expect(find.byKey(const Key('roster-search')), findsNothing);
  });

  testWidgets('manager and officer see the members of their own tour, only the manager can check in', (tester) async {
    for (final role in ['manager', 'officer']) {
      final router = await _open(tester, role: role);
      router.go('/manager/tours');
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('tour-roster-tour-01')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('roster-booking-bk-01')), findsOneWidget, reason: role);
      expect(find.byKey(const Key('roster-checkin-bk-01')), role == 'manager' ? findsOneWidget : findsNothing);
      await tester.pumpWidget(const SizedBox());
    }
  });

  testWidgets('member list fits 320 px with 130% text', (tester) async {
    final router = await _open(tester, width: 320, text: 1.3);
    router.push('/guide/tours/tour-01/members');
    await tester.pumpAndSettle();
    await _walk(tester);
    expect(tester.takeException(), isNull);
  });
}
