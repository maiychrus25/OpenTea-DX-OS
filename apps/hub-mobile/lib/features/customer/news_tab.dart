// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format/formatting.dart';
import '../../core/theme/app_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart';

class NewsTab extends StatelessWidget {
  const NewsTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<List<Article>>(
      load: repo.listPublishedArticles,
      builder: (context, articles, reload) => RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Về Xứ Chè',
              style: Theme.of(
                context,
              ).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800, color: AppColors.teaDark),
            ),
            const SizedBox(height: 4),
            const Text('Tin mới từ các hợp tác xã'),
            const SizedBox(height: 16),
            if (articles.isEmpty) const SizedBox(height: 240, child: EmptyState('Chưa có bài viết nào')),
            for (final a in articles) ...[
              Card(
                clipBehavior: Clip.antiAlias,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    GradientBanner(seed: a.id.hashCode, icon: Icons.article_outlined, height: 100, radius: 0),
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (a.pinned) const Padding(padding: EdgeInsets.only(bottom: 6), child: StatusChip('Ghim')),
                          Text(
                            a.title,
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 6),
                          Text(a.body),
                          const SizedBox(height: 8),
                          Text(formatDate(a.createdAt), style: Theme.of(context).textTheme.bodySmall),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],
          ],
        ),
      ),
    );
  }
}
