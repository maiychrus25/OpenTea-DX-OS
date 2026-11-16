// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:hub_mobile/features/customer/tour_detail_screen.dart' show LinkRow;
import 'package:shared_preferences/shared_preferences.dart';

Future<void> _openTour(WidgetTester tester, {String? email}) async {
  SharedPreferences.setMockInitialValues({});
  final store = await LocalStore.open();
  tester.view.physicalSize = const Size(800, 2800);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(HubApp(repository: MockHubRepository(), auth: DemoAuthService(store), store: store));
  await tester.pumpAndSettle();
  if (email == null) {
    await tester.tap(find.byKey(const Key('login-guest')));
  } else {
    await tester.enterText(find.byKey(const Key('login-email')), email);
    await tester.enterText(find.byKey(const Key('login-password')), DemoAuthService.demoPassword);
    await tester.tap(find.byKey(const Key('login-submit')));
  }
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('home-explore')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('tour-tour-01')));
  await tester.pumpAndSettle();
}

void main() {
  group('Book tour bar', () {
    testWidgets('floats at the bottom with the starting price and Đặt ngay', (tester) async {
      await _openTour(tester, email: 'customer@demo.vn');
      expect(find.byKey(const Key('tour-book')), findsOneWidget);
      expect(find.text('Đặt ngay'), findsOneWidget);
      expect(find.text('Giá từ'), findsOneWidget);
      expect(find.byKey(const Key('booking-bar-total')), findsNothing);
      expect(find.textContaining('Tạm tính'), findsNothing);
    });

    testWidgets('a signed-in customer opens the booking screen, where the price appears', (tester) async {
      await _openTour(tester, email: 'customer@demo.vn');
      await tester.tap(find.byKey(const Key('tour-book')));
      await tester.pumpAndSettle();
      expect(find.text('Ngày đi'), findsOneWidget);
      expect(find.textContaining('Tạm tính'), findsOneWidget);
      expect(find.byKey(const Key('booking-bar-total')), findsOneWidget);
      expect(find.byKey(const Key('tour-book')), findsNothing);
    });

    testWidgets('a guest is sent to sign in first', (tester) async {
      await _openTour(tester);
      await tester.tap(find.byKey(const Key('tour-book')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('login-submit')), findsOneWidget);
      expect(find.text('Ngày đi'), findsNothing);
    });

    testWidgets('the overview names the HTX and the host household as plain lines, no cards or buttons', (
      tester,
    ) async {
      await _openTour(tester, email: 'customer@demo.vn');
      await tester.tap(find.byKey(const Key('tour-tab-0')));
      await tester.pumpAndSettle();
      expect(find.text('Hợp tác xã'), findsOneWidget);
      expect(find.text('HTX Chè Tân Cương (demo), Thái Nguyên'), findsOneWidget);
      expect(find.text('Hộ đón khách'), findsOneWidget);
      expect(find.byKey(const Key('tour-info-host')), findsOneWidget);
      expect(find.byType(LinkRow), findsNothing);
      expect(find.text('Hộ nông dân đón khách'), findsNothing);
      expect(find.byKey(const Key('tour-visit-request')), findsNothing);
      expect(find.textContaining('Gửi yêu cầu tham quan'), findsNothing);
    });

    testWidgets('the itinerary tab is open first and the tabs switch the content', (tester) async {
      await _openTour(tester, email: 'customer@demo.vn');
      expect(find.byKey(const Key('tour-itinerary')), findsOneWidget);
      expect(find.text('Đón khách tại nhà văn hoá HTX'), findsOneWidget);
      expect(find.text('Sáng sớm · 08:00'), findsOneWidget);
      await tester.tap(find.byKey(const Key('tour-tab-2')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('tour-includes')), findsOneWidget);
      expect(find.text('Cơm trưa món địa phương'), findsOneWidget);
      await tester.tap(find.byKey(const Key('tour-tab-0')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('tour-itinerary')), findsNothing);
      expect(find.text('Tháng đẹp'), findsOneWidget);
    });

    testWidgets('no fact cards for duration, pickup time or group size', (tester) async {
      await _openTour(tester, email: 'customer@demo.vn');
      expect(find.text('Thời lượng'), findsNothing);
      expect(find.text('Giờ đón'), findsNothing);
      expect(find.text('Nhóm tối đa'), findsNothing);
    });

    testWidgets('the heart saves the tour on the device and can be undone', (tester) async {
      await _openTour(tester, email: 'customer@demo.vn');
      expect(find.byIcon(Icons.favorite_border), findsOneWidget);
      await tester.tap(find.byKey(const Key('tour-save')));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.favorite), findsOneWidget);
      expect(find.text('Đã lưu tour vào mục yêu thích'), findsOneWidget);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getStringList('saved-tours.v1'), ['tour-01']);
      await tester.tap(find.byKey(const Key('tour-save')));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.favorite_border), findsOneWidget);
      expect(prefs.getStringList('saved-tours.v1'), isEmpty);
    });
  });
}
