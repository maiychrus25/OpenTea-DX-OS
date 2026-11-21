// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/core/role/role.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/hub_repository.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:hub_mobile/data/models/short_video.dart';

void main() {
  final customer = DemoAuthService.accounts['customer@demo.vn']!;
  final manager = DemoAuthService.accounts['manager@demo.vn']!;
  final officer = DemoAuthService.accounts['officer@demo.vn']!;
  const other = Claims(subject: 'other', name: 'Khách mới', email: '', roles: [roleCustomer]);

  for (final entry in DemoAuthService.accounts.entries) {
    test('${entry.key} has two to four clips in its channel', () async {
      final clips = await MockHubRepository().listShorts(shortChannel(entry.value));
      expect(clips.length, inInclusiveRange(2, 4));
      expect(clips.every((v) => v.ownerId == shortChannel(entry.value)), isTrue);
      expect(clips.every((v) => v.source.startsWith('assets/videos/')), isTrue);
    });
  }

  test('manager and officer share the cooperative channel', () {
    expect(shortChannel(manager), 'tan-cuong');
    expect(shortChannel(officer), shortChannel(manager));
    expect(canManageShorts(officer), isFalse);
  });

  test('posting puts a validated clip first with session owner and zero views', () async {
    final repo = MockHubRepository();
    final clip = await repo.postShort(
      customer,
      title: '  Chuyến đi của tôi  ',
      source: 'local.mp4',
      durationSeconds: 6,
    );
    expect((await repo.listShorts(shortChannel(customer))).first, clip);
    expect(clip.title, 'Chuyến đi của tôi');
    expect(clip.ownerId, customer.subject);
    expect(clip.ownerName, customer.name);
    expect(clip.views, 0);
    expect(clip.poster, isNull);
  });

  test('delete only own channel, never another customer or officer', () async {
    final repo = MockHubRepository();
    final clip = (await repo.listShorts(shortChannel(customer))).first;
    await expectLater(repo.deleteShort(clip.id, actor: other), throwsA(isA<HubException>()));
    final shared = (await repo.listShorts(shortChannel(manager))).first;
    await expectLater(repo.deleteShort(shared.id, actor: officer), throwsA(isA<HubException>()));
    await repo.deleteShort(shared.id, actor: manager);
    expect((await repo.listShorts(shortChannel(manager))).any((v) => v.id == shared.id), isFalse);
    for (final own in await repo.listShorts(shortChannel(customer))) {
      await repo.deleteShort(own.id, actor: customer);
    }
    expect(await repo.listShorts(shortChannel(customer)), isEmpty);
  });

  test('officer cannot post even by calling the repository directly', () async {
    await expectLater(
      MockHubRepository().postShort(officer, title: 'Không được', source: 'local.mp4', durationSeconds: 6),
      throwsA(isA<HubException>()),
    );
  });

  test('reject blank or oversized titles and invalid durations or sources', () async {
    final repo = MockHubRepository();
    for (final title in ['', '   ', 'x' * 81]) {
      await expectLater(
        repo.postShort(customer, title: title, source: 'local.mp4', durationSeconds: 6),
        throwsA(isA<HubException>()),
      );
    }
    for (final duration in [0, -1, 61]) {
      await expectLater(
        repo.postShort(customer, title: 'Video', source: 'local.mp4', durationSeconds: duration),
        throwsA(isA<HubException>()),
      );
    }
    await expectLater(
      repo.postShort(customer, title: 'Video', source: '', durationSeconds: 6),
      throwsA(isA<HubException>()),
    );
  });

  test('new customer is empty and viewing increments only the selected clip', () async {
    final repo = MockHubRepository();
    expect(await repo.listShorts(shortChannel(other)), isEmpty);
    final before = (await repo.listShorts(shortChannel(manager))).first;
    final viewed = await repo.recordShortView(before.id);
    expect(viewed.views, before.views + 1);
    expect((await repo.listShorts(shortChannel(manager))).first.views, viewed.views);
  });
}
