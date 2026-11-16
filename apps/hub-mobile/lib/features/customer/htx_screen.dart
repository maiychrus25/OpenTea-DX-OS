// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/money/money.dart';
import '../../data/hub_repository.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart';
import 'tour_detail_screen.dart';
import 'tour_widgets.dart';

/// Public profile of a cooperative: its farming households and its tours.
class HtxScreen extends StatelessWidget {
  const HtxScreen({super.key, required this.code});
  final String code;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return InnerPage(
      title: 'Hợp tác xã',
      child: LoadView<(Htx, List<Household>, List<Tour>)>(
        load: () async =>
            (await repo.getHtx(code), await repo.listHouseholds(htxCode: code), await repo.listTours(htxCode: code)),
        builder: (context, data, reload) {
          final (htx, households, tours) = data;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            children: [
              const SizedBox(height: 14),
              TeaPhoto(asset: teaPhotoFor(code.length), height: 190, radius: 20),
              PageTitle(shortHtxName(htx), subtitle: htx.province),
              FactsGrid([
                ('Tỉnh', htx.province),
                ('Hộ đón khách', '${households.length} hộ'),
                ('Tour', '${tours.length} tour'),
                ('Cây trồng', 'Chè'),
              ]),
              const SectionTitle('Hộ nông dân đón khách'),
              for (final h in households)
                LinkRow(
                  kind: '${h.village} · ${h.certificate}',
                  title: h.name,
                  subtitle: '${h.crop} · ${h.hosting}',
                  icon: Icons.home_work_outlined,
                  route: '/shop/farm/${h.id}',
                ),
              const SectionTitle('Tour của HTX'),
              for (final t in tours)
                LinkRow(
                  kind: t.durationLabel,
                  title: t.name,
                  subtitle: 'Từ ${formatVnd(t.adultPrice)}',
                  icon: Icons.explore_outlined,
                  route: '/shop/tours/${t.id}',
                ),
            ],
          );
        },
      ),
    );
  }
}
