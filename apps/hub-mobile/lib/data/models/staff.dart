// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Models of the staff side. Names and fields follow apps/web/prisma/schema.prisma
// (Parcel, JournalEntry, Lot, Notification, HtxProfile, Household), trimmed to what a phone shows.

enum ParcelStatus { sowing, tending, harvestApproved, harvested, draft }

extension ParcelStatusLabel on ParcelStatus {
  String get label => switch (this) {
    ParcelStatus.sowing => 'Xuống giống',
    ParcelStatus.tending => 'Đang chăm sóc',
    ParcelStatus.harvestApproved => 'Được phép thu hoạch',
    ParcelStatus.harvested => 'Đã thu hoạch',
    ParcelStatus.draft => 'Bản nháp',
  };

  /// Parcels counted as "đang canh tác" on the dashboards (web: not HARVESTED, not DRAFT).
  bool get isActive => this != ParcelStatus.harvested && this != ParcelStatus.draft;
}

class Parcel {
  const Parcel({
    required this.id,
    required this.code,
    required this.householdId,
    required this.householdName,
    required this.cropType,
    required this.areaHa,
    required this.status,
    required this.estimatedYieldPerHa,
    required this.zone,
    this.estimatedHarvestDate,
  });
  final String id;
  final String code;
  final String householdId;
  final String householdName;
  final String cropType;
  final double areaHa;
  final ParcelStatus status;

  /// Kilograms per hectare (web: estimated_yield_per_ha).
  final double estimatedYieldPerHa;
  final String zone;
  final DateTime? estimatedHarvestDate;

  double get expectedKg => areaHa * estimatedYieldPerHa;

  Parcel copyWith({ParcelStatus? status, DateTime? estimatedHarvestDate}) => Parcel(
    id: id,
    code: code,
    householdId: householdId,
    householdName: householdName,
    cropType: cropType,
    areaHa: areaHa,
    status: status ?? this.status,
    estimatedYieldPerHa: estimatedYieldPerHa,
    zone: zone,
    estimatedHarvestDate: estimatedHarvestDate ?? this.estimatedHarvestDate,
  );
}

enum MemberRole { farmer, officer, manager }

enum MemberStatus { active, pending, locked }

extension MemberLabels on MemberRole {
  String get label => switch (this) {
    MemberRole.farmer => 'Nông dân',
    MemberRole.officer => 'Cán bộ kỹ thuật',
    MemberRole.manager => 'Trưởng HTX',
  };
}

extension MemberStatusLabels on MemberStatus {
  String get label => switch (this) {
    MemberStatus.active => 'Hoạt động',
    MemberStatus.pending => 'Chờ kích hoạt',
    MemberStatus.locked => 'Đã khoá',
  };
}

class Member {
  const Member({
    required this.id,
    required this.htxCode,
    required this.name,
    required this.phone,
    required this.role,
    required this.status,
    this.email,
    this.address,
    this.householdId,
    this.joinedAt,
  });
  final String id;
  final String htxCode;
  final String name;
  final String phone;
  final String? email;
  final String? address;
  final MemberRole role;
  final MemberStatus status;

  /// Set for farmers: the household (web: Household) this account belongs to.
  final String? householdId;
  final DateTime? joinedAt;
}

enum ActivityType { sowing, fertilizing, spraying, irrigation, harvest, other }

extension ActivityLabels on ActivityType {
  String get label => switch (this) {
    ActivityType.sowing => 'Gieo sạ',
    ActivityType.fertilizing => 'Bón phân',
    ActivityType.spraying => 'Phun thuốc',
    ActivityType.irrigation => 'Tưới tiêu',
    ActivityType.harvest => 'Thu hoạch',
    ActivityType.other => 'Khác',
  };
}

/// Web values: PENDING_APPROVAL, APPROVED, REJECTED (+ REQUEST_CHANGES on the officer page).
enum JournalStatus { pendingApproval, approved, rejected }

extension JournalStatusLabels on JournalStatus {
  String get label => switch (this) {
    JournalStatus.pendingApproval => 'Chờ duyệt',
    JournalStatus.approved => 'Đã duyệt',
    JournalStatus.rejected => 'Từ chối',
  };
}

class JournalEntry {
  const JournalEntry({
    required this.id,
    required this.parcelId,
    required this.parcelCode,
    required this.cropType,
    required this.householdId,
    required this.entryDate,
    required this.activityType,
    required this.performedBy,
    required this.status,
    this.activityDetail = '',
    this.productName,
    this.dosage,
    this.withdrawalDays,
    this.notes,
  });
  final String id;
  final String parcelId;
  final String parcelCode;
  final String cropType;
  final String householdId;
  final DateTime entryDate;
  final ActivityType activityType;
  final String performedBy;
  final JournalStatus status;
  final String activityDetail;
  final String? productName;
  final String? dosage;

  /// Spraying only: days to wait before harvest (web: withdrawal_days).
  final int? withdrawalDays;
  final String? notes;

  DateTime? get safeHarvestDate => withdrawalDays == null ? null : entryDate.add(Duration(days: withdrawalDays!));

  JournalEntry copyWith({JournalStatus? status}) => JournalEntry(
    id: id,
    parcelId: parcelId,
    parcelCode: parcelCode,
    cropType: cropType,
    householdId: householdId,
    entryDate: entryDate,
    activityType: activityType,
    performedBy: performedBy,
    status: status ?? this.status,
    activityDetail: activityDetail,
    productName: productName,
    dosage: dosage,
    withdrawalDays: withdrawalDays,
    notes: notes,
  );
}

class NewJournalEntry {
  const NewJournalEntry({
    required this.parcelId,
    required this.entryDate,
    required this.activityType,
    required this.performedBy,
    this.productName,
    this.dosage,
    this.withdrawalDays,
    this.notes,
  });
  final String parcelId;
  final DateTime entryDate;
  final ActivityType activityType;
  final String performedBy;
  final String? productName;
  final String? dosage;
  final int? withdrawalDays;
  final String? notes;
}

/// Web values: DRAFT, READY, QR_EXPORTED.
enum LotStatus { draft, ready, qrExported }

extension LotStatusLabels on LotStatus {
  String get label => switch (this) {
    LotStatus.draft => 'Nháp',
    LotStatus.ready => 'Sẵn sàng',
    LotStatus.qrExported => 'Đã xuất QR',
  };
}

class Lot {
  const Lot({
    required this.id,
    required this.lotCode,
    required this.commodity,
    required this.harvestDate,
    required this.status,
    required this.parcelCodes,
    this.qualityGrade,
    this.weightKg,
    this.packagingType,
    this.destination,
    this.buyerName,
  });
  final String id;
  final String lotCode;
  final String commodity;
  final String? qualityGrade;
  final DateTime harvestDate;
  final double? weightKg;
  final String? packagingType;
  final String? destination;
  final String? buyerName;
  final LotStatus status;
  final List<String> parcelCodes;
}

/// Web values of NotificationType, grouped as the inbox groups them.
enum NotificationKind {
  announcement,
  harvestApproved,
  diseaseReport,
  journalSubmitted,
  journalApproved,
  marketAlert,
  system,
}

extension NotificationKindLabels on NotificationKind {
  String get label => switch (this) {
    NotificationKind.announcement => 'Thông báo HTX',
    NotificationKind.harvestApproved => 'Cho phép thu hoạch',
    NotificationKind.diseaseReport => 'Báo cáo bệnh',
    NotificationKind.journalSubmitted => 'Nhật ký mới',
    NotificationKind.journalApproved => 'Nhật ký đã duyệt',
    NotificationKind.marketAlert => 'Giá thị trường',
    NotificationKind.system => 'Hệ thống',
  };
}

class AppNotification {
  const AppNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.createdAt,
    this.isRead = false,
    this.householdId,
    this.forStaff = true,
  });
  final String id;
  final NotificationKind kind;
  final String title;
  final String body;
  final DateTime createdAt;
  final bool isRead;

  /// Null for a broadcast of the whole HTX, else the household that receives it.
  final String? householdId;

  /// Whether managers and officers see it (farmer-only messages are false).
  final bool forStaff;

  AppNotification copyWith({bool? isRead}) => AppNotification(
    id: id,
    kind: kind,
    title: title,
    body: body,
    createdAt: createdAt,
    isRead: isRead ?? this.isRead,
    householdId: householdId,
    forStaff: forStaff,
  );
}

/// Web: HtxProfile.
class HtxProfile {
  const HtxProfile({
    required this.code,
    required this.name,
    required this.address,
    required this.phone,
    required this.email,
    required this.cropTypes,
    required this.seasonLabel,
    required this.totalAreaHa,
  });
  final String code;
  final String name;
  final String address;
  final String phone;
  final String email;
  final List<String> cropTypes;
  final String seasonLabel;
  final double totalAreaHa;
}

/// Web: Bulletin (generated summary with its sources) and MarketData rows.
class BulletinItem {
  const BulletinItem({required this.title, required this.body, required this.sources, required this.createdAt});
  final String title;
  final String body;
  final List<String> sources;
  final DateTime createdAt;
}

class MarketPrice {
  const MarketPrice({
    required this.commodity,
    required this.metric,
    required this.level,
    required this.index,
    required this.source,
  });
  final String commodity;
  final String metric;

  /// Plain-language level: 'Ổn định', 'Cao hơn bình thường', ...
  final String level;
  final double index;
  final String source;
}

class WeatherNow {
  const WeatherNow({
    required this.temperatureC,
    required this.condition,
    required this.humidityPct,
    required this.precipitationMm,
  });
  final double temperatureC;
  final String condition;
  final int humidityPct;
  final double precipitationMm;
}

// ---- Tour company ---------------------------------------------------------

enum DirectiveState { done, doing, unconfirmed, notReceived }

extension DirectiveStateLabels on DirectiveState {
  String get label => switch (this) {
    DirectiveState.done => 'Đã xong',
    DirectiveState.doing => 'Đang làm',
    DirectiveState.unconfirmed => 'Chưa xác nhận',
    DirectiveState.notReceived => 'Chưa nhận',
  };
}

class DirectiveAssignment {
  const DirectiveAssignment(this.htxName, this.state);
  final String htxName;
  final DirectiveState state;
}

class Directive {
  const Directive({required this.id, required this.title, required this.dueDate, required this.assignments});
  final String id;
  final String title;
  final DateTime dueDate;
  final List<DirectiveAssignment> assignments;

  int get doneCount => assignments.where((a) => a.state == DirectiveState.done).length;
}

class NewDirective {
  const NewDirective({required this.title, required this.dueDate, this.htxName});
  final String title;
  final DateTime dueDate;

  /// Null means every linked cooperative.
  final String? htxName;
}

/// A cooperative that agreed to link with the tour company (web: HtxProfile + counts).
class LinkedHtx {
  const LinkedHtx({
    required this.code,
    required this.name,
    required this.location,
    required this.households,
    required this.hosting,
    required this.tours,
    required this.articles,
    required this.readiness,
    required this.state,
    required this.guestsThisMonth,
    required this.revenueMillion,
  });
  final String code;
  final String name;
  final String location;
  final int households;
  final int hosting;
  final int tours;
  final int articles;

  /// Percent, 0..100.
  final int readiness;

  /// 'ok', 'warn' or 'neutral' (status chip tone).
  final String state;
  final int guestsThisMonth;
  final int revenueMillion;

  String get stateLabel => switch (state) {
    'ok' => 'Hoạt động tốt',
    'warn' => 'Cần hỗ trợ',
    _ => 'Mới liên kết',
  };
}

class RegionTour {
  const RegionTour({
    required this.id,
    required this.name,
    required this.route,
    required this.price,
    required this.htxCount,
    required this.state,
    required this.stateLabel,
  });
  final String id;
  final String name;
  final String route;
  final int price;
  final int htxCount;

  /// 'ok', 'warn' or 'neutral'.
  final String state;
  final String stateLabel;
}

class ReportRow {
  const ReportRow(this.metric, this.source, this.value);
  final String metric;
  final String source;
  final String value;
}
