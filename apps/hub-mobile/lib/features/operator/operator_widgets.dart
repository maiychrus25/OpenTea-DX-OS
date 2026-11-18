// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';

import '../../core/theme/staff_theme.dart';
import '../../data/models/staff.dart';

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

/// A shortcut tile: an icon on a soft square, a label, and a count badge when something waits.
class QuickAction extends StatelessWidget {
  const QuickAction({super.key, required this.icon, required this.label, required this.onTap, this.count = 0});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final int count;

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(18),
      side: const BorderSide(color: StaffColors.border),
    ),
    child: InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
        child: Column(
          children: [
            Badge(
              isLabelVisible: count > 0,
              label: Text('$count'),
              backgroundColor: StaffColors.bad,
              child: Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(color: StaffColors.okSoft, borderRadius: BorderRadius.circular(13)),
                child: Icon(icon, size: 22, color: StaffColors.primary),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              label,
              textAlign: TextAlign.center,
              maxLines: 2,
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, height: 1.25),
            ),
          ],
        ),
      ),
    ),
  );
}

const shareColors = [Color(0xFF176C4B), Color(0xFF7BAE3F), Color(0xFFD6A23A), Color(0xFF3E7C9B), Color(0xFFB0BEB5)];

/// A ring chart of shares with the total in the middle; the legend is drawn by the caller with [shareColors].
class ShareDonut extends StatelessWidget {
  const ShareDonut({super.key, required this.values, required this.center, this.caption, this.size = 132});
  final List<num> values;
  final String center;
  final String? caption;
  final double size;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: size,
    height: size,
    child: CustomPaint(
      painter: _DonutPainter(values),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              center,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: StaffColors.ink),
            ),
            if (caption != null) Text(caption!, style: const TextStyle(fontSize: 11.5, color: StaffColors.muted)),
          ],
        ),
      ),
    ),
  );
}

class _DonutPainter extends CustomPainter {
  _DonutPainter(this.values);
  final List<num> values;

  @override
  void paint(Canvas canvas, Size size) {
    final total = values.fold<num>(0, (s, v) => s + v);
    final stroke = size.width * 0.14;
    final rect = Rect.fromLTWH(stroke / 2, stroke / 2, size.width - stroke, size.height - stroke);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke;
    if (total <= 0) {
      canvas.drawArc(rect, 0, 6.2832, false, paint..color = StaffColors.neutralSoft);
      return;
    }
    var start = -1.5708;
    for (var i = 0; i < values.length; i++) {
      final sweep = values[i] / total * 6.2832;
      if (sweep <= 0) continue;
      // A hair of gap between the segments.
      canvas.drawArc(
        rect,
        start,
        (sweep - 0.03).clamp(0.01, 6.3),
        false,
        paint..color = shareColors[i % shareColors.length],
      );
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(_DonutPainter old) => old.values != values;
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

/// A title above a horizontal list, with an optional "Xem tất cả".
class StripTitle extends StatelessWidget {
  const StripTitle(this.text, {super.key, this.onSeeAll});
  final String text;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: 2, bottom: 8),
    child: Row(
      children: [
        Expanded(
          child: Text(
            text,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: StaffColors.ink),
          ),
        ),
        if (onSeeAll != null) TextButton(onPressed: onSeeAll, child: const Text('Xem tất cả ›')),
      ],
    ),
  );
}

/// The ring of revenue shares with a legend: each cooperative's mark, name, amount and share.
class RevenueShare extends StatelessWidget {
  const RevenueShare({super.key, required this.linked, required this.total});
  final List<LinkedHtx> linked;
  final int total;

  @override
  Widget build(BuildContext context) {
    final shown = linked.take(4).toList();
    final rest = linked.skip(4).fold<int>(0, (s, h) => s + h.revenueMillion);
    final values = [for (final h in shown) h.revenueMillion, if (rest > 0) rest];
    Widget legend(Color color, String name, int value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13)),
          ),
          const SizedBox(width: 6),
          Text(
            total == 0 ? '0%' : '${(value * 100 / total).round()}%',
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
    return LayoutBuilder(
      builder: (context, c) {
        final donut = ShareDonut(values: values, center: '$total tr', caption: 'tháng này', size: 124);
        final list = Column(
          children: [
            for (var i = 0; i < shown.length; i++)
              legend(shareColors[i], shown[i].name.replaceFirst('HTX Chè ', ''), shown[i].revenueMillion),
            if (rest > 0) legend(shareColors[shown.length % shareColors.length], 'HTX khác', rest),
          ],
        );
        if (c.maxWidth < 300) {
          return Column(children: [donut, const SizedBox(height: 12), list]);
        }
        return Row(
          children: [
            donut,
            const SizedBox(width: 16),
            Expanded(child: list),
          ],
        );
      },
    );
  }
}
