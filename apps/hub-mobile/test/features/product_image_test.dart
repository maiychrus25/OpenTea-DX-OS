// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:hub_mobile/shared/product_image.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('the seed of a product known only by its id follows the seeded products', () {
    expect(productSeedFromId('prod-01'), 0);
    expect(productSeedFromId('prod-05'), 4);
    expect(productSeedFromId('abc'), 3); // no number: stable fallback
  });

  testWidgets('each of the three drawings renders without errors at several sizes', (tester) async {
    for (final seed in [0, 1, 2, 3, 4]) {
      for (final size in [48.0, 84.0, 160.0]) {
        await tester.pumpWidget(
          MaterialApp(
            home: Center(
              child: ProductImage(seed: seed, height: size, width: size),
            ),
          ),
        );
        expect(tester.takeException(), isNull, reason: 'seed $seed size $size');
      }
    }
  });

  group('products have a picture', () {
    Future<void> openShop(WidgetTester tester) async {
      SharedPreferences.setMockInitialValues({});
      final store = await LocalStore.open();
      tester.view.physicalSize = const Size(800, 2800);
      tester.view.devicePixelRatio = 2;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(HubApp(repository: MockHubRepository(), auth: DemoAuthService(store), store: store));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('login-guest')));
      await tester.pumpAndSettle();
    }

    testWidgets('on the home page strip and on the products page', (tester) async {
      await openShop(tester);
      final list = find.descendant(of: find.byType(RefreshIndicator), matching: find.byType(Scrollable)).first;
      await tester.scrollUntilVisible(find.byKey(const Key('home-product-image-prod-01')), 300, scrollable: list);
      expect(find.byKey(const Key('home-product-image-prod-01')), findsOneWidget);
      await tester.tap(find.byKey(const Key('home-all-products')));
      await tester.pumpAndSettle();
      for (final id in ['prod-01', 'prod-02', 'prod-03']) {
        expect(find.byKey(Key('product-image-$id')), findsOneWidget, reason: id);
      }
    });
  });
}
