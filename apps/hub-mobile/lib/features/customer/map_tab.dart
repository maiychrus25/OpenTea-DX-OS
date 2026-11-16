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

/// "Bản đồ": a drawn placeholder map with pins and the list of places. No map
/// SDK on purpose (no Google services); a real build can open an external map.
class MapTab extends StatelessWidget {
  const MapTab({super.key});

  static const _pinSpots = [
    Alignment(-0.45, -0.2),
    Alignment(0.25, -0.5),
    Alignment(0.5, 0.35),
    Alignment(-0.2, 0.5),
    Alignment(0.7, -0.05),
  ];

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return InnerPage(
      title: 'Bản đồ',
      child: LoadView<(List<Htx>, List<Household>)>(
        load: () async => (await repo.listHtxs(), await repo.listHouseholds()),
        builder: (context, data, reload) {
          final (htxs, households) = data;
          final places = <({String kind, String name, String route})>[
            for (final h in htxs) (kind: 'HTX · ${h.province}', name: shortHtxName(h), route: '/shop/htx/${h.code}'),
            for (final h in households)
              (
                kind: 'Hộ đón khách · ${h.village.split(',').first.toLowerCase()}',
                name: h.name,
                route: '/shop/farm/${h.id}',
              ),
          ];
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            children: [
              const PageTitle('Điểm đến trên bản đồ'),
              const SourceChip('Nguồn: lõi · điểm công khai do HTX đánh dấu · không hiện vị trí thửa của hộ'),
              Container(
                key: const Key('map-canvas'),
                height: 230,
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppColors.border),
                  gradient: const LinearGradient(
                    colors: [Color(0xFFDFE9CF), Color(0xFFCFE0BF)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: Stack(
                  children: [
                    Positioned.fill(child: CustomPaint(painter: _ContourPainter())),
                    for (var i = 0; i < places.length && i < _pinSpots.length; i++)
                      Align(alignment: _pinSpots[i], child: const _Pin()),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              for (final p in places)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => context.push(p.route),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF1F6EA),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFFD8E5C8)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.place, color: AppColors.amber, size: 20),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(p.kind, style: const TextStyle(fontSize: 11, color: AppColors.faint)),
                                Text(p.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                              ],
                            ),
                          ),
                          const Icon(Icons.chevron_right, color: AppColors.teaDark),
                        ],
                      ),
                    ),
                  ),
                ),
              const SizedBox(height: 4),
              const Text(
                'Bản thật sẽ có nút "Mở trên bản đồ" mở dịch vụ bản đồ bên ngoài.',
                style: TextStyle(fontSize: 13, color: AppColors.muted, height: 1.4),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Pin extends StatelessWidget {
  const _Pin();
  @override
  Widget build(BuildContext context) => const Icon(
    Icons.location_on,
    size: 44,
    color: AppColors.amber,
    shadows: [Shadow(color: Color(0x55000000), blurRadius: 6, offset: Offset(0, 2))],
  );
}

class _ContourPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0x33FFFFFF)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    for (var i = 0; i < 6; i++) {
      final y = size.height * (0.12 + i * 0.16);
      final path = Path()
        ..moveTo(0, y)
        ..cubicTo(size.width * 0.3, y - 26, size.width * 0.6, y + 26, size.width, y - 8);
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}
