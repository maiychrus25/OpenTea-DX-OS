// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/format/formatting.dart';
import '../../core/money/money.dart';
import '../../core/theme/app_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart';
import 'tour_widgets.dart';

/// Linked row ("Hợp tác xã", "Hộ đón khách") used on tour and HTX pages.
class LinkRow extends StatelessWidget {
  const LinkRow({super.key, required this.kind, required this.title, this.subtitle, required this.route, this.icon});
  final String kind;
  final String title;
  final String? subtitle;
  final String route;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => context.push(route),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xFFF1F6EA),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFD8E5C8)),
        ),
        child: Row(
          children: [
            Icon(icon ?? Icons.place, size: 22, color: AppColors.amber),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(kind, style: const TextStyle(fontSize: 11, color: AppColors.faint)),
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  if (subtitle != null) Text(subtitle!, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: AppColors.teaDark),
          ],
        ),
      ),
    ),
  );
}

/// Primary amber call-to-action pill.
class AmberButton extends StatelessWidget {
  const AmberButton({super.key, required this.label, required this.onPressed, this.buttonKey});
  final String label;
  final VoidCallback onPressed;
  final Key? buttonKey;
  @override
  Widget build(BuildContext context) => SizedBox(
    height: 54,
    width: double.infinity,
    child: FilledButton(
      key: buttonKey,
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.amber,
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
      onPressed: onPressed,
      child: Text(label, textAlign: TextAlign.center),
    ),
  );
}

class TourDetailScreen extends StatelessWidget {
  const TourDetailScreen({super.key, required this.tourId});
  final String tourId;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<(Tour, Htx, List<Departure>, Household?)>(
      load: () async {
        final tour = await repo.getTour(tourId);
        Household? host;
        try {
          host = await repo.getHousehold(tour.householdId);
        } on HubException {
          host = null;
        }
        return (tour, await repo.getHtx(tour.htxCode), await repo.listDepartures(tourId), host);
      },
      builder: (context, data, reload) {
        final (tour, htx, departures, host) = data;
        return ListView(
          padding: EdgeInsets.zero,
          children: [
            TeaPhoto(
              asset: teaPhotoFor(tour.gradientSeed),
              height: 230,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Align(alignment: Alignment.topLeft, child: PhotoBadge(tour.durationLabel)),
              ),
            ),
            PageHeader(tour.name),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(tour.name, style: serif(28, height: 1.2)),
                  const SizedBox(height: 6),
                  Text('${shortHtxName(htx)} · ${htx.province}', style: const TextStyle(color: AppColors.faint)),
                  const SizedBox(height: 8),
                  Text(tour.summary, style: const TextStyle(fontSize: 16, height: 1.5, color: AppColors.muted)),
                  const SizedBox(height: 14),
                  FactsGrid([
                    ('Giá từ', formatVnd(tour.adultPrice)),
                    ('Số khách', 'Tối đa ${tour.maxGuests} khách'),
                    ('Tháng đẹp', tour.bestMonths),
                    ('Mức độ', tour.level),
                  ]),
                  const SizedBox(height: 8),
                  Text(
                    'Trẻ em ${formatVnd(tour.childPrice)} · thời lượng ${tour.durationLabel}',
                    style: const TextStyle(fontSize: 13, color: AppColors.faint),
                  ),
                  const SizedBox(height: 16),
                  AmberButton(
                    buttonKey: const Key('tour-visit-request'),
                    label: 'Gửi yêu cầu tham quan trực tiếp',
                    onPressed: () => context.push('/shop/visit?household=${tour.householdId}&tour=${tour.id}'),
                  ),
                  const SectionTitle('Lịch khởi hành và đặt chỗ'),
                  const SourceChip('Nguồn: tea-tour · ngày khởi hành và số chỗ'),
                  if (departures.isEmpty) const Text('Chưa mở ngày khởi hành.'),
                  for (final d in departures)
                    Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.fromLTRB(16, 10, 10, 10),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(formatDateLong(d.date), style: const TextStyle(fontWeight: FontWeight.w700)),
                                Text(
                                  d.seatsLeft > 0 ? 'Còn ${d.seatsLeft} chỗ' : 'Hết chỗ',
                                  style: const TextStyle(color: AppColors.muted, fontSize: 13),
                                ),
                              ],
                            ),
                          ),
                          FilledButton(
                            key: Key('book-${d.id}'),
                            style: FilledButton.styleFrom(
                              minimumSize: const Size(0, 44),
                              padding: const EdgeInsets.symmetric(horizontal: 20),
                            ),
                            onPressed: d.seatsLeft > 0
                                ? () => context.push('/shop/booking/${tour.id}?dep=${d.id}')
                                : null,
                            child: const Text('Đặt tour'),
                          ),
                        ],
                      ),
                    ),
                  const SectionTitle('Lịch trình'),
                  const SourceChip('Nguồn: app du lịch · các điểm dừng nối tới HTX và hộ trong lõi'),
                  for (final day in tour.itinerary) _Timeline(day: day),
                  const SectionTitle('Gặp ai trong chuyến đi'),
                  LinkRow(
                    kind: 'Hợp tác xã · nguồn lõi',
                    title: shortHtxName(htx),
                    subtitle: 'Hồ sơ HTX · các hộ đón khách',
                    icon: Icons.account_balance_outlined,
                    route: '/shop/htx/${htx.code}',
                  ),
                  if (host != null)
                    LinkRow(
                      kind: 'Hộ nông dân đón khách · nguồn lõi',
                      title: '${host.name} · ${host.village.split(',').first}',
                      subtitle: 'Xem quy trình sản xuất chè của hộ',
                      icon: Icons.home_work_outlined,
                      route: '/shop/farm/${host.id}',
                    ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.day});
  final ItineraryDay day;

  static final _time = RegExp(r'^(\d{1,2}:\d{2})\s+(.*)$');

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Text(
            day.title,
            style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.amber, fontSize: 15),
          ),
        ),
        Stack(
          children: [
            Positioned(left: 8, top: 6, bottom: 6, child: Container(width: 2, color: const Color(0xFFCFD9C4))),
            Padding(
              padding: const EdgeInsets.only(left: 26),
              child: Column(children: [for (final step in day.steps) _stop(step)]),
            ),
          ],
        ),
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _stop(String step) {
    final m = _time.firstMatch(step);
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Positioned(
          left: -24,
          top: 16,
          child: Container(
            width: 14,
            height: 14,
            decoration: BoxDecoration(
              color: AppColors.leaf,
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.cream, width: 3),
              boxShadow: const [BoxShadow(color: Color(0xFFCFD9C4), spreadRadius: 2)],
            ),
          ),
        ),
        Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: m == null
              ? Text(step, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600))
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      m.group(1)!,
                      style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.amber, fontSize: 13),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      m.group(2)!,
                      style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600, height: 1.35),
                    ),
                  ],
                ),
        ),
      ],
    );
  }
}
