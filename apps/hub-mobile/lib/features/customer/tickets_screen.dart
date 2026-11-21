// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../app/activity_controller.dart';
import '../../core/format/formatting.dart';
import '../../core/money/money.dart';
import '../../core/theme/app_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/booking.dart';
import '../../data/models/catalog.dart' show GuideStaff;
import '../../data/models/order.dart' show PaymentStatus;
import '../../shared/soft_card.dart';
import '../../shared/widgets.dart';
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
      appBar: AppBar(
        leading: const SafeBackButton(fallback: '/shop/me'),
        title: const Text('Vé của tôi'),
      ),
      body: Column(
        children: [
          if (activity.offline) offlineBanner(),
          Expanded(
            child: activity.bookings.isEmpty
                ? const EmptyState('Bạn chưa đặt tour nào', icon: Icons.confirmation_number_outlined)
                : RefreshIndicator(
                    onRefresh: activity.refresh,
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                      children: [for (final b in activity.bookings) _TicketCard(booking: b)],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _TicketCard extends StatelessWidget {
  const _TicketCard({required this.booking});
  final Booking booking;

  @override
  Widget build(BuildContext context) {
    final b = booking;
    final waitingPay = b.paymentStatus == PaymentStatus.unpaid && b.status != BookingStatus.cancelled;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Material(
        color: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
          side: const BorderSide(color: AppColors.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: Key('ticket-${b.id}'),
          onTap: () => context.push('/shop/tickets/${b.id}'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TeaPhoto(asset: teaPhotoFor(b.tourId.hashCode), height: 110, radius: 0, shade: true),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      b.tourName,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        height: 1.3,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 8),
                    _Line(Icons.event_outlined, formatDateLong(b.departureDate)),
                    const SizedBox(height: 4),
                    _Line(Icons.group_outlined, '${b.guests} khách'),
                    const Divider(height: 24),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            waitingPay ? 'Chờ thanh toán' : b.code,
                            style: TextStyle(
                              fontSize: 13,
                              color: waitingPay ? AppColors.amber : AppColors.muted,
                              fontWeight: waitingPay ? FontWeight.w600 : FontWeight.w400,
                            ),
                          ),
                        ),
                        Text(
                          formatVnd(b.total),
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.teaDark),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line(this.icon, this.text);
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Icon(icon, size: 17, color: AppColors.teaDark),
      const SizedBox(width: 8),
      Expanded(
        child: Text(text, style: const TextStyle(color: AppColors.muted)),
      ),
    ],
  );
}

/// Ticket with a QR of the booking code. It opens from the local copy, so it
/// works without a network.
class TicketScreen extends StatefulWidget {
  const TicketScreen({super.key, required this.bookingId});
  final String bookingId;

  @override
  State<TicketScreen> createState() => _TicketScreenState();
}

class _TicketScreenState extends State<TicketScreen> {
  String get bookingId => widget.bookingId;

  @override
  void initState() {
    super.initState();
    // Opened by a link before the list was loaded: fetch the bookings once.
    final activity = context.read<ActivityController>();
    if (activity.bookingById(bookingId) == null) activity.refresh();
  }

  @override
  Widget build(BuildContext context) {
    final b = context.watch<ActivityController>().bookingById(bookingId);
    if (b == null) {
      return Scaffold(
        appBar: AppBar(leading: const SafeBackButton(fallback: '/shop/trips')),
        body: const EmptyState('Không tìm thấy vé'),
      );
    }
    final cancelled = b.status == BookingStatus.cancelled;
    final valid =
        !cancelled &&
        (b.paymentStatus == PaymentStatus.paid ||
            b.status == BookingStatus.confirmed ||
            b.status == BookingStatus.completed);
    final needsPay = b.paymentStatus == PaymentStatus.unpaid && b.status != BookingStatus.cancelled;
    return Scaffold(
      appBar: AppBar(
        leading: const SafeBackButton(fallback: '/shop/trips'),
        title: const Text('Vé tham quan'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          // The ticket: the tour on top, a torn edge, then the QR to show at the gate.
          Material(
            color: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(24),
              side: const BorderSide(color: AppColors.border),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                TeaPhoto(
                  asset: teaPhotoFor(b.tourId.hashCode),
                  height: 150,
                  radius: 0,
                  shade: true,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [Text(b.tourName, style: serif(22, color: Colors.white, height: 1.2))],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                  child: Row(
                    children: [
                      Expanded(child: _Fact('Ngày đi', formatDate(b.departureDate))),
                      Expanded(child: _Fact('Số khách', '${b.guests} người')),
                    ],
                  ),
                ),
                const _TearLine(),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
                  child: Column(
                    children: [
                      if (valid)
                        Container(
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: AppColors.border),
                          ),
                          padding: const EdgeInsets.all(10),
                          child: QrImageView(key: const Key('ticket-qr'), data: b.code, size: 200),
                        )
                      else
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEAF3E4),
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Text(
                            cancelled ? 'Vé này đã huỷ.' : 'Vé có mã QR ngay sau khi bạn chuyển khoản.',
                            textAlign: TextAlign.center,
                            style: TextStyle(height: 1.4),
                          ),
                        ),
                      const SizedBox(height: 12),
                      Text(
                        b.code,
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, letterSpacing: 1.2),
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'Đưa mã này khi đến điểm đón',
                        style: TextStyle(fontSize: 12.5, color: AppColors.faint),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SoftCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const BlockTitle(Icons.person_outline, 'Thông tin đặt chỗ'),
                KeyValueRow('Ngày đi', formatDateLong(b.departureDate)),
                KeyValueRow('Khách', '${b.adults} người lớn, ${b.children} trẻ em'),
                KeyValueRow('Liên hệ', '${b.contactName} · ${b.phone}'),
                if (b.email.isNotEmpty) KeyValueRow('Email', b.email),
                if (b.note.isNotEmpty) KeyValueRow('Ghi chú', b.note),
              ],
            ),
          ),
          if (valid) _GuideCard(tourId: b.tourId),
          SoftCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const BlockTitle(Icons.account_balance_wallet_outlined, 'Thanh toán'),
                KeyValueRow('Tổng tiền', formatVnd(b.total), strong: true),
              ],
            ),
          ),
          if (needsPay)
            SizedBox(
              height: 52,
              child: FilledButton(
                key: const Key('ticket-pay'),
                onPressed: () => context.push('/shop/pay/${Uri.encodeComponent(b.code)}'),
                child: const Text('Thanh toán VietQR'),
              ),
            ),
        ],
      ),
    );
  }
}

/// The guides assigned to the tour of this ticket, so the customer knows who to call on the day.
class _GuideCard extends StatelessWidget {
  const _GuideCard({required this.tourId});
  final String tourId;

  @override
  Widget build(BuildContext context) => FutureBuilder<List<GuideStaff>>(
    future: context.read<HubRepository>().listTourGuides(tourId),
    builder: (context, snapshot) {
      final guides = snapshot.data ?? const <GuideStaff>[];
      if (guides.isEmpty) return const SizedBox.shrink();
      return SoftCard(
        key: const Key('ticket-guides'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const BlockTitle(Icons.hiking, 'Người dẫn tour'),
            for (final g in guides) KeyValueRow(g.name, g.phone),
          ],
        ),
      );
    },
  );
}

class _Fact extends StatelessWidget {
  const _Fact(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
      const SizedBox(height: 2),
      Text(
        value,
        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.ink),
      ),
    ],
  );
}

/// The dashed line of a ticket with a notch on each side.
class _TearLine extends StatelessWidget {
  const _TearLine();

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 24,
    child: Stack(
      alignment: Alignment.center,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 22),
          child: LayoutBuilder(
            builder: (context, c) {
              final n = (c.maxWidth / 10).floor();
              return Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [for (var i = 0; i < n; i++) Container(width: 5, height: 1.5, color: AppColors.border)],
              );
            },
          ),
        ),
        const Positioned(left: -12, child: _Notch()),
        const Positioned(right: -12, child: _Notch()),
      ],
    ),
  );
}

class _Notch extends StatelessWidget {
  const _Notch();

  @override
  Widget build(BuildContext context) => Container(
    width: 24,
    height: 24,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: Theme.of(context).scaffoldBackgroundColor,
      border: Border.all(color: AppColors.border),
    ),
  );
}
