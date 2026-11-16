// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/activity_controller.dart';
import '../../app/app_state.dart';
import '../../core/format/formatting.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/booking.dart';
import '../../shared/widgets.dart';
import '../common/status_colors.dart';

/// "Lịch trình": the customer's own bookings (tickets).
class TripsTab extends StatefulWidget {
  const TripsTab({super.key});

  @override
  State<TripsTab> createState() => _TripsTabState();
}

class _TripsTabState extends State<TripsTab> {
  @override
  void initState() {
    super.initState();
    if (context.read<AppState>().claims != null) context.read<ActivityController>().refresh();
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = context.watch<AppState>().claims != null;
    final bookings = context.watch<ActivityController>().bookings;
    return InnerPage(
      title: 'Lịch trình của tôi',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        children: [
          const PageTitle('Lịch trình của tôi'),
          const SourceChip('Nguồn: đặt chỗ ở tea-tour · yêu cầu tham quan'),
          if (!signedIn)
            _note('Đăng nhập để xem các chuyến đã đặt, mã vé và trạng thái thanh toán.')
          else if (bookings.isEmpty)
            _note('Bạn chưa đặt tour nào.'),
          for (final b in bookings)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: InkWell(
                key: Key('trip-${b.id}'),
                borderRadius: BorderRadius.circular(18),
                onTap: () => context.push('/shop/tickets/${b.id}'),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 48,
                            height: 48,
                            decoration: const BoxDecoration(color: Color(0xFFE1ECD2), shape: BoxShape.circle),
                            child: const Icon(Icons.home_work_outlined, color: AppColors.teaDark),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(b.tourName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                                Text(
                                  '${b.code} · ${formatDate(b.departureDate)} · ${b.guests} khách',
                                  style: const TextStyle(color: AppColors.muted, fontSize: 13),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      StatusChip(b.status.label, color: bookingStatusColor(b.status)),
                    ],
                  ),
                ),
              ),
            ),
          const SizedBox(height: 6),
          if (signedIn)
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: _QuickTile(
                      key: const Key('trips-tickets'),
                      icon: Icons.confirmation_number_outlined,
                      title: 'Vé của tôi',
                      subtitle: bookings.isEmpty ? 'Chưa có vé' : '${bookings.length} chuyến',
                      onTap: () => context.push('/shop/tickets'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _QuickTile(
                      key: const Key('trips-orders'),
                      icon: Icons.receipt_long_outlined,
                      title: 'Đơn hàng',
                      subtitle: 'Mua chè, đặc sản',
                      onTap: () => context.push('/shop/orders'),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 12),
          Material(
            color: AppColors.teaDark,
            borderRadius: BorderRadius.circular(20),
            child: InkWell(
              key: const Key('trips-find'),
              borderRadius: BorderRadius.circular(20),
              onTap: () => context.push('/shop/tours'),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), shape: BoxShape.circle),
                      child: const Icon(Icons.hiking, color: Colors.white),
                    ),
                    const SizedBox(width: 14),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Tìm thêm tour',
                            style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700),
                          ),
                          Text('Chọn ngày và đặt chỗ ngay', style: TextStyle(color: Color(0xCCFFFFFF), fontSize: 13)),
                        ],
                      ),
                    ),
                    const Icon(Icons.arrow_forward, color: Colors.white),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _note(String text) => Container(
    margin: const EdgeInsets.only(bottom: 14),
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: AppColors.border),
    ),
    child: Text(text, style: const TextStyle(color: AppColors.muted, height: 1.4)),
  );
}

/// A rounded tile with an icon, a title and a short line: a shortcut under the list of trips.
class _QuickTile extends StatelessWidget {
  const _QuickTile({super.key, required this.icon, required this.title, required this.subtitle, required this.onTap});
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: AppColors.tileLight,
    borderRadius: BorderRadius.circular(20),
    child: InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 12, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 30, color: AppColors.teaDark),
                const Spacer(),
                const Icon(Icons.chevron_right, color: AppColors.teaDark),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: AppColors.ink),
            ),
            const SizedBox(height: 2),
            Text(subtitle, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
          ],
        ),
      ),
    ),
  );
}
