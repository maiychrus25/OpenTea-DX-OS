// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';

import '../../core/theme/staff_theme.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart' show TeaPhoto, teaPhotoFor;

/// One departure of a tour assigned to the guide, with the numbers the cards show.
class GuideTrip {
  const GuideTrip({required this.tour, required this.departure, required this.guests, required this.htxName});
  final Tour tour;
  final Departure departure;
  final int guests;
  final String htxName;

  DateTime get date => DateUtils.dateOnly(departure.date);
}

/// "Hôm nay", "Ngày mai", "Còn 3 ngày" or "Đã qua", counted from [today].
String guideCountdown(DateTime date, DateTime today) {
  final days = DateUtils.dateOnly(date).difference(today).inDays;
  if (days < 0) return 'Đã qua';
  if (days == 0) return 'Hôm nay';
  if (days == 1) return 'Ngày mai';
  return 'Còn $days ngày';
}

const _months = ['Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12'];

/// Day number over month, like a calendar leaf.
class GuideDateBadge extends StatelessWidget {
  const GuideDateBadge(this.date, {super.key, this.strong = false});
  final DateTime date;
  final bool strong;

  @override
  Widget build(BuildContext context) => Container(
    width: 52,
    padding: const EdgeInsets.symmetric(vertical: 8),
    decoration: BoxDecoration(
      color: strong ? StaffColors.primary : StaffColors.secondary,
      borderRadius: BorderRadius.circular(14),
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '${date.day}',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            height: 1.1,
            color: strong ? Colors.white : StaffColors.primary,
          ),
        ),
        Text(
          _months[date.month - 1],
          style: TextStyle(fontSize: 12, color: strong ? Colors.white70 : StaffColors.muted),
        ),
      ],
    ),
  );
}

class GuideChip extends StatelessWidget {
  const GuideChip(this.label, {super.key, this.icon, this.highlight = false});
  final String label;
  final IconData? icon;
  final bool highlight;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: highlight ? StaffColors.lime : StaffColors.neutralSoft,
      borderRadius: BorderRadius.circular(99),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[Icon(icon, size: 14, color: StaffColors.ink), const SizedBox(width: 4)],
        Flexible(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: StaffColors.ink),
          ),
        ),
      ],
    ),
  );
}

/// Tour photo with the name over it; [footer] sits under the name.
class GuideCover extends StatelessWidget {
  const GuideCover({super.key, required this.tour, required this.height, this.top, this.footer});
  final Tour tour;
  final double height;
  final Widget? top;
  final Widget? footer;

  @override
  Widget build(BuildContext context) => TeaPhoto(
    asset: teaPhotoFor(tour.gradientSeed),
    // Larger text needs a taller photo, or the name and the line under it run out of room.
    height: height * MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 1.8),
    radius: 22,
    shade: true,
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ?top,
          const Spacer(),
          Text(
            tour.name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800, color: Colors.white, height: 1.2),
          ),
          if (footer != null) ...[const SizedBox(height: 6), footer!],
        ],
      ),
    ),
  );
}

/// A departure as a card: date badge, name, guests, who assigned it.
class GuideTripCard extends StatelessWidget {
  const GuideTripCard({super.key, required this.trip, required this.today, required this.onTap});
  final GuideTrip trip;
  final DateTime today;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final past = trip.date.isBefore(today);
    final left = guideCountdown(trip.date, today);
    return Material(
      color: StaffColors.card,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Ink(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: StaffColors.border),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              GuideDateBadge(trip.date, strong: !past && left == 'Hôm nay'),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      trip.tour.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: StaffColors.ink),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Do ${trip.htxName} giao',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13, color: StaffColors.muted),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        GuideChip('${trip.guests} khách', icon: Icons.groups_outlined),
                        GuideChip(left, highlight: !past && left == 'Hôm nay'),
                      ],
                    ),
                  ],
                ),
              ),
              const Padding(
                padding: EdgeInsets.only(top: 14),
                child: Icon(Icons.chevron_right, color: StaffColors.faint),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class GuideStat extends StatelessWidget {
  const GuideStat({super.key, required this.value, required this.label, required this.icon});
  final String value;
  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: StaffColors.card,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: StaffColors.border),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: StaffColors.primary),
        const SizedBox(height: 8),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            value,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: StaffColors.ink),
          ),
        ),
        Text(label, style: const TextStyle(fontSize: 12.5, color: StaffColors.muted)),
      ],
    ),
  );
}
