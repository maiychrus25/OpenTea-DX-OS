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
import '../../data/models/order.dart';
import '../../shared/widgets.dart';

/// One line of the customer's notification list, derived from the customer's own bookings and orders.
class CustomerNotice {
  const CustomerNotice({
    required this.id,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.at,
    required this.route,
    this.needsAction = false,
  });
  final String id;
  final IconData icon;
  final String title;
  final String subtitle;
  final DateTime at;
  final String route;

  /// The customer still has something to do (pay), so the bell counts it.
  final bool needsAction;
}

/// The notices of a customer: one per booking and one per order, newest first. Nothing is stored apart from the
/// bookings and orders themselves; the wording follows their status and payment.
List<CustomerNotice> customerNotices(List<Booking> bookings, List<Order> orders) {
  final notices = <CustomerNotice>[
    for (final b in bookings)
      CustomerNotice(
        id: 'booking-${b.id}',
        icon: Icons.confirmation_number_outlined,
        title: switch (b.status) {
          BookingStatus.pending when b.paymentStatus == PaymentStatus.unpaid =>
            'Lượt đặt ${b.code} đang chờ thanh toán',
          BookingStatus.pending => 'Lượt đặt ${b.code} đang chờ đơn vị tổ chức xác nhận',
          BookingStatus.confirmed => 'Lượt đặt ${b.code} đã được xác nhận',
          BookingStatus.completed => 'Chuyến đi ${b.code} đã hoàn tất',
          BookingStatus.cancelled => 'Lượt đặt ${b.code} đã huỷ',
        },
        subtitle: '${b.tourName} · ${formatDate(b.departureDate)}',
        at: b.createdAt,
        route: '/shop/tickets/${b.id}',
        needsAction: b.status == BookingStatus.pending && b.paymentStatus == PaymentStatus.unpaid,
      ),
    for (final o in orders)
      CustomerNotice(
        id: 'order-${o.id}',
        icon: Icons.receipt_long_outlined,
        title: switch (o.status) {
          OrderStatus.pending when o.paymentStatus == PaymentStatus.unpaid => 'Đơn ${o.code} đang chờ thanh toán',
          OrderStatus.pending => 'Đơn ${o.code} đang chờ hợp tác xã xác nhận',
          OrderStatus.confirmed => 'Đơn ${o.code} đã được xác nhận',
          OrderStatus.shipping => 'Đơn ${o.code} đang được giao',
          OrderStatus.completed => 'Đơn ${o.code} đã hoàn tất',
          OrderStatus.cancelled => 'Đơn ${o.code} đã huỷ',
        },
        subtitle: '${o.lines.length} sản phẩm · ${formatDate(o.createdAt)}',
        at: o.createdAt,
        route: '/shop/orders/${o.id}',
        needsAction: o.status == OrderStatus.pending && o.paymentStatus == PaymentStatus.unpaid,
      ),
  ]..sort((a, b) => b.at.compareTo(a.at));
  return notices;
}

/// How many notices still wait for the customer: shown on the bell.
int customerNoticeBadge(List<Booking> bookings, List<Order> orders) =>
    customerNotices(bookings, orders).where((n) => n.needsAction).length;

/// "Thông báo" of guests and customers.
class CustomerNotificationsScreen extends StatelessWidget {
  const CustomerNotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final signedIn = context.watch<AppState>().claims != null;
    final activity = context.watch<ActivityController>();
    final notices = customerNotices(activity.bookings, activity.orders);
    return InnerPage(
      title: 'Thông báo',
      child: signedIn
          ? (notices.isEmpty
                ? const _Empty(
                    key: Key('notices-empty'),
                    text: 'Chưa có thông báo. Khi bạn đặt tour hoặc mua hàng, trạng thái sẽ hiện ở đây.',
                  )
                : ListView.separated(
                    key: const Key('notices-list'),
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    itemCount: notices.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, i) {
                      final n = notices[i];
                      return ListTile(
                        key: Key('notice-${n.id}'),
                        contentPadding: const EdgeInsets.symmetric(vertical: 6),
                        leading: CircleAvatar(
                          backgroundColor: AppColors.tileLight,
                          child: Icon(n.icon, color: AppColors.teaDark, size: 22),
                        ),
                        title: Text(
                          n.title,
                          style: TextStyle(fontWeight: n.needsAction ? FontWeight.w800 : FontWeight.w600),
                        ),
                        subtitle: Text(n.subtitle, style: const TextStyle(color: AppColors.muted)),
                        trailing: n.needsAction
                            ? const Icon(Icons.circle, size: 10, color: AppColors.teaDark)
                            : const Icon(Icons.chevron_right, color: AppColors.faint),
                        onTap: () => context.push(n.route),
                      );
                    },
                  ))
          : Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const _Empty(
                    key: Key('notices-guest'),
                    text: 'Đăng nhập để nhận thông báo về đơn hàng, vé và thanh toán của bạn.',
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    key: const Key('notices-signin'),
                    onPressed: () => context.push('/login?from=${Uri.encodeComponent('/shop/notifications')}'),
                    child: const Text('Đăng nhập'),
                  ),
                ],
              ),
            ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({super.key, required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.notifications_none, size: 44, color: AppColors.faint),
          const SizedBox(height: 12),
          Text(
            text,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.muted, height: 1.45),
          ),
        ],
      ),
    ),
  );
}
