// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/hub_repository.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:hub_mobile/data/models/short_video.dart';

import '../helpers/fake_video_source.dart';
import 'shorts_test.dart' show openShortsAccount;

Future<void> _openFeed(WidgetTester tester, String role, MockHubRepository repo, FakeVideoSource videos) async {
  await openShortsAccount(tester, role, videos, repo);
  await tester.tap(
    find.byKey(const Key('bottom-videos')).evaluate().isNotEmpty
        ? find.byKey(const Key('bottom-videos'))
        : find.byKey(const Key('nav-video')),
  );
  await tester.pumpAndSettle();
}

void main() {
  final customer = DemoAuthService.accounts['customer@demo.vn']!;
  final farmer = DemoAuthService.accounts['farmer@demo.vn']!;

  test('one heart per account, toggled, on top of the seeded hearts', () async {
    final repo = MockHubRepository();
    final id = (await repo.listAllShorts()).first.id;
    final base = (await repo.shortReactions(id, viewer: customer)).likes;
    expect((await repo.shortReactions(id, viewer: customer)).liked, isFalse);
    final liked = await repo.toggleShortLike(id, customer);
    expect((liked.likes, liked.liked), (base + 1, true));
    expect((await repo.toggleShortLike(id, farmer)).likes, base + 2);
    final back = await repo.toggleShortLike(id, customer);
    expect((back.likes, back.liked), (base + 1, false));
    expect((await repo.shortReactions(id)).liked, isFalse); // a guest never "liked"
  });

  test('comments: newest first, trimmed, 1 to 300 characters', () async {
    final repo = MockHubRepository();
    final id = (await repo.listAllShorts()).first.id;
    final before = (await repo.listShortComments(id)).length;
    expect(before, inInclusiveRange(2, 4));
    final c = await repo.addShortComment(id, customer, '  Đẹp quá!  ');
    expect(c.text, 'Đẹp quá!');
    expect(c.authorName, customer.name);
    expect((await repo.listShortComments(id)).first.id, c.id);
    expect((await repo.shortReactions(id)).comments, before + 1);
    for (final bad in ['', '   ', 'x' * 301]) {
      await expectLater(repo.addShortComment(id, customer, bad), throwsA(isA<HubException>()));
    }
    await expectLater(repo.toggleShortLike('nope', customer), throwsA(isA<HubException>()));
  });

  test('counts read like the views: 999, 1,2 N, 3 Tr', () {
    expect(shortCountLabel(999), '999');
    expect(shortCountLabel(1200), '1,2 N');
    expect(shortCountLabel(3000000), '3 Tr');
  });

  testWidgets('the heart button toggles and the count follows', (tester) async {
    final repo = MockHubRepository();
    await _openFeed(tester, 'customer', repo, FakeVideoSource());
    final id = (await repo.listAllShorts()).first.id;
    final base = (await repo.shortReactions(id)).likes;
    expect(find.text(shortCountLabel(base)), findsOneWidget);
    await tester.tap(find.byKey(const Key('reel-like')));
    await tester.pumpAndSettle();
    expect(find.text(shortCountLabel(base + 1)), findsOneWidget);
    expect((await repo.shortReactions(id, viewer: customer)).liked, isTrue);
    await tester.tap(find.byKey(const Key('reel-like')));
    await tester.pumpAndSettle();
    expect((await repo.shortReactions(id, viewer: customer)).liked, isFalse);
  });

  testWidgets('a double tap on the video adds a heart once, never removes it', (tester) async {
    final repo = MockHubRepository();
    await _openFeed(tester, 'customer', repo, FakeVideoSource());
    final id = (await repo.listAllShorts()).first.id;
    final base = (await repo.shortReactions(id)).likes;
    for (var i = 0; i < 2; i++) {
      await tester.tap(find.byKey(const Key('short-toggle')));
      await tester.pump(const Duration(milliseconds: 60));
      await tester.tap(find.byKey(const Key('short-toggle')));
      await tester.pump(const Duration(milliseconds: 700));
    }
    await tester.pumpAndSettle();
    expect((await repo.shortReactions(id, viewer: customer)).likes, base + 1);
  });

  testWidgets('comments sheet lists, adds and updates the count', (tester) async {
    final repo = MockHubRepository();
    await _openFeed(tester, 'farmer', repo, FakeVideoSource());
    final id = (await repo.listAllShorts()).first.id;
    final before = (await repo.listShortComments(id)).length;
    await tester.tap(find.byKey(const Key('reel-comments')));
    await tester.pumpAndSettle();
    expect(find.text('Bình luận · $before'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('reel-comment-input')), 'Hay quá, chúc mừng HTX!');
    await tester.pump();
    await tester.tap(find.byKey(const Key('reel-comment-send')));
    await tester.pumpAndSettle();
    expect(find.text('Hay quá, chúc mừng HTX!'), findsOneWidget);
    expect(find.text('Bình luận · ${before + 1}'), findsOneWidget);
    await tester.tapAt(const Offset(10, 10)); // dismiss the sheet
    await tester.pumpAndSettle();
    expect(find.text('${before + 1}'), findsWidgets);
    expect((await repo.listShortComments(id)).first.authorName, farmer.name);
  });

  testWidgets('share copies the title', (tester) async {
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String?;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    final repo = MockHubRepository();
    await _openFeed(tester, 'customer', repo, FakeVideoSource());
    final first = (await repo.listAllShorts()).first;
    await tester.tap(find.byKey(const Key('reel-share')));
    await tester.pumpAndSettle();
    expect(copied, contains(first.title));
  });

  testWidgets('the buttons and the sheet fit 320 px with large text', (tester) async {
    final repo = MockHubRepository();
    await openShortsAccount(tester, 'customer', FakeVideoSource(), repo, width: 320, scale: 1.3);
    await tester.tap(find.byKey(const Key('nav-video')));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.tap(find.byKey(const Key('reel-comments')));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
