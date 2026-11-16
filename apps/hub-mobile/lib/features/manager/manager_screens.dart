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
import '../../data/models/order.dart';
import '../../shared/widgets.dart' show LoadView, showMessage;
import '../staff/staff_format.dart';
import '../staff/staff_shell.dart';
import '../staff/staff_widgets.dart';

// The storefront work of a cooperative ("Gian hàng" in the drawer): orders,
// tour bookings, payments, news submitted for approval, tours and products.

String _htx(BuildContext context) => context.read<AppState>().claims?.htxCode ?? '';
bool _canWrite(BuildContext context) => context.read<AppState>().claims?.canWriteHtx ?? false;

Widget _page(Future<void> Function() reload, List<Widget> children) => RefreshIndicator(
  onRefresh: reload,
  child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 28), children: children),
);

class OrdersTab extends StatelessWidget {
  const OrdersTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final code = _htx(context);
    return LoadView<List<Order>>(
      load: () => repo.listOrders(code),
      builder: (context, orders, reload) => _page(reload, [
        PageHead(
          'Đơn hàng',
          subtitle: '${orders.where((o) => o.status == OrderStatus.pending).length} đơn chờ xác nhận',
        ),
        if (orders.isEmpty)
          const StaffEmpty('Chưa có đơn hàng', icon: Icons.receipt_long_outlined)
        else
          Stack10([
            for (final o in orders)
              RowCard(
                key: Key('m-order-${o.id}'),
                title: '${o.code} · ${o.recipient}',
                subtitle: '${formatVnd(o.total)} · ${o.paymentStatus.label}',
                trailing: Pill(o.status.label, tone: orderTone(o.status)),
                onTap: () async {
                  await context.push('/manager/orders/${o.id}');
                  await reload();
                },
              ),
          ]),
      ]),
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
    return DetailScaffold(
      title: 'Chi tiết đơn',
      body: LoadView<Order?>(
        load: () async => (await repo.listOrders(code)).where((o) => o.id == orderId).firstOrNull,
        builder: (context, o, reload) {
          if (o == null) return const StaffEmpty('Không tìm thấy đơn');
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
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(o.code, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                  ),
                  Pill(o.status.label, tone: orderTone(o.status)),
                ],
              ),
              const SizedBox(height: 8),
              for (final l in o.lines)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      Expanded(child: Text('${l.name} x ${l.quantity}')),
                      Text(formatVnd(l.subtotal)),
                    ],
                  ),
                ),
              const Divider(height: 24),
              DetailRow('Tổng', formatVnd(o.total)),
              DetailRow(
                'Thanh toán',
                '${o.method == PaymentMethod.vietQr ? 'VietQR' : 'Khi nhận hàng'} · ${o.paymentStatus.label}',
              ),
              DetailRow('Người nhận', o.recipient),
              DetailRow('Điện thoại', o.phone),
              DetailRow('Địa chỉ', o.address),
              if (!canWrite) ...[const SizedBox(height: 12), const InfoNote('Chỉ xem (cán bộ)')],
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
      builder: (context, bookings, reload) => _page(reload, [
        PageHead(
          'Lượt đặt tour',
          subtitle: '${bookings.where((b) => b.status == BookingStatus.pending).length} lượt chờ xác nhận',
        ),
        if (bookings.isEmpty)
          const StaffEmpty('Chưa có lượt đặt', icon: Icons.confirmation_number_outlined)
        else
          Stack10([
            for (final b in bookings)
              RowCard(
                key: Key('m-booking-${b.id}'),
                title: '${b.code} · ${b.contactName}',
                subtitle: b.tourName,
                meta: '${formatDate(b.departureDate)} · ${b.guests} khách · ${formatVnd(b.total)}',
                trailing: Pill(b.status.label, tone: bookingTone(b.status)),
                onTap: () async {
                  await context.push('/manager/bookings/${b.id}');
                  await reload();
                },
              ),
          ]),
      ]),
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
    return DetailScaffold(
      title: 'Chi tiết lượt đặt',
      body: LoadView<Booking?>(
        load: () async => (await repo.listBookings(code)).where((b) => b.id == bookingId).firstOrNull,
        builder: (context, b, reload) {
          if (b == null) return const StaffEmpty('Không tìm thấy lượt đặt');
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(b.code, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                  ),
                  Pill(b.status.label, tone: bookingTone(b.status)),
                ],
              ),
              const SizedBox(height: 8),
              DetailRow('Tour', b.tourName),
              DetailRow('Ngày đi', formatDateLong(b.departureDate)),
              DetailRow('Liên hệ', '${b.contactName} · ${b.phone}'),
              DetailRow('Số khách', '${b.adults} người lớn, ${b.children} trẻ em'),
              DetailRow('Tổng tiền', formatVnd(b.total)),
              DetailRow('Thanh toán', b.paymentStatus.label),
              DetailRow('Điểm danh', b.checkedIn ? 'Đã đến' : 'Chưa'),
              if (!canWrite) ...[const SizedBox(height: 12), const InfoNote('Chỉ xem (cán bộ)')],
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

/// Tour-related news a cooperative submits to the tour company for approval.
class ManagerArticlesScreen extends StatelessWidget {
  const ManagerArticlesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final code = _htx(context);
    final canWrite = _canWrite(context);
    return LoadView<List<Article>>(
      load: () => repo.listArticles(code),
      builder: (context, articles, reload) => _page(reload, [
        const PageHead('Bài viết của HTX', subtitle: 'Gửi duyệt rồi hiện ở ứng dụng khách.'),
        Stack10([
          for (final a in articles)
            RowCard(
              title: a.title,
              subtitle: a.body,
              trailing: Pill(a.status.label, tone: articleTone(a.status)),
              footer: canWrite && (a.status == ArticleStatus.draft || a.status == ArticleStatus.rejected)
                  ? Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton(
                        key: Key('submit-${a.id}'),
                        style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
                        onPressed: () async {
                          await repo.submitArticle(a.id);
                          await reload();
                        },
                        child: const Text('Gửi duyệt'),
                      ),
                    )
                  : null,
            ),
        ]),
      ]),
    );
  }
}

class ManagerPaymentsScreen extends StatelessWidget {
  const ManagerPaymentsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final code = _htx(context);
    return LoadView<List<Payment>>(
      load: () => repo.listPayments(code),
      builder: (context, payments, reload) => _page(reload, [
        const PageHead('Thu tiền', subtitle: 'Sổ ghi các khoản đã nhận, chỉ thêm không sửa.'),
        if (payments.isEmpty)
          const StaffEmpty('Chưa có khoản thu nào', icon: Icons.payments_outlined)
        else
          Stack10([
            for (final p in payments)
              RowCard(
                title: p.reference,
                subtitle: '${formatDateTime(p.recordedAt)} · ${p.recordedBy}',
                trailing: Text(formatVnd(p.amount), style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
          ]),
      ]),
    );
  }
}

class ManagerCatalogScreen extends StatelessWidget {
  const ManagerCatalogScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final code = _htx(context);
    return LoadView<(List<Tour>, List<Product>)>(
      load: () async => (await repo.listTours(htxCode: code), await repo.listProducts(htxCode: code)),
      builder: (context, data, reload) => _page(reload, [
        const PageHead(
          'Tour và sản phẩm',
          subtitle: 'Chỉnh sửa tour, ngày khởi hành và sản phẩm sẽ làm cùng API ở mốc M2; hiện chỉ xem.',
        ),
        SectionCard(
          title: 'Tour',
          child: Column(
            children: [
              for (final t in data.$1)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(t.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                            Text(t.durationLabel, style: const TextStyle(fontSize: 12.5, color: Color(0xFF5B6B62))),
                          ],
                        ),
                      ),
                      Text(formatVnd(t.adultPrice), style: const TextStyle(fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          title: 'Sản phẩm',
          child: Column(
            children: [
              for (final p in data.$2)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(p.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                            Text(
                              '${formatVnd(p.price)} · ${p.unit}',
                              style: const TextStyle(fontSize: 12.5, color: Color(0xFF5B6B62)),
                            ),
                          ],
                        ),
                      ),
                      Text('Kho: ${p.stock}'),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ]),
    );
  }
}
