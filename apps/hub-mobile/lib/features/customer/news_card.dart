// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';

import '../../core/format/formatting.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart';

/// Minutes to read an article: about 180 words a minute, at least one.
int readMinutes(String body) {
  final words = body.trim().isEmpty ? 0 : body.trim().split(RegExp(r'\s+')).length;
  final m = (words / 180).ceil();
  return m < 1 ? 1 : m;
}

/// A news card: a picture, the cooperative, the title, a short extract and the date with the reading time.
/// [large] stacks the picture over the text and shows the whole body (the news page); the small one sits the picture
/// at the left and cuts the extract (the home page).
class NewsCard extends StatelessWidget {
  const NewsCard({super.key, required this.article, required this.htxName, this.large = false, this.onTap});
  final Article article;
  final String htxName;
  final bool large;
  final VoidCallback? onTap;

  String get _footer => '${formatDate(article.createdAt)}  ·  ${readMinutes(article.body)} phút đọc';

  Widget _photo(double? height, double radius) =>
      TeaPhoto(asset: teaPhotoFor(article.id.hashCode), height: height, radius: radius);

  Widget _chips() => Wrap(
    spacing: 6,
    runSpacing: 6,
    children: [
      if (article.pinned) const _Chip('Ghim', color: Color(0xFFFDE8D2), textColor: AppColors.amber),
      if (htxName.isNotEmpty) _Chip(htxName),
    ],
  );

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(24),
      side: const BorderSide(color: AppColors.border),
    ),
    clipBehavior: Clip.antiAlias,
    child: InkWell(onTap: onTap, child: large ? _large() : _small()),
  );

  Widget _small() => Padding(
    padding: const EdgeInsets.all(12),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(width: 104, child: _photo(104, 16)),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _chips(),
              const SizedBox(height: 8),
              Text(
                article.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, height: 1.3, color: AppColors.ink),
              ),
              const SizedBox(height: 6),
              Text(_footer, style: const TextStyle(fontSize: 12.5, color: AppColors.faint)),
            ],
          ),
        ),
      ],
    ),
  );

  Widget _large() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _photo(170, 0),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _chips(),
            const SizedBox(height: 10),
            Text(
              article.title,
              style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700, height: 1.3, color: AppColors.ink),
            ),
            const SizedBox(height: 8),
            Text(article.body, style: const TextStyle(fontSize: 15, height: 1.55, color: AppColors.muted)),
            const SizedBox(height: 10),
            Text(_footer, style: const TextStyle(fontSize: 12.5, color: AppColors.faint)),
          ],
        ),
      ),
    ],
  );
}

class _Chip extends StatelessWidget {
  const _Chip(this.text, {this.color = const Color(0xFFD8E8D1), this.textColor = AppColors.ink});
  final String text;
  final Color color;
  final Color textColor;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(999)),
    child: Text(
      text,
      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: textColor),
    ),
  );
}
