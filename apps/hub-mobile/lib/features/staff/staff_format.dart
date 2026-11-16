// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../data/hub_repository.dart';
import '../../data/models/booking.dart';
import '../../data/models/catalog.dart' show ArticleStatus;
import '../../data/models/order.dart';
import '../../data/models/staff.dart';
import 'staff_widgets.dart';

/// Vietnamese decimal: comma, trimmed zero ("1,2").
String fmtNum(num v, {int digits = 1}) {
  final s = v.toStringAsFixed(digits);
  final trimmed = s.contains('.') ? s.replaceFirst(RegExp(r'\.?0+$'), '') : s;
  return trimmed.replaceAll('.', ',');
}

String fmtHa(double v) => '${fmtNum(v)} ha';
String fmtTon(double kg) => '${fmtNum(kg / 1000)} tấn';

DateTime dayOf(DateTime d) => DateTime(d.year, d.month, d.day);

int daysUntil(DateTime date, DateTime now) => dayOf(date).difference(dayOf(now)).inDays;

String greeting(DateTime now) {
  if (now.hour < 12) return 'Chào buổi sáng';
  if (now.hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

String relativeTime(DateTime t, DateTime now) {
  final d = now.difference(t);
  if (d.inMinutes < 60) return '${d.inMinutes.clamp(1, 59)} phút trước';
  if (d.inHours < 24) return '${d.inHours} giờ trước';
  return '${d.inDays} ngày trước';
}

Tone parcelTone(ParcelStatus s) => switch (s) {
  ParcelStatus.sowing => Tone.neutral,
  ParcelStatus.tending => Tone.ok,
  ParcelStatus.harvestApproved => Tone.warn,
  ParcelStatus.harvested => Tone.neutral,
  ParcelStatus.draft => Tone.neutral,
};

Tone journalTone(JournalStatus s) => switch (s) {
  JournalStatus.pendingApproval => Tone.warn,
  JournalStatus.approved => Tone.ok,
  JournalStatus.rejected => Tone.bad,
};

Tone lotTone(LotStatus s) => switch (s) {
  LotStatus.draft => Tone.warn,
  LotStatus.ready => Tone.ok,
  LotStatus.qrExported => Tone.neutral,
};

Tone memberTone(MemberStatus s) => switch (s) {
  MemberStatus.active => Tone.ok,
  MemberStatus.pending => Tone.warn,
  MemberStatus.locked => Tone.bad,
};

Tone toneOfState(String s) => switch (s) {
  'ok' => Tone.ok,
  'warn' => Tone.warn,
  'bad' => Tone.bad,
  _ => Tone.neutral,
};

Tone directiveTone(DirectiveState s) => switch (s) {
  DirectiveState.done => Tone.ok,
  DirectiveState.doing => Tone.warn,
  DirectiveState.unconfirmed => Tone.bad,
  DirectiveState.notReceived => Tone.neutral,
};

/// What every staff page needs to know about the signed-in user.
class StaffScope {
  StaffScope(BuildContext context)
    : repo = context.read<HubRepository>(),
      htx = context.read<AppState>().claims?.htxCode ?? '',
      userName = context.read<AppState>().claims?.name ?? '',
      canWrite = context.read<AppState>().claims?.canWriteHtx ?? false,
      _household = context.read<AppState>().claims?.householdId,
      isFarmer = context.read<AppState>().claims?.householdId != null;

  final HubRepository repo;
  final String htx;
  final String userName;
  final bool canWrite;
  final bool isFarmer;
  final String? _household;

  /// Set for farmers only, so their queries return their own household.
  String? get household => isFarmer ? _household : null;
}

Tone bookingTone(BookingStatus s) => switch (s) {
  BookingStatus.pending => Tone.warn,
  BookingStatus.cancelled => Tone.bad,
  _ => Tone.ok,
};

Tone orderTone(OrderStatus s) => switch (s) {
  OrderStatus.pending => Tone.warn,
  OrderStatus.cancelled => Tone.bad,
  _ => Tone.ok,
};

Tone paymentTone(PaymentStatus s) => switch (s) {
  PaymentStatus.unpaid => Tone.bad,
  PaymentStatus.claimed => Tone.warn,
  PaymentStatus.paid => Tone.ok,
};

Tone articleTone(ArticleStatus s) => switch (s) {
  ArticleStatus.published => Tone.ok,
  ArticleStatus.pending => Tone.warn,
  ArticleStatus.rejected => Tone.bad,
  ArticleStatus.draft => Tone.neutral,
};
