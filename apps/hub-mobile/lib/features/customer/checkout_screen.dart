// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/activity_controller.dart';
import '../../app/app_state.dart';
import '../../app/cart_controller.dart';
import '../../core/money/money.dart';
import '../../data/hub_repository.dart';
import '../../data/models/order.dart';
import '../../shared/widgets.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  late final _recipient = TextEditingController(text: context.read<AppState>().claims?.name ?? '');
  final _phone = TextEditingController();
  final _address = TextEditingController();
  final _note = TextEditingController();
  PaymentMethod _method = PaymentMethod.vietQr;
  bool _busy = false;

  @override
  void dispose() {
    _recipient.dispose();
    _phone.dispose();
    _address.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final cart = context.read<CartController>();
    if (_recipient.text.trim().isEmpty || _phone.text.trim().length < 9 || _address.text.trim().isEmpty) {
      showMessage(context, 'Nhập đủ người nhận, số điện thoại và địa chỉ');
      return;
    }
    final activity = context.read<ActivityController>();
    final router = GoRouter.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final userId = context.read<AppState>().claims!.subject;
    setState(() => _busy = true);
    try {
      final order = await activity.placeOrder(
        NewOrder(
          customerId: userId,
          htxCode: cart.htxCode!,
          recipient: _recipient.text.trim(),
          phone: _phone.text.trim(),
          address: _address.text.trim(),
          note: _note.text.trim(),
          lines: cart.toOrderLines(),
          method: _method,
        ),
      );
      await cart.clear();
      router.go(
        _method == PaymentMethod.vietQr ? '/shop/pay/${Uri.encodeComponent(order.code)}' : '/shop/orders/${order.id}',
      );
    } on HubException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartController>();
    return Scaffold(
      appBar: AppBar(title: const Text('Thanh toán')),
      body: cart.isEmpty
          ? const EmptyState('Giỏ hàng đang trống')
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                TextField(
                  key: const Key('checkout-recipient'),
                  controller: _recipient,
                  decoration: const InputDecoration(labelText: 'Người nhận'),
                ),
                const SizedBox(height: 12),
                TextField(
                  key: const Key('checkout-phone'),
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Số điện thoại'),
                ),
                const SizedBox(height: 12),
                TextField(
                  key: const Key('checkout-address'),
                  controller: _address,
                  decoration: const InputDecoration(labelText: 'Địa chỉ giao hàng'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _note,
                  decoration: const InputDecoration(labelText: 'Ghi chú (không bắt buộc)'),
                ),
                const SectionTitle('Cách thanh toán'),
                RadioGroup<PaymentMethod>(
                  groupValue: _method,
                  onChanged: (v) => setState(() => _method = v ?? _method),
                  child: const Column(
                    children: [
                      RadioListTile<PaymentMethod>(value: PaymentMethod.vietQr, title: Text('Chuyển khoản VietQR')),
                      RadioListTile<PaymentMethod>(
                        value: PaymentMethod.cashOnDelivery,
                        title: Text('Trả tiền khi nhận hàng'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                Text('Tổng: ${formatVnd(cart.total)}', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 12),
                FilledButton(
                  key: const Key('checkout-submit'),
                  onPressed: _busy ? null : _submit,
                  child: const Text('Đặt hàng'),
                ),
              ],
            ),
    );
  }
}
