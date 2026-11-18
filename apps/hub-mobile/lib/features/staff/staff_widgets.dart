// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';

import '../../core/theme/staff_theme.dart';

/// Chip tones of the web's status pills: ok (green), warn (amber), bad (red), neutral (grey).
enum Tone { ok, warn, bad, neutral }

Color toneColor(Tone t) => switch (t) {
  Tone.ok => StaffColors.ok,
  Tone.warn => StaffColors.warn,
  Tone.bad => StaffColors.bad,
  Tone.neutral => StaffColors.neutral,
};

Color toneSoft(Tone t) => switch (t) {
  Tone.ok => StaffColors.okSoft,
  Tone.warn => StaffColors.warnSoft,
  Tone.bad => StaffColors.badSoft,
  Tone.neutral => StaffColors.neutralSoft,
};

/// A round soft-green badge holding an icon: the leading mark of a row (an activity, a parcel).
class IconBadge extends StatelessWidget {
  const IconBadge(this.icon, {super.key, this.tone = Tone.ok});
  final IconData icon;
  final Tone tone;

  @override
  Widget build(BuildContext context) => Container(
    width: 42,
    height: 42,
    decoration: BoxDecoration(color: toneSoft(tone), shape: BoxShape.circle),
    child: Icon(icon, size: 22, color: toneColor(tone)),
  );
}

class Pill extends StatelessWidget {
  const Pill(this.label, {super.key, this.tone = Tone.neutral});
  final String label;
  final Tone tone;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(color: toneSoft(tone), borderRadius: BorderRadius.circular(999)),
    child: Text(
      label,
      style: TextStyle(color: toneColor(tone), fontSize: 12, fontWeight: FontWeight.w700),
    ),
  );
}

/// Page heading like the web's `h1` + subtitle, with an optional green eyebrow pill above.
class PageHead extends StatelessWidget {
  const PageHead(this.title, {super.key, this.subtitle, this.eyebrow, this.action, this.compact = false});
  final bool compact;
  final String title;
  final String? subtitle;
  final Widget? eyebrow;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
    padding: compact ? const EdgeInsets.only(bottom: 16) : const EdgeInsets.fromLTRB(2, 4, 2, 14),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ?(eyebrow == null ? null : Padding(padding: const EdgeInsets.only(bottom: 6), child: eyebrow)),
              Text(
                title,
                style: TextStyle(
                  fontSize: compact ? 22 : 24,
                  fontWeight: compact ? FontWeight.w600 : FontWeight.w800,
                  color: StaffColors.ink,
                  height: 1.3,
                ),
              ),
              if (subtitle != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    subtitle!,
                    style: TextStyle(fontSize: compact ? 13 : 14, color: StaffColors.muted, height: 1.4),
                  ),
                ),
            ],
          ),
        ),
        ?action,
      ],
    ),
  );
}

/// White rounded block with a title row (web: dashboard section).
class SectionCard extends StatelessWidget {
  const SectionCard({
    super.key,
    required this.title,
    required this.child,
    this.onSeeAll,
    this.seeAllLabel = 'Xem tất cả',
    this.padded = true,
    this.divided = false,
  });

  /// Quiet header and divider for overview and account sections.
  final bool divided;
  final String title;
  final Widget child;
  final VoidCallback? onSeeAll;
  final String seeAllLabel;
  final bool padded;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(staffRadius),
      border: Border.all(color: StaffColors.border),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: divided
              ? EdgeInsets.fromLTRB(16, onSeeAll == null ? 16 : 4, 8, onSeeAll == null ? 16 : 4)
              : const EdgeInsets.fromLTRB(16, 14, 8, 8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(fontSize: 16, fontWeight: divided ? FontWeight.w600 : FontWeight.w800, height: 1.35),
                ),
              ),
              if (onSeeAll != null)
                TextButton(
                  onPressed: onSeeAll,
                  style: TextButton.styleFrom(
                    minimumSize: Size(44, divided ? 44 : 36),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                  ),
                  child: Text('$seeAllLabel ›', style: const TextStyle(fontSize: 13)),
                ),
            ],
          ),
        ),
        if (divided) const Divider(height: 1, thickness: 1),
        Padding(
          padding: padded
              ? (divided ? const EdgeInsets.all(16) : const EdgeInsets.fromLTRB(16, 0, 16, 14))
              : EdgeInsets.zero,
          child: child,
        ),
      ],
    ),
  );
}

/// Web MetricCard: tinted icon, label, big value.
class MetricCard extends StatelessWidget {
  const MetricCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.tone = Tone.ok,
    this.onTap,
  });
  final String label;
  final String value;
  final IconData icon;
  final Tone tone;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(staffRadius),
      side: const BorderSide(color: StaffColors.border),
    ),
    child: InkWell(
      borderRadius: BorderRadius.circular(staffRadius),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(7),
              decoration: BoxDecoration(color: toneSoft(tone), borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, size: 20, color: toneColor(tone)),
            ),
            const SizedBox(height: 10),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(value, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
            ),
            const SizedBox(height: 2),
            Text(label, style: const TextStyle(fontSize: 12.5, color: StaffColors.muted)),
          ],
        ),
      ),
    ),
  );
}

class MetricGrid extends StatelessWidget {
  const MetricGrid(this.cards, {super.key, this.compact = false});
  final List<MetricCard> cards;
  final bool compact;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, c) {
      if (compact) {
        return Material(
          color: StaffColors.card,
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(staffRadius),
            side: const BorderSide(color: StaffColors.border),
          ),
          child: Column(
            children: [
              for (var i = 0; i < cards.length; i += 2) ...[
                if (i > 0) const Divider(height: 1, thickness: 1),
                IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(child: _MetricCell(cards[i], key: cards[i].key)),
                      const VerticalDivider(width: 1, thickness: 1),
                      Expanded(
                        child: i + 1 < cards.length
                            ? _MetricCell(cards[i + 1], key: cards[i + 1].key)
                            : const SizedBox(),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        );
      }
      final w = (c.maxWidth - 12) / 2;
      return Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [for (final m in cards) SizedBox(width: w, child: m)],
      );
    },
  );
}

class _MetricCell extends StatelessWidget {
  const _MetricCell(this.metric, {super.key});
  final MetricCard metric;

  @override
  Widget build(BuildContext context) => Semantics(
    button: metric.onTap != null,
    child: InkWell(
      onTap: metric.onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              metric.value,
              style: const TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w600,
                height: 1.2,
                color: StaffColors.ink,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
            const SizedBox(height: 4),
            ConstrainedBox(
              constraints: BoxConstraints(minHeight: MediaQuery.textScalerOf(context).scale(13) * 2.8),
              child: Text(metric.label, style: const TextStyle(fontSize: 13, height: 1.4, color: StaffColors.muted)),
            ),
          ],
        ),
      ),
    ),
  );
}

/// Three or four headline figures, with a vertical fallback for enlarged text.
class SummaryStrip extends StatelessWidget {
  const SummaryStrip(this.figures, {super.key});
  final List<MetricCard> figures;

  @override
  Widget build(BuildContext context) => Material(
    color: StaffColors.card,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(staffRadius),
      side: const BorderSide(color: StaffColors.border),
    ),
    clipBehavior: Clip.antiAlias,
    child: LayoutBuilder(
      builder: (context, constraints) {
        final stacked = constraints.maxWidth / figures.length < MediaQuery.textScalerOf(context).scale(88);
        Widget cell(MetricCard figure) => InkWell(
          key: figure.key,
          onTap: figure.onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  figure.value,
                  style: const TextStyle(
                    fontSize: 23,
                    fontWeight: FontWeight.w600,
                    height: 1.2,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(height: 6),
                Text(figure.label, style: const TextStyle(fontSize: 12, height: 1.4, color: StaffColors.muted)),
              ],
            ),
          ),
        );
        if (stacked) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < figures.length; i++) ...[if (i > 0) const Divider(height: 1), cell(figures[i])],
            ],
          );
        }
        return IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < figures.length; i++) ...[
                if (i > 0) const VerticalDivider(width: 1),
                Expanded(child: cell(figures[i])),
              ],
            ],
          ),
        );
      },
    ),
  );
}

/// "Cần xử lý hôm nay": a compact header with the total, and the list only after the person opens it.
/// The banner at the top of a dashboard: today's date, one headline that matters now, and a few facts as chips.
class DayBanner extends StatelessWidget {
  const DayBanner({super.key, required this.day, required this.headline, this.caption, this.chips = const []});
  final String day;
  final String headline;
  final String? caption;
  final List<(IconData, String)> chips;

  @override
  Widget build(BuildContext context) => Container(
    key: const Key('day-banner'),
    width: double.infinity,
    clipBehavior: Clip.antiAlias,
    decoration: BoxDecoration(
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [StaffColors.sidebar, Color(0xFF1D5A40)],
      ),
      borderRadius: BorderRadius.circular(22),
    ),
    child: Stack(
      children: [
        Positioned(
          right: -18,
          bottom: -22,
          child: Icon(Icons.eco, size: 130, color: Colors.white.withValues(alpha: 0.07)),
        ),
        Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                day,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: StaffColors.lime),
              ),
              const SizedBox(height: 6),
              Text(
                headline,
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white, height: 1.25),
              ),
              if (caption != null) ...[
                const SizedBox(height: 4),
                Text(caption!, style: const TextStyle(fontSize: 14, color: Colors.white70, height: 1.4)),
              ],
              if (chips.isNotEmpty) ...[
                const SizedBox(height: 14),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final c in chips)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(c.$1, size: 15, color: StaffColors.lime),
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text(c.$2, style: const TextStyle(fontSize: 12.5, color: Colors.white)),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ],
    ),
  );
}

/// Counts are attention signals, not status colours. Zero rows stay out of the way. The main action stays in view.
class AttentionCard extends StatefulWidget {
  const AttentionCard({super.key, required this.items, this.action, this.title = 'Cần xử lý hôm nay'});
  final List<({String label, int count, VoidCallback onTap})> items;
  final Widget? action;
  final String title;

  @override
  State<AttentionCard> createState() => _AttentionCardState();
}

class _AttentionCardState extends State<AttentionCard> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final active = widget.items.where((item) => item.count > 0).toList();
    final total = active.fold<int>(0, (n, item) => n + item.count);
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(staffRadius),
        border: Border.all(color: StaffColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            key: const Key('attention-toggle'),
            borderRadius: BorderRadius.circular(staffRadius),
            onTap: () => setState(() => _open = !_open),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      widget.title,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: StaffColors.ink),
                    ),
                  ),
                  if (total > 0) Pill('$total việc', tone: Tone.warn) else const Pill('Xong hết', tone: Tone.ok),
                  const SizedBox(width: 4),
                  Icon(_open ? Icons.expand_less : Icons.expand_more, color: StaffColors.muted),
                ],
              ),
            ),
          ),
          if (_open) ...[
            const Divider(height: 1),
            if (active.isEmpty)
              const StaffListRow(title: 'Không có việc cần xử lý', subtitle: 'Mọi việc đã được cập nhật.')
            else
              for (var i = 0; i < active.length; i++) ...[
                if (i > 0) const Divider(height: 1, indent: 16, endIndent: 16),
                Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: active[i].onTap,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      child: Row(
                        children: [
                          Expanded(child: Text(active[i].label, style: const TextStyle(fontSize: 14, height: 1.4))),
                          const SizedBox(width: 12),
                          Pill('${active[i].count}'),
                          const SizedBox(width: 8),
                          const Icon(Icons.chevron_right, size: 18, color: StaffColors.muted),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
          ],
          if (widget.action != null) Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), child: widget.action),
        ],
      ),
    );
  }
}

/// Direct-labelled proportions; the denominator is always visible, never a made-up target.
class ProportionLine extends StatelessWidget {
  const ProportionLine({super.key, required this.label, required this.detail, required this.value});
  final String label;
  final String detail;
  final double value;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: '$label: $detail',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 13, color: StaffColors.muted)),
        const SizedBox(height: 4),
        Text(
          detail,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            fontFeatures: [FontFeature.tabularFigures()],
          ),
        ),
        const SizedBox(height: 8),
        LinearProgressIndicator(
          value: value.clamp(0, 1),
          minHeight: 4,
          borderRadius: BorderRadius.circular(4),
          color: StaffColors.primary,
          backgroundColor: StaffColors.secondary,
          semanticsLabel: '$label: $detail',
        ),
      ],
    ),
  );
}

/// Today plus six calendar days. Cells wrap at large text sizes rather than clip.
class HarvestWeekStrip extends StatelessWidget {
  const HarvestWeekStrip({super.key, required this.now, required this.dates});
  final DateTime now;
  final List<DateTime> dates;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final large = MediaQuery.textScalerOf(context).scale(12) > 16;
      final columns = large && constraints.maxWidth < 400 ? 4 : 7;
      return Wrap(
        spacing: 4,
        runSpacing: 8,
        children: [
          for (var i = 0; i < 7; i++)
            SizedBox(
              width: (constraints.maxWidth - (columns - 1) * 4) / columns,
              child: _day(DateTime(now.year, now.month, now.day + i), i == 0),
            ),
        ],
      );
    },
  );

  Widget _day(DateTime date, bool today) {
    final count = dates.where((d) => d.year == date.year && d.month == date.month && d.day == date.day).length;
    return Semantics(
      label: '${today ? 'Hôm nay, ' : ''}${date.day}/${date.month}, $count thửa thu hái',
      child: ExcludeSemantics(
        child: Tooltip(
          message: '${date.day}/${date.month}: $count thửa thu hái',
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(
              color: today ? StaffColors.secondary : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              children: [
                Text(
                  date.weekday == 7 ? 'CN' : 'T${date.weekday + 1}',
                  style: const TextStyle(fontSize: 11, color: StaffColors.muted),
                ),
                const SizedBox(height: 4),
                Text(
                  '${date.day}',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: today ? FontWeight.w700 : FontWeight.w500,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(height: 6),
                Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: count > 0 ? StaffColors.primary : Colors.transparent,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A borderless row inside a section. Long text wraps, never competes with status.
class StaffListRow extends StatelessWidget {
  const StaffListRow({super.key, required this.title, this.subtitle, this.trailing, this.onTap});
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.transparent,
    child: InkWell(
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 64, minWidth: double.infinity),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final text = Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, height: 1.4)),
                  if (subtitle != null) ...[
                    const SizedBox(height: 4),
                    Text(subtitle!, style: const TextStyle(fontSize: 13, color: StaffColors.muted, height: 1.4)),
                  ],
                ],
              );
              final end =
                  trailing ??
                  (onTap == null ? null : const Icon(Icons.chevron_right, size: 20, color: StaffColors.muted));
              if (end == null) return text;
              if (constraints.maxWidth < 280 || MediaQuery.textScalerOf(context).scale(15) > 20) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [text, const SizedBox(height: 8), end],
                );
              }
              return Row(
                children: [
                  Expanded(child: text),
                  const SizedBox(width: 12),
                  ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: constraints.maxWidth * .45),
                    child: end,
                  ),
                ],
              );
            },
          ),
        ),
      ),
    ),
  );
}

/// One row of a list card: title, optional subtitle lines, trailing widget; tappable.
class RowCard extends StatelessWidget {
  const RowCard({
    super.key,
    required this.title,
    this.subtitle,
    this.meta,
    this.trailing,
    this.leading,
    this.onTap,
    this.footer,
  });
  final String title;
  final String? subtitle;
  final String? meta;
  final Widget? trailing;
  final Widget? leading;
  final VoidCallback? onTap;
  final Widget? footer;

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(staffRadius),
      side: const BorderSide(color: StaffColors.border),
    ),
    child: InkWell(
      borderRadius: BorderRadius.circular(staffRadius),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (leading != null) ...[leading!, const SizedBox(width: 12)],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, height: 1.25)),
                      if (subtitle != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 3),
                          child: Text(
                            subtitle!,
                            style: const TextStyle(fontSize: 13.5, color: StaffColors.muted, height: 1.35),
                          ),
                        ),
                      if (meta != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 3),
                          child: Text(meta!, style: const TextStyle(fontSize: 12.5, color: StaffColors.faint)),
                        ),
                    ],
                  ),
                ),
                if (trailing != null) ...[
                  const SizedBox(width: 8),
                  ConstrainedBox(constraints: const BoxConstraints(maxWidth: 150), child: trailing),
                ],
              ],
            ),
            if (footer != null) Padding(padding: const EdgeInsets.only(top: 10), child: footer),
          ],
        ),
      ),
    ),
  );
}

/// Vertical list with 10 px gaps.
class Stack10 extends StatelessWidget {
  const Stack10(this.children, {super.key});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      for (var i = 0; i < children.length; i++) ...[if (i > 0) const SizedBox(height: 10), children[i]],
    ],
  );
}

class StaffEmpty extends StatelessWidget {
  const StaffEmpty(this.message, {super.key, this.icon = Icons.inbox_outlined});
  final String message;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 24),
    child: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 44, color: StaffColors.faint),
          const SizedBox(height: 10),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: StaffColors.muted, fontSize: 15),
          ),
        ],
      ),
    ),
  );
}

/// Horizontal bars (operator dashboard): label, track, value.
class BarList extends StatelessWidget {
  const BarList(this.rows, {super.key, this.unit = ''});
  final List<(String, num)> rows;
  final String unit;

  @override
  Widget build(BuildContext context) {
    final max = rows.fold<num>(1, (m, r) => r.$2 > m ? r.$2 : m);
    return Column(
      children: [
        for (final (label, value) in rows)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Tooltip(
              message: '$label: $value$unit',
              child: Column(
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: Text(label, style: const TextStyle(fontSize: 14, height: 1.4))),
                      const SizedBox(width: 12),
                      Text(
                        '$value$unit',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  LinearProgressIndicator(
                    value: (value / max).toDouble().clamp(0, 1),
                    minHeight: 4,
                    borderRadius: BorderRadius.circular(4),
                    backgroundColor: StaffColors.secondary,
                    color: StaffColors.primary,
                    semanticsLabel: '$label: $value$unit',
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// Small outlined note, e.g. "Chỉ xem (cán bộ)".
class InfoNote extends StatelessWidget {
  const InfoNote(this.text, {super.key, this.tone = Tone.warn});
  final String text;
  final Tone tone;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
    decoration: BoxDecoration(
      color: toneSoft(tone),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: toneColor(tone).withValues(alpha: 0.3)),
    ),
    child: Text(text, style: TextStyle(fontSize: 13, color: toneColor(tone), height: 1.35)),
  );
}

/// Label and value on one row, for detail pages.
class DetailRow extends StatelessWidget {
  const DetailRow(this.label, this.value, {super.key});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 112,
          child: Text(label, style: const TextStyle(color: StaffColors.muted, fontSize: 14)),
        ),
        Expanded(
          child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5)),
        ),
      ],
    ),
  );
}

/// Segmented filter chips (web: filter tabs).
class FilterChips<T> extends StatelessWidget {
  const FilterChips({super.key, required this.options, required this.value, required this.onChanged});
  final List<(T, String)> options;
  final T value;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    scrollDirection: Axis.horizontal,
    child: Row(
      children: [
        for (final (v, label) in options)
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              label: Text(label),
              selected: v == value,
              onSelected: (_) => onChanged(v),
              showCheckmark: false,
              selectedColor: StaffColors.primary,
              backgroundColor: Colors.white,
              side: const BorderSide(color: StaffColors.border),
              shape: const StadiumBorder(),
              labelStyle: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 13,
                color: v == value ? Colors.white : StaffColors.ink,
              ),
            ),
          ),
      ],
    ),
  );
}
