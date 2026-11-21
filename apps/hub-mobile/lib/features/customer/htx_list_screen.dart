// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/theme/app_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart';
import 'tour_widgets.dart';

/// The cooperatives, one photo card each; a card opens that cooperative's information page.
class HtxListScreen extends StatelessWidget {
  const HtxListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return InnerPage(
      title: 'Đồi chè',
      child: LoadView<List<Htx>>(
        load: repo.listHtxs,
        builder: (context, htxs, reload) => RefreshIndicator(
          onRefresh: reload,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            children: [
              const PageTitle('Hợp tác xã', subtitle: 'Các hợp tác xã chè đang có trên OpenTea.'),
              if (htxs.isEmpty) const SizedBox(height: 240, child: EmptyState('Chưa có hợp tác xã nào')),
              for (var i = 0; i < htxs.length; i++) ...[
                InkWell(
                  key: Key('htx-${htxs[i].code}'),
                  borderRadius: BorderRadius.circular(22),
                  onTap: () => context.push('/shop/htx/${htxs[i].code}'),
                  child: TeaPhoto(
                    asset: teaPhotoFor(i),
                    height: 190,
                    radius: 22,
                    shade: true,
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.end,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(shortHtxName(htxs[i]), style: serif(24, color: Colors.white, height: 1.15)),
                          const SizedBox(height: 2),
                          Row(
                            children: [
                              const Icon(Icons.place, size: 16, color: Colors.white),
                              const SizedBox(width: 4),
                              Text(htxs[i].province, style: const TextStyle(color: Colors.white, fontSize: 15)),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
