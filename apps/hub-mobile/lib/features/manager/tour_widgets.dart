// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';

import '../../core/format/formatting.dart';
import '../../core/money/money.dart';
import '../../core/theme/staff_theme.dart';
import '../../data/models/catalog.dart';
import '../guide/guide_widgets.dart';

/// Equal-width actions on wide screens; full-width touch targets on phones.
class TourActionRow extends StatelessWidget {
  const TourActionRow({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final scale = MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 2.0);
      if (constraints.maxWidth < children.length * 240 * scale) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 0; i < children.length; i++) ...[if (i > 0) const SizedBox(height: 8), children[i]],
          ],
        );
      }
      return Row(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            Expanded(child: children[i]),
          ],
        ],
      );
    },
  );
}

/// The manager's existing tour data, presented in the guide pages' visual language.
class ManagerTourCard extends StatelessWidget {
  const ManagerTourCard({
    super.key,
    required this.tour,
    required this.departures,
    required this.guides,
    required this.actions,
  });
  final Tour tour;
  final List<Departure> departures;
  final List<GuideStaff> guides;
  final Widget actions;

  @override
  Widget build(BuildContext context) => Card(
    clipBehavior: Clip.antiAlias,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GuideCover(tour: tour, height: 160),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 6,
                runSpacing: 8,
                children: [
                  GuideChip('${formatVnd(tour.adultPrice)} / người lớn', icon: Icons.payments_outlined),
                  GuideChip('${tour.maxGuests} chỗ', icon: Icons.event_seat_outlined),
                  GuideChip('${guides.length} nhân viên', icon: Icons.badge_outlined),
                  GuideChip('${departures.length} lượt khởi hành', icon: Icons.event_outlined),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Trẻ em: ${formatVnd(tour.childPrice)}',
                style: const TextStyle(color: StaffColors.muted, fontSize: 13),
              ),
              const SizedBox(height: 16),
              const Text('Lịch khởi hành', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              if (departures.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text('Chưa có lịch khởi hành', style: TextStyle(color: StaffColors.muted)),
                ),
              for (final departure in departures)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Row(
                    children: [
                      GuideDateBadge(departure.date),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(formatDate(departure.date), style: const TextStyle(fontWeight: FontWeight.w600)),
                            const SizedBox(height: 4),
                            Text(
                              'còn ${departure.seatsLeft}/${departure.seatsTotal} chỗ',
                              style: const TextStyle(color: StaffColors.muted, fontSize: 13),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 16),
              const Text('Nhân viên dẫn tour', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              if (guides.isEmpty)
                const Text('Chưa có nhân viên dẫn tour', style: TextStyle(color: StaffColors.muted, fontSize: 13))
              else
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final guide in guides)
                      Container(
                        padding: const EdgeInsets.fromLTRB(4, 4, 12, 4),
                        decoration: BoxDecoration(
                          color: StaffColors.secondary,
                          borderRadius: BorderRadius.circular(24),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            CircleAvatar(
                              radius: 16,
                              backgroundColor: StaffColors.card,
                              child: Text(
                                guide.name.trim().isEmpty ? '?' : guide.name.trim().characters.first.toUpperCase(),
                                style: const TextStyle(
                                  color: StaffColors.primary,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Flexible(
                              child: Text(guide.name, style: const TextStyle(color: StaffColors.ink, fontSize: 13)),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              const SizedBox(height: 16),
              const Divider(),
              const SizedBox(height: 12),
              actions,
            ],
          ),
        ),
      ],
    ),
  );
}

/// White rounded card with a thin border; tappable when [onTap] is set.
class OpCard extends StatelessWidget {
  const OpCard({super.key, required this.child, this.onTap, this.padding = const EdgeInsets.all(14)});
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white,
    clipBehavior: Clip.antiAlias,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(20),
      side: const BorderSide(color: StaffColors.border),
    ),
    child: InkWell(
      onTap: onTap,
      child: Padding(padding: padding, child: child),
    ),
  );
}

const _months = ['Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12'];
const _days = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/// A small calendar leaf: weekday, day number, month. [muted] greys it (past or cancelled).
class DateBlock extends StatelessWidget {
  const DateBlock(this.date, {super.key, this.muted = false});
  final DateTime date;
  final bool muted;

  @override
  Widget build(BuildContext context) => Container(
    width: 54,
    padding: const EdgeInsets.symmetric(vertical: 8),
    decoration: BoxDecoration(
      color: muted ? StaffColors.neutralSoft : StaffColors.okSoft,
      borderRadius: BorderRadius.circular(14),
    ),
    child: Column(
      children: [
        Text(
          _days[date.weekday - 1],
          style: TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w600,
            color: muted ? StaffColors.muted : StaffColors.primary,
          ),
        ),
        Text(
          '${date.day}',
          style: TextStyle(
            fontSize: 21,
            fontWeight: FontWeight.w800,
            height: 1.15,
            color: muted ? StaffColors.muted : StaffColors.ink,
          ),
        ),
        Text(_months[date.month - 1], style: const TextStyle(fontSize: 11.5, color: StaffColors.muted)),
      ],
    ),
  );
}

/// A label and a value on one line, for the detail blocks.
class OpRow extends StatelessWidget {
  const OpRow(this.label, this.value, {super.key, this.strong = false});
  final String label;
  final String value;
  final bool strong;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 104,
          child: Text(label, style: const TextStyle(fontSize: 13.5, color: StaffColors.muted)),
        ),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: TextStyle(
              fontSize: strong ? 17 : 14,
              fontWeight: strong ? FontWeight.w800 : FontWeight.w600,
              color: strong ? StaffColors.primary : StaffColors.ink,
            ),
          ),
        ),
      ],
    ),
  );
}

/// A block title with an icon, inside an [OpCard].
class OpBlockTitle extends StatelessWidget {
  const OpBlockTitle(this.icon, this.text, {super.key});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Row(
      children: [
        Icon(icon, size: 19, color: StaffColors.primary),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: StaffColors.ink),
          ),
        ),
      ],
    ),
  );
}

/// A horizontal progress of steps: done steps are filled, the current one is outlined.
class StepTrack extends StatelessWidget {
  const StepTrack({super.key, required this.steps, required this.done});
  final List<String> steps;

  /// How many steps are done.
  final int done;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      for (var i = 0; i < steps.length; i++)
        Expanded(
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Container(
                      height: 3,
                      color: i == 0 ? Colors.transparent : (i <= done ? StaffColors.primary : StaffColors.border),
                    ),
                  ),
                  Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: i < done ? StaffColors.primary : Colors.white,
                      border: Border.all(color: i <= done ? StaffColors.primary : StaffColors.border, width: 2),
                    ),
                    child: i < done
                        ? const Icon(Icons.check, size: 15, color: Colors.white)
                        : Center(
                            child: Text(
                              '${i + 1}',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: i == done ? StaffColors.primary : StaffColors.faint,
                              ),
                            ),
                          ),
                  ),
                  Expanded(
                    child: Container(
                      height: 3,
                      color: i == steps.length - 1
                          ? Colors.transparent
                          : (i < done ? StaffColors.primary : StaffColors.border),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                steps[i],
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 11.5,
                  height: 1.25,
                  fontWeight: i == done ? FontWeight.w700 : FontWeight.w500,
                  color: i <= done ? StaffColors.ink : StaffColors.faint,
                ),
              ),
            ],
          ),
        ),
    ],
  );
}
