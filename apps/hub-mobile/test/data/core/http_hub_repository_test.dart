// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/data/auth_service.dart';
import 'package:hub_mobile/data/core/core_exception.dart';
import 'package:hub_mobile/data/core/core_queries.dart';
import 'package:hub_mobile/data/hub_repository.dart';
import 'package:hub_mobile/data/http_hub_repository.dart';
import 'package:hub_mobile/data/models/staff.dart';

import 'core_test_support.dart';

void main() {
  late FakeCore core;
  late HttpHubRepository repo;

  setUp(() {
    core = FakeCore.byRoot(rootFixtures);
    repo = core.repository();
  });

  group('parsing the fixtures', () {
    test('HTX profile', () async {
      final p = await repo.getHtxProfile('TC');
      expect(p.code, 'TC');
      expect(p.name, 'HTX Chè Tân Cương');
      expect(p.cropTypes, ['Chè Trung du', 'Chè Kim Tuyên']);
      expect(p.seasonLabel, 'Lứa 4/2026');
      expect(p.totalAreaHa, 42.5);
      expect(p.email, '');
    });

    test('members come from households; a linked account means active', () async {
      final m = await repo.listMembers('TC');
      expect(m.map((e) => e.name), ['Hộ ông Sáng', 'Hộ bà Lan']);
      expect(m[0].status, MemberStatus.active);
      expect(m[1].status, MemberStatus.pending);
      expect(m[0].householdId, 'clx0hh0002');
      expect(m[0].joinedAt!.toUtc(), DateTime.utc(2026, 3, 2, 8, 15, 0, 123, 456));
      expect(m[1].address, isNull);
    });

    test('parcels: status, yield, zone from the household address, open cycle gives the harvest date', () async {
      final p = await repo.listParcels('TC');
      expect(p.length, 3);
      expect(p[0].code, 'P-TC-002');
      expect(p[0].status, ParcelStatus.harvestApproved);
      expect(p[0].areaHa, 0.8);
      expect(p[0].expectedKg, closeTo(7200, 0.001));
      expect(p[0].zone, 'Xóm 3');
      expect(p[0].householdName, 'Hộ ông Sáng');
      expect(p[0].estimatedHarvestDate!.toUtc(), DateTime.utc(2026, 11, 20));
      // a harvested cycle leaves nothing to schedule; null yield is 0; no cycle is fine
      expect(p[1].status, ParcelStatus.harvested);
      expect(p[1].estimatedHarvestDate, isNull);
      expect(p[1].estimatedYieldPerHa, 0);
      expect(p[1].zone, 'Chưa ghi vùng');
      expect(p[2].status, ParcelStatus.draft);
      expect(p[2].estimatedHarvestDate, isNull);
    });

    test('journal: activity, spraying details, status including REQUEST_CHANGES', () async {
      final j = await repo.listJournal('TC');
      expect(j.length, 2);
      final a = j[0];
      expect(a.parcelCode, 'P-TC-002');
      expect(a.householdId, 'clx0hh0002');
      expect(a.activityType, ActivityType.spraying);
      expect(a.status, JournalStatus.pendingApproval);
      expect(a.activityDetail, 'Phun thuốc sâu sinh học');
      expect(a.productName, 'Bt 32000');
      expect(a.dosage, '20 g/bình 16 l');
      expect(a.withdrawalDays, 7);
      expect(a.entryDate.toUtc(), DateTime.utc(2026, 11, 14));
      expect(a.safeHarvestDate!.difference(a.entryDate).inDays, 7);
      final b = j[1];
      expect(b.status, JournalStatus.requestChanges);
      expect(b.activityType, ActivityType.irrigation);
      expect(b.productName, isNull);
      expect(b.notes, isNull);
    });

    test('lots: weight picks actual, then total, then estimated; parcel codes', () async {
      final l = await repo.listLots('TC');
      expect(l[0].lotCode, 'TC-CHE-20261110-001');
      expect(l[0].status, LotStatus.qrExported);
      expect(l[0].weightKg, 480.5);
      expect(l[0].parcelCodes, ['P-TC-001', 'P-TC-002']);
      expect(l[1].status, LotStatus.draft);
      expect(l[1].weightKg, isNull);
      expect(l[1].parcelCodes, isEmpty);
    });

    test('notifications: kinds, read flag, household', () async {
      final n = await repo.listNotifications('TC');
      expect(n[0].kind, NotificationKind.journalSubmitted);
      expect(n[0].isRead, isFalse);
      expect(n[0].householdId, isNull);
      expect(n[1].kind, NotificationKind.announcement); // BROADCAST
      expect(n[1].isRead, isTrue);
      expect(n[1].householdId, 'clx0hh0001');
    });

    test('a row without its id is a bad response, not a silent default', () async {
      final bad = FakeCore((_) => '{"data":{"lots":[{"lot_code":"X","harvest_date":"2026-01-01T00:00:00"}]}}');
      expect(
        bad.repository().listLots('TC'),
        throwsA(isA<CoreException>().having((e) => e.kind, 'kind', CoreErrorKind.badResponse)),
      );
    });

    test('an empty list is an empty list', () async {
      final empty = FakeCore((_) => '{"data":{"journal_entries":[]}}');
      expect(await empty.repository().listJournal('TC'), isEmpty);
    });

    test('a manager without a profile row gets a clear message', () async {
      final none = FakeCore((_) => '{"data":{"htx_profiles":[]}}');
      expect(none.repository().getHtxProfile('TC'), throwsA(isA<CoreException>()));
    });
  });

  group('request bodies', () {
    test('each list asks for its own root with the documented variables', () async {
      await repo.getHtxProfile('TC');
      await repo.listMembers('TC');
      await repo.listParcels('TC');
      await repo.listJournal('TC');
      await repo.listLots('TC');
      await repo.listNotifications('TC');
      final roots = [
        for (final s in core.seen) RegExp(r'\{\s*(\w+)').firstMatch(s.query.substring(s.query.indexOf('{')))!.group(1),
      ];
      expect(roots, ['htx_profiles', 'households', 'parcels', 'journal_entries', 'lots', 'notifications']);
      expect(core.seen[0].variables, isEmpty);
      expect(core.seen[1].variables, {'limit': coreListLimit});
      expect(core.seen[2].variables, {'where': <String, Object?>{}, 'limit': coreListLimit});
      expect(core.seen[3].variables, {'where': <String, Object?>{}, 'limit': coreListLimit});
      expect(core.seen[4].variables, {'limit': coreListLimit});
      expect(core.seen[5].variables, {'limit': coreListLimit});
      expect(core.seen[3].query, contains('journal_entries(where: \$where, order_by: { entry_date: desc }'));
      expect(core.seen.every((s) => s.headers['Authorization'] == 'Bearer tok-123'), isTrue);
    });

    test('the role header follows the token the auth service gives', () async {
      await core.repository(token: const BearerToken('t', hasuraRole: 'farmer')).listLots('TC');
      expect(core.seen.single.headers['x-hasura-role'], 'farmer');
    });
  });

  group('household scoping', () {
    // The row permission in Hasura (farmer: keycloak_user_id = X-Hasura-User-Id) is the real guard.
    // These filters only keep a screen from asking for more than it shows.
    test('a farmer asks for the own household on parcels and diary', () async {
      await repo.listParcels('TC', householdId: 'clx0hh0002');
      await repo.listJournal('TC', householdId: 'clx0hh0002');
      expect(core.seen[0].variables['where'], {
        'household_id': {'_eq': 'clx0hh0002'},
      });
      expect(core.seen[1].variables['where'], {
        'parcel': {
          'household_id': {'_eq': 'clx0hh0002'},
        },
      });
    });

    test('a manager sends no household filter', () async {
      await repo.listParcels('TC');
      expect(core.seen.single.variables['where'], isEmpty);
    });

    test('the htx code argument is never sent: Hasura takes it from the token', () async {
      await repo.listParcels('SOME-OTHER-HTX');
      await repo.listMembers('SOME-OTHER-HTX');
      expect(
        core.seen.any((s) => s.query.contains('SOME-OTHER-HTX') || s.body.toString().contains('SOME-OTHER-HTX')),
        isFalse,
      );
    });

    test('if the server returns more than was asked, the client does not hide it (no client-side security)', () async {
      // The fixture has parcels of two households although one was requested.
      final p = await repo.listParcels('TC', householdId: 'clx0hh0002');
      expect(p.map((e) => e.householdId).toSet(), {'clx0hh0002', 'clx0hh0001'});
    });
  });

  group('read-only core', () {
    test('writes are refused without calling the server', () async {
      expect(repo.coreWritable, isFalse);
      expect(repo.coreIsSample, isFalse);
      final failures = <Future<Object?>>[
        repo.reviewJournal('x', approve: true),
        repo.addJournal(
          NewJournalEntry(parcelId: 'p', entryDate: DateTime(2026), activityType: ActivityType.other, performedBy: 'a'),
        ),
        repo.rescheduleHarvest('p', DateTime(2026)),
        repo.markNotificationRead('n'),
        repo.markAllNotificationsRead('TC'),
      ];
      for (final f in failures) {
        await expectLater(f, throwsA(isA<CoreException>().having((e) => e.kind, 'kind', CoreErrorKind.unsupported)));
      }
      expect(core.seen, isEmpty);
    });

    test('what is not core stays on the sample repository', () async {
      expect((await repo.listTours()).isNotEmpty, isTrue);
      expect((await repo.listPublishedArticles()).isNotEmpty, isTrue);
      expect(core.seen, isEmpty);
    });

    test('errors reach the caller as HubException with Vietnamese text', () async {
      final down = FakeCore((_) => throw Exception('no route'));
      await expectLater(
        down.repository().listLots('TC'),
        throwsA(isA<HubException>().having((e) => e.message, 'message', CoreException.networkMessage)),
      );
    });
  });
}
