// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/cart_controller.dart';
import '../../core/money/money.dart';
import '../../core/theme/app_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/cart.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart';

class ProductsTab extends StatelessWidget {
  const ProductsTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<List<Product>>(
      load: repo.listProducts,
      builder: (context, products, reload) => RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Sản phẩm', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            for (final p in products) ...[
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 84,
                        child: GradientBanner(
                          seed: p.gradientSeed,
                          icon: Icons.local_cafe_outlined,
                          height: 84,
                          radius: 16,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(p.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                            Text(p.unit, style: Theme.of(context).textTheme.bodySmall),
                            const SizedBox(height: 4),
                            Text(
                              formatVnd(p.price),
                              style: const TextStyle(color: AppColors.teaDark, fontWeight: FontWeight.w700),
                            ),
                            if (p.stock == 0) const StatusChip('Hết hàng', color: AppColors.danger),
                            if (p.stock > 0 && p.stock <= 5) StatusChip('Chỉ còn ${p.stock}', color: AppColors.amber),
                          ],
                        ),
                      ),
                      IconButton.filled(
                        key: Key('add-${p.id}'),
                        onPressed: p.stock == 0 ? null : () => _add(context, p),
                        icon: const Icon(Icons.add_shopping_cart),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 10),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _add(BuildContext context, Product p) async {
    final result = await context.read<CartController>().add(p);
    if (!context.mounted) return;
    showMessage(context, switch (result) {
      CartAddResult.added => 'Đã thêm "${p.name}" vào giỏ',
      CartAddResult.otherHtx => 'Giỏ hàng chỉ chứa sản phẩm của một HTX. Hãy thanh toán hoặc xoá giỏ trước.',
      CartAddResult.outOfStock => 'Không đủ hàng trong kho',
    });
  }
}
