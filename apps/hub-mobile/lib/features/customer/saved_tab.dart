// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/saved_controller.dart';
import '../../core/money/money.dart';
import '../../core/theme/app_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart';

/// "Đã lưu": tours the visitor marked with the heart.
class SavedTab extends StatelessWidget {
  const SavedTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final saved = context.watch<SavedController>().ids;
    return InnerPage(
      title: 'Đã lưu',
      child: LoadView<List<Tour>>(
        load: repo.listTours,
        builder: (context, tours, reload) {
          final mine = [
            for (final t in tours)
              if (saved.contains(t.id)) t,
          ];
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            children: [
              const PageTitle('Đã lưu', subtitle: 'Các tour bạn đã lưu để xem sau.'),
              if (mine.isEmpty)
                const SizedBox(
                  height: 200,
                  child: EmptyState('Chưa lưu tour nào. Chạm trái tim trên tour để lưu.', icon: Icons.bookmark_border),
                ),
              for (final t in mine)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: InkWell(
                    key: Key('saved-${t.id}'),
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => context.push('/shop/tours/${t.id}'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF1F6EA),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFFD8E5C8)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.bookmark, color: AppColors.amber),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(t.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                                Text(
                                  '${formatVnd(t.adultPrice)} · ${t.durationLabel}',
                                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                                ),
                              ],
                            ),
                          ),
                          const Icon(Icons.chevron_right, color: AppColors.teaDark),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
