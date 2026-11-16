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
      expect(find.text('Ngày đi'), findsOneWidget);
      expect(find.byKey(const Key('booking-from')), findsOneWidget);
      expect(find.byKey(const Key('booking-to')), findsOneWidget);
      expect(find.text('Số khách'), findsOneWidget);
      expect(find.text('Người lớn'), findsOneWidget);
      expect(find.text('Trẻ em'), findsOneWidget);
      expect(_text(tester, 'adult-count'), '1');
      expect(_text(tester, 'child-count'), '0');
      expect(find.textContaining('Tạm tính · 1 ngày · 1 khách'), findsOneWidget);
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

    testWidgets('the date boxes open a month calendar where only departure days can be chosen', (tester) async {
      await _openBooking(tester);
      String fromText() => tester
          .widget<Text>(find.descendant(of: find.byKey(const Key('booking-from')), matching: find.byType(Text)).last)
          .data!;
      String toText() => tester
          .widget<Text>(find.descendant(of: find.byKey(const Key('booking-to')), matching: find.byType(Text)).last)
          .data!;
      // tour-01 lasts one day: the start and the end are the same day.
      expect(fromText(), toText());
      expect(tester.widget<Text>(find.byKey(const Key('booking-span'))).data, startsWith('1 ngày · '));

      final deps = await MockHubRepository().listDepartures('tour-01');
      final first = deps.firstWhere((d) => d.id == 'dep-01').date;
      final second = deps.firstWhere((d) => d.id == 'dep-02').date;

      await tester.tap(find.byKey(const Key('booking-from')));
      await tester.pumpAndSettle();
      expect(find.byType(DatePickerDialog), findsOneWidget);
      expect(find.text('Chọn ngày đi'), findsOneWidget);
      if (second.month != first.month) {
        await tester.tap(find.byIcon(Icons.chevron_right));
        await tester.pumpAndSettle();
      }
      await tester.tap(find.descendant(of: find.byType(DatePickerDialog), matching: find.text('${second.day}')).last);
      await tester.pump();
      await tester.tap(find.text('Chọn'));
      await tester.pumpAndSettle();
      expect(find.byType(DatePickerDialog), findsNothing);
      String two(int n) => n.toString().padLeft(2, '0');
      expect(fromText(), '${two(second.day)}/${two(second.month)}/${second.year}');
      expect(toText(), fromText());
    });

    testWidgets('the end date box opens the same calendar, titled for the return day', (tester) async {
      await _openBooking(tester);
      await tester.tap(find.byKey(const Key('booking-to')));
      await tester.pumpAndSettle();
      expect(find.text('Chọn ngày về'), findsOneWidget);
      await tester.tap(find.text('Huỷ'));
      await tester.pumpAndSettle();
      expect(find.byType(DatePickerDialog), findsNothing);
    });

    testWidgets('the bar shows the number of guests', (tester) async {
      await _openBooking(tester);
      await tester.tap(find.byKey(const Key('adult-plus')));
      await tester.pump();
      expect(tester.widget<Text>(find.byKey(const Key('booking-bar-label'))).data, 'Tạm tính · 1 ngày · 2 khách');
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

    testWidgets('the age groups and the optional email and note are on the screen', (tester) async {
      await _openBooking(tester);
      expect(find.text('Từ 12 tuổi trở lên'), findsOneWidget);
      expect(find.text('Từ 6 – 11 tuổi'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('booking-note')));
      expect(find.byKey(const Key('booking-email')), findsOneWidget);
      expect(find.byKey(const Key('booking-note')), findsOneWidget);
      expect(find.text('0/200'), findsOneWidget);
    });

    testWidgets('a wrong email is refused, a right one and a note travel with the booking', (tester) async {
      await _openBooking(tester);
      await tester.enterText(find.byKey(const Key('booking-phone')), '0912345678');
      await tester.enterText(find.byKey(const Key('booking-email')), 'khong-hop-le');
      await tester.ensureVisible(find.byKey(const Key('booking-submit')));
      await tester.tap(find.byKey(const Key('booking-submit')));
      await tester.pumpAndSettle();
      expect(find.text('Email không hợp lệ'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('booking-email')), 'ha@example.com');
      await tester.enterText(find.byKey(const Key('booking-note')), 'Đi cùng một em bé');
      await tester.tap(find.byKey(const Key('booking-submit')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('pay-qr')), findsOneWidget);
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
