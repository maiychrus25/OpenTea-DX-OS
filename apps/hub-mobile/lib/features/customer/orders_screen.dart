// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/activity_controller.dart';
import '../../core/format/formatting.dart';
import '../../core/money/money.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/order.dart';
import '../../shared/widgets.dart';
import '../common/status_colors.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  @override
  void initState() {
    super.initState();
    context.read<ActivityController>().refresh();
  }

  @override
  Widget build(BuildContext context) {
    final activity = context.watch<ActivityController>();
    return Scaffold(
      appBar: AppBar(title: const Text('Đơn hàng của tôi')),
      body: Column(
        children: [
          if (activity.offline) const _OfflineBanner(),
          Expanded(
            child: activity.orders.isEmpty
                ? const EmptyState('Bạn chưa có đơn hàng nào')
                : RefreshIndicator(
                    onRefresh: activity.refresh,
                    child: ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        for (final o in activity.orders)
                          Card(
                            child: ListTile(
                              key: Key('order-${o.id}'),
                              title: Text(o.code),
                              subtitle: Text('${formatDateTime(o.createdAt)} · ${formatVnd(o.total)}'),
                              trailing: StatusChip(o.status.label, color: orderStatusColor(o.status)),
                              onTap: () => context.push('/shop/orders/${o.id}'),
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

class _OfflineBanner extends StatelessWidget {
  const _OfflineBanner();

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    color: AppColors.amber.withValues(alpha: 0.18),
    padding: const EdgeInsets.all(8),
    child: const Text('Không có mạng: đang hiển thị dữ liệu đã lưu trong máy', textAlign: TextAlign.center),
  );
}

/// Offline banner for other screens.
Widget offlineBanner() => const _OfflineBanner();

class OrderDetailScreen extends StatelessWidget {
  const OrderDetailScreen({super.key, required this.orderId});
  final String orderId;

  static const _steps = [OrderStatus.pending, OrderStatus.confirmed, OrderStatus.shipping, OrderStatus.completed];

  @override
  Widget build(BuildContext context) {
    final order = context.watch<ActivityController>().orderById(orderId);
    if (order == null) return Scaffold(appBar: AppBar(), body: const EmptyState('Không tìm thấy đơn hàng'));
    final cancelled = order.status == OrderStatus.cancelled;
    return Scaffold(
      appBar: AppBar(title: Text(order.code)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (cancelled) Center(child: StatusChip(order.status.label, color: AppColors.danger)),
          if (!cancelled)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    for (final s in _steps)
                      ListTile(
                        dense: true,
                        leading: Icon(
                          _steps.indexOf(s) <= _steps.indexOf(order.status)
                              ? Icons.check_circle
                              : Icons.radio_button_unchecked,
                          color: AppColors.teaGreen,
                        ),
                        title: Text(s.label),
                      ),
                  ],
                ),
              ),
            ),
          const SectionTitle('Sản phẩm'),
          for (final l in order.lines)
            ListTile(dense: true, title: Text('${l.name} x ${l.quantity}'), trailing: Text(formatVnd(l.subtotal))),
          const Divider(),
          InfoRow('Tổng', formatVnd(order.total)),
          InfoRow(
            'Thanh toán',
            order.method == PaymentMethod.vietQr ? 'VietQR · ${order.paymentStatus.label}' : 'Khi nhận hàng',
          ),
          InfoRow('Người nhận', order.recipient),
          InfoRow('Điện thoại', order.phone),
          InfoRow('Địa chỉ', order.address),
          if (order.method == PaymentMethod.vietQr && order.paymentStatus == PaymentStatus.unpaid && !cancelled)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: FilledButton(
                onPressed: () => context.push('/shop/pay/${Uri.encodeComponent(order.code)}'),
                child: const Text('Thanh toán VietQR'),
              ),
            ),
        ],
      ),
    );
  }
}
