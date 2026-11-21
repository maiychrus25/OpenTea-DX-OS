// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../data/hub_repository.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart';
import 'news_card.dart';
import 'tour_widgets.dart';

/// News written by the cooperatives and approved by the tour company.
class NewsScreen extends StatelessWidget {
  const NewsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return InnerPage(
      title: 'Tin từ hợp tác xã',
      child: LoadView<(List<Article>, List<Htx>)>(
        load: () async => (await repo.listPublishedArticles(), await repo.listHtxs()),
        builder: (context, data, reload) {
          final (articles, htxs) = data;
          String htxName(String code) {
            for (final h in htxs) {
              if (h.code == code) return shortHtxName(h);
            }
            return '';
          }

          return RefreshIndicator(
            onRefresh: reload,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
              children: [
                const PageTitle(
                  'Tin từ hợp tác xã',
                  subtitle: 'Bài viết về khu vực, văn hoá chè và nông hộ do chính các hợp tác xã đăng.',
                ),
                if (articles.isEmpty) const SizedBox(height: 240, child: EmptyState('Chưa có bài viết nào')),
                for (final a in articles) ...[
                  NewsCard(key: Key('news-${a.id}'), article: a, htxName: htxName(a.htxCode), large: true),
                  const SizedBox(height: 14),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}
