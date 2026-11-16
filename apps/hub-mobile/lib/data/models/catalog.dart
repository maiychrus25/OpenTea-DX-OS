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
  });
  final String code;
  final String name;
  final String province;
  final String bankBin;
  final String bankAccount;
  final String accountHolder;
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
