// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/activity_controller.dart';
import '../../app/app_state.dart';
import '../../app/cart_controller.dart';
import '../../core/money/money.dart';
import '../../core/theme/app_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/catalog.dart';
import '../../data/models/order.dart';
import '../../shared/product_image.dart';
import '../../shared/soft_card.dart';
import '../../shared/widgets.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _recipient = TextEditingController();
  final _phone = TextEditingController();
  final _address = TextEditingController();
  final _note = TextEditingController();
  PaymentMethod _method = PaymentMethod.vietQr;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _recipient.text = context.read<AppState>().claims?.name ?? '';
  }

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
      appBar: AppBar(
        leading: const SafeBackButton(fallback: '/shop/cart'),
        title: const Text('Thanh toán'),
      ),
      body: cart.isEmpty
          ? const EmptyState('Giỏ hàng đang trống')
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              children: [
                _Section(
                  icon: Icons.location_on_outlined,
                  title: 'Thông tin nhận hàng',
                  child: Column(
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
                    ],
                  ),
                ),
                _Section(
                  icon: Icons.shopping_bag_outlined,
                  title: 'Sản phẩm',
                  child: Column(
                    children: [
                      for (final l in cart.lines)
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
                              Text(
                                formatVnd(l.unitPrice * l.quantity),
                                style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.teaDark),
                              ),
                            ],
                          ),
                        ),
                      FutureBuilder<Htx>(
                        future: context.read<HubRepository>().getHtx(cart.htxCode!),
                        builder: (context, snap) => snap.hasData
                            ? Align(
                                alignment: Alignment.centerLeft,
                                child: Padding(
                                  padding: const EdgeInsets.only(top: 6),
                                  child: Text(
                                    'Bán và giao bởi ${snap.data!.name}',
                                    style: const TextStyle(fontSize: 12.5, color: AppColors.faint),
                                  ),
                                ),
                              )
                            : const SizedBox.shrink(),
                      ),
                    ],
                  ),
                ),
                _Section(
                  icon: Icons.account_balance_wallet_outlined,
                  title: 'Hình thức thanh toán',
                  child: Column(
                    children: [
                      _MethodTile(
                        key: const Key('method-vietqr'),
                        icon: Icons.qr_code_2,
                        title: 'Chuyển khoản VietQR',
                        subtitle: 'Quét mã bằng app ngân hàng, tiền vào thẳng tài khoản hợp tác xã',
                        selected: _method == PaymentMethod.vietQr,
                        onTap: () => setState(() => _method = PaymentMethod.vietQr),
                      ),
                      const SizedBox(height: 10),
                      _MethodTile(
                        key: const Key('method-cod'),
                        icon: Icons.payments_outlined,
                        title: 'Trả tiền khi nhận hàng',
                        subtitle: 'Đưa tiền mặt cho người giao hàng',
                        selected: _method == PaymentMethod.cashOnDelivery,
                        onTap: () => setState(() => _method = PaymentMethod.cashOnDelivery),
                      ),
                    ],
                  ),
                ),
                _Section(
                  icon: Icons.receipt_long_outlined,
                  title: 'Chi tiết thanh toán',
                  child: Column(
                    children: [
                      _SumRow('Tiền hàng', formatVnd(cart.total)),
                      const _SumRow('Phí giao hàng', 'HTX báo sau'),
                      const Divider(height: 24),
                      _SumRow('Tổng thanh toán', formatVnd(cart.total), strong: true),
                    ],
                  ),
                ),
              ],
            ),
      bottomNavigationBar: cart.isEmpty
          ? null
          : Material(
              color: Colors.white,
              elevation: 8,
              child: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Tổng cộng', style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
                            Text(
                              formatVnd(cart.total),
                              key: const Key('checkout-total'),
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                                color: AppColors.teaDark,
                              ),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(
                        height: 52,
                        child: FilledButton(
                          key: const Key('checkout-submit'),
                          onPressed: _busy ? null : _submit,
                          child: const Padding(padding: EdgeInsets.symmetric(horizontal: 18), child: Text('Đặt hàng')),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
    );
  }
}

/// A white rounded block of the checkout with an icon and a title.
class _Section extends StatelessWidget {
  const _Section({required this.icon, required this.title, required this.child});
  final IconData icon;
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(top: 12),
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(22),
      border: Border.all(color: AppColors.border),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 20, color: AppColors.teaDark),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.ink),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        child,
      ],
    ),
  );
}

class _MethodTile extends StatelessWidget {
  const _MethodTile({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    borderRadius: BorderRadius.circular(16),
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: selected ? const Color(0xFFEAF3E4) : Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: selected ? AppColors.teaDark : AppColors.border, width: selected ? 1.5 : 1),
      ),
      child: Row(
        children: [
          Icon(icon, size: 26, color: AppColors.teaDark),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(subtitle, style: const TextStyle(fontSize: 12.5, height: 1.35, color: AppColors.muted)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Icon(
            selected ? Icons.check_circle : Icons.radio_button_unchecked,
            color: selected ? AppColors.teaDark : AppColors.faint,
          ),
        ],
      ),
    ),
  );
}

class _SumRow extends StatelessWidget {
  const _SumRow(this.label, this.value, {this.strong = false});
  final String label;
  final String value;
  final bool strong;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              color: strong ? AppColors.ink : AppColors.muted,
              fontWeight: strong ? FontWeight.w700 : FontWeight.w400,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: TextStyle(
              fontWeight: strong ? FontWeight.w800 : FontWeight.w600,
              fontSize: strong ? 18 : 14,
              color: strong ? AppColors.teaDark : AppColors.ink,
            ),
          ),
        ),
      ],
    ),
  );
}
