// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/theme/app_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart';
import 'tour_detail_screen.dart' show AmberButton;

/// A farming household: facts and the five-step tea production process.
class HouseholdScreen extends StatelessWidget {
  const HouseholdScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<Household>(
      load: () => repo.getHousehold(id),
      builder: (context, h, reload) => Column(
        children: [
          PageHeader(h.name),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
              children: [
                const NoticeBanner('Dữ liệu mẫu. Hộ chỉ công khai những gì đã đồng ý.'),
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 52,
                        height: 52,
                        decoration: const BoxDecoration(color: Color(0xFFE1ECD2), shape: BoxShape.circle),
                        child: const Icon(Icons.agriculture_outlined, color: AppColors.teaDark, size: 28),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(h.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 19)),
                            Text(h.village, style: const TextStyle(color: AppColors.muted)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                FactsGrid([
                  ('Cây trồng', h.crop),
                  ('Chứng nhận', h.certificate),
                  ('Kinh nghiệm', h.experience),
                  ('Đón khách', h.hosting),
                ]),
                const SizedBox(height: 10),
                const SourceChip(
                  'Hộ đã đồng ý công khai tên, thôn, quy trình. Không hiện số điện thoại và vị trí thửa.',
                ),
                const SectionTitle('Quy trình sản xuất chè'),
                for (var i = 0; i < h.process.length; i++) _StepCard(index: i + 1, step: h.process[i]),
                const SizedBox(height: 8),
                AmberButton(
                  buttonKey: const Key('household-visit'),
                  label: 'Gửi yêu cầu tham quan hộ này',
                  onPressed: () => context.push('/shop/visit?household=${h.id}'),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 54,
                  child: OutlinedButton(
                    key: const Key('household-shop'),
                    onPressed: () => context.push('/shop/products'),
                    child: const Text('Mua chè của hộ · xem nguồn gốc lô'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StepCard extends StatelessWidget {
  const _StepCard({required this.index, required this.step});
  final int index;
  final ProcessStep step;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 10),
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: AppColors.border),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: const BoxDecoration(color: AppColors.teaDark, shape: BoxShape.circle),
          child: Text(
            '$index',
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(step.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5)),
              const SizedBox(height: 4),
              Text(step.description, style: const TextStyle(color: AppColors.muted, height: 1.45, fontSize: 14)),
              const SizedBox(height: 8),
              SourceChip('Nguồn: ${step.source}'),
            ],
          ),
        ),
      ],
    ),
  );
}
