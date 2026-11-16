// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/money/money.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart';

/// White rounded badge laid over a photo.
class PhotoBadge extends StatelessWidget {
  const PhotoBadge(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.92), borderRadius: BorderRadius.circular(999)),
    child: Text(
      text,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.ink),
    ),
  );
}

/// Soft tinted pill (tags such as "Hái chè").
class TagPill extends StatelessWidget {
  const TagPill(this.text, {super.key, this.amber = false});
  final String text;
  final bool amber;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
    decoration: BoxDecoration(
      // The highlighted pill ('Xem lịch trình ›') is a light green tile like the other soft surfaces, not orange.
      color: amber ? AppColors.tileLight : const Color(0xFFE9EFDF),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Text(
      text,
      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.teaDark),
    ),
  );
}

/// Full width tour card of the tour list.
class TourCard extends StatelessWidget {
  const TourCard({super.key, required this.tour, required this.htxName});
  final Tour tour;
  final String htxName;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      key: Key('tour-${tour.id}'),
      borderRadius: BorderRadius.circular(22),
      onTap: () => context.push('/shop/tours/${tour.id}'),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: AppColors.border),
          boxShadow: const [BoxShadow(color: Color(0x12143C2D), blurRadius: 14, offset: Offset(0, 4))],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TeaPhoto(
              asset: teaPhotoFor(tour.gradientSeed),
              height: 170,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [Flexible(child: PhotoBadge(htxName))],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(tour.name, style: serif(19, height: 1.25)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 14,
                    runSpacing: 4,
                    children: [
                      _meta(Icons.schedule, tour.durationLabel),
                      _meta(Icons.calendar_month_outlined, tour.bestMonths),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Wrap(spacing: 8, runSpacing: 8, children: [for (final t in tour.tags) TagPill(t)]),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: Text.rich(
                          TextSpan(
                            children: [
                              const TextSpan(
                                text: 'Từ ',
                                style: TextStyle(color: AppColors.faint, fontSize: 13),
                              ),
                              TextSpan(
                                text: formatVnd(tour.adultPrice),
                                style: const TextStyle(
                                  color: Color(0xFF8A3D06),
                                  fontSize: 19,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const TextSpan(
                                text: ' /người',
                                style: TextStyle(color: AppColors.faint, fontSize: 13),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const TagPill('Xem lịch trình ›', amber: true),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _meta(IconData icon, String text) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 15, color: AppColors.muted),
      const SizedBox(width: 4),
      Text(text, style: const TextStyle(fontSize: 13, color: AppColors.muted)),
    ],
  );
}

/// Short HTX name for badges and destination cards ("HTX Chè Tân Cương").
String shortHtxName(Htx h) => h.name.replaceAll(RegExp(r'\s*\(demo\)'), '');
