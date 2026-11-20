// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/core/role/role.dart';
import 'package:hub_mobile/data/hub_repository.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:hub_mobile/data/models/staff.dart';
import 'package:hub_mobile/features/staff/staff_nav.dart';

void main() {
  late MockHubRepository repo;
  setUp(() => repo = MockHubRepository(now: DateTime(2026, 11, 16, 9)));

  test('a farmer only gets the rows of the own household', () async {
    final parcels = await repo.listParcels('tan-cuong', householdId: 'hh-01');
    expect(parcels.map((p) => p.householdId).toSet(), {'hh-01'});
    final journal = await repo.listJournal('tan-cuong', householdId: 'hh-01');
    expect(journal, isNotEmpty);
    expect(journal.every((e) => e.householdId == 'hh-01'), isTrue);
    final all = await repo.listParcels('tan-cuong');
    expect(all.length, greaterThan(parcels.length));
  });

  test('approving a diary entry is allowed once and only while pending', () async {
    final done = await repo.reviewJournal('jr-01', approve: true);
    expect(done.status, JournalStatus.approved);
    expect(() => repo.reviewJournal('jr-01', approve: false), throwsA(isA<HubException>()));
  });

  test('spraying needs a product name; a valid entry starts pending', () async {
    final draft = NewJournalEntry(
      parcelId: 'pc-01',
      entryDate: DateTime(2026, 11, 16),
      activityType: ActivityType.spraying,
      performedBy: 'Sáng',
    );
    expect(() => repo.addJournal(draft), throwsA(isA<HubException>()));
    final ok = await repo.addJournal(
      NewJournalEntry(
        parcelId: 'pc-01',
        entryDate: DateTime(2026, 11, 16),
        activityType: ActivityType.spraying,
        performedBy: 'Sáng',
        productName: 'BT-10',
        withdrawalDays: 7,
      ),
    );
    expect(ok.status, JournalStatus.pendingApproval);
    expect(ok.safeHarvestDate, DateTime(2026, 11, 23));
  });

  test('notifications: farmers see their own and broadcasts, staff see staff ones; read state sticks', () async {
    final farmer = await repo.listNotifications('tan-cuong', householdId: 'hh-02');
    expect(farmer.every((n) => n.householdId == null || n.householdId == 'hh-02'), isTrue);
    final staff = await repo.listNotifications('tan-cuong');
    expect(staff.every((n) => n.forStaff), isTrue);
    await repo.markNotificationRead('nt-01');
    expect((await repo.listNotifications('tan-cuong')).firstWhere((n) => n.id == 'nt-01').isRead, isTrue);
  });

  test('rescheduling a harvest changes the date; a harvested parcel cannot be moved', () async {
    final p = await repo.rescheduleHarvest('pc-01', DateTime(2026, 12, 1));
    expect(p.estimatedHarvestDate, DateTime(2026, 12, 1));
    expect(() => repo.rescheduleHarvest('pc-07', DateTime(2026, 12, 1)), throwsA(isA<HubException>()));
  });

  test('menu labels are the ones of the web', () {
    List<String> labels(StaffKind k) => [for (final m in navFor(k).main) m.label];
    expect(labels(StaffKind.manager), [
      'Tổng quan',
      'Lịch thu hái',
      'Quản lý thành viên',
      'Bản tin',
      'Duyệt nhật ký',
      'Trợ lý AI',
      'Vùng trồng',
      'Lô hàng',
      'Thông báo',
      'Hồ sơ HTX',
    ]);
    expect(labels(StaffKind.operator), [
      'Tổng quan',
      'Hợp tác xã liên kết',
      'Tour toàn vùng',
      'Bài viết HTX',
      'Báo cáo tổng hợp',
      'Trợ lý AI',
    ]);
    expect(labels(StaffKind.officer), contains('Nông hộ'));
    expect(labels(StaffKind.farmer), contains('Thửa đất của tôi'));
  });

  test('the officer is a manager-area user without write permission', () {
    const officer = Claims(subject: 'o', name: 'Bảo', email: 'o@x', roles: [roleOfficer], htxCode: 'tan-cuong');
    expect(staffKindOf(officer), StaffKind.officer);
    expect(officer.canWriteHtx, isFalse);
    expect(roleFromClaims(officer), AppRole.manager);
  });
}
