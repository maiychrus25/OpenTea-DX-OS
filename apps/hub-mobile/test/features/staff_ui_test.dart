// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/app/hub_app.dart';
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
        'Chatbot',
        'Bản đồ đối tác',
        'Vùng trồng',
        'Lô hàng',
        'Thông báo',
        'Hồ sơ HTX',
        'Kho ứng dụng',
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
        'Bản đồ',
        'Nông hộ',
        'Nhật ký',
        'Lô hàng',
        'Nhật ký bệnh',
        'Tài liệu',
        'Chatbot KT',
        'Trợ lý TT',
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
        'Chỉ đạo và nhiệm vụ',
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
      _expectAll(['Chờ duyệt', 'Thửa đất đang canh tác', 'Lô sẵn sàng', 'Nông hộ quản lý', 'Nhật ký gần đây']);
      expect(find.byKey(const Key('journal-approve-jr-01')), findsNothing);
    });

    testWidgets('farmer dashboard shows own parcels, tasks and next harvest', (tester) async {
      await _openAs(tester, 'farmer@demo.vn');
      _expectAll([
        'Thửa đất của tôi',
        'Việc hôm nay',
        'Thu hái tới',
        'Tình trạng thửa đất',
        'P-TC-001',
        'Lịch tham quan',
      ]);
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

    testWidgets('unbuilt pages show the Sắp có placeholder with what the web does', (tester) async {
      await _openAs(tester, 'manager@demo.vn');
      for (final p in ['/manager/chat', '/manager/partner-map', '/manager/app-store']) {
        await _goTo(tester, p);
        expect(find.text('Sắp có'), findsWidgets);
        expect(find.text('Trên bản web'), findsOneWidget);
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

    testWidgets('operator creates a directive and approves an article from the new menu', (tester) async {
      await _openAs(tester, 'operator@demo.vn');
      await _goTo(tester, '/operator/directives');
      await tester.tap(find.byKey(const Key('directive-new')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('directive-title')), 'Chuẩn bị lễ hội chè');
      await tester.tap(find.byKey(const Key('directive-send')));
      await tester.pumpAndSettle();
      expect(find.text('Chuẩn bị lễ hội chè'), findsOneWidget);
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
