// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/data/models/booking.dart';
import 'package:hub_mobile/data/models/order.dart';

Booking _booking({String email = '', String note = ''}) => Booking(
  id: 'bk-1',
  code: 'TOUR-0001',
  htxCode: 'tan-cuong',
  householdId: 'hh-01',
  tourId: 'tour-01',
  tourName: 'Một ngày làm người hái chè',
  departureId: 'dep-01',
  departureDate: DateTime(2026, 11, 22),
  customerId: 'u-1',
  contactName: 'Nguyễn Thu Hà',
  phone: '0912345678',
  adults: 1,
  children: 0,
  total: 350000,
  status: BookingStatus.pending,
  paymentStatus: PaymentStatus.unpaid,
  createdAt: DateTime(2026, 11, 17),
  email: email,
  note: note,
);

void main() {
  test('email and note survive a round trip through JSON and copyWith', () {
    final b = _booking(email: 'ha@example.com', note: 'Đi cùng một em bé');
    final back = Booking.fromJson(b.toJson());
    expect(back.email, 'ha@example.com');
    expect(back.note, 'Đi cùng một em bé');
    expect(b.copyWith(status: BookingStatus.confirmed).note, 'Đi cùng một em bé');
  });

  test('a booking saved before the two fields existed still loads, with empty values', () {
    final json = _booking().toJson()
      ..remove('email')
      ..remove('note');
    final back = Booking.fromJson(json);
    expect(back.email, '');
    expect(back.note, '');
  });
}
