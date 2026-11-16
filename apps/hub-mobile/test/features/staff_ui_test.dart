// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hub_mobile/core/role/role.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/core/theme/staff_theme.dart';
import 'package:hub_mobile/features/staff/staff_widgets.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> _openAs(WidgetTester tester, String email) async {
  SharedPreferences.setMockInitialValues({});
  final store = await LocalStore.open();
  tester.view.physicalSize = const Size(800, 2800);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(HubApp(repository: MockHubRepository(), auth: DemoAuthService(store), store: store));
  await tester.pumpAndSettle();
  await tester.enterText(find.byKey(const Key('login-email')), email);
  await tester.enterText(find.byKey(const Key('login-password')), DemoAuthService.demoPassword);
  await tester.tap(find.byKey(const Key('login-submit')));
  await tester.pumpAndSettle();
}

Future<void> _openDrawer(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('menu-button')));
  await tester.pumpAndSettle();
}

Future<void> _goTo(WidgetTester tester, String path) async {
  await _openDrawer(tester);
  if (find.byKey(Key('menu-$path')).evaluate().isEmpty) {
    await tester.tap(find.byKey(const Key('drawer-shop-toggle')));
    await tester.pumpAndSettle();
  }
  await tester.tap(find.byKey(Key('menu-$path')));
  await tester.pumpAndSettle();
}

void _expectAll(Iterable<String> labels) {
  for (final l in labels) {
    expect(find.text(l), findsWidgets, reason: l);
  }
}

void main() {
  group('compact shared components', () {
    testWidgets('metrics keep equal cells, keys and actions without decorative icons', (tester) async {
      tester.view.physicalSize = const Size(320, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      var taps = 0;
      await tester.pumpWidget(
        MaterialApp(
          theme: buildStaffTheme(),
          home: Scaffold(
            body: Padding(
              padding: const EdgeInsets.all(16),
              child: MetricGrid([
                MetricCard(
                  key: const Key('first-metric'),
                  label: 'Thu hái trong 7 ngày',
                  value: '12 thửa',
                  icon: Icons.eco,
                  onTap: () => taps++,
                ),
                const MetricCard(key: Key('second-metric'), label: 'Thành viên', value: '8', icon: Icons.groups),
              ], compact: true),
            ),
          ),
        ),
      );
      expect(
        tester.getSize(find.byKey(const Key('first-metric'))).height,
        tester.getSize(find.byKey(const Key('second-metric'))).height,
      );
      expect(find.byType(Icon), findsNothing);
      expect(tester.widget<Text>(find.text('8')).style!.fontFeatures, isNotEmpty);
      await tester.tap(find.text('12 thửa'));
      expect(taps, 1);
      expect(tester.takeException(), isNull);
    });

    testWidgets('section links and rows are accessible at 320px with enlarged text', (tester) async {
      tester.view.physicalSize = const Size(320, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      var taps = 0;
      await tester.pumpWidget(
        MaterialApp(
          theme: buildStaffTheme(),
          home: Scaffold(
            body: MediaQuery(
              data: const MediaQueryData(textScaler: TextScaler.linear(1.5)),
              child: SectionCard(
                title: 'Tình trạng thửa đất',
                divided: true,
                padded: false,
                onSeeAll: () => taps++,
                child: StaffListRow(
                  title: 'P-TC-001 · Chè Trung du',
                  subtitle: 'Thông tin thửa đất đang canh tác',
                  trailing: const Pill('Được phép thu hoạch', tone: Tone.warn),
                  onTap: () => taps++,
                ),
              ),
            ),
          ),
        ),
      );
      expect(find.byType(Divider), findsOneWidget);
      expect(tester.getSize(find.byType(TextButton)).height, greaterThanOrEqualTo(44));
      expect(tester.getSize(find.byType(StaffListRow)).height, greaterThanOrEqualTo(44));
      await tester.tap(find.text('Xem tất cả ›'));
      await tester.tap(find.text('P-TC-001 · Chè Trung du'));
      expect(taps, 2);
      expect(tester.takeException(), isNull);
    });
  });

  group('priority layout components', () {
    for (final width in [320.0, 1280.0]) {
      testWidgets('summary calendar and bars fit at $width with double text', (tester) async {
        tester.view.physicalSize = Size(width, 2400);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        var taps = 0;
        await tester.pumpWidget(
          MaterialApp(
            theme: buildStaffTheme(),
            home: Scaffold(
              body: MediaQuery(
                data: const MediaQueryData(textScaler: TextScaler.linear(2)),
                child: SingleChildScrollView(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        AttentionCard(
                          items: [
                            (label: 'Nhật ký chờ duyệt của hợp tác xã', count: 123, onTap: () => taps++),
                            (label: 'Không cần hiển thị', count: 0, onTap: () => taps++),
                          ],
                        ),
                        SummaryStrip([
                          MetricCard(label: 'Thành viên', value: '123456', icon: Icons.groups, onTap: () => taps++),
                          const MetricCard(label: 'Diện tích', value: '999,9 ha', icon: Icons.eco),
                          const MetricCard(label: 'Doanh thu', value: '12345 tr ₫', icon: Icons.payments),
                        ]),
                        HarvestWeekStrip(now: DateTime(2026, 12, 29), dates: [DateTime(2027, 1, 1)]),
                        const ProportionLine(label: 'Diện tích đang canh tác', detail: '0 ha / 0 ha', value: 0),
                        const BarList([('Hợp tác xã có tên dài ở vùng trung du', 12345), ('Chưa có khách', 0)]),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        expect(find.text('Không cần hiển thị'), findsNothing);
        expect(find.text('123'), findsOneWidget);
        expect(find.text('1'), findsOneWidget); // calendar crosses the year boundary
        await tester.tap(find.text('Nhật ký chờ duyệt của hợp tác xã'));
        await tester.tap(find.text('123456'));
        expect(taps, 2);
        expect(tester.takeException(), isNull);
        final scroll = tester.state<ScrollableState>(find.byType(Scrollable).first);
        scroll.position.jumpTo(scroll.position.maxScrollExtent);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('all-zero attention shows a calm empty state and retains primary action', (tester) async {
      var taps = 0;
      await tester.pumpWidget(
        MaterialApp(
          theme: buildStaffTheme(),
          home: Scaffold(
            body: AttentionCard(
              items: [(label: 'Nhật ký chờ duyệt', count: 0, onTap: () {})],
              action: FilledButton(onPressed: () => taps++, child: const Text('Ghi nhật ký mới')),
            ),
          ),
        ),
      );
      expect(find.text('Không có việc cần xử lý'), findsOneWidget);
      expect(find.text('Nhật ký chờ duyệt'), findsNothing);
      await tester.tap(find.text('Ghi nhật ký mới'));
      expect(taps, 1);
    });

    testWidgets('operator bars are sorted, limited to three and proportional', (tester) async {
      await _openAs(tester, 'operator@demo.vn');
      final bars = tester.widget<BarList>(find.byType(BarList));
      final linked = [...await MockHubRepository().listLinkedHtxs()];
      linked.sort((a, b) => b.guestsThisMonth.compareTo(a.guestsThisMonth));
      expect(bars.rows, [for (final h in linked.take(3)) (h.name.replaceFirst('HTX Chè ', ''), h.guestsThisMonth)]);
      final indicators = tester
          .widgetList<LinearProgressIndicator>(
            find.descendant(of: find.byType(BarList), matching: find.byType(LinearProgressIndicator)),
          )
          .toList();
      expect(indicators.first.value, 1);
      expect(indicators[1].value, closeTo(bars.rows[1].$2 / bars.rows.first.$2, .001));
    });

    testWidgets('account shortcuts use existing routes and show identity once', (tester) async {
      for (final (role, label, path) in [
        ('manager', 'Hồ sơ HTX', '/manager/profile'),
        ('manager', 'Thông báo', '/manager/notifications'),
        ('officer', 'Thông báo', '/manager/notifications'),
        ('farmer', 'Thông báo', '/farmer/notifications'),
        ('operator', 'Báo cáo tổng hợp', '/operator/reports'),
      ]) {
        await _openAs(tester, '$role@demo.vn');
        await tester.tap(find.byKey(const Key('staff-avatar')));
        await tester.pumpAndSettle();
        expect(find.text('$role@demo.vn'), findsOneWidget);
        final row = find.descendant(of: find.byType(StaffListRow), matching: find.text(label));
        final router = GoRouter.of(tester.element(row));
        await tester.tap(row);
        await tester.pumpAndSettle();
        expect(router.routeInformationProvider.value.uri.path, path);
      }
    });
  });

  group('dashboard and account responsive stress', () {
    for (final width in [320.0, 390.0, 1280.0]) {
      for (final role in ['manager', 'officer', 'farmer', 'operator']) {
        testWidgets('$role dashboard and account fit at $width px and sign out', (tester) async {
          final email = '$role@demo.vn';
          await _openAs(tester, email);
          final errors = <FlutterErrorDetails>[];
          final previousHandler = FlutterError.onError;
          FlutterError.onError = (details) {
            errors.add(details);
            previousHandler?.call(details);
          };
          addTearDown(() => FlutterError.onError = previousHandler);
          tester.view.physicalSize = Size(width, 900);
          tester.view.devicePixelRatio = 1;
          await tester.pumpAndSettle();
          final strip = tester.widget<SummaryStrip>(find.byType(SummaryStrip));
          expect(strip.figures, hasLength(3));
          expect(find.descendant(of: find.byType(SummaryStrip), matching: find.byType(Icon)), findsNothing);
          expect(
            tester.getTopLeft(find.byType(AttentionCard)).dy,
            lessThan(tester.getTopLeft(find.byType(SummaryStrip)).dy),
          );
          expect(find.textContaining(DemoAuthService.accounts[email]!.name), findsWidgets);
          expect(find.text('Đang hoạt động'), findsNothing);
          expect(tester.takeException(), isNull, reason: errors.map((e) => e.toString()).join('\n'));
          // Walk the entire dashboard, including sections below the first viewport.
          final scroll = tester.state<ScrollableState>(find.byType(Scrollable).first);
          while (scroll.position.pixels < scroll.position.maxScrollExtent) {
            scroll.position.jumpTo((scroll.position.pixels + 500).clamp(0, scroll.position.maxScrollExtent));
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
          }
          expect(find.byKey(const Key('sample-chip')), findsOneWidget);
          await tester.tap(find.byKey(const Key('staff-avatar')));
          await tester.pumpAndSettle();
          expect(find.text('Hồ sơ tài khoản'), findsOneWidget);
          expect(find.text(DemoAuthService.accounts[email]!.name), findsOneWidget);
          expect(find.text(email), findsOneWidget);
          expect(find.textContaining('Mã HTX ·'), role == 'operator' ? findsNothing : findsOneWidget);
          expect(find.byKey(const Key('sample-chip')), findsNothing);
          expect(find.byType(Pill), findsOneWidget);
          expect(find.text('Vai trò'), findsNothing);
          expect(find.byType(SectionCard), findsOneWidget);
          await tester.scrollUntilVisible(find.byKey(const Key('account-logout')), 250);
          await tester.pumpAndSettle();
          expect(tester.getSize(find.byKey(const Key('account-logout'))).height, greaterThanOrEqualTo(44));
          expect(tester.takeException(), isNull);
          await tester.tap(find.byKey(const Key('account-logout')));
          // The login screen is outside this layout task; restore its test viewport.
          tester.view.physicalSize = const Size(800, 2800);
          tester.view.devicePixelRatio = 2;
          await tester.pumpAndSettle();
          expect(find.byKey(const Key('login-submit')), findsOneWidget);
        });
      }
    }
  });

  group('large text and long claims stress', () {
    for (final width in [320.0, 1280.0]) {
      for (final role in ['manager', 'officer', 'farmer', 'operator']) {
        testWidgets('$role preserves long identity at $width px and 130 percent text', (tester) async {
          SharedPreferences.setMockInitialValues({});
          final store = await LocalStore.open();
          const fullName = 'Nguyễn Hoàng Minh Anh · Hợp tác xã chè vùng trung du';
          const email = 'long.account.name.for.layout@example.test';
          await store.saveSession(
            Claims(
              subject: 'layout-test',
              name: fullName,
              email: email,
              roles: [role],
              htxCode: role == 'operator' ? null : 'tan-cuong',
              householdId: role == 'farmer' ? 'hh-01' : null,
            ),
          );
          tester.view.physicalSize = Size(width, 900);
          tester.view.devicePixelRatio = 1;
          tester.platformDispatcher.textScaleFactorTestValue = 1.3;
          addTearDown(tester.view.reset);
          addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
          await tester.pumpWidget(HubApp(repository: MockHubRepository(), auth: DemoAuthService(store), store: store));
          await tester.pumpAndSettle();
          expect(find.textContaining(fullName), findsOneWidget);
          expect(tester.takeException(), isNull);
          final scroll = tester.state<ScrollableState>(find.byType(Scrollable).first);
          while (scroll.position.pixels < scroll.position.maxScrollExtent) {
            scroll.position.jumpTo((scroll.position.pixels + 400).clamp(0, scroll.position.maxScrollExtent));
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
          }
          await tester.tap(find.byKey(const Key('staff-avatar')));
          await tester.pumpAndSettle();
          expect(find.text(fullName), findsOneWidget);
          expect(find.text(email), findsOneWidget);
          await tester.scrollUntilVisible(find.byKey(const Key('account-logout')), 250);
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        });
      }
    }
  });

  testWidgets('summary and attention rows keep their real destinations', (tester) async {
    final routes = {
      'manager': [
        ('/manager/members', 'Thành viên'),
        ('/manager/zones', 'Vùng canh tác'),
        ('/manager/schedule', 'Thu hái trong 7 ngày'),
        ('/manager/journal-approve', 'Nhật ký chờ duyệt'),
        ('/manager/lots', 'Lô sẵn sàng'),
        ('/manager/notifications', 'Thông báo chưa đọc'),
      ],
      'officer': [
        ('/manager/journal', 'Nhật ký chờ duyệt'),
        ('/manager/zones', 'Thửa đang canh tác'),
        ('/manager/lots', 'Lô sẵn sàng'),
        ('/manager/households', 'Nông hộ quản lý'),
      ],
      'farmer': [
        ('/farmer/parcels', 'Thửa đất của tôi'),
        ('/farmer/schedule', 'Thu hái tới'),
        ('/farmer/journal', 'Nhật ký chờ duyệt'),
      ],
      'operator': [
        ('/operator/htx', 'HTX liên kết'),
        ('/operator/bookings', 'Lượt đặt tour'),
        ('/operator/articles', 'Bài chờ duyệt'),
        ('/operator/reports', 'Doanh thu tháng'),
      ],
    };
    for (final entry in routes.entries) {
      await _openAs(tester, '${entry.key}@demo.vn');
      final home = entry.key == 'officer' ? '/manager' : '/${entry.key}';
      final router = GoRouter.of(tester.element(find.byType(SummaryStrip)));
      for (final (path, text) in entry.value) {
        final label = find.text(text).first;
        await tester.ensureVisible(label);
        await tester.tap(label);
        await tester.pumpAndSettle();
        expect(router.routeInformationProvider.value.uri.path, path);
        router.go(home);
        await tester.pumpAndSettle();
      }
    }
  });

  group('shell and drawer', () {
    testWidgets('manager drawer has the web menu, brand, HTX block and the Gian hàng section', (tester) async {
      await _openAs(tester, 'manager@demo.vn');
      expect(find.byKey(const Key('staff-search')), findsOneWidget);
      expect(find.byKey(const Key('staff-bell')), findsOneWidget);
      await _openDrawer(tester);
      _expectAll([
        'OpenTea DX-OS',
        'Chuyển đổi số HTX',
        'HTX Chè Tân Cương',
        'Tổng quan',
        'Lịch thu hái',
        'Quản lý thành viên',
        'Bản tin',
        'Duyệt nhật ký',
        'Vùng trồng',
        'Lô hàng',
        'Thông báo',
        'Hồ sơ HTX',
        'Gian hàng',
      ]);
      await tester.tap(find.byKey(const Key('drawer-shop-toggle')));
      await tester.pumpAndSettle();
      _expectAll(['Đơn hàng', 'Lượt đặt tour', 'Thu tiền', 'Tour và sản phẩm']);
      expect(find.text('Trưởng HTX'), findsWidgets);
    });

    testWidgets('officer drawer follows the officer menu of the web', (tester) async {
      await _openAs(tester, 'officer@demo.vn');
      await _openDrawer(tester);
      _expectAll([
        'Tổng quan',
        'Lịch thu hái',
        'Vùng trồng',
        'Nông hộ',
        'Nhật ký',
        'Lô hàng',
        'Thông báo',
        'Tài khoản',
        'Cán bộ KT',
      ]);
      expect(find.text('Duyệt nhật ký'), findsNothing);
    });

    testWidgets('farmer drawer lists the farmer pages and the storefront items', (tester) async {
      await _openAs(tester, 'farmer@demo.vn');
      await _openDrawer(tester);
      await tester.tap(find.byKey(const Key('drawer-shop-toggle')));
      await tester.pumpAndSettle();
      _expectAll([
        'Tổng quan',
        'Nhật ký đồng ruộng',
        'Lịch',
        'Bản tin',
        'Thông báo',
        'Thửa đất của tôi',
        'Hồ sơ',
        'Lịch tham quan',
        'Sản phẩm của hộ',
        'Nông dân',
      ]);
    });

    testWidgets('operator drawer lists the tour company pages', (tester) async {
      await _openAs(tester, 'operator@demo.vn');
      await _openDrawer(tester);
      await tester.tap(find.byKey(const Key('drawer-shop-toggle')));
      await tester.pumpAndSettle();
      _expectAll([
        'Tổng quan',
        'Hợp tác xã liên kết',
        'Tour toàn vùng',
        'Bài viết HTX',
        'Báo cáo tổng hợp',
        'Lượt đặt tour',
        'Công ty du lịch',
      ]);
    });

    testWidgets('search finds a page and opens it', (tester) async {
      await _openAs(tester, 'manager@demo.vn');
      await tester.tap(find.byKey(const Key('staff-search')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'lo hang');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Lô hàng').last);
      await tester.pumpAndSettle();
      expect(find.text('Sẵn sàng giao thương'), findsOneWidget);
    });
  });

  group('dashboards', () {
    testWidgets('manager dashboard shows the stat cards and lists', (tester) async {
      await _openAs(tester, 'manager@demo.vn');
      _expectAll([
        'Thành viên',
        'Vùng canh tác',
        'Thu hái trong 7 ngày',
        'Nhật ký chờ duyệt',
        'Lô sẵn sàng',
        'Thông báo chưa đọc',
      ]);
      await tester.scrollUntilVisible(find.text('Gian hàng'), 300);
      expect(find.text('Lịch thu hái sắp tới'), findsWidgets);
    });

    testWidgets('officer dashboard is read-only', (tester) async {
      await _openAs(tester, 'officer@demo.vn');
      _expectAll(['Nhật ký chờ duyệt', 'Thửa đang canh tác', 'Lô sẵn sàng', 'Nông hộ quản lý']);
      await tester.scrollUntilVisible(find.text('Nhật ký gần đây'), 300);
      expect(find.byKey(const Key('journal-approve-jr-01')), findsNothing);
    });

    testWidgets('farmer dashboard shows own parcels, tasks and next harvest', (tester) async {
      await _openAs(tester, 'farmer@demo.vn');
      _expectAll(['Thửa đất của tôi', 'Nhật ký chờ duyệt', 'Thu hái tới', 'Tình trạng thửa đất', 'P-TC-001']);
      await tester.scrollUntilVisible(find.text('Lịch tham quan'), 300);
      expect(find.text('Lịch tham quan'), findsOneWidget);
      expect(find.text('P-TC-003'), findsNothing); // another household
    });

    testWidgets('operator dashboard shows linked HTXs, bookings, articles and revenue', (tester) async {
      await _openAs(tester, 'operator@demo.vn');
      _expectAll(['HTX liên kết', 'Lượt đặt tour', 'Bài chờ duyệt', 'Doanh thu tháng', 'Cần xử lý hôm nay']);
    });
  });

  group('actions', () {
    testWidgets('manager approves a diary entry', (tester) async {
      await _openAs(tester, 'manager@demo.vn');
      await tester.tap(find.byKey(const Key('bottom-/manager/journal-approve')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('journal-approve-jr-01')), findsOneWidget);
      await tester.tap(find.byKey(const Key('journal-approve-jr-01')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('journal-approve-jr-01')), findsNothing);
      expect(find.byKey(const Key('journal-approve-jr-03')), findsOneWidget);
    });

    testWidgets('officer sees the diary but no approve buttons', (tester) async {
      await _openAs(tester, 'officer@demo.vn');
      await tester.tap(find.byKey(const Key('bottom-/manager/journal')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('journal-jr-01')), findsOneWidget);
      expect(find.byKey(const Key('journal-approve-jr-01')), findsNothing);
      expect(find.byKey(const Key('journal-reject-jr-01')), findsNothing);
      expect(find.text('Chỉ xem (cán bộ)'), findsOneWidget);
    });

    testWidgets('manager reads members, lots, zones, notifications and the HTX profile', (tester) async {
      await _openAs(tester, 'manager@demo.vn');
      await _goTo(tester, '/manager/members');
      expect(find.byKey(const Key('member-u-03')), findsOneWidget);
      await _goTo(tester, '/manager/lots');
      expect(find.textContaining('TC-CHE-'), findsWidgets);
      await _goTo(tester, '/manager/zones');
      expect(find.byKey(const Key('zone-pc-01')), findsOneWidget);
      await _goTo(tester, '/manager/notifications');
      expect(find.byKey(const Key('notif-nt-01')), findsOneWidget);
      await _goTo(tester, '/manager/profile');
      expect(find.text('Hồ sơ Hợp tác xã'), findsOneWidget);
      expect(find.text('Lứa 4/2026'), findsOneWidget);
      await _goTo(tester, '/manager/schedule');
      expect(find.byKey(const Key('harvest-pc-02')), findsOneWidget);
    });

    testWidgets('no drawer lists a "Sắp có" placeholder', (tester) async {
      for (final email in ['manager@demo.vn', 'officer@demo.vn', 'farmer@demo.vn', 'operator@demo.vn']) {
        await _openAs(tester, email);
        await _openDrawer(tester);
        expect(find.text('Sắp có'), findsNothing, reason: email);
        for (final gone in [
          'Chatbot',
          'Bản đồ đối tác',
          'Kho ứng dụng',
          'Tài liệu',
          'Chẩn đoán',
          'Nhật ký bệnh',
          'Chỉ đạo và nhiệm vụ',
        ]) {
          expect(find.text(gone), findsNothing, reason: '$email $gone');
        }
      }
    });

    testWidgets('farmer adds a diary entry and it waits for approval', (tester) async {
      await _openAs(tester, 'farmer@demo.vn');
      await tester.tap(find.byKey(const Key('farmer-new-journal')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('jf-notes')), 'Tưới buổi chiều');
      await tester.tap(find.byKey(const Key('jf-submit')));
      await tester.pumpAndSettle();
      expect(find.text('Đã gửi nhật ký, đang chờ duyệt'), findsOneWidget);
      await tester.tap(find.byKey(const Key('bottom-/farmer/journal')));
      await tester.pumpAndSettle();
      expect(find.text('Chờ duyệt'), findsWidgets);
    });

    testWidgets('farmer spraying entry needs a product name', (tester) async {
      await _openAs(tester, 'farmer@demo.vn');
      await tester.tap(find.byKey(const Key('farmer-new-journal')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('jf-activity')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Phun thuốc').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('jf-submit')));
      await tester.pumpAndSettle();
      expect(find.text('Phun thuốc cần ghi tên sản phẩm'), findsOneWidget);
    });

    testWidgets('operator approves an article and opens the linked pages from the menu', (tester) async {
      await _openAs(tester, 'operator@demo.vn');
      await _goTo(tester, '/operator/articles');
      await tester.tap(find.byKey(const Key('approve-art-03')));
      await tester.pumpAndSettle();
      expect(find.text('Không có bài nào chờ duyệt'), findsOneWidget);
      await _goTo(tester, '/operator/htx');
      expect(find.byKey(const Key('htx-tan-cuong')), findsOneWidget);
      await _goTo(tester, '/operator/tours');
      expect(find.byKey(const Key('region-rt-01')), findsOneWidget);
      await _goTo(tester, '/operator/reports');
      expect(find.text('Khách đã xác nhận'), findsOneWidget);
    });

    testWidgets('the storefront items stay reachable from the drawer', (tester) async {
      await _openAs(tester, 'manager@demo.vn');
      await _goTo(tester, '/manager/bookings');
      await tester.tap(find.byKey(const Key('m-booking-bk-02')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('confirm-payment')), findsOneWidget);
    });
  });
}
