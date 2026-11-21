// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/app_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart';
import 'tour_widgets.dart';

/// Public profile of a cooperative: information only, nothing to pick. Tours belong to the travel company, so none
/// are listed here.
class HtxScreen extends StatelessWidget {
  const HtxScreen({super.key, required this.code});
  final String code;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return InnerPage(
      title: 'Hợp tác xã',
      child: LoadView<(Htx, List<Household>, List<Site>)>(
        load: () async =>
            (await repo.getHtx(code), await repo.listHouseholds(htxCode: code), await repo.listSites(code)),
        builder: (context, data, reload) {
          final (htx, households, sites) = data;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            children: [
              const SizedBox(height: 14),
              TeaPhoto(asset: teaPhotoFor(code.length), height: 190, radius: 20),
              PageTitle(shortHtxName(htx), subtitle: htx.province),
              FactsGrid([
                ('Tỉnh', htx.province),
                ('Cây trồng', 'Chè'),
                ('Hộ thành viên', '${households.length} hộ'),
                ('Chứng nhận', {for (final h in households) h.certificate}.join(', ')),
              ]),
              if (sites.isNotEmpty) ...[
                const SectionTitle('Điểm tham quan tiêu biểu'),
                for (final site in sites)
                  Container(
                    key: Key('site-${site.id}'),
                    width: double.infinity,
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.place_outlined, color: AppColors.teaDark),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(site.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                              if (site.description.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(site.description, style: const TextStyle(color: AppColors.muted, height: 1.45)),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
              const SectionTitle('Hộ nông dân'),
              for (final h in households)
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(h.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(
                        '${h.village} · ${h.crop} · ${h.certificate}',
                        style: const TextStyle(color: AppColors.muted, height: 1.4),
                      ),
                      if (h.experience.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(h.experience, style: const TextStyle(color: AppColors.muted, height: 1.45)),
                      ],
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
