// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:hub_mobile/data/seed_data.dart';
import 'package:hub_mobile/features/customer/tours_tab.dart';
import 'package:hub_mobile/shared/widgets.dart' show LeafLogo;
import 'package:shared_preferences/shared_preferences.dart';

Future<void> _pump(WidgetTester tester) async {
  SharedPreferences.setMockInitialValues({});
  final store = await LocalStore.open();
  tester.view.physicalSize = const Size(800, 2800);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(HubApp(repository: MockHubRepository(), auth: DemoAuthService(store), store: store));
  await tester.pumpAndSettle();
}

Future<void> _guest(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('login-guest')));
  await tester.pumpAndSettle();
}

void main() {
  group('login page', () {
    testWidgets('shows brand, demo account box, fields and both actions', (tester) async {
      await _pump(tester);
      expect(find.text('Về Xứ Chè'), findsOneWidget);
      expect(find.text('Đăng nhập'), findsWidgets);
      expect(find.text('customer@demo.vn'), findsOneWidget);
      expect(find.text(DemoAuthService.demoPassword), findsOneWidget);
      expect(find.text('Email'), findsOneWidget);
      expect(find.text('Mật khẩu'), findsOneWidget);
      expect(find.text('Quên mật khẩu?'), findsOneWidget);
      expect(find.text('Đăng ký'), findsOneWidget);
      expect(find.text('Tiếp tục khám phá'), findsOneWidget);
    });

    testWidgets('eye toggles the password and a wrong password shows an error', (tester) async {
      await _pump(tester);
      final field = find.descendant(of: find.byKey(const Key('login-password')), matching: find.byType(EditableText));
      expect(tester.widget<EditableText>(field).obscureText, isTrue);
      await tester.tap(find.byKey(const Key('login-eye')));
      await tester.pump();
      expect(tester.widget<EditableText>(field).obscureText, isFalse);
      await tester.enterText(find.byKey(const Key('login-email')), 'customer@demo.vn');
      await tester.enterText(find.byKey(const Key('login-password')), 'sai');
      await tester.tap(find.byKey(const Key('login-submit')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('login-error')), findsOneWidget);
    });

    testWidgets('tapping a role chip fills the credentials', (tester) async {
      await _pump(tester);
      await tester.tap(find.byKey(const Key('demo-farmer@demo.vn')));
      await tester.pump();
      expect(find.text('farmer@demo.vn'), findsOneWidget);
    });
  });

  group('home "Khám phá"', () {
    testWidgets('shows search, hero, three tiles and the bottom navigation', (tester) async {
      await _pump(tester);
      await _guest(tester);
      expect(find.text('Về Xứ Chè'), findsNothing);
      expect(find.byKey(const Key('home-account')), findsOneWidget);
      expect(find.text('Tìm đồi chè, trải nghiệm'), findsOneWidget);
      expect(find.text('Khám phá ngay ›'), findsOneWidget);
      expect(find.text('Khám phá ngay ›'), findsOneWidget);
      for (final t in ['Đồi chè', 'Trải nghiệm', 'Đặc sản']) {
        expect(find.text(t), findsOneWidget);
      }
      for (final t in ['Khám phá', 'Tour', 'Lịch trình', 'Tài khoản']) {
        expect(find.descendant(of: find.byType(NavigationBar), matching: find.text(t)), findsOneWidget);
      }
    });

    testWidgets('lower sections: featured places, tour carousel, products, news', (tester) async {
      await _pump(tester);
      await _guest(tester);
      final list = find.byType(Scrollable).first;
      await tester.scrollUntilVisible(find.text('Tour nổi bật'), 300, scrollable: list);
      expect(find.text('Điểm đến nổi bật'), findsOneWidget);
      await tester.scrollUntilVisible(find.byKey(const Key('home-tour-tour-01')), 300, scrollable: list);
      await tester.scrollUntilVisible(find.text('Sản phẩm'), 300, scrollable: list);
      await tester.scrollUntilVisible(find.byKey(const Key('home-all-news')), 300, scrollable: list);
    });

    testWidgets('guest sees cart and news links, a customer also orders and tickets', (tester) async {
      await _pump(tester);
      await _guest(tester);
      expect(find.byKey(const Key('home-cart')), findsOneWidget);
      expect(find.byKey(const Key('home-orders')), findsNothing);
      await tester.tap(find.byKey(const Key('home-account')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('account-login')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('login-email')), 'customer@demo.vn');
      await tester.enterText(find.byKey(const Key('login-password')), DemoAuthService.demoPassword);
      await tester.tap(find.byKey(const Key('login-submit')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('home-orders')), findsOneWidget);
      expect(find.byKey(const Key('home-tickets')), findsOneWidget);
    });
  });

  group('tours and households', () {
    test('tourMatches filters by chip and by search text without accents', () {
      final tours = SeedData.tours;
      expect(tours.where((t) => tourMatches(t, filter: 'Homestay')).map((t) => t.id), ['tour-02']);
      expect(tours.where((t) => tourMatches(t, filter: 'Trong ngày')).length, 2);
      expect(tours.where((t) => tourMatches(t, query: 'shan tuyet')).map((t) => t.id), ['tour-03']);
      expect(tours.where((t) => tourMatches(t)).length, 3);
    });

    testWidgets('logo, search bar and account icon share one row even on a narrow phone', (tester) async {
      await _pump(tester);
      tester.view.physicalSize = const Size(640, 2800);
      await _guest(tester);
      expect(tester.takeException(), isNull);
      final logo = tester.getTopLeft(find.byType(LeafLogo).first).dy;
      final search = tester.getTopLeft(find.byKey(const Key('home-search'))).dy;
      final account = tester.getTopLeft(find.byKey(const Key('home-account'))).dy;
      expect((search - logo).abs(), lessThan(24));
      expect((account - logo).abs(), lessThan(24));
    });

    testWidgets('the top of the home page shows featured tours as swipeable cards', (tester) async {
      await _pump(tester);
      await _guest(tester);
      expect(find.byKey(const Key('home-carousel')), findsOneWidget);
      expect(find.byKey(const Key('home-hero-tour-01')), findsOneWidget);
      await tester.drag(find.byKey(const Key('home-carousel')), const Offset(-400, 0));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('home-hero-tour-02')), findsOneWidget);
      await tester.tap(find.byKey(const Key('home-hero-tour-02')));
      await tester.pumpAndSettle();
      expect(find.text('Giá từ'), findsOneWidget);
    });

    testWidgets('the first bottom tab uses a house icon', (tester) async {
      await _pump(tester);
      await _guest(tester);
      expect(find.byIcon(Icons.home_outlined), findsWidgets);
      expect(find.byIcon(Icons.explore_outlined), findsNothing);
    });

    testWidgets('the header stays at the top while the page scrolls', (tester) async {
      await _pump(tester);
      await _guest(tester);
      final before = tester.getTopLeft(find.byKey(const Key('home-search')));
      await tester.drag(find.byType(Scrollable).first, const Offset(0, -900));
      await tester.pumpAndSettle();
      expect(tester.getTopLeft(find.byKey(const Key('home-search'))), before);
      expect(find.byKey(const Key('home-account')), findsOneWidget);
    });

    testWidgets('submitting the search bar lists the matching tours', (tester) async {
      await _pump(tester);
      await _guest(tester);
      await tester.enterText(find.byKey(const Key('home-search')), 'shan tuyet');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('tour-tour-03')), findsOneWidget);
      expect(find.byKey(const Key('tour-tour-01')), findsNothing);
    });

    testWidgets('list filter, detail, household process and visit request status', (tester) async {
      await _pump(tester);
      await _guest(tester);
      await tester.tap(find.byKey(const Key('home-explore')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('filter-Homestay')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('tour-tour-02')), findsOneWidget);
      expect(find.byKey(const Key('tour-tour-01')), findsNothing);
      await tester.tap(find.byKey(const Key('filter-Tất cả')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('tour-tour-01')));
      await tester.pumpAndSettle();
      expect(find.text('Giá từ'), findsOneWidget);
      expect(find.text('Mức độ'), findsOneWidget);
      await tester.ensureVisible(find.textContaining('Hộ bà Lan'));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Hộ bà Lan'));
      await tester.pumpAndSettle();
      expect(find.text('Quy trình sản xuất chè'), findsOneWidget);
      expect(find.text('Chăm sóc và bón phân'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.byKey(const Key('household-visit')),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.ensureVisible(find.byKey(const Key('household-visit')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('household-visit')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('visit-submit')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('visit-error')), findsOneWidget);
      await tester.enterText(find.byKey(const Key('visit-name')), 'Nguyễn Văn B');
      await tester.enterText(find.byKey(const Key('visit-phone')), '0912345678');
      await tester.tap(find.byKey(const Key('visit-submit')));
      await tester.pumpAndSettle();
      expect(find.text('Đã gửi yêu cầu tham quan'), findsOneWidget);
      expect(find.text('HTX xem và duyệt'), findsOneWidget);
      expect(find.byKey(const Key('visit-code')), findsOneWidget);
    });

    testWidgets('bottom bar is Khám phá, Tour, Lịch trình, Tài khoản with no map or saved tab', (tester) async {
      await _pump(tester);
      await _guest(tester);
      for (final label in ['Khám phá', 'Tour', 'Lịch trình', 'Tài khoản']) {
        expect(find.descendant(of: find.byType(NavigationBar), matching: find.text(label)), findsOneWidget);
      }
      expect(find.text('Bản đồ'), findsNothing);
      expect(find.text('Đã lưu'), findsNothing);
      expect(find.byIcon(Icons.favorite_border), findsNothing);
      await tester.tap(find.byKey(const Key('home-explore')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('save-tour-01')), findsNothing);
    });
  });
}
