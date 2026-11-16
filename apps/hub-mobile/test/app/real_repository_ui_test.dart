// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/data/core/core_exception.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/core/core_test_support.dart';

/// The app on the real repository over a fake server (nothing here touches a network).
Future<void> _open(WidgetTester tester, FakeCore core, String email) async {
  SharedPreferences.setMockInitialValues({});
  final store = await LocalStore.open();
  tester.view.physicalSize = const Size(800, 2800);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(const SizedBox());
  final auth = DemoAuthService(store, devToken: 'dev-token', debugBuild: true);
  await tester.pumpWidget(HubApp(repository: core.repositoryWith(auth.bearerToken), auth: auth, store: store));
  await tester.pumpAndSettle();
  await tester.enterText(find.byKey(const Key('login-email')), email);
  await tester.enterText(find.byKey(const Key('login-password')), DemoAuthService.demoPassword);
  await tester.tap(find.byKey(const Key('login-submit')));
  await tester.pumpAndSettle();
}

void main() {
  group('real dashboard responsive stress', () {
    for (final width in [320.0, 1280.0]) {
      for (final role in ['manager', 'officer', 'farmer']) {
        testWidgets('$role keeps real data boundaries and account claims at $width px', (tester) async {
          final core = FakeCore.byRoot(rootFixtures);
          await _open(tester, core, '$role@demo.vn');
          tester.view.physicalSize = Size(width, 900);
          tester.view.devicePixelRatio = 1;
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          final scroll = tester.state<ScrollableState>(find.byType(Scrollable).first);
          while (scroll.position.pixels < scroll.position.maxScrollExtent) {
            scroll.position.jumpTo((scroll.position.pixels + 400).clamp(0, scroll.position.maxScrollExtent));
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
            for (final sampleSection in ['Gian hàng', 'Chỉ số giá nông sản', 'Thời tiết hiện tại', 'Lịch tham quan']) {
              expect(find.text(sampleSection), findsNothing);
            }
          }
          expect(find.byKey(const Key('sample-chip')), findsNothing);
          expect(find.byKey(const Key('farmer-new-journal')), findsNothing);
          expect(core.seen.every((call) => call.headers['x-hasura-role'] == role), isTrue);
          await tester.tap(find.byKey(const Key('staff-avatar')));
          await tester.pumpAndSettle();
          expect(find.text('$role@demo.vn'), findsOneWidget);
          expect(find.text('Mã HTX · tan-cuong'), findsOneWidget);
          expect(find.byKey(const Key('sample-chip')), findsNothing);
          expect(tester.takeException(), isNull);
        });
      }
    }
  });

  testWidgets('manager dashboard shows real counts, no sample chip, no storefront numbers', (tester) async {
    final core = FakeCore.byRoot(rootFixtures);
    await _open(tester, core, 'manager@demo.vn');
    expect(find.text('Thành viên'), findsOneWidget);
    // 2 households, 1 diary entry waiting, 2 lots (none READY)
    expect(find.text('Nhật ký chờ duyệt'), findsWidgets);
    expect(find.byKey(const Key('sample-chip')), findsNothing);
    expect(find.text('Gian hàng'), findsNothing);
    expect(find.text('Chỉ số giá nông sản'), findsNothing);
    // the token and the role went out with the calls
    expect(core.seen.every((s) => s.headers['Authorization'] == 'Bearer dev-token'), isTrue);
    expect(core.seen.every((s) => s.headers['x-hasura-role'] == 'manager'), isTrue);
  });

  testWidgets('diary page is read-only with the real repository and says so', (tester) async {
    await _open(tester, FakeCore.byRoot(rootFixtures), 'manager@demo.vn');
    await tester.tap(find.byKey(const Key('bottom-/manager/journal-approve')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('journal-clx0je0002')), findsOneWidget);
    expect(find.textContaining('chỉ xem dữ liệu thật'), findsOneWidget);
    expect(find.byKey(const Key('journal-approve-clx0je0002')), findsNothing);
    expect(find.byKey(const Key('sample-chip')), findsNothing);
  });

  testWidgets('an expired session shows the message and a retry that works', (tester) async {
    final core = FakeCore((_) => http.Response('', 401));
    await _open(tester, core, 'manager@demo.vn');
    expect(find.text(CoreException.unauthorizedMessage), findsOneWidget);
    expect(find.byKey(const Key('load-retry')), findsOneWidget);
    core.reply = (s) =>
        fixture(rootFixtures[RegExp(r'\{\s*(\w+)').firstMatch(s.query.substring(s.query.indexOf('{')))!.group(1)!]!);
    await tester.tap(find.byKey(const Key('load-retry')));
    await tester.pumpAndSettle();
    expect(find.text('Thành viên'), findsOneWidget);
    expect(find.byKey(const Key('load-error')), findsNothing);
  });

  testWidgets('server error and forbidden each have their own text', (tester) async {
    await _open(tester, FakeCore((_) => http.Response('oops', 503)), 'manager@demo.vn');
    expect(find.textContaining('mã 503'), findsOneWidget);
    await _open(tester, FakeCore((_) => http.Response('', 403)), 'manager@demo.vn');
    expect(find.text(CoreException.forbiddenMessage), findsOneWidget);
  });

  testWidgets('loading shows a spinner before the answer', (tester) async {
    final core = FakeCore.byRoot(rootFixtures);
    await _open(tester, core, 'manager@demo.vn');
    // open a page and look before settling
    await tester.tap(find.byKey(const Key('bottom-/manager/journal-approve')));
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsWidgets);
    await tester.pumpAndSettle();
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets('an empty diary shows the empty state, not an error', (tester) async {
    final core = FakeCore.byRoot(rootFixtures);
    core.reply = (s) => s.query.contains('journal_entries')
        ? '{"data":{"journal_entries":[]}}'
        : fixture(rootFixtures[RegExp(r'\{\s*(\w+)').firstMatch(s.query.substring(s.query.indexOf('{')))!.group(1)!]!);
    await _open(tester, core, 'manager@demo.vn');
    await tester.tap(find.byKey(const Key('bottom-/manager/journal-approve')));
    await tester.pumpAndSettle();
    expect(find.text('Không có nhật ký nào'), findsOneWidget);
    expect(find.byKey(const Key('load-error')), findsNothing);
  });

  testWidgets('farmer sees own parcels, can not add a diary entry, and the household filter goes out', (tester) async {
    final core = FakeCore.byRoot(rootFixtures);
    await _open(tester, core, 'farmer@demo.vn');
    expect(find.byKey(const Key('farmer-new-journal')), findsNothing);
    final parcelCall = core.seen.firstWhere((s) => s.query.contains('parcels('));
    expect(parcelCall.headers['x-hasura-role'], 'farmer');
    expect(parcelCall.variables['where'], {
      'household_id': {'_eq': 'hh-01'},
    });
    expect(find.byKey(const Key('sample-chip')), findsNothing);
  });

  testWidgets('storefront pages still carry the sample chip with the real repository', (tester) async {
    await _open(tester, FakeCore.byRoot(rootFixtures), 'manager@demo.vn');
    await tester.tap(find.byKey(const Key('bottom-/manager/orders')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('sample-chip')), findsOneWidget);
  });

  testWidgets('with the sample repository the core pages carry the chip', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final store = await LocalStore.open();
    tester.view.physicalSize = const Size(800, 2800);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(HubApp(repository: MockHubRepository(), auth: DemoAuthService(store), store: store));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('login-email')), 'manager@demo.vn');
    await tester.enterText(find.byKey(const Key('login-password')), DemoAuthService.demoPassword);
    await tester.tap(find.byKey(const Key('login-submit')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('sample-chip')), findsOneWidget);
  });
}
