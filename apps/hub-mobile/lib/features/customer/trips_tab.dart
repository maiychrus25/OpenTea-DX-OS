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
          const SizedBox(height: 4),
          if (signedIn && bookings.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: SizedBox(
                height: 52,
                child: OutlinedButton(
                  key: const Key('trips-tickets'),
                  onPressed: () => context.push('/shop/tickets'),
                  child: const Text('Xem tất cả vé'),
                ),
              ),
            ),
          SizedBox(
            height: 52,
            child: FilledButton(
              key: const Key('trips-find'),
              onPressed: () => context.push('/shop/tours'),
              child: const Text('Tìm thêm tour'),
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
