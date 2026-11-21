// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import '../models/staff.dart';
import 'core_exception.dart';

// Pure functions from Hasura JSON rows to the app's models. A row that lacks
// a required field is a bad response (CoreException), never a silent default,
// so a schema drift shows up as an error instead of as wrong numbers.

typedef Json = Map<String, Object?>;

Json _obj(Object? v) => v is Map ? v.cast<String, Object?>() : throw const CoreException.badResponse();

List<Json> rows(Object? v) => v is List ? [for (final e in v) _obj(e)] : throw const CoreException.badResponse();

String _req(Json j, String key) {
  final v = j[key];
  return v is String && v.isNotEmpty ? v : throw const CoreException.badResponse();
}

String? _opt(Json j, String key) {
  final v = j[key];
  return v is String && v.isNotEmpty ? v : null;
}

double _num(Json j, String key, {double or = 0}) {
  final v = j[key];
  return v is num ? v.toDouble() : or;
}

/// Hasura renders `timestamp` columns without a zone; they hold UTC (the web does the same).
DateTime parseCoreTimestamp(String value) {
  final hasZone = RegExp(r'(Z|[+-]\d{2}:\d{2})$').hasMatch(value);
  final parsed = DateTime.tryParse(hasZone ? value : '${value}Z');
  return parsed?.toLocal() ?? (throw const CoreException.badResponse());
}

DateTime _date(Json j, String key) => parseCoreTimestamp(_req(j, key));
DateTime? _dateOpt(Json j, String key) {
  final v = _opt(j, key);
  return v == null ? null : parseCoreTimestamp(v);
}

HtxProfile htxProfileFrom(Json j) => HtxProfile(
  code: _req(j, 'htx_code'),
  name: _req(j, 'name'),
  address: _opt(j, 'address') ?? '',
  phone: _opt(j, 'contact_phone') ?? '',
  email: _opt(j, 'contact_email') ?? '',
  cropTypes: [
    if (j['crop_types'] is List)
      for (final c in j['crop_types']! as List)
        if (c is String && c.isNotEmpty) c,
  ],
  seasonLabel: _opt(j, 'season_label') ?? '',
  totalAreaHa: _num(j, 'total_area_ha'),
);

/// Households are the HTX members the core knows. A household with a linked
/// Keycloak account is active; one without is waiting for activation.
Member memberFrom(Json j, String htxCode) => Member(
  id: _req(j, 'id'),
  htxCode: htxCode,
  name: _req(j, 'name'),
  phone: _opt(j, 'phone') ?? '',
  address: _opt(j, 'address'),
  role: MemberRole.farmer,
  status: _opt(j, 'keycloak_user_id') == null ? MemberStatus.pending : MemberStatus.active,
  householdId: _req(j, 'id'),
  joinedAt: _dateOpt(j, 'created_at'),
);

ParcelStatus parcelStatusFrom(String? v) => switch (v) {
  'SOWING' => ParcelStatus.sowing,
  'TENDING' => ParcelStatus.tending,
  'HARVEST_APPROVED' => ParcelStatus.harvestApproved,
  'HARVESTED' => ParcelStatus.harvested,
  _ => ParcelStatus.draft,
};

/// The core has no "zone": the household's address stands in for it.
Parcel parcelFrom(Json j) {
  final household = j['household'] is Map ? _obj(j['household']) : const <String, Object?>{};
  final cycles = j['crop_cycles'] is List ? rows(j['crop_cycles']) : const <Json>[];
  final cycle = cycles.isEmpty ? null : cycles.first;
  final harvested = cycle != null && _opt(cycle, 'harvested_at') != null;
  return Parcel(
    id: _req(j, 'id'),
    code: _req(j, 'parcel_code'),
    householdId: _req(j, 'household_id'),
    householdName: _opt(household, 'name') ?? '',
    cropType: _opt(j, 'crop_type') ?? '',
    areaHa: _num(j, 'area_ha'),
    status: parcelStatusFrom(_opt(j, 'status')),
    estimatedYieldPerHa: _num(j, 'estimated_yield_per_ha'),
    zone: _opt(household, 'address') ?? 'Chưa ghi vùng',
    // A harvested cycle has nothing left to schedule.
    estimatedHarvestDate: cycle == null || harvested ? null : _dateOpt(cycle, 'estimated_harvest_date'),
  );
}

ActivityType activityTypeFrom(String? v) => switch (v) {
  'SOWING' => ActivityType.sowing,
  'FERTILIZING' => ActivityType.fertilizing,
  'SPRAYING' => ActivityType.spraying,
  'IRRIGATION' => ActivityType.irrigation,
  'HARVEST' => ActivityType.harvest,
  _ => ActivityType.other,
};

JournalStatus journalStatusFrom(String? v) => switch (v) {
  'APPROVED' => JournalStatus.approved,
  'REJECTED' => JournalStatus.rejected,
  'REQUEST_CHANGES' => JournalStatus.requestChanges,
  _ => JournalStatus.pendingApproval,
};

JournalEntry journalFrom(Json j) {
  final parcel = j['parcel'] is Map ? _obj(j['parcel']) : throw const CoreException.badResponse();
  final activities = j['activities'] is List ? rows(j['activities']) : const <Json>[];
  final first = activities.isEmpty ? null : activities.first;
  Json? pick(bool Function(Json) test) => activities.where(test).firstOrNull;
  final withProduct = pick((a) => _opt(a, 'product_name') != null);
  final withWithdrawal = pick((a) => a['withdrawal_days'] is int);
  return JournalEntry(
    id: _req(j, 'id'),
    parcelId: _req(j, 'parcel_id'),
    parcelCode: _req(parcel, 'parcel_code'),
    cropType: _opt(parcel, 'crop_type') ?? '',
    householdId: _req(parcel, 'household_id'),
    entryDate: _date(j, 'entry_date'),
    activityType: activityTypeFrom(_opt(j, 'activity_type')),
    performedBy: _opt(j, 'performed_by') ?? '',
    status: journalStatusFrom(_opt(j, 'status')),
    activityDetail: first == null ? '' : (_opt(first, 'activity_detail') ?? ''),
    productName: withProduct == null ? null : _opt(withProduct, 'product_name'),
    dosage: withProduct == null ? null : _opt(withProduct, 'dosage'),
    withdrawalDays: withWithdrawal == null ? null : withWithdrawal['withdrawal_days']! as int,
    notes: _opt(j, 'notes'),
  );
}

LotStatus lotStatusFrom(String? v) => switch (v) {
  'READY' => LotStatus.ready,
  'QR_EXPORTED' => LotStatus.qrExported,
  _ => LotStatus.draft,
};

Lot lotFrom(Json j) {
  double? weight() {
    for (final k in ['actual_weight_kg', 'total_weight_kg', 'estimated_weight_kg']) {
      final v = j[k];
      if (v is num) return v.toDouble();
    }
    return null;
  }

  final links = j['lot_parcels'] is List ? rows(j['lot_parcels']) : const <Json>[];
  return Lot(
    id: _req(j, 'id'),
    lotCode: _req(j, 'lot_code'),
    commodity: _opt(j, 'commodity') ?? '',
    qualityGrade: _opt(j, 'quality_grade'),
    harvestDate: _date(j, 'harvest_date'),
    weightKg: weight(),
    packagingType: _opt(j, 'packaging_type'),
    destination: _opt(j, 'destination'),
    buyerName: _opt(j, 'buyer_name'),
    status: lotStatusFrom(_opt(j, 'status')),
    parcelCodes: [
      for (final l in links)
        if (l['parcel'] is Map && _opt(_obj(l['parcel']), 'parcel_code') != null)
          _opt(_obj(l['parcel']), 'parcel_code')!,
    ],
  );
}

NotificationKind notificationKindFrom(String? v) => switch (v) {
  'HARVEST_APPROVED' => NotificationKind.harvestApproved,
  'DISEASE_REPORT' => NotificationKind.diseaseReport,
  'JOURNAL_SUBMITTED' => NotificationKind.journalSubmitted,
  'JOURNAL_APPROVED' => NotificationKind.journalApproved,
  'MARKET_ALERT' => NotificationKind.marketAlert,
  'SYSTEM' => NotificationKind.system,
  _ => NotificationKind.announcement, // ANNOUNCEMENT, BROADCAST
};

AppNotification notificationFrom(Json j) => AppNotification(
  id: _req(j, 'id'),
  kind: notificationKindFrom(_opt(j, 'type')),
  title: _req(j, 'title'),
  body: _opt(j, 'body') ?? '',
  createdAt: _date(j, 'created_at'),
  isRead: j['is_read'] == true,
  householdId: _opt(j, 'household_id'),
);
