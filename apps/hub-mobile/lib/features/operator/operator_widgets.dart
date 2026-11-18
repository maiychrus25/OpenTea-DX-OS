// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';

import '../../core/theme/staff_theme.dart';

// Building blocks of the tour company pages: a white card, a date block, a cooperative mark and a figure tile.

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

const _marks = [Color(0xFF176C4B), Color(0xFF2F7A1D), Color(0xFF3E6B5A), Color(0xFF5B7F2A), Color(0xFF1D5A40)];

/// A cooperative's mark: its initials on a green square that stays the same for the same [code].
class HtxMark extends StatelessWidget {
  const HtxMark({super.key, required this.code, required this.name, this.size = 46});
  final String code;
  final String name;
  final double size;

  String get _initials {
    final words = name.replaceFirst(RegExp(r'^HTX\s+(Chè\s+)?'), '').split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
    final picked = words.take(2).map((w) => w.characters.first.toUpperCase()).join();
    return picked.isEmpty ? 'HTX' : picked;
  }

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    alignment: Alignment.center,
    decoration: BoxDecoration(
      color: _marks[code.codeUnits.fold<int>(0, (s, c) => s + c) % _marks.length],
      borderRadius: BorderRadius.circular(size * 0.3),
    ),
    child: Text(
      _initials,
      style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: size * 0.36),
    ),
  );
}

/// One figure of a report: an icon, the value, the label and where it comes from.
class FigureTile extends StatelessWidget {
  const FigureTile({super.key, required this.icon, required this.value, required this.label, this.source});
  final IconData icon;
  final String value;
  final String label;
  final String? source;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: StaffColors.border),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(color: StaffColors.okSoft, borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, size: 19, color: StaffColors.primary),
        ),
        const SizedBox(height: 10),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: StaffColors.ink),
        ),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(fontSize: 13, height: 1.3, color: StaffColors.ink)),
        if (source != null) ...[
          const SizedBox(height: 2),
          Text('Nguồn: $source', style: const TextStyle(fontSize: 11.5, color: StaffColors.faint)),
        ],
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
