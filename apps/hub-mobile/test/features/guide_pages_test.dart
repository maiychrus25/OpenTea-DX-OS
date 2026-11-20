// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:hub_mobile/core/role/role.dart';
import 'package:hub_mobile/data/models/booking.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:hub_mobile/data/models/catalog.dart';
import 'package:hub_mobile/core/format/formatting.dart';
import 'package:hub_mobile/core/money/money.dart';
import 'package:hub_mobile/features/guide/guide_widgets.dart';
import 'package:hub_mobile/shared/widgets.dart' show TeaPhoto, teaPhotoFor;
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

class _TourLayoutRepository extends MockHubRepository {
  _TourLayoutRepository({this.empty = false});
  final bool empty;

  @override
  Future<List<Tour>> listTours({String? htxCode}) async => empty
      ? []
      : [
          for (final tour in await super.listTours(htxCode: htxCode))
            tour.copyWith(
              name:
                  'Trải nghiệm văn hóa chè cùng bà con hợp tác xã trên những đồi chè xanh và thưởng thức đặc sản địa phương',
              guideIds: tour.id == 'tour-01' ? tour.guideIds : [],
            ),
        ];

  @override
  Future<List<Departure>> listDepartures(String tourId) async => tourId != 'tour-01'
      ? []
      : [
          for (var i = 0; i < 18; i++)
            Departure(
              id: 'stress-departure-$i',
              tourId: tourId,
              date: DateUtils.dateOnly(DateTime.now()).add(Duration(days: i - 1)),
              seatsTotal: 24,
              seatsTaken: i.isEven ? 24 : 0,
            ),
        ];

  @override
  Future<List<GuideStaff>> listHtxGuides(String htxCode) async => [
    for (final guide in await super.listHtxGuides(htxCode))
      GuideStaff(
        id: guide.id,
        name: '${guide.name} — Nhân viên phụ trách trải nghiệm văn hóa và thu hái chè tại hợp tác xã',
        phone: guide.phone,
        htxCode: guide.htxCode,
      ),
  ];
}

class _FailingGuideRepository extends MockHubRepository {
  bool failRead = false;
  bool failWrite = false;
  int checkIns = 0;
  Completer<void>? pendingCheckIn;

  @override
  Future<List<Tour>> listGuideTours(String guideId) async {
    if (failRead) throw StateError('private server failure');
    return super.listGuideTours(guideId);
  }

  @override
  Future<Booking> checkIn(String bookingId, {required Claims actor}) async {
    checkIns++;
    if (failWrite) throw StateError('private server failure');
    await pendingCheckIn?.future;
    return super.checkIn(bookingId, actor: actor);
  }
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
  test('QA countdown uses calendar dates even just before midnight', () {
    expect(guideCountdown(DateTime(2026, 12, 1), DateTime(2026, 11, 30, 23, 59)), 'Ngày mai');
    expect(guideCountdown(DateTime(2026, 11, 30, 0, 1), DateTime(2026, 12, 1)), 'Đã qua');
    expect(guideCountdown(DateTime(2027, 1, 1), DateTime(2026, 12, 31, 23, 59)), 'Ngày mai');
  });

  for (final suffix in ['', '/members']) {
    testWidgets('QA route changes cannot retain a previously assigned tour $suffix', (tester) async {
      final router = await _open(tester);
      router.go('/guide/tours/tour-01$suffix');
      await tester.pumpAndSettle();
      expect(find.text('Nguyễn Thu Hà'), suffix.isEmpty ? findsNothing : findsOneWidget);
      router.go('/guide/tours/tour-02$suffix');
      await tester.pumpAndSettle();
      expect(find.text('Tour này chưa được giao cho bạn.'), findsOneWidget);
      expect(find.textContaining('Nguyễn Thu Hà'), findsNothing);
    });

    testWidgets('QA guide deep link has a back button $suffix', (tester) async {
      final router = await _open(tester);
      router.go('/guide/tours/tour-01$suffix');
      await tester.pumpAndSettle();
      expect(find.byType(BackButton), findsOneWidget);
      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();
      expect(router.routeInformationProvider.value.uri.path, '/guide');
    });

    testWidgets('QA unexpected check-in failure is recoverable $suffix', (tester) async {
      final repo = _FailingGuideRepository()..failWrite = true;
      final router = await _open(tester, repo: repo);
      router.push('/guide/tours/tour-01$suffix');
      await tester.pumpAndSettle();
      final button = find.byKey(Key('${suffix.isEmpty ? 'guide' : 'roster'}-checkin-bk-01'));
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Không thể điểm danh. Hãy thử lại.'), findsOneWidget);
      repo.failWrite = false;
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(button, findsNothing);
      expect((await repo.listGuideBookings('guide-demo')).firstWhere((b) => b.id == 'bk-01').checkedIn, isTrue);
    });

    testWidgets('QA double tap submits check-in once $suffix', (tester) async {
      final repo = _FailingGuideRepository()..pendingCheckIn = Completer<void>();
      final router = await _open(tester, repo: repo);
      router.push('/guide/tours/tour-01$suffix');
      await tester.pumpAndSettle();
      final button = find.byKey(Key('${suffix.isEmpty ? 'guide' : 'roster'}-checkin-bk-01'));
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.tap(button);
      expect(repo.checkIns, 1);
      repo.pendingCheckIn!.complete();
      await tester.pumpAndSettle();
      expect(button, findsNothing);
    });
  }

  testWidgets('QA roster check-in refreshes arrived totals on detail and manager roster', (tester) async {
    final repo = MockHubRepository();
    final bookings = await repo.listGuideBookings('guide-demo', tourId: 'tour-01');
    final booking = bookings.firstWhere((b) => b.id == 'bk-01');
    final total = bookings.where((b) => b.departureId == booking.departureId).fold<int>(0, (n, b) => n + b.guests);
    var router = await _open(tester, repo: repo);
    router.push('/guide/tours/tour-01');
    await tester.pumpAndSettle();
    expect(find.text('Đã đến 0/$total'), findsOneWidget);
    await tester.tap(find.byKey(const Key('guide-roster')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('roster-checkin-bk-01')));
    await tester.pumpAndSettle();
    expect(
      find.byWidgetPredicate((w) => w is GuideStat && w.label == 'Đã đến' && w.value == '${booking.guests}/$total'),
      findsOneWidget,
    );
    router.pop();
    await tester.pumpAndSettle();
    expect(find.text('Đã đến ${booking.guests}/$total'), findsOneWidget);
    router = await _open(tester, role: 'manager', repo: repo);
    router.push('/manager/tours/tour-01/members');
    await tester.pumpAndSettle();
    expect(
      find.byWidgetPredicate((w) => w is GuideStat && w.label == 'Đã đến' && w.value == '${booking.guests}/$total'),
      findsOneWidget,
    );
  });

  testWidgets('QA detail refresh revokes visible booking data', (tester) async {
    final repo = MockHubRepository();
    final router = await _open(tester, repo: repo);
    router.push('/guide/tours/tour-01');
    await tester.pumpAndSettle();
    await repo.removeGuideFromTour('tour-01', 'guide-demo', actor: DemoAuthService.accounts['manager@demo.vn']!);
    expect(find.byType(RefreshIndicator), findsOneWidget);
    tester.state<RefreshIndicatorState>(find.byType(RefreshIndicator)).show();
    await tester.pumpAndSettle();
    expect(find.text('Tour này chưa được giao cho bạn.'), findsOneWidget);
    expect(find.byKey(const Key('guide-booking-bk-01')), findsNothing);
  });

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

  for (final role in ['manager', 'officer']) {
    testWidgets('$role sees tour covers, summary, departures and role-appropriate actions', (tester) async {
      final repo = MockHubRepository();
      final router = await _open(tester, role: role, repo: repo);
      router.go('/manager/tours');
      await tester.pumpAndSettle();
      final tours = await repo.listTours(htxCode: 'tan-cuong');
      final departures = [for (final tour in tours) ...await repo.listDepartures(tour.id)];
      final today = DateUtils.dateOnly(DateTime.now());
      for (final stat in [
        ('Tour', '${tours.length}'),
        ('Chuyến sắp tới', '${departures.where((d) => !DateUtils.dateOnly(d.date).isBefore(today)).length}'),
        ('Khách đã đặt', '${departures.fold<int>(0, (n, d) => n + d.seatsTotal - d.seatsLeft)}'),
      ]) {
        expect(
          find.byWidgetPredicate((w) => w is GuideStat && w.label == stat.$1 && w.value == stat.$2),
          findsOneWidget,
        );
      }
      expect(find.byKey(const Key('create-tour')), role == 'manager' ? findsOneWidget : findsNothing);
      expect(find.text('Chế độ chỉ xem'), role == 'officer' ? findsOneWidget : findsNothing);
      for (final tour in tours) {
        final card = find.byKey(Key('manager-tour-${tour.id}'));
        await tester.scrollUntilVisible(card, 300, scrollable: find.byType(Scrollable).last);
        expect(find.descendant(of: card, matching: find.text(tour.name)), findsOneWidget);
        expect(
          find.descendant(
            of: card,
            matching: find.byWidgetPredicate((w) => w is TeaPhoto && w.asset == teaPhotoFor(tour.gradientSeed)),
          ),
          findsOneWidget,
        );
        expect(
          find.descendant(of: card, matching: find.text('${formatVnd(tour.adultPrice)} / người lớn')),
          findsOneWidget,
        );
        expect(find.descendant(of: card, matching: find.text('Trẻ em: ${formatVnd(tour.childPrice)}')), findsOneWidget);
        for (final dep in departures.where((d) => d.tourId == tour.id)) {
          expect(find.descendant(of: card, matching: find.text(formatDate(dep.date))), findsOneWidget);
          expect(
            find.descendant(of: card, matching: find.text('còn ${dep.seatsLeft}/${dep.seatsTotal} chỗ')),
            findsWidgets,
          );
        }
        final guides = (await repo.listHtxGuides('tan-cuong')).where((g) => tour.guideIds.contains(g.id));
        expect(find.descendant(of: card, matching: find.byType(CircleAvatar)), findsNWidgets(guides.length));
        for (final guide in guides) {
          expect(find.descendant(of: card, matching: find.text(guide.name)), findsOneWidget);
        }
        for (final prefix in ['edit-tour', 'tour-guides']) {
          expect(find.byKey(Key('$prefix-${tour.id}')), role == 'manager' ? findsOneWidget : findsNothing);
        }
        expect(find.byKey(Key('tour-roster-${tour.id}')), findsOneWidget);
      }
      expect(find.byKey(const Key('manager-tour-tour-03')), findsNothing);
    });
  }

  testWidgets('tour list shortcuts keep their existing destinations', (tester) async {
    final router = await _open(tester, role: 'manager');
    for (final action in [
      ('Lượt đặt tour', '/manager/bookings'),
      ('Thu tiền tour', '/manager/tour-payments'),
      ('Sửa tour', '/manager/tours/tour-01/edit'),
      ('Thêm nhân viên dẫn tour', '/manager/tours/tour-01/guides'),
    ]) {
      router.go('/manager/tours');
      await tester.pumpAndSettle();
      final button = find.text(action.$1).first;
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(GoRouterState.of(tester.element(find.byType(Scaffold).last)).uri.path, action.$2);
    }
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

  for (final width in [320.0, 1280.0]) {
    for (final brightness in Brightness.values) {
      testWidgets('manager tour stress with long names and many departures at $width px ${brightness.name}', (
        tester,
      ) async {
        final repo = _TourLayoutRepository();
        final router = await _open(
          tester,
          role: 'manager',
          repo: repo,
          width: width,
          text: 1.3,
          brightness: brightness,
        );
        router.go('/manager/tours');
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        // The fixture includes yesterday, today, future departures and a tour without a schedule.
        expect(
          find.byWidgetPredicate((w) => w is GuideStat && w.label == 'Chuyến sắp tới' && w.value == '17'),
          findsOneWidget,
        );
        expect(
          find.byWidgetPredicate((w) => w is GuideStat && w.label == 'Khách đã đặt' && w.value == '216'),
          findsOneWidget,
        );
        await _walk(tester);
        expect(find.text('Chưa có lịch khởi hành'), findsOneWidget);
        expect(find.text('Chưa có nhân viên dẫn tour'), findsOneWidget);
        final roster = find.byKey(const Key('tour-roster-tour-02'));
        await tester.ensureVisible(roster);
        await tester.tap(roster);
        await tester.pumpAndSettle();
        expect(GoRouterState.of(tester.element(find.byType(Scaffold).last)).uri.path, '/manager/tours/tour-02/members');
        expect(find.text('Tour chưa có ngày khởi hành'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('empty manager tour list keeps zero stats and create action', (tester) async {
    final router = await _open(
      tester,
      role: 'manager',
      repo: _TourLayoutRepository(empty: true),
      width: 320,
      text: 1.3,
    );
    router.go('/manager/tours');
    await tester.pumpAndSettle();
    expect(find.byWidgetPredicate((w) => w is GuideStat && w.value == '0'), findsNWidgets(3));
    expect(find.text('HTX chưa có tour nào'), findsOneWidget);
    expect(find.byKey(const Key('create-tour')), findsOneWidget);
    await _walk(tester);
    expect(tester.takeException(), isNull);
  });

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
