// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../app/activity_controller.dart';
import '../../core/format/formatting.dart';
import '../../core/money/money.dart';
import '../../data/models/booking.dart';
import '../../data/models/order.dart' show PaymentStatus, PaymentLabels;
import '../../shared/widgets.dart';
import '../common/status_colors.dart';
import 'orders_screen.dart' show offlineBanner;

class TicketsScreen extends StatefulWidget {
  const TicketsScreen({super.key});

  @override
  State<TicketsScreen> createState() => _TicketsScreenState();
}

class _TicketsScreenState extends State<TicketsScreen> {
  @override
  void initState() {
    super.initState();
    context.read<ActivityController>().refresh();
  }

  @override
  Widget build(BuildContext context) {
    final activity = context.watch<ActivityController>();
    return Scaffold(
      appBar: AppBar(title: const Text('Vé của tôi')),
      body: Column(
        children: [
          if (activity.offline) offlineBanner(),
          Expanded(
            child: activity.bookings.isEmpty
                ? const EmptyState('Bạn chưa đặt tour nào')
                : RefreshIndicator(
                    onRefresh: activity.refresh,
                    child: ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        for (final b in activity.bookings)
                          Card(
                            child: ListTile(
                              key: Key('ticket-${b.id}'),
                              title: Text(b.tourName),
                              subtitle: Text('${formatDate(b.departureDate)} · ${b.guests} khách'),
                              trailing: StatusChip(b.status.label, color: bookingStatusColor(b.status)),
                              onTap: () => context.push('/shop/tickets/${b.id}'),
                            ),
                          ),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

/// Ticket with a QR of the booking code. It opens from the local copy, so it
/// works without a network.
class TicketScreen extends StatelessWidget {
  const TicketScreen({super.key, required this.bookingId});
  final String bookingId;

  @override
  Widget build(BuildContext context) {
    final b = context.watch<ActivityController>().bookingById(bookingId);
    if (b == null) return Scaffold(appBar: AppBar(), body: const EmptyState('Không tìm thấy vé'));
    final valid = b.status == BookingStatus.confirmed || b.status == BookingStatus.completed;
    return Scaffold(
      appBar: AppBar(title: const Text('Vé tham quan')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Text(b.tourName, style: Theme.of(context).textTheme.titleLarge, textAlign: TextAlign.center),
                  const SizedBox(height: 8),
                  StatusChip(b.status.label, color: bookingStatusColor(b.status)),
                  const SizedBox(height: 16),
                  if (valid)
                    Container(
                      color: Colors.white,
                      padding: const EdgeInsets.all(8),
                      child: QrImageView(key: const Key('ticket-qr'), data: b.code, size: 220),
                    )
                  else
                    const Text('Vé có mã QR sau khi HTX xác nhận thanh toán.'),
                  const SizedBox(height: 12),
                  Text(b.code, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 12),
                  InfoRow('Ngày đi', formatDateLong(b.departureDate)),
                  InfoRow('Khách', '${b.adults} người lớn, ${b.children} trẻ em'),
                  InfoRow('Liên hệ', '${b.contactName} · ${b.phone}'),
                  InfoRow('Tổng tiền', formatVnd(b.total)),
                  InfoRow('Thanh toán', b.paymentStatus.label),
                ],
              ),
            ),
          ),
          if (b.paymentStatus == PaymentStatus.unpaid && b.status != BookingStatus.cancelled)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: FilledButton(
                onPressed: () => context.push('/shop/pay/${Uri.encodeComponent(b.code)}'),
                child: const Text('Thanh toán VietQR'),
              ),
            ),
        ],
      ),
    );
  }
}
