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
import '../../data/models/catalog.dart';
import '../../data/models/order.dart';
import '../../shared/widgets.dart';

/// VietQR payment of an order or a booking, identified by its [code].
/// Money goes straight to the cooperative's account; the manager confirms it.
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
          : LoadView<Htx>(
              load: () => context.read<HubRepository>().getHtx(htxCode),
              builder: (context, htx, _) {
                final payload = buildVietQrPayload(
                  bankBin: htx.bankBin,
                  account: htx.bankAccount,
                  amountVnd: amount,
                  content: code,
                );
                final bank = bankByBin(htx.bankBin);
                final unpaid = status == PaymentStatus.unpaid;
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
                            InfoRow('Ngân hàng', bank?.name ?? htx.bankBin),
                            InfoRow('Số tài khoản', htx.bankAccount),
                            InfoRow('Chủ tài khoản', htx.accountHolder),
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
                    const Text('Tiền chuyển thẳng vào tài khoản của HTX. HTX sẽ xác nhận khi nhận được tiền.'),
                    const SizedBox(height: 12),
                    if (unpaid)
                      FilledButton(
                        key: const Key('pay-claim'),
                        onPressed: () async {
                          final sent = await context.read<ActivityController>().claimPayment(code);
                          if (context.mounted) {
                            showMessage(
                              context,
                              sent
                                  ? 'Đã báo HTX. HTX sẽ xác nhận khi nhận được tiền.'
                                  : 'Chưa có mạng: đã lưu trong máy, sẽ báo HTX sau.',
                            );
                          }
                        },
                        child: const Text('Tôi đã chuyển khoản'),
                      )
                    else
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
