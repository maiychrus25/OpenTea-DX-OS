// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/core/role/role.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:hub_mobile/data/models/short_video.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../helpers/fake_video_source.dart';

Future<GoRouter> openShortsAccount(
  WidgetTester tester,
  String role,
  FakeVideoSource videos,
  MockHubRepository repo, {
  double width = 390,
  double height = 1200,
  double scale = 1,
}) async {
  SharedPreferences.setMockInitialValues({});
  final store = await LocalStore.open();
  await store.saveSession(DemoAuthService.accounts['$role@demo.vn']!);
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = scale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  await tester.pumpWidget(HubApp(repository: repo, auth: DemoAuthService(store), store: store, videoSource: videos));
  await tester.pumpAndSettle();
  final router = GoRouter.of(tester.element(find.byType(Scaffold).first));
  final home = homeRouteFor(roleFromClaims(DemoAuthService.accounts['$role@demo.vn']!));
  router.go('$home/me');
  await tester.pumpAndSettle();
  return router;
}

Future<void> tapVisible(WidgetTester tester, String key) async {
  await tester.ensureVisible(find.byKey(Key(key)));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(Key(key)));
  // A single tap on the video waits for a possible double tap (a heart) before it counts.
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pumpAndSettle();
}

void main() {
  for (final role in ['customer', 'farmer', 'manager', 'officer', 'operator']) {
    testWidgets('$role account shows shorts and opens its selected clip with a working back', (tester) async {
      final videos = FakeVideoSource();
      final repo = MockHubRepository();
      final router = await openShortsAccount(tester, role, videos, repo);
      final accountPath = router.routeInformationProvider.value.uri.path;
      expect(find.byKey(const Key('shorts-section')), findsOneWidget);
      final clips = await repo.listShorts(shortChannel(DemoAuthService.accounts['$role@demo.vn']!));
      await tapVisible(tester, 'short-${clips[1].id}');
      expect(find.byKey(const Key('shorts-player')), findsOneWidget);
      expect(videos.players.last.video.id, clips[1].id);
      expect(videos.players.last.isPlaying, isTrue);
      expect(find.byType(NavigationBar), findsNothing);
      expect(find.byKey(const Key('short-delete')), role == 'officer' ? findsNothing : findsOneWidget);
      await tapVisible(tester, 'shorts-back');
      expect(router.routeInformationProvider.value.uri.path, accountPath);
      expect(videos.players.every((p) => p.disposed), isTrue);
    });
  }

  testWidgets('swipe changes player, tap pauses, views counted once per start and back disposes', (tester) async {
    final videos = FakeVideoSource();
    final repo = MockHubRepository();
    await openShortsAccount(tester, 'farmer', videos, repo);
    final channel = shortChannel(DemoAuthService.accounts['farmer@demo.vn']!);
    final clips = await repo.listShorts(channel);
    await tapVisible(tester, 'short-${clips.first.id}');
    final first = videos.players.last;
    await tapVisible(tester, 'short-toggle');
    expect(first.isPlaying, isFalse);
    expect(first.pauses, greaterThan(0));
    await tapVisible(tester, 'short-toggle');
    expect(first.isPlaying, isTrue);
    expect((await repo.listShorts(channel)).first.views, clips.first.views + 1);
    await tester.drag(find.byKey(const Key('shorts-player')), const Offset(0, -800));
    await tester.pumpAndSettle();
    expect(first.disposed, isTrue);
    expect(videos.players.last.video.id, clips[1].id);
    expect(videos.players.where((p) => p.isPlaying).length, 1);
    await tapVisible(tester, 'shorts-back');
    expect(videos.players.every((p) => p.disposed), isTrue);
  });

  testWidgets('post requires a title, adds first, then confirmed delete removes it', (tester) async {
    final videos = FakeVideoSource();
    final repo = MockHubRepository();
    await openShortsAccount(tester, 'customer', videos, repo);
    await tapVisible(tester, 'shorts-post');
    expect(find.byKey(const Key('short-title')), findsOneWidget);
    await tapVisible(tester, 'short-submit');
    expect(find.text('Hãy nhập tiêu đề video.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('short-title')), 'Video của tôi');
    await tapVisible(tester, 'short-submit');
    final clips = await repo.listShorts('cus-demo');
    expect(clips.first.title, 'Video của tôi');
    expect(clips.length, 3);
    await tapVisible(tester, 'short-${clips.first.id}');
    await tapVisible(tester, 'short-delete');
    await tapVisible(tester, 'short-delete-confirm');
    final left = await repo.listShorts('cus-demo');
    expect(left.length, 2);
    expect(left.any((v) => v.title == 'Video của tôi'), isFalse);
    expect(find.byKey(const Key('shorts-section')), findsOneWidget);
  });

  testWidgets('officer has no post action on account or grid', (tester) async {
    await openShortsAccount(tester, 'officer', FakeVideoSource(), MockHubRepository());
    expect(find.byKey(const Key('shorts-post')), findsNothing);
    await tapVisible(tester, 'shorts-all');
    expect(find.byKey(const Key('shorts-grid')), findsOneWidget);
    expect(find.byKey(const Key('shorts-post')), findsNothing);
  });

  testWidgets('customer without clips gets inviting empty state', (tester) async {
    final repo = MockHubRepository();
    final customer = DemoAuthService.accounts['customer@demo.vn']!;
    for (final clip in await repo.listShorts(shortChannel(customer))) {
      await repo.deleteShort(clip.id, actor: customer);
    }
    await openShortsAccount(tester, 'customer', FakeVideoSource(), repo);
    expect(find.byKey(const Key('shorts-empty')), findsOneWidget);
    expect(find.byKey(const Key('shorts-post')), findsOneWidget);
  });
}
