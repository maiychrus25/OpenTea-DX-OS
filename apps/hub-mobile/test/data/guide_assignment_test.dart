// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/core/role/role.dart';
import 'package:hub_mobile/data/demo_auth_service.dart';
import 'package:hub_mobile/data/hub_repository.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';

void main() {
  final manager = DemoAuthService.accounts['manager@demo.vn']!;
  final officer = DemoAuthService.accounts['officer@demo.vn']!;
  const guide = Claims(subject: 'guide-demo', name: 'Guide', email: '', roles: ['guide']);
  NewTour draft({int seats = 12}) => NewTour(
    name: 'Tour mới của HTX',
    adultPrice: 250000,
    childPrice: 100000,
    maxGuests: seats,
    dates: [DateTime.now().add(const Duration(days: 30))],
  );

  test('demo guide sees assigned tours from two HTXs but not all their tours', () async {
    final repo = MockHubRepository();
    final tours = await repo.listGuideTours(guide.subject);
    expect(tours.map((t) => t.htxCode).toSet(), {'tan-cuong', 'suoi-giang'});
    expect(tours.every((t) => t.guideIds.contains(guide.subject)), isTrue);
    expect(tours.length, lessThan((await repo.listTours()).length));
    expect(await repo.listGuideTours('unassigned'), isEmpty);
    for (final code in ['tan-cuong', 'suoi-giang']) {
      final staff = await repo.listHtxGuides(code);
      expect(staff.length, inInclusiveRange(2, 3));
      expect(staff.any((g) => g.id == guide.subject), isTrue);
    }
  });

  test('manager creates and edits own tour then adds and removes a guide', () async {
    final repo = MockHubRepository();
    final tour = await repo.createTour(draft(), actor: manager);
    expect(tour.htxCode, manager.htxCode);
    expect((await repo.listDepartures(tour.id)).single.seatsTotal, 12);
    await repo.addGuideToTour(tour.id, guide.subject, actor: manager);
    expect((await repo.listGuideTours(guide.subject)).map((t) => t.id), contains(tour.id));
    await repo.updateTour(tour.id, draft(seats: 20), actor: manager);
    expect((await repo.getTour(tour.id)).guideIds, contains(guide.subject));
    expect((await repo.listDepartures(tour.id)).single.seatsTotal, 20);
    await repo.removeGuideFromTour(tour.id, guide.subject, actor: manager);
    expect((await repo.listGuideTours(guide.subject)).map((t) => t.id), isNot(contains(tour.id)));
  });

  test('guide and officer cannot manage tours and manager cannot edit another HTX', () async {
    final repo = MockHubRepository();
    for (final actor in [guide, officer]) {
      await expectLater(repo.createTour(draft(), actor: actor), throwsA(isA<HubException>()));
      await expectLater(repo.addGuideToTour('tour-01', guide.subject, actor: actor), throwsA(isA<HubException>()));
    }
    final other = (await repo.listTours(htxCode: 'suoi-giang')).first;
    await expectLater(repo.updateTour(other.id, draft(), actor: manager), throwsA(isA<HubException>()));
    await expectLater(repo.addGuideToTour('tour-01', 'missing', actor: manager), throwsA(isA<HubException>()));
  });

  test('guide can check in assigned confirmed group but cannot confirm payment or cancel', () async {
    final repo = MockHubRepository();
    final bookings = await repo.listGuideBookings(guide.subject);
    final confirmed = bookings.firstWhere((b) => b.id == 'bk-01');
    expect((await repo.checkIn(confirmed.id, actor: guide)).checkedIn, isTrue);
    await expectLater(
      repo.recordPayment(reference: confirmed.code, amount: 1, recordedBy: guide.name, actor: guide),
      throwsA(isA<HubException>()),
    );
    await expectLater(repo.cancelBooking('bk-02', actor: guide), throwsA(isA<HubException>()));
    await repo.removeGuideFromTour(confirmed.tourId, guide.subject, actor: manager);
    await expectLater(repo.checkIn(confirmed.id, actor: guide), throwsA(isA<HubException>()));
  });
}
