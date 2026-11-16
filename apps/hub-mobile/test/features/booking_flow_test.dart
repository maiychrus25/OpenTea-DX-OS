// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> _openBooking(WidgetTester tester) async {
  SharedPreferences.setMockInitialValues({});
  final store = await LocalStore.open();
  tester.view.physicalSize = const Size(800, 2800);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(HubApp(repository: MockHubRepository(), auth: DemoAuthService(store), store: store));
  await tester.pumpAndSettle();
  await tester.enterText(find.byKey(const Key('login-email')), 'customer@demo.vn');
  await tester.enterText(find.byKey(const Key('login-password')), DemoAuthService.demoPassword);
  await tester.tap(find.byKey(const Key('login-submit')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('home-explore')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('tour-tour-01')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('tour-book')));
  await tester.pumpAndSettle();
}

String _text(WidgetTester tester, String key) => tester.widget<Text>(find.byKey(Key(key))).data!;

void main() {
  group('booking screen: date, people, contact, then the price and continue', () {
    testWidgets('shows dates, both guest types and the estimate', (tester) async {
      await _openBooking(tester);
      expect(find.text('Chọn ngày đi'), findsOneWidget);
      expect(find.byKey(const Key('date-dep-01')), findsOneWidget);
      expect(find.text('Số khách'), findsOneWidget);
      expect(find.text('Người lớn'), findsOneWidget);
      expect(find.text('Trẻ em'), findsOneWidget);
      expect(_text(tester, 'adult-count'), '1');
      expect(_text(tester, 'child-count'), '0');
      expect(find.text('Tạm tính'), findsOneWidget);
    });

    testWidgets('changing the number of people changes the estimate', (tester) async {
      await _openBooking(tester);
      final before = _text(tester, 'booking-bar-total');
      await tester.tap(find.byKey(const Key('adult-plus')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('child-plus')));
      await tester.pump();
      expect(_text(tester, 'adult-count'), '2');
      expect(_text(tester, 'child-count'), '1');
      expect(_text(tester, 'booking-bar-total'), isNot(before));
    });

    testWidgets('picking another date keeps the booking screen and marks it selected', (tester) async {
      await _openBooking(tester);
      await tester.tap(find.byKey(const Key('date-dep-02')));
      await tester.pump();
      expect(find.byKey(const Key('date-dep-02')), findsOneWidget);
      expect(find.byKey(const Key('booking-submit')), findsOneWidget);
    });

    testWidgets('more dates opens the full list', (tester) async {
      await _openBooking(tester);
      await tester.tap(find.byKey(const Key('booking-more-dates')));
      await tester.pumpAndSettle();
      expect(find.text('Tất cả ngày khởi hành'), findsOneWidget);
    });

    testWidgets('at least one adult is kept', (tester) async {
      await _openBooking(tester);
      expect(tester.widget<IconButton>(find.byKey(const Key('adult-minus'))).onPressed, isNull);
    });

    testWidgets('booking for someone else asks for the traveller name', (tester) async {
      await _openBooking(tester);
      expect(find.byKey(const Key('booking-guest-name')), findsNothing);
      await tester.ensureVisible(find.byKey(const Key('booking-on-behalf')));
      await tester.tap(find.byKey(const Key('booking-on-behalf')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('booking-guest-name')), findsOneWidget);
    });

    testWidgets('contact details are required, then Continue leads to the payment page', (tester) async {
      await _openBooking(tester);
      await tester.tap(find.byKey(const Key('booking-submit')));
      await tester.pumpAndSettle();
      expect(find.text('Nhập số điện thoại hợp lệ'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('booking-phone')), '0912345678');
      await tester.tap(find.byKey(const Key('booking-submit')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('booking-submit')), findsNothing);
      expect(find.byKey(const Key('pay-qr')), findsOneWidget);
    });
  });
}
