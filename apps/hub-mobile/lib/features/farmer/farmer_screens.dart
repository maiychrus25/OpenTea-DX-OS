// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/format/formatting.dart';
import '../../core/money/money.dart';
import '../../core/theme/app_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/booking.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart';
import '../common/account_tab.dart';
import '../common/status_colors.dart';

class FarmerShell extends StatelessWidget {
  const FarmerShell({super.key, required this.location, required this.child});
  final String location;
  final Widget child;

  static const destinations = [
    NavDestination('Lịch tham quan', Icons.event_note_outlined, '/farmer'),
    NavDestination('Sản phẩm', Icons.local_cafe_outlined, '/farmer/products'),
    NavDestination('Tài khoản', Icons.person_outline, '/farmer/me'),
  ];

  @override
  Widget build(BuildContext context) => RoleShell(destinations: destinations, location: location, child: child);
}

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
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Lịch tham quan tại hộ',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 12),
            if (visits.isEmpty) const SizedBox(height: 240, child: EmptyState('Chưa có đoàn khách nào')),
            for (final v in visits)
              Card(
                child: ListTile(
                  key: Key('visit-${v.id}'),
                  title: Text(v.tourName),
                  subtitle: Text('${formatDateLong(v.departureDate)}\n${v.contactName} · ${v.guests} khách'),
                  isThreeLine: true,
                  trailing: v.checkedIn
                      ? const StatusChip('Đã điểm danh')
                      : StatusChip(v.status.label, color: bookingStatusColor(v.status)),
                  onTap: () => context.push('/farmer/visits/${v.id}'),
                ),
              ),
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
    return Scaffold(
      appBar: AppBar(title: const Text('Đoàn khách')),
      body: LoadView<Booking?>(
        load: () async => (await repo.listHouseholdVisits(household)).where((b) => b.id == bookingId).firstOrNull,
        builder: (context, b, reload) {
          if (b == null) return const EmptyState('Không tìm thấy đoàn khách');
          final canCheckIn = b.status == BookingStatus.confirmed && !b.checkedIn;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(b.tourName, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              InfoRow('Ngày', formatDateLong(b.departureDate)),
              InfoRow('Mã đặt', b.code),
              InfoRow('Liên hệ', b.contactName),
              InfoRow('Điện thoại', b.phone),
              InfoRow('Số khách', '${b.adults} người lớn, ${b.children} trẻ em'),
              InfoRow('Trạng thái', b.status.label),
              InfoRow('Điểm danh', b.checkedIn ? 'Đã đến' : 'Chưa'),
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
                const Text('Chỉ điểm danh được lượt đặt HTX đã xác nhận.'),
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
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Sản phẩm của hộ',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 12),
            if (products.isEmpty) const SizedBox(height: 240, child: EmptyState('Hộ chưa có sản phẩm')),
            for (final p in products)
              Card(
                child: ListTile(
                  leading: SizedBox(
                    width: 56,
                    child: GradientBanner(
                      seed: p.gradientSeed,
                      icon: Icons.local_cafe_outlined,
                      height: 56,
                      radius: 14,
                    ),
                  ),
                  title: Text(p.name),
                  subtitle: Text('${formatVnd(p.price)} · ${p.unit}'),
                  trailing: p.stock == 0
                      ? const StatusChip('Hết hàng', color: AppColors.danger)
                      : Text('Kho: ${p.stock}'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class FarmerAccountTab extends StatelessWidget {
  const FarmerAccountTab({super.key});
  @override
  Widget build(BuildContext context) => const AccountTab();
}
