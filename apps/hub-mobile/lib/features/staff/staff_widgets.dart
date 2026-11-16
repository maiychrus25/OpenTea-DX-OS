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
  const PageHead(this.title, {super.key, this.subtitle, this.eyebrow, this.action});
  final String title;
  final String? subtitle;
  final Widget? eyebrow;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(2, 4, 2, 14),
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
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: StaffColors.ink, height: 1.2),
              ),
              if (subtitle != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(subtitle!, style: const TextStyle(fontSize: 14, color: StaffColors.muted, height: 1.4)),
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
  });
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
          padding: const EdgeInsets.fromLTRB(16, 14, 8, 8),
          child: Row(
            children: [
              Expanded(
                child: Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              ),
              if (onSeeAll != null)
                TextButton(
                  onPressed: onSeeAll,
                  style: TextButton.styleFrom(
                    minimumSize: const Size(0, 36),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                  ),
                  child: Text('$seeAllLabel ›', style: const TextStyle(fontSize: 13)),
                ),
            ],
          ),
        ),
        Padding(padding: padded ? const EdgeInsets.fromLTRB(16, 0, 16, 14) : EdgeInsets.zero, child: child),
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
  const MetricGrid(this.cards, {super.key});
  final List<MetricCard> cards;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, c) {
      final w = (c.maxWidth - 12) / 2;
      return Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [for (final m in cards) SizedBox(width: w, child: m)],
      );
    },
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
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(
              children: [
                SizedBox(
                  width: 96,
                  child: Text(
                    label,
                    style: const TextStyle(fontSize: 13),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(
                      value: (value / max).toDouble(),
                      minHeight: 10,
                      backgroundColor: StaffColors.secondary,
                      color: StaffColors.primary,
                    ),
                  ),
                ),
                SizedBox(
                  width: 48,
                  child: Text(
                    '$value$unit',
                    textAlign: TextAlign.right,
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                  ),
                ),
              ],
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
