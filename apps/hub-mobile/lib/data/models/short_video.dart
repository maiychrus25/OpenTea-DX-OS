// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import '../../core/role/role.dart';

/// Personal/household/tour demo channels use the subject; the shared HTX channel uses its code.
String shortChannel(Claims claims) => roleFromClaims(claims) == AppRole.manager ? claims.htxCode ?? '' : claims.subject;

bool canManageShorts(Claims claims) =>
    shortChannel(claims).isNotEmpty &&
    switch (roleFromClaims(claims)) {
      AppRole.guest => false,
      AppRole.manager => claims.canWriteHtx,
      _ => true,
    };

class ShortVideo {
  const ShortVideo({
    required this.id,
    required this.ownerId,
    required this.ownerName,
    required this.title,
    required this.source,
    this.poster,
    required this.views,
    required this.createdAt,
    required this.durationSeconds,
  });

  final String id;
  final String ownerId;
  final String ownerName;
  final String title;
  final String source;
  final String? poster;
  final int views;
  final DateTime createdAt;
  final int durationSeconds;

  ShortVideo withViews(int value) => ShortVideo(
    id: id,
    ownerId: ownerId,
    ownerName: ownerName,
    title: title,
    source: source,
    poster: poster,
    views: value,
    createdAt: createdAt,
    durationSeconds: durationSeconds,
  );
}

String shortViewsLabel(int views) {
  if (views < 1000) return '$views lượt xem';
  final divisor = views < 1000000 ? 1000 : 1000000;
  final unit = views < 1000000 ? 'N' : 'Tr';
  final value = (views / divisor).toStringAsFixed(1).replaceAll('.0', '').replaceAll('.', ',');
  return '$value $unit lượt xem';
}
