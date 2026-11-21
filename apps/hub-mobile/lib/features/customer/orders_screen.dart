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
import '../../shared/product_image.dart';
import '../../shared/soft_card.dart';
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
      appBar: AppBar(
        leading: const SafeBackButton(fallback: '/shop/me'),
        title: const Text('Đơn hàng của tôi'),
      ),
      body: Column(
        children: [
          if (activity.offline) const _OfflineBanner(),
          Expanded(
            child: activity.orders.isEmpty
                ? const EmptyState('Bạn chưa có đơn hàng nào', icon: Icons.receipt_long_outlined)
                : RefreshIndicator(
                    onRefresh: activity.refresh,
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                      children: [for (final o in activity.orders) _OrderCard(order: o)],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order});
  final Order order;

  @override
  Widget build(BuildContext context) {
    final o = order;
    final first = o.lines.first;
    final items = o.lines.fold<int>(0, (n, l) => n + l.quantity);
    final waitingPay =
        o.method == PaymentMethod.vietQr &&
        o.paymentStatus == PaymentStatus.unpaid &&
        o.status != OrderStatus.cancelled;
    return SoftCard(
      key: Key('order-${o.id}'),
      padding: const EdgeInsets.all(14),
      onTap: () => context.push('/shop/orders/${o.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  o.code,
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.ink),
                ),
              ),
              StatusChip(o.status.label, color: orderStatusColor(o.status)),
            ],
          ),
          const SizedBox(height: 2),
          Text(formatDateTime(o.createdAt), style: const TextStyle(fontSize: 12.5, color: AppColors.faint)),
          const SizedBox(height: 12),
          Row(
            children: [
              SizedBox(
                width: 60,
                child: ProductImage(
                  productId: first.productId,
                  seed: productSeedFromId(first.productId),
                  height: 60,
                  radius: 12,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      first.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      o.lines.length > 1
                          ? 'và ${o.lines.length - 1} sản phẩm khác'
                          : '${first.unit} × ${first.quantity}',
                      style: const TextStyle(fontSize: 13, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const Divider(height: 24),
          Row(
            children: [
              Expanded(
                child: Text(
                  waitingPay ? 'Chờ thanh toán VietQR' : '$items sản phẩm',
                  style: TextStyle(
                    fontSize: 13,
                    color: waitingPay ? AppColors.amber : AppColors.muted,
                    fontWeight: waitingPay ? FontWeight.w600 : FontWeight.w400,
                  ),
                ),
              ),
              Text(
                formatVnd(o.total),
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.teaDark),
              ),
            ],
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

class OrderDetailScreen extends StatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});
  final String orderId;

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  String get orderId => widget.orderId;

  @override
  void initState() {
    super.initState();
    // Opened by a link before the list was loaded: fetch the orders once.
    final activity = context.read<ActivityController>();
    if (activity.orderById(orderId) == null) activity.refresh();
  }

  static const _steps = [OrderStatus.pending, OrderStatus.confirmed, OrderStatus.shipping, OrderStatus.completed];
  static const _stepIcons = [
    Icons.receipt_long_outlined,
    Icons.verified_outlined,
    Icons.local_shipping_outlined,
    Icons.inventory_2_outlined,
  ];

  @override
  Widget build(BuildContext context) {
    final order = context.watch<ActivityController>().orderById(orderId);
    if (order == null) {
      return Scaffold(
        appBar: AppBar(leading: const SafeBackButton(fallback: '/shop/orders')),
        body: const EmptyState('Không tìm thấy đơn hàng'),
      );
    }
    final cancelled = order.status == OrderStatus.cancelled;
    final current = _steps.indexOf(order.status);
    final needsPay = order.method == PaymentMethod.vietQr && order.paymentStatus == PaymentStatus.unpaid && !cancelled;
    return Scaffold(
      appBar: AppBar(
        leading: const SafeBackButton(fallback: '/shop/orders'),
        title: Text(order.code),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          SoftCard(
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Mã đơn hàng', style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
                      Text(order.code, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 2),
                      Text(
                        'Đặt lúc ${formatDateTime(order.createdAt)}',
                        style: const TextStyle(fontSize: 12.5, color: AppColors.faint),
                      ),
                    ],
                  ),
                ),
                StatusChip(order.status.label, color: orderStatusColor(order.status)),
              ],
            ),
          ),
          if (!cancelled)
            SoftCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const BlockTitle(Icons.timeline, 'Tiến trình đơn hàng'),
                  for (var i = 0; i < _steps.length; i++)
                    _TimelineStep(
                      icon: _stepIcons[i],
                      label: _steps[i].label,
                      done: i <= current,
                      active: i == current,
                      last: i == _steps.length - 1,
                    ),
                ],
              ),
            ),
          SoftCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const BlockTitle(Icons.shopping_bag_outlined, 'Sản phẩm'),
                for (final l in order.lines)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 56,
                          child: ProductImage(
                            productId: l.productId,
                            seed: productSeedFromId(l.productId),
                            height: 56,
                            radius: 12,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(l.name, style: const TextStyle(fontWeight: FontWeight.w600, height: 1.3)),
                              const SizedBox(height: 2),
                              Text(
                                '${formatVnd(l.unitPrice)} · ${l.unit}  ×  ${l.quantity}',
                                style: const TextStyle(fontSize: 13, color: AppColors.muted),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(formatVnd(l.subtotal), style: const TextStyle(fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                const Divider(height: 24),
                KeyValueRow('Tổng', formatVnd(order.total), strong: true),
              ],
            ),
          ),
          SoftCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const BlockTitle(Icons.account_balance_wallet_outlined, 'Thanh toán'),
                KeyValueRow(
                  'Hình thức',
                  order.method == PaymentMethod.vietQr ? 'Chuyển khoản VietQR' : 'Trả tiền khi nhận hàng',
                ),
                KeyValueRow(
                  'Tình trạng',
                  order.method == PaymentMethod.vietQr ? order.paymentStatus.label : 'Thu khi giao hàng',
                ),
              ],
            ),
          ),
          SoftCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const BlockTitle(Icons.location_on_outlined, 'Nhận hàng'),
                KeyValueRow('Người nhận', order.recipient),
                KeyValueRow('Điện thoại', order.phone),
                KeyValueRow('Địa chỉ', order.address),
                if (order.note.isNotEmpty) KeyValueRow('Ghi chú', order.note),
              ],
            ),
          ),
          if (needsPay)
            SizedBox(
              height: 52,
              child: FilledButton(
                key: const Key('order-pay'),
                onPressed: () => context.push('/shop/pay/${Uri.encodeComponent(order.code)}'),
                child: const Text('Thanh toán VietQR'),
              ),
            ),
        ],
      ),
    );
  }
}

/// One row of the order timeline: a round icon joined to the next one by a line.
class _TimelineStep extends StatelessWidget {
  const _TimelineStep({
    required this.icon,
    required this.label,
    required this.done,
    required this.active,
    required this.last,
  });
  final IconData icon;
  final String label;
  final bool done;
  final bool active;
  final bool last;

  @override
  Widget build(BuildContext context) => IntrinsicHeight(
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          width: 36,
          child: Column(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: done ? AppColors.teaDark : Colors.white,
                  border: Border.all(color: done ? AppColors.teaDark : AppColors.border, width: 1.5),
                ),
                child: Icon(
                  done && !active ? Icons.check : icon,
                  size: 17,
                  color: done ? Colors.white : AppColors.faint,
                ),
              ),
              if (!last) Expanded(child: Container(width: 2, color: done ? AppColors.teaDark : AppColors.border)),
            ],
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(top: 6, bottom: last ? 0 : 22),
            child: Text(
              label,
              style: TextStyle(
                fontWeight: active ? FontWeight.w800 : FontWeight.w500,
                color: done ? AppColors.ink : AppColors.faint,
              ),
            ),
          ),
        ),
      ],
    ),
  );
}
