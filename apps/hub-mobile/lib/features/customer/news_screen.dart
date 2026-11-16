// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format/formatting.dart';
import '../../core/theme/app_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart';

/// News written by the cooperatives and approved by the tour company.
class NewsScreen extends StatelessWidget {
  const NewsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return InnerPage(
      title: 'Tin từ hợp tác xã',
      child: LoadView<List<Article>>(
        load: repo.listPublishedArticles,
        builder: (context, articles, reload) => RefreshIndicator(
          onRefresh: reload,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            children: [
              const PageTitle(
                'Tin từ hợp tác xã',
                subtitle: 'Bài viết về khu vực, văn hoá chè và nông hộ do chính các hợp tác xã đăng.',
              ),
              const SourceChip('Nguồn: bài viết HTX · công ty du lịch liên kết duyệt'),
              if (articles.isEmpty) const SizedBox(height: 240, child: EmptyState('Chưa có bài viết nào')),
              for (final a in articles) ...[
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (a.pinned) const Padding(padding: EdgeInsets.only(bottom: 8), child: StatusChip('Ghim')),
                      Text(a.title, style: serif(19, height: 1.25)),
                      const SizedBox(height: 8),
                      Text(a.body, style: const TextStyle(height: 1.5, color: AppColors.muted)),
                      const SizedBox(height: 8),
                      Text(formatDate(a.createdAt), style: const TextStyle(fontSize: 12, color: AppColors.faint)),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
