// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../app/cart_controller.dart';
import '../../core/money/money.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/product_image.dart';
import '../../shared/soft_card.dart';
import '../../shared/widgets.dart';

class CartTab extends StatefulWidget {
  const CartTab({super.key});

  @override
  State<CartTab> createState() => _CartTabState();
}

class _CartTabState extends State<CartTab> {
  @override
  void initState() {
    super.initState();
    // The "added to cart" message of the page before would sit on top of the checkout bar.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ScaffoldMessenger.of(context).clearSnackBars();
    });
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartController>();
    final signedIn = context.watch<AppState>().claims != null;
    if (cart.isEmpty) {
      return Column(
        children: [
          const Expanded(child: EmptyState('Giỏ hàng đang trống', icon: Icons.shopping_cart_outlined)),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            child: OutlinedButton(
              key: const Key('cart-browse'),
              onPressed: () => context.push('/shop/products'),
              child: const Text('Xem sản phẩm'),
            ),
          ),
        ],
      );
    }
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            children: [
              PageTitle('Giỏ hàng', subtitle: '${cart.itemCount} sản phẩm'),
              for (final l in cart.lines)
                SoftCard(
                  key: Key('cart-line-${l.productId}'),
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        width: 76,
                        child: ProductImage(
                          key: Key('product-image-${l.productId}'),
                          productId: l.productId,
                          seed: productSeedFromId(l.productId),
                          height: 76,
                          radius: 14,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Text(
                                    l.name,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(fontWeight: FontWeight.w700, height: 1.3),
                                  ),
                                ),
                                InkWell(
                                  key: Key('cart-remove-${l.productId}'),
                                  onTap: () => cart.setQuantity(l.productId, 0),
                                  customBorder: const CircleBorder(),
                                  child: const Padding(
                                    padding: EdgeInsets.all(4),
                                    child: Icon(Icons.close, size: 18, color: AppColors.faint),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${formatVnd(l.unitPrice)} · ${l.unit}',
                              style: const TextStyle(fontSize: 13, color: AppColors.muted),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                _Stepper(
                                  quantity: l.quantity,
                                  onMinus: () => cart.setQuantity(l.productId, l.quantity - 1),
                                  onPlus: () => cart.setQuantity(l.productId, l.quantity + 1),
                                  minusKey: Key('cart-minus-${l.productId}'),
                                  plusKey: Key('cart-plus-${l.productId}'),
                                ),
                                const Spacer(),
                                Text(
                                  formatVnd(l.unitPrice * l.quantity),
                                  style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.teaDark),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              SoftCard(
                child: Column(
                  children: [
                    KeyValueRow('Tiền hàng', formatVnd(cart.total)),
                    const KeyValueRow('Phí giao hàng', 'HTX báo sau'),
                    const Divider(height: 20),
                    KeyValueRow('Tạm tính', formatVnd(cart.total), strong: true),
                  ],
                ),
              ),
              Center(
                child: TextButton(
                  key: const Key('cart-clear'),
                  onPressed: cart.clear,
                  child: const Text('Xoá giỏ hàng', style: TextStyle(color: AppColors.muted)),
                ),
              ),
            ],
          ),
        ),
        Material(
          color: Colors.white,
          elevation: 8,
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
              child: Row(
                children: [
                  Expanded(
                    flex: 4,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Tổng cộng', style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
                        Text(
                          formatVnd(cart.total),
                          key: const Key('cart-total'),
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.teaDark),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 5,
                    child: SizedBox(
                      height: 52,
                      child: FilledButton(
                        key: const Key('cart-checkout'),
                        onPressed: () => context.push('/shop/checkout'),
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(signedIn ? 'Thanh toán' : 'Đăng nhập để thanh toán'),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({
    required this.quantity,
    required this.onMinus,
    required this.onPlus,
    required this.minusKey,
    required this.plusKey,
  });
  final int quantity;
  final VoidCallback onMinus;
  final VoidCallback onPlus;
  final Key minusKey;
  final Key plusKey;

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      border: Border.all(color: AppColors.border),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        InkWell(
          key: minusKey,
          customBorder: const CircleBorder(),
          onTap: onMinus,
          child: const Padding(
            padding: EdgeInsets.all(7),
            child: Icon(Icons.remove, size: 18, color: AppColors.teaDark),
          ),
        ),
        SizedBox(
          width: 28,
          child: Text(
            '$quantity',
            textAlign: TextAlign.center,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
          ),
        ),
        InkWell(
          key: plusKey,
          customBorder: const CircleBorder(),
          onTap: onPlus,
          child: const Padding(
            padding: EdgeInsets.all(7),
            child: Icon(Icons.add, size: 18, color: AppColors.teaDark),
          ),
        ),
      ],
    ),
  );
}
