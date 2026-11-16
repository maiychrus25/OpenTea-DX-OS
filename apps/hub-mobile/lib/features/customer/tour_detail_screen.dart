// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/format/formatting.dart';
import '../../core/money/money.dart';
import '../../data/hub_repository.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart';

class TourDetailScreen extends StatelessWidget {
  const TourDetailScreen({super.key, required this.tourId});
  final String tourId;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return Scaffold(
      appBar: AppBar(title: const Text('Chi tiết tour')),
      body: LoadView<(Tour, Htx, List<Departure>)>(
        load: () async {
          final tour = await repo.getTour(tourId);
          return (tour, await repo.getHtx(tour.htxCode), await repo.listDepartures(tourId));
        },
        builder: (context, data, reload) {
          final (tour, htx, departures) = data;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              GradientBanner(seed: tour.gradientSeed, icon: Icons.landscape_outlined, height: 180),
              const SizedBox(height: 16),
              Text(tour.name, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text('${htx.name} · ${htx.province}'),
              const SizedBox(height: 12),
              Text(tour.summary),
              const SizedBox(height: 8),
              InfoRow('Thời lượng', tour.durationLabel),
              InfoRow('Người lớn', formatVnd(tour.adultPrice)),
              InfoRow('Trẻ em', formatVnd(tour.childPrice)),
              const SectionTitle('Lịch trình'),
              for (final day in tour.itinerary)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(day.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        for (final step in day.steps)
                          Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: Text(step)),
                      ],
                    ),
                  ),
                ),
              const SectionTitle('Ngày khởi hành'),
              if (departures.isEmpty) const Text('Chưa mở ngày khởi hành.'),
              for (final d in departures)
                Card(
                  child: ListTile(
                    title: Text(formatDateLong(d.date)),
                    subtitle: Text(d.seatsLeft > 0 ? 'Còn ${d.seatsLeft} chỗ' : 'Hết chỗ'),
                    trailing: FilledButton(
                      key: Key('book-${d.id}'),
                      onPressed: d.seatsLeft > 0 ? () => context.push('/shop/booking/${tour.id}?dep=${d.id}') : null,
                      child: const Text('Đặt tour'),
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
