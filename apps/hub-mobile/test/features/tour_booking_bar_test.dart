// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
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
    testWidgets('is visible without scrolling and does not show a price yet', (tester) async {
      await _openTour(tester, email: 'customer@demo.vn');
      expect(find.byKey(const Key('tour-book')), findsOneWidget);
      expect(find.text('Đặt tour'), findsWidgets);
      expect(find.byKey(const Key('booking-bar-total')), findsNothing);
      expect(find.text('Tạm tính'), findsNothing);
    });

    testWidgets('a signed-in customer opens the booking screen, where the price appears', (tester) async {
      await _openTour(tester, email: 'customer@demo.vn');
      await tester.tap(find.byKey(const Key('tour-book')));
      await tester.pumpAndSettle();
      expect(find.text('Ngày đi'), findsOneWidget);
      expect(find.text('Tạm tính'), findsOneWidget);
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

    testWidgets('the household visit request stays reachable as a secondary action', (tester) async {
      await _openTour(tester, email: 'customer@demo.vn');
      await tester.ensureVisible(find.byKey(const Key('tour-visit-request')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('tour-visit-request')), findsOneWidget);
    });
  });
}
