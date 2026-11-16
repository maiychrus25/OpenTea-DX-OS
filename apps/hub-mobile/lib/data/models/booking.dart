// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'order.dart';

/// Tour booking lifecycle: pending (awaiting payment), confirmed, completed, cancelled.
enum BookingStatus { pending, confirmed, completed, cancelled }

extension BookingStatusRules on BookingStatus {
  String get label => switch (this) {
    BookingStatus.pending => 'Chờ xác nhận',
    BookingStatus.confirmed => 'Đã xác nhận',
    BookingStatus.completed => 'Đã đi',
    BookingStatus.cancelled => 'Đã huỷ',
  };

  Set<BookingStatus> get next => switch (this) {
    BookingStatus.pending => {BookingStatus.confirmed, BookingStatus.cancelled},
    BookingStatus.confirmed => {BookingStatus.completed, BookingStatus.cancelled},
    _ => const {},
  };

  bool canMoveTo(BookingStatus target) => next.contains(target);
}

class Booking {
  const Booking({
    required this.id,
    required this.code,
    required this.htxCode,
    required this.householdId,
    required this.tourId,
    required this.tourName,
    required this.departureId,
    required this.departureDate,
    required this.customerId,
    required this.contactName,
    required this.phone,
    required this.adults,
    required this.children,
    required this.total,
    required this.status,
    required this.paymentStatus,
    required this.createdAt,
    this.checkedIn = false,
  });

  final String id;
  final String code;
  final String htxCode;
  final String householdId;
  final String tourId;
  final String tourName;
  final String departureId;
  final DateTime departureDate;
  final String customerId;
  final String contactName;
  final String phone;
  final int adults;
  final int children;
  final int total;
  final BookingStatus status;
  final PaymentStatus paymentStatus;
  final DateTime createdAt;

  /// Set by the farmer when the group arrives at the household.
  final bool checkedIn;

  int get guests => adults + children;

  Booking copyWith({BookingStatus? status, PaymentStatus? paymentStatus, bool? checkedIn}) => Booking(
    id: id,
    code: code,
    htxCode: htxCode,
    householdId: householdId,
    tourId: tourId,
    tourName: tourName,
    departureId: departureId,
    departureDate: departureDate,
    customerId: customerId,
    contactName: contactName,
    phone: phone,
    adults: adults,
    children: children,
    total: total,
    status: status ?? this.status,
    paymentStatus: paymentStatus ?? this.paymentStatus,
    createdAt: createdAt,
    checkedIn: checkedIn ?? this.checkedIn,
  );

  Map<String, Object?> toJson() => {
    'id': id,
    'code': code,
    'htxCode': htxCode,
    'householdId': householdId,
    'tourId': tourId,
    'tourName': tourName,
    'departureId': departureId,
    'departureDate': departureDate.toIso8601String(),
    'customerId': customerId,
    'contactName': contactName,
    'phone': phone,
    'adults': adults,
    'children': children,
    'total': total,
    'status': status.name,
    'paymentStatus': paymentStatus.name,
    'createdAt': createdAt.toIso8601String(),
    'checkedIn': checkedIn,
  };

  factory Booking.fromJson(Map<String, Object?> j) => Booking(
    id: j['id']! as String,
    code: j['code']! as String,
    htxCode: j['htxCode']! as String,
    householdId: j['householdId']! as String,
    tourId: j['tourId']! as String,
    tourName: j['tourName']! as String,
    departureId: j['departureId']! as String,
    departureDate: DateTime.parse(j['departureDate']! as String),
    customerId: j['customerId']! as String,
    contactName: j['contactName']! as String,
    phone: j['phone']! as String,
    adults: j['adults']! as int,
    children: j['children']! as int,
    total: j['total']! as int,
    status: BookingStatus.values.byName(j['status']! as String),
    paymentStatus: PaymentStatus.values.byName(j['paymentStatus']! as String),
    createdAt: DateTime.parse(j['createdAt']! as String),
    checkedIn: (j['checkedIn'] as bool?) ?? false,
  );
}

/// Append-only ledger entry (direction doc §5.4): refunds are negative amounts.
class Payment {
  const Payment({
    required this.id,
    required this.htxCode,
    required this.reference,
    required this.amount,
    required this.recordedBy,
    required this.recordedAt,
  });
  final String id;
  final String htxCode;

  /// Order or booking code the money belongs to.
  final String reference;
  final int amount;
  final String recordedBy;
  final DateTime recordedAt;
}

/// Counts for the manager report and the operator overview.
class HtxSummary {
  const HtxSummary({
    required this.htx,
    required this.pendingOrders,
    required this.pendingBookings,
    required this.confirmedBookings,
    required this.revenue,
  });
  final String htx;
  final int pendingOrders;
  final int pendingBookings;
  final int confirmedBookings;
  final int revenue;
}
