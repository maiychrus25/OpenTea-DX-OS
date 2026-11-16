// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> _openTrips(WidgetTester tester, {String? email}) async {
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
  await tester.tap(find.text('Lịch trình').first);
  await tester.pumpAndSettle();
}

void main() {
  group('Lịch trình shortcuts', () {
    testWidgets('a customer sees ticket and order tiles and the find-tour card', (tester) async {
      await _openTrips(tester, email: 'customer@demo.vn');
      expect(find.byKey(const Key('trips-tickets')), findsOneWidget);
      expect(find.byKey(const Key('trips-orders')), findsOneWidget);
      expect(find.text('Vé của tôi'), findsOneWidget);
      expect(find.text('Đơn hàng'), findsOneWidget);
      expect(find.byKey(const Key('trips-find')), findsOneWidget);
      expect(find.text('Tìm thêm tour'), findsOneWidget);
    });

    testWidgets('the tiles sit side by side', (tester) async {
      await _openTrips(tester, email: 'customer@demo.vn');
      final a = tester.getTopLeft(find.byKey(const Key('trips-tickets')));
      final b = tester.getTopLeft(find.byKey(const Key('trips-orders')));
      expect(a.dy, b.dy);
      expect(b.dx, greaterThan(a.dx));
    });

    testWidgets('the orders tile opens the orders screen and the find card opens the tours', (tester) async {
      await _openTrips(tester, email: 'customer@demo.vn');
      await tester.tap(find.byKey(const Key('trips-orders')));
      await tester.pumpAndSettle();
      expect(find.text('Đơn hàng của tôi'), findsWidgets);
      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('trips-find')));
      await tester.tap(find.byKey(const Key('trips-find')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('tour-tour-01')), findsOneWidget);
    });

    testWidgets('a guest only gets the find-tour card', (tester) async {
      await _openTrips(tester);
      expect(find.byKey(const Key('trips-tickets')), findsNothing);
      expect(find.byKey(const Key('trips-orders')), findsNothing);
      expect(find.byKey(const Key('trips-find')), findsOneWidget);
    });
  });
}
