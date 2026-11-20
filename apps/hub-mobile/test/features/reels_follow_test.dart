// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/app/hub_app.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/hub_repository.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:hub_mobile/data/models/short_video.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../helpers/fake_video_source.dart';
import 'shorts_test.dart' show openShortsAccount;

Future<void> _openFeed(
  WidgetTester tester,
  String role,
  MockHubRepository repo,
  FakeVideoSource videos, {
  double width = 390,
  double scale = 1,
}) async {
  await openShortsAccount(tester, role, videos, repo, width: width, scale: scale);
  final bar = find.byKey(const Key('bottom-videos'));
  await tester.tap(bar.evaluate().isNotEmpty ? bar : find.byKey(const Key('nav-video')));
  await tester.pumpAndSettle();
}

void main() {
  final customer = DemoAuthService.accounts['customer@demo.vn']!;
  final farmer = DemoAuthService.accounts['farmer@demo.vn']!;
  final manager = DemoAuthService.accounts['manager@demo.vn']!;

  test('follow and unfollow a channel; your own channel and unknown ones are refused', () async {
    final repo = MockHubRepository();
    expect(await repo.followedChannels(customer), {'tan-cuong', 'operator-demo'});
    expect(await repo.toggleFollowChannel('farmer-demo', customer), isTrue);
    expect(await repo.followedChannels(customer), contains('farmer-demo'));
    expect(await repo.toggleFollowChannel('farmer-demo', customer), isFalse);
    expect(await repo.followedChannels(customer), isNot(contains('farmer-demo')));
    await expectLater(repo.toggleFollowChannel(shortChannel(farmer), farmer), throwsA(isA<HubException>()));
    await expectLater(repo.toggleFollowChannel(shortChannel(manager), manager), throwsA(isA<HubException>()));
    await expectLater(repo.toggleFollowChannel('nobody', customer), throwsA(isA<HubException>()));
  });

  testWidgets('the feed has the two tabs and "Dành cho bạn" lists every channel', (tester) async {
    final videos = FakeVideoSource();
    final repo = MockHubRepository();
    await _openFeed(tester, 'customer', repo, videos);
    expect(find.text('Theo dõi'), findsOneWidget);
    expect(find.text('Dành cho bạn'), findsOneWidget);
    expect(videos.players.last.video.id, (await repo.listAllShorts()).first.id);
  });

  testWidgets('the "Theo dõi" tab shows only the followed channels, and it follows a new follow', (tester) async {
    final videos = FakeVideoSource();
    final repo = MockHubRepository();
    await _openFeed(tester, 'customer', repo, videos);
    // Newest clip of everyone is the farmer's: not followed yet, so the "+" shows. Follow it.
    expect(videos.players.last.video.ownerId, 'farmer-demo');
    await tester.tap(find.byKey(const Key('reel-follow')));
    await tester.pumpAndSettle();
    expect(await repo.followedChannels(customer), contains('farmer-demo'));
    expect(find.byIcon(Icons.check), findsOneWidget);

    await tester.tap(find.byKey(const Key('feed-tab-following')));
    await tester.pumpAndSettle();
    final followed = await repo.followedChannels(customer);
    expect(followed.contains(videos.players.last.video.ownerId), isTrue);
    final all = await repo.listAllShorts();
    final expectedFirst = all.firstWhere((v) => followed.contains(v.ownerId));
    expect(videos.players.last.video.id, expectedFirst.id);
    // Own channel is not in the followed list: its clips never show here.
    expect(all.where((v) => v.ownerId == 'cus-demo'), isNotEmpty);

    await tester.tap(find.byKey(const Key('feed-tab-foryou')));
    await tester.pumpAndSettle();
    expect(videos.players.last.video.id, all.first.id);
  });

  testWidgets('unfollowing everything leaves the Theo dõi tab with an empty message', (tester) async {
    final videos = FakeVideoSource();
    final repo = MockHubRepository();
    for (final c in await repo.followedChannels(customer)) {
      await repo.toggleFollowChannel(c, customer);
    }
    await _openFeed(tester, 'customer', repo, videos);
    await tester.tap(find.byKey(const Key('feed-tab-following')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('feed-empty')), findsOneWidget);
    expect(find.textContaining('Bạn chưa theo dõi kênh nào'), findsOneWidget);
    expect(find.byKey(const Key('shorts-player')), findsNothing);
    await tester.tap(find.byKey(const Key('feed-tab-foryou')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('shorts-player')), findsOneWidget);
  });

  testWidgets('your own channel has no follow badge', (tester) async {
    final videos = FakeVideoSource();
    final repo = MockHubRepository();
    await _openFeed(tester, 'farmer', repo, videos);
    expect(videos.players.last.video.ownerId, 'farmer-demo'); // the newest clip is the farmer's own
    expect(find.byKey(const Key('reel-follow')), findsOneWidget);
    expect(find.byIcon(Icons.add), findsNothing);
    expect(find.byIcon(Icons.check), findsNothing);
    await tester.tap(find.byKey(const Key('reel-follow')));
    await tester.pumpAndSettle();
    expect(await repo.followedChannels(farmer), isNot(contains('farmer-demo')));
  });

  testWidgets('a guest is asked to sign in to follow, and sees the sign-in message in the Theo dõi tab', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final store = await LocalStore.open();
    tester.view.physicalSize = const Size(390, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final videos = FakeVideoSource();
    await tester.pumpWidget(
      HubApp(repository: MockHubRepository(), auth: DemoAuthService(store), store: store, videoSource: videos),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('login-guest')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('nav-video')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('reel-follow')));
    await tester.pumpAndSettle();
    expect(find.text('Đăng nhập để theo dõi kênh.'), findsOneWidget);
    await tester.tap(find.byKey(const Key('feed-tab-following')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Đăng nhập để theo dõi những kênh'), findsOneWidget);
  });

  testWidgets('the tabs fit 320 px with large text', (tester) async {
    await _openFeed(tester, 'customer', MockHubRepository(), FakeVideoSource(), width: 320, scale: 1.3);
    expect(tester.takeException(), isNull);
    await tester.tap(find.byKey(const Key('feed-tab-following')));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
