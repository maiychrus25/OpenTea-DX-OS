// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../app/activity_controller.dart';
import '../../core/money/money.dart';
import '../../core/theme/app_theme.dart';
import '../../core/vietqr/vietqr.dart';
import '../../data/hub_repository.dart';
import '../../data/models/order.dart';
import '../../shared/widgets.dart';

/// Who receives the money of a payment and confirms it.
typedef _Payee = ({String name, String bankBin, String bankAccount, String accountHolder});

/// VietQR payment of an order or a booking, identified by its [code].
/// Product orders are paid to the cooperative, which confirms the money.
/// Tour bookings are paid to the travel company, which confirms the money.
class PaymentScreen extends StatelessWidget {
  const PaymentScreen({super.key, required this.code});
  final String code;

  @override
  Widget build(BuildContext context) {
    final activity = context.watch<ActivityController>();
    final order = activity.orderByCode(code);
    final booking = activity.bookingByCode(code);
    final amount = order?.total ?? booking?.total;
    final htxCode = order?.htxCode ?? booking?.htxCode;
    final status = order?.paymentStatus ?? booking?.paymentStatus;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Thanh toán VietQR'),
        leading: IconButton(icon: const Icon(Icons.close), onPressed: () => context.go('/shop/me')),
      ),
      body: amount == null || htxCode == null
          ? const EmptyState('Không tìm thấy đơn hoặc lượt đặt này')
          : LoadView<_Payee>(
              load: () async {
                final repo = context.read<HubRepository>();
                if (booking != null && order == null) {
                  final c = await repo.getTourCompany();
                  return (name: c.name, bankBin: c.bankBin, bankAccount: c.bankAccount, accountHolder: c.accountHolder);
                }
                final h = await repo.getHtx(htxCode);
                return (name: h.name, bankBin: h.bankBin, bankAccount: h.bankAccount, accountHolder: h.accountHolder);
              },
              builder: (context, payee, _) {
                final isBooking = order == null;
                final payload = buildVietQrPayload(
                  bankBin: payee.bankBin,
                  account: payee.bankAccount,
                  amountVnd: amount,
                  content: code,
                );
                final bank = bankByBin(payee.bankBin);
                final unpaid = status == PaymentStatus.unpaid;
                final who = isBooking ? 'Công ty du lịch' : 'Hợp tác xã';
                return ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          children: [
                            Text(
                              formatVnd(amount),
                              key: const Key('pay-amount'),
                              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                                fontWeight: FontWeight.w800,
                                color: AppColors.teaDark,
                              ),
                            ),
                            const SizedBox(height: 12),
                            // White background and quiet zone so banking apps can scan it.
                            Container(
                              color: Colors.white,
                              padding: const EdgeInsets.all(8),
                              child: QrImageView(key: const Key('pay-qr'), data: payload, size: 240),
                            ),
                            const SizedBox(height: 12),
                            InfoRow('Người nhận', payee.name),
                            InfoRow('Ngân hàng', bank?.name ?? payee.bankBin),
                            InfoRow('Số tài khoản', payee.bankAccount),
                            InfoRow('Chủ tài khoản', payee.accountHolder),
                            InfoRow('Nội dung', code),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: () async {
                        await Clipboard.setData(ClipboardData(text: code));
                        if (context.mounted) showMessage(context, 'Đã sao chép nội dung chuyển khoản');
                      },
                      icon: const Icon(Icons.copy),
                      label: const Text('Sao chép nội dung chuyển khoản'),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      isBooking
                          ? 'Tiền tour chuyển thẳng vào tài khoản của ${payee.name}. '
                                'Vé được xác nhận ngay khi bạn bấm "Tôi đã chuyển khoản".'
                          : 'Tiền hàng chuyển thẳng vào tài khoản của ${payee.name}. '
                                'Hợp tác xã xác nhận khi tiền về.',
                      key: const Key('pay-receiver-note'),
                    ),
                    const SizedBox(height: 12),
                    if (unpaid)
                      FilledButton(
                        key: const Key('pay-claim'),
                        onPressed: () async {
                          final sent = await context.read<ActivityController>().claimPayment(code);
                          if (!context.mounted) return;
                          if (isBooking) {
                            // A tour ticket is confirmed at once: go and show it.
                            showMessage(context, 'Đã xác nhận. Vé của bạn đã sẵn sàng.');
                            context.go('/shop/tickets/${booking!.id}');
                            return;
                          }
                          showMessage(
                            context,
                            sent
                                ? 'Đã báo $who. $who sẽ xác nhận khi tiền về.'
                                : 'Chưa có mạng: đã lưu trong máy, sẽ báo ${who.toLowerCase()} sau.',
                          );
                        },
                        child: const Text('Tôi đã chuyển khoản'),
                      )
                    else if (!isBooking)
                      Center(child: StatusChip(status!.label)),
                    TextButton(
                      onPressed: () =>
                          context.go(order != null ? '/shop/orders/${order.id}' : '/shop/tickets/${booking!.id}'),
                      child: Text(order != null ? 'Xem đơn hàng' : 'Xem vé'),
                    ),
                  ],
                );
              },
            ),
    );
  }
}
