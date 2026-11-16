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
  await tester.tap(find.byKey(const Key('pick-dep-01')).first);
  await tester.pumpAndSettle();
}

String _text(WidgetTester tester, String key) => tester.widget<Text>(find.byKey(Key(key))).data!;

void main() {
  group('booking form: ticket, people, price, then book', () {
    testWidgets('shows both ticket types, the cost and the total before booking', (tester) async {
      await _openBooking(tester);
      expect(find.text('Vé người lớn'), findsOneWidget);
      expect(find.text('Vé trẻ em'), findsOneWidget);
      expect(_text(tester, 'adult-count'), '1');
      expect(_text(tester, 'child-count'), '0');
      expect(find.byKey(const Key('booking-total')), findsOneWidget);
      expect(find.byKey(const Key('booking-submit')), findsOneWidget);
    });

    testWidgets('changing the number of people changes the total', (tester) async {
      await _openBooking(tester);
      final before = _text(tester, 'booking-bar-total');
      await tester.tap(find.byKey(const Key('adult-plus')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('child-plus')));
      await tester.pump();
      expect(_text(tester, 'adult-count'), '2');
      expect(_text(tester, 'child-count'), '1');
      expect(find.byKey(const Key('cost-children')), findsOneWidget);
      expect(_text(tester, 'booking-bar-total'), isNot(before));
    });

    testWidgets('at least one adult is kept', (tester) async {
      await _openBooking(tester);
      expect(tester.widget<IconButton>(find.byKey(const Key('adult-minus'))).onPressed, isNull);
    });

    testWidgets('contact details are required, then booking leads to the payment page', (tester) async {
      await _openBooking(tester);
      await tester.tap(find.byKey(const Key('booking-submit')));
      await tester.pumpAndSettle();
      expect(find.text('Nhập số điện thoại hợp lệ'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('booking-phone')), '0912345678');
      await tester.tap(find.byKey(const Key('booking-submit')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('booking-submit')), findsNothing);
    });
  });
}
