// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format/formatting.dart';
import '../../core/theme/app_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart';
import 'tour_widgets.dart';

const tourFilters = ['Tất cả', 'Hái chè', 'Sao chè', 'Homestay', 'Trong ngày'];

/// Whether [t] belongs under the filter chip [filter] and matches [query].
bool tourMatches(Tour t, {String filter = 'Tất cả', String query = ''}) {
  final okFilter = switch (filter) {
    'Tất cả' => true,
    'Trong ngày' => t.isSameDay,
    _ => t.tags.contains(filter),
  };
  if (!okFilter) return false;
  final q = stripDiacritics(query.trim().toLowerCase());
  if (q.isEmpty) return true;
  return stripDiacritics('${t.name} ${t.summary} ${t.tags.join(' ')}'.toLowerCase()).contains(q);
}

class ToursTab extends StatefulWidget {
  const ToursTab({super.key, this.query = ''});
  final String query;

  @override
  State<ToursTab> createState() => _ToursTabState();
}

class _ToursTabState extends State<ToursTab> {
  String _filter = tourFilters.first;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return InnerPage(
      title: 'Khám phá tour',
      child: LoadView<(List<Tour>, List<Htx>)>(
        load: () async => (await repo.listTours(), await repo.listHtxs()),
        builder: (context, data, reload) {
          final (tours, htxs) = data;
          final names = {for (final h in htxs) h.code: shortHtxName(h)};
          final shown = [
            for (final t in tours)
              if (tourMatches(t, filter: _filter, query: widget.query)) t,
          ];
          return RefreshIndicator(
            onRefresh: reload,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
              children: [
                const PageTitle(
                  'Tour trải nghiệm vùng chè',
                  subtitle: 'Chọn một tour để xem lịch trình, gặp hợp tác xã và nông hộ ngay tại vườn chè.',
                ),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final f in tourFilters)
                      ChoiceChip(
                        key: Key('filter-$f'),
                        label: Text(f),
                        selected: _filter == f,
                        showCheckmark: false,
                        selectedColor: AppColors.teaDark,
                        backgroundColor: const Color(0xFFE9EFDF),
                        labelStyle: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: _filter == f ? Colors.white : AppColors.teaDark,
                        ),
                        onSelected: (_) => setState(() => _filter = f),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                if (widget.query.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text('Kết quả cho "${widget.query}"', style: const TextStyle(color: AppColors.muted)),
                  ),
                if (shown.isEmpty) const SizedBox(height: 200, child: EmptyState('Không có tour phù hợp')),
                for (final t in shown) ...[
                  TourCard(tour: t, htxName: names[t.htxCode] ?? t.htxCode),
                  const SizedBox(height: 18),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}
