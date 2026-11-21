// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/data/hub_repository.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';

NewBooking _draft(DateTime date, {int adults = 1, String departureId = ''}) => NewBooking(
  customerId: 'u-1',
  tourId: 'tour-01',
  departureId: departureId,
  contactName: 'Nguyễn Thu Hà',
  phone: '0912345678',
  adults: adults,
  children: 0,
  date: date,
);

void main() {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);

  test('a day without a departure opens one with the tour capacity and books on it', () async {
    final repo = MockHubRepository();
    final day = today.add(const Duration(days: 40));
    final before = await repo.listDepartures('tour-01');
    expect(before.any((d) => d.date == day), isFalse);
    final booking = await repo.createBooking(_draft(day, adults: 2));
    expect(booking.departureDate, day);
    final after = await repo.listDepartures('tour-01');
    final opened = after.singleWhere((d) => d.date == day);
    final tour = await repo.getTour('tour-01');
    expect(opened.seatsTotal, tour.maxGuests);
    expect(opened.seatsTaken, 2);
  });

  test('a second booking on the same free day uses the same departure', () async {
    final repo = MockHubRepository();
    final day = today.add(const Duration(days: 41));
    await repo.createBooking(_draft(day));
    await repo.createBooking(_draft(day));
    final deps = (await repo.listDepartures('tour-01')).where((d) => d.date == day).toList();
    expect(deps, hasLength(1));
    expect(deps.single.seatsTaken, 2);
  });

  test('today and past days are refused', () async {
    final repo = MockHubRepository();
    expect(() => repo.createBooking(_draft(today)), throwsA(isA<HubException>()));
    expect(() => repo.createBooking(_draft(today.subtract(const Duration(days: 3)))), throwsA(isA<HubException>()));
  });

  test('more guests than the tour capacity are refused on a free day', () async {
    final repo = MockHubRepository();
    final tour = await repo.getTour('tour-01');
    expect(
      () => repo.createBooking(_draft(today.add(const Duration(days: 42)), adults: tour.maxGuests + 1)),
      throwsA(isA<HubException>()),
    );
  });
}
