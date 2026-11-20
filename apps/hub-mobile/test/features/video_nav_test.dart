// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';

import '../helpers/fake_video_source.dart';
import 'shorts_test.dart' show openShortsAccount;

void main() {
  testWidgets('customer: the Video button sits next to Khám phá and opens the feed of every channel', (tester) async {
    final videos = FakeVideoSource();
    final repo = MockHubRepository();
    final router = await openShortsAccount(tester, 'customer', videos, repo);
    final labels = tester.widgetList<NavigationDestination>(find.byType(NavigationDestination)).map((d) => d.label);
    expect(labels, ['Khám phá', 'Reels', 'Tour', 'Lịch trình', 'Tài khoản']);

    await tester.tap(find.byKey(const Key('nav-video')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('shorts-player')), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing); // full screen
    final feed = await repo.listAllShorts();
    expect(videos.players.last.video.id, feed.first.id); // newest clip of any channel
    expect(feed.map((v) => v.ownerId).toSet().length, greaterThan(1));

    await tester.fling(find.byKey(const Key('shorts-player')), const Offset(0, -600), 1500);
    await tester.pumpAndSettle();
    expect(videos.players.last.video.id, feed[1].id);

    await tester.tap(find.byKey(const Key('shorts-back')));
    await tester.pumpAndSettle();
    expect(router.routeInformationProvider.value.uri.path, '/shop/me');
  });

  for (final role in ['farmer', 'manager', 'officer', 'operator']) {
    testWidgets('$role: Video sits next to Tổng quan and opens the feed', (tester) async {
      final videos = FakeVideoSource();
      await openShortsAccount(tester, role, videos, MockHubRepository());
      final tabs = find.byWidgetPredicate(
        (w) => w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('bottom-/'),
      );
      expect(tabs, findsNWidgets(4));
      final video = tester.getCenter(find.byKey(const Key('bottom-videos'))).dx;
      final xs = [for (final e in tabs.evaluate()) tester.getCenter(find.byWidget(e.widget)).dx]..sort();
      expect(xs[0] < video && video < xs[1], isTrue, reason: 'the Video button is right after Tổng quan');

      await tester.tap(find.byKey(const Key('bottom-videos')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('shorts-player')), findsOneWidget);
      expect(videos.players.last.isPlaying, isTrue);
      await tester.tap(find.byKey(const Key('shorts-back')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('bottom-videos')), findsOneWidget);
    });
  }

  testWidgets('the bottom bars fit 320 px with large text', (tester) async {
    for (final role in ['customer', 'farmer', 'manager', 'operator']) {
      await openShortsAccount(tester, role, FakeVideoSource(), MockHubRepository(), width: 320, scale: 1.3);
      expect(tester.takeException(), isNull, reason: role);
    }
  });
}
