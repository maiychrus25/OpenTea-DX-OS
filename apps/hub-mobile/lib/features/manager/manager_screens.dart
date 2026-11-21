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

// The storefront work of a cooperative ("Gian hàng" in the drawer): products,
// product orders, their payments and news submitted for approval. Tours are the
// travel company's business and have no page here.

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

/// News a cooperative submits to the travel company for approval.
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
      // Tour money goes to the travel company; the cooperative's ledger shows orders only.
      load: () async => [
        for (final p in await repo.listPayments(code))
          if (!isTourReference(p.reference)) p,
      ],
      builder: (context, payments, reload) => _page(reload, [
        const PageHead('Thu tiền', subtitle: 'Tiền đơn hàng sản phẩm đã nhận. Sổ chỉ thêm, không sửa.'),
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

/// "Sản phẩm": the cooperative's products. Tours are listed by the travel company.
class ManagerProductsScreen extends StatelessWidget {
  const ManagerProductsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final code = _htx(context);
    return LoadView<List<Product>>(
      load: () => repo.listProducts(htxCode: code),
      builder: (context, products, reload) => _page(reload, [
        const PageHead('Sản phẩm', subtitle: 'Chỉnh sửa sản phẩm sẽ làm cùng API ở mốc M2; hiện chỉ xem.'),
        if (products.isEmpty)
          const StaffEmpty('HTX chưa có sản phẩm', icon: Icons.local_cafe_outlined)
        else
          Stack10([
            for (final p in products)
              RowCard(
                key: Key('m-product-${p.id}'),
                title: p.name,
                subtitle: '${formatVnd(p.price)} · ${p.unit}',
                trailing: p.stock == 0
                    ? const Pill('Hết hàng', tone: Tone.bad)
                    : Text('Kho: ${p.stock}', style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
          ]),
      ]),
    );
  }
}
