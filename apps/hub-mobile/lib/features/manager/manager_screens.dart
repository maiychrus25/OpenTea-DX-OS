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
import '../../data/models/order.dart';
import '../../shared/widgets.dart';
import '../common/account_tab.dart';
import '../common/status_colors.dart';

class ManagerShell extends StatelessWidget {
  const ManagerShell({super.key, required this.location, required this.child});
  final String location;
  final Widget child;

  static const destinations = [
    NavDestination('Tổng quan', Icons.dashboard_outlined, '/manager'),
    NavDestination('Đơn hàng', Icons.receipt_long_outlined, '/manager/orders'),
    NavDestination('Lượt đặt', Icons.confirmation_number_outlined, '/manager/bookings'),
    NavDestination('Quản lý', Icons.tune, '/manager/more'),
    NavDestination('Tài khoản', Icons.person_outline, '/manager/me'),
  ];

  @override
  Widget build(BuildContext context) => RoleShell(destinations: destinations, location: location, child: child);
}

String _htx(BuildContext context) => context.read<AppState>().claims?.htxCode ?? '';
bool _canWrite(BuildContext context) => context.read<AppState>().claims?.canWriteHtx ?? false;

class _ReadOnlyNote extends StatelessWidget {
  const _ReadOnlyNote();
  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.only(top: 12),
    child: StatusChip('Chỉ xem (cán bộ)', color: AppColors.amber),
  );
}

class OverviewTab extends StatelessWidget {
  const OverviewTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final code = _htx(context);
    return LoadView<HtxSummary>(
      load: () => repo.summary(code),
      builder: (context, s, reload) => RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(s.htx, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            _Stat('Đơn chờ xác nhận', '${s.pendingOrders}', Icons.receipt_long_outlined),
            _Stat('Lượt đặt chờ xác nhận', '${s.pendingBookings}', Icons.hourglass_bottom),
            _Stat('Lượt đặt đã xác nhận', '${s.confirmedBookings}', Icons.event_available),
            _Stat('Đã thu', formatVnd(s.revenue), Icons.payments_outlined),
            if (!_canWrite(context)) const _ReadOnlyNote(),
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value, this.icon);
  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Card(
      child: ListTile(
        leading: Icon(icon, color: AppColors.teaGreen),
        title: Text(label),
        trailing: Text(value, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
      ),
    ),
  );
}

class OrdersTab extends StatelessWidget {
  const OrdersTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final code = _htx(context);
    return LoadView<List<Order>>(
      load: () => repo.listOrders(code),
      builder: (context, orders, reload) => RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Đơn hàng', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            if (orders.isEmpty) const SizedBox(height: 240, child: EmptyState('Chưa có đơn hàng')),
            for (final o in orders)
              Card(
                child: ListTile(
                  key: Key('m-order-${o.id}'),
                  title: Text('${o.code} · ${o.recipient}'),
                  subtitle: Text('${formatVnd(o.total)} · ${o.paymentStatus.label}'),
                  trailing: StatusChip(o.status.label, color: orderStatusColor(o.status)),
                  onTap: () async {
                    await context.push('/manager/orders/${o.id}');
                    await reload();
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class ManagerOrderDetailScreen extends StatelessWidget {
  const ManagerOrderDetailScreen({super.key, required this.orderId});
  final String orderId;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final code = _htx(context);
    final canWrite = _canWrite(context);
    final user = context.read<AppState>().claims?.name ?? '';
    return Scaffold(
      appBar: AppBar(title: const Text('Chi tiết đơn')),
      body: LoadView<Order?>(
        load: () async => (await repo.listOrders(code)).where((o) => o.id == orderId).firstOrNull,
        builder: (context, o, reload) {
          if (o == null) return const EmptyState('Không tìm thấy đơn');
          Future<void> run(Future<Object?> Function() action) async {
            try {
              await action();
              await reload();
            } on HubException catch (e) {
              if (context.mounted) showMessage(context, e.message);
            }
          }

          final forward = o.status.forward;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                children: [
                  Expanded(child: Text(o.code, style: Theme.of(context).textTheme.titleLarge)),
                  StatusChip(o.status.label, color: orderStatusColor(o.status)),
                ],
              ),
              const SizedBox(height: 8),
              for (final l in o.lines)
                ListTile(dense: true, title: Text('${l.name} x ${l.quantity}'), trailing: Text(formatVnd(l.subtotal))),
              const Divider(),
              InfoRow('Tổng', formatVnd(o.total)),
              InfoRow(
                'Thanh toán',
                '${o.method == PaymentMethod.vietQr ? 'VietQR' : 'Khi nhận hàng'} · ${o.paymentStatus.label}',
              ),
              InfoRow('Người nhận', o.recipient),
              InfoRow('Điện thoại', o.phone),
              InfoRow('Địa chỉ', o.address),
              if (!canWrite) const _ReadOnlyNote(),
              if (canWrite) ...[
                const SizedBox(height: 16),
                if (o.method == PaymentMethod.vietQr &&
                    o.paymentStatus != PaymentStatus.paid &&
                    o.status != OrderStatus.cancelled)
                  FilledButton.icon(
                    key: const Key('confirm-payment'),
                    icon: const Icon(Icons.price_check),
                    onPressed: () =>
                        run(() => repo.recordPayment(reference: o.code, amount: o.total, recordedBy: user)),
                    label: Text('Xác nhận đã nhận ${formatVnd(o.total)}'),
                  ),
                if (forward != null) ...[
                  const SizedBox(height: 8),
                  OutlinedButton(
                    key: const Key('advance-order'),
                    onPressed: () => run(() => repo.updateOrderStatus(o.id, forward)),
                    child: Text('Chuyển sang "${forward.label}"'),
                  ),
                ],
                if (o.status.canMoveTo(OrderStatus.cancelled))
                  TextButton(
                    onPressed: () => run(() => repo.updateOrderStatus(o.id, OrderStatus.cancelled)),
                    child: const Text('Huỷ đơn (trả lại hàng vào kho)'),
                  ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class BookingsTab extends StatelessWidget {
  const BookingsTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final code = _htx(context);
    return LoadView<List<Booking>>(
      load: () => repo.listBookings(code),
      builder: (context, bookings, reload) => RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Lượt đặt tour',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 12),
            if (bookings.isEmpty) const SizedBox(height: 240, child: EmptyState('Chưa có lượt đặt')),
            for (final b in bookings)
              Card(
                child: ListTile(
                  key: Key('m-booking-${b.id}'),
                  title: Text('${b.code} · ${b.contactName}'),
                  subtitle: Text(
                    '${b.tourName}\n${formatDate(b.departureDate)} · ${b.guests} khách · ${formatVnd(b.total)}',
                  ),
                  isThreeLine: true,
                  trailing: StatusChip(b.status.label, color: bookingStatusColor(b.status)),
                  onTap: () async {
                    await context.push('/manager/bookings/${b.id}');
                    await reload();
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class ManagerBookingDetailScreen extends StatelessWidget {
  const ManagerBookingDetailScreen({super.key, required this.bookingId});
  final String bookingId;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final code = _htx(context);
    final canWrite = _canWrite(context);
    final user = context.read<AppState>().claims?.name ?? '';
    return Scaffold(
      appBar: AppBar(title: const Text('Chi tiết lượt đặt')),
      body: LoadView<Booking?>(
        load: () async => (await repo.listBookings(code)).where((b) => b.id == bookingId).firstOrNull,
        builder: (context, b, reload) {
          if (b == null) return const EmptyState('Không tìm thấy lượt đặt');
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                children: [
                  Expanded(child: Text(b.code, style: Theme.of(context).textTheme.titleLarge)),
                  StatusChip(b.status.label, color: bookingStatusColor(b.status)),
                ],
              ),
              const SizedBox(height: 8),
              InfoRow('Tour', b.tourName),
              InfoRow('Ngày đi', formatDateLong(b.departureDate)),
              InfoRow('Liên hệ', '${b.contactName} · ${b.phone}'),
              InfoRow('Số khách', '${b.adults} người lớn, ${b.children} trẻ em'),
              InfoRow('Tổng tiền', formatVnd(b.total)),
              InfoRow('Thanh toán', b.paymentStatus.label),
              InfoRow('Điểm danh', b.checkedIn ? 'Đã đến' : 'Chưa'),
              if (!canWrite) const _ReadOnlyNote(),
              if (canWrite && b.paymentStatus != PaymentStatus.paid && b.status != BookingStatus.cancelled) ...[
                const SizedBox(height: 16),
                FilledButton.icon(
                  key: const Key('confirm-payment'),
                  icon: const Icon(Icons.price_check),
                  onPressed: () async {
                    try {
                      await repo.recordPayment(reference: b.code, amount: b.total, recordedBy: user);
                      await reload();
                    } on HubException catch (e) {
                      if (context.mounted) showMessage(context, e.message);
                    }
                  },
                  label: Text('Xác nhận đã nhận ${formatVnd(b.total)}'),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class MoreTab extends StatelessWidget {
  const MoreTab({super.key});

  @override
  Widget build(BuildContext context) {
    Widget tile(IconData icon, String title, String path) => Card(
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push(path),
      ),
    );
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Quản lý', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 12),
        tile(Icons.article_outlined, 'Tin tức', '/manager/articles'),
        const SizedBox(height: 8),
        tile(Icons.payments_outlined, 'Sổ thu tiền', '/manager/payments'),
        const SizedBox(height: 8),
        tile(Icons.hiking, 'Tour và sản phẩm', '/manager/catalog'),
      ],
    );
  }
}

class ManagerArticlesScreen extends StatelessWidget {
  const ManagerArticlesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final code = _htx(context);
    final canWrite = _canWrite(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Tin tức của HTX')),
      body: LoadView<List<Article>>(
        load: () => repo.listArticles(code),
        builder: (context, articles, reload) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            for (final a in articles)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(a.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                          ),
                          StatusChip(a.status.label),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(a.body, maxLines: 2, overflow: TextOverflow.ellipsis),
                      if (canWrite && (a.status == ArticleStatus.draft || a.status == ArticleStatus.rejected))
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            key: Key('submit-${a.id}'),
                            onPressed: () async {
                              await repo.submitArticle(a.id);
                              await reload();
                            },
                            child: const Text('Gửi duyệt'),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class ManagerPaymentsScreen extends StatelessWidget {
  const ManagerPaymentsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final code = _htx(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Sổ thu tiền')),
      body: LoadView<List<Payment>>(
        load: () => repo.listPayments(code),
        builder: (context, payments, _) => payments.isEmpty
            ? const EmptyState('Chưa có khoản thu nào')
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  for (final p in payments)
                    Card(
                      child: ListTile(
                        title: Text(p.reference),
                        subtitle: Text('${formatDateTime(p.recordedAt)} · ${p.recordedBy}'),
                        trailing: Text(formatVnd(p.amount), style: const TextStyle(fontWeight: FontWeight.w700)),
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}

class ManagerCatalogScreen extends StatelessWidget {
  const ManagerCatalogScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final code = _htx(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Tour và sản phẩm')),
      body: LoadView<(List<Tour>, List<Product>)>(
        load: () async => (await repo.listTours(htxCode: code), await repo.listProducts(htxCode: code)),
        builder: (context, data, _) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text('Chỉnh sửa tour, ngày khởi hành và sản phẩm sẽ làm cùng API ở mốc M2; hiện chỉ xem.'),
            const SectionTitle('Tour'),
            for (final t in data.$1)
              Card(
                child: ListTile(
                  title: Text(t.name),
                  subtitle: Text(t.durationLabel),
                  trailing: Text(formatVnd(t.adultPrice)),
                ),
              ),
            const SectionTitle('Sản phẩm'),
            for (final p in data.$2)
              Card(
                child: ListTile(
                  title: Text(p.name),
                  subtitle: Text('${formatVnd(p.price)} · ${p.unit}'),
                  trailing: Text('Kho: ${p.stock}'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class ManagerAccountTab extends StatelessWidget {
  const ManagerAccountTab({super.key});
  @override
  Widget build(BuildContext context) => const AccountTab();
}
