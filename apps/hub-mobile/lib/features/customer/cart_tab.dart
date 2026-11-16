// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../app/cart_controller.dart';
import '../../core/money/money.dart';
import '../../shared/product_image.dart';
import '../../shared/widgets.dart';

class CartTab extends StatelessWidget {
  const CartTab({super.key});

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartController>();
    final signedIn = context.watch<AppState>().claims != null;
    if (cart.isEmpty) return const EmptyState('Giỏ hàng đang trống', icon: Icons.shopping_basket_outlined);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      children: [
        const PageTitle('Giỏ hàng'),
        for (final l in cart.lines)
          Card(
            child: ListTile(
              leading: SizedBox(
                width: 52,
                child: ProductImage(
                  key: Key('product-image-${l.productId}'),
                  seed: productSeedFromId(l.productId),
                  height: 52,
                  radius: 10,
                ),
              ),
              title: Text(l.name),
              subtitle: Text('${formatVnd(l.unitPrice)} · ${l.unit}'),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    onPressed: () => cart.setQuantity(l.productId, l.quantity - 1),
                    icon: const Icon(Icons.remove_circle_outline),
                  ),
                  Text('${l.quantity}'),
                  IconButton(
                    onPressed: () => cart.setQuantity(l.productId, l.quantity + 1),
                    icon: const Icon(Icons.add_circle_outline),
                  ),
                ],
              ),
            ),
          ),
        const SizedBox(height: 12),
        Text(
          'Tổng: ${formatVnd(cart.total)}',
          key: const Key('cart-total'),
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 12),
        FilledButton(
          key: const Key('cart-checkout'),
          onPressed: () => context.push('/shop/checkout'),
          child: Text(signedIn ? 'Thanh toán' : 'Đăng nhập để thanh toán'),
        ),
        TextButton(onPressed: cart.clear, child: const Text('Xoá giỏ hàng')),
      ],
    );
  }
}
