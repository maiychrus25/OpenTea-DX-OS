// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/// A cooperative (HTX). Every storefront item belongs to exactly one; money
/// goes straight to its bank account (direction doc §2).
class Htx {
  const Htx({
    required this.code,
    required this.name,
    required this.province,
    required this.bankBin,
    required this.bankAccount,
    required this.accountHolder,
    this.contactPhone = '',
  });
  final String contactPhone;
  final String code;
  final String name;
  final String province;
  final String bankBin;
  final String bankAccount;
  final String accountHolder;
}

/// A notable place a cooperative shows to visitors (a hill, a tea workshop, a viewpoint).
/// It mirrors the `sites` of the tea-experience mini-app, without the coordinates.
class Site {
  const Site({required this.id, required this.htxCode, required this.name, required this.description});
  final String id;
  final String htxCode;
  final String name;
  final String description;
}

/// A guide can be on the staff list of more than one cooperative.
class GuideStaff {
  const GuideStaff({required this.id, required this.name, required this.phone, required this.htxCode});
  final String id;
  final String name;
  final String phone;
  final String htxCode;
}

class ItineraryDay {
  const ItineraryDay({required this.title, required this.steps});
  final String title;
  final List<String> steps;
}

class Departure {
  const Departure({
    required this.id,
    required this.tourId,
    required this.date,
    required this.seatsTotal,
    required this.seatsTaken,
  });
  final String id;
  final String tourId;
  final DateTime date;
  final int seatsTotal;
  final int seatsTaken;
  int get seatsLeft => seatsTotal - seatsTaken;
}

class Tour {
  const Tour({
    required this.id,
    required this.htxCode,
    required this.householdId,
    required this.name,
    required this.summary,
    required this.durationLabel,
    required this.adultPrice,
    required this.childPrice,
    required this.itinerary,
    required this.gradientSeed,
    this.tags = const [],
    this.bestMonths = 'Quanh năm',
    this.level = 'Dễ',
    this.maxGuests = 12,
    this.includes = const [],
    this.guideIds = const [],
  });
  final String id;
  final String htxCode;

  /// Household that hosts the visit; the farmer of that household sees it.
  final String householdId;
  final String name;
  final String summary;
  final String durationLabel;
  final int adultPrice;
  final int childPrice;
  final List<ItineraryDay> itinerary;

  /// Picks the demo photo (and the fallback gradient).
  final int gradientSeed;

  /// Filter labels, e.g. "Hái chè", "Homestay".
  final List<String> tags;
  final String bestMonths;
  final String level;
  final int maxGuests;

  /// What the price covers, as the cooperative lists it (shown under 'Bao gồm').
  final List<String> includes;

  /// Account subjects assigned by this tour's cooperative.
  final List<String> guideIds;

  Tour copyWith({String? name, int? adultPrice, int? childPrice, int? maxGuests, List<String>? guideIds}) => Tour(
    id: id,
    htxCode: htxCode,
    householdId: householdId,
    name: name ?? this.name,
    summary: summary,
    durationLabel: durationLabel,
    adultPrice: adultPrice ?? this.adultPrice,
    childPrice: childPrice ?? this.childPrice,
    itinerary: itinerary,
    gradientSeed: gradientSeed,
    tags: tags,
    bestMonths: bestMonths,
    level: level,
    maxGuests: maxGuests ?? this.maxGuests,
    includes: includes,
    guideIds: List.unmodifiable(guideIds ?? this.guideIds),
  );

  /// Whole-day or shorter tours; used by the "Trong ngày" filter.
  bool get isSameDay => !durationLabel.contains('đêm');

  /// Number of days of the tour: the number at the start of [durationLabel] ('2 ngày 1 đêm' gives 2), else the
  /// itinerary length, at least 1.
  int get days {
    final n = int.tryParse(RegExp(r'^\s*(\d+)').firstMatch(durationLabel)?.group(1) ?? '');
    if (n != null && n > 0) return n;
    return itinerary.isEmpty ? 1 : itinerary.length;
  }
}

/// One step of a household's tea production, with where the statement comes from.
class ProcessStep {
  const ProcessStep({required this.title, required this.description, required this.source});
  final String title;
  final String description;
  final String source;
}

/// A farming household that welcomes visitors. Only what the household agreed
/// to publish (no phone number, no plot location).
class Household {
  const Household({
    required this.id,
    required this.htxCode,
    required this.name,
    required this.village,
    required this.crop,
    required this.certificate,
    required this.experience,
    required this.hosting,
    required this.process,
  });
  final String id;
  final String htxCode;
  final String name;
  final String village;
  final String crop;
  final String certificate;
  final String experience;
  final String hosting;
  final List<ProcessStep> process;
}

class Product {
  const Product({
    required this.id,
    required this.htxCode,
    required this.name,
    required this.unit,
    required this.price,
    required this.stock,
    required this.description,
    required this.gradientSeed,
    this.householdId,
    this.origin = '',
    this.harvest = '',
    this.shelfLife = '',
    this.storage = '',
    this.brewing = '',
  });
  final String id;
  final String htxCode;
  final String name;
  final String unit;
  final int price;
  final int stock;
  final String description;
  final int gradientSeed;

  /// Producing household, when a single household produces it.
  final String? householdId;

  /// Details the cooperative writes for the product page; an empty one is not shown.
  final String origin;
  final String harvest;
  final String shelfLife;
  final String storage;
  final String brewing;
}

enum ArticleStatus { draft, pending, published, rejected }

extension ArticleStatusLabel on ArticleStatus {
  String get label => switch (this) {
    ArticleStatus.draft => 'Nháp',
    ArticleStatus.pending => 'Chờ duyệt',
    ArticleStatus.published => 'Đã đăng',
    ArticleStatus.rejected => 'Bị từ chối',
  };
}

class Article {
  const Article({
    required this.id,
    required this.htxCode,
    required this.title,
    required this.body,
    required this.status,
    required this.createdAt,
    this.pinned = false,
  });
  final String id;
  final String htxCode;
  final String title;
  final String body;
  final ArticleStatus status;
  final DateTime createdAt;
  final bool pinned;

  Article copyWith({ArticleStatus? status}) => Article(
    id: id,
    htxCode: htxCode,
    title: title,
    body: body,
    status: status ?? this.status,
    createdAt: createdAt,
    pinned: pinned,
  );
}
