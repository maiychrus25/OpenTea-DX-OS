// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/format/formatting.dart';
import '../../core/money/money.dart';
import '../../data/hub_repository.dart';
import '../../data/models/booking.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart' show GradientBanner, LoadView, showMessage;
import '../staff/staff_format.dart';
import '../staff/staff_shell.dart';
import '../staff/staff_widgets.dart';

// The storefront work of a farming household ("Gian hàng" in the drawer):
// visiting groups to check in and the household's products.

String _householdOf(BuildContext context) => context.read<AppState>().claims?.householdId ?? '';

/// Visits to the farmer's own household, nearest first.
class VisitsTab extends StatelessWidget {
  const VisitsTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final household = _householdOf(context);
    return LoadView<List<Booking>>(
      load: () => repo.listHouseholdVisits(household),
      builder: (context, visits, reload) => RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            const PageHead('Lịch tham quan tại hộ', subtitle: 'Các đoàn khách đã đặt tour đến hộ của bạn.'),
            if (visits.isEmpty)
              const StaffEmpty('Chưa có đoàn khách nào', icon: Icons.event_note_outlined)
            else
              Stack10([
                for (final v in visits)
                  RowCard(
                    key: Key('visit-list-${v.id}'),
                    title: v.tourName,
                    subtitle: '${formatDateLong(v.departureDate)}\n${v.contactName} · ${v.guests} khách',
                    trailing: v.checkedIn
                        ? const Pill('Đã điểm danh', tone: Tone.ok)
                        : Pill(v.status.label, tone: bookingTone(v.status)),
                    onTap: () => context.push('/farmer/visits/${v.id}'),
                  ),
              ]),
          ],
        ),
      ),
    );
  }
}

class VisitDetailScreen extends StatelessWidget {
  const VisitDetailScreen({super.key, required this.bookingId});
  final String bookingId;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final household = _householdOf(context);
    return DetailScaffold(
      title: 'Đoàn khách',
      body: LoadView<Booking?>(
        load: () async => (await repo.listHouseholdVisits(household)).where((b) => b.id == bookingId).firstOrNull,
        builder: (context, b, reload) {
          if (b == null) return const StaffEmpty('Không tìm thấy đoàn khách');
          final canCheckIn = b.status == BookingStatus.confirmed && !b.checkedIn;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            children: [
              Text(b.tourName, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              DetailRow('Ngày', formatDateLong(b.departureDate)),
              DetailRow('Mã đặt', b.code),
              DetailRow('Liên hệ', b.contactName),
              DetailRow('Điện thoại', b.phone),
              DetailRow('Số khách', '${b.adults} người lớn, ${b.children} trẻ em'),
              DetailRow('Trạng thái', b.status.label),
              DetailRow('Điểm danh', b.checkedIn ? 'Đã đến' : 'Chưa'),
              const SizedBox(height: 16),
              if (canCheckIn)
                FilledButton.icon(
                  key: const Key('farmer-checkin'),
                  icon: const Icon(Icons.how_to_reg),
                  onPressed: () async {
                    try {
                      await repo.checkIn(b.id);
                      if (context.mounted) showMessage(context, 'Đã điểm danh');
                      await reload();
                    } on HubException catch (e) {
                      if (context.mounted) showMessage(context, e.message);
                    }
                  },
                  label: const Text('Điểm danh khách đã đến'),
                )
              else if (!b.checkedIn)
                const InfoNote('Chỉ điểm danh được lượt đặt HTX đã xác nhận.', tone: Tone.neutral),
            ],
          );
        },
      ),
    );
  }
}

class FarmerProductsTab extends StatelessWidget {
  const FarmerProductsTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final household = _householdOf(context);
    return LoadView<List<Product>>(
      load: () => repo.listHouseholdProducts(household),
      builder: (context, products, reload) => RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            const PageHead('Sản phẩm của hộ'),
            if (products.isEmpty)
              const StaffEmpty('Hộ chưa có sản phẩm', icon: Icons.local_cafe_outlined)
            else
              Stack10([
                for (final p in products)
                  RowCard(
                    leading: SizedBox(
                      width: 52,
                      child: GradientBanner(
                        seed: p.gradientSeed,
                        icon: Icons.local_cafe_outlined,
                        height: 52,
                        radius: 12,
                      ),
                    ),
                    title: p.name,
                    subtitle: '${formatVnd(p.price)} · ${p.unit}',
                    trailing: p.stock == 0
                        ? const Pill('Hết hàng', tone: Tone.bad)
                        : Text('Kho: ${p.stock}', style: const TextStyle(fontWeight: FontWeight.w700)),
                  ),
              ]),
          ],
        ),
      ),
    );
  }
}
