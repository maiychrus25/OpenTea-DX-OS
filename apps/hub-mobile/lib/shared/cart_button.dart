// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../app/cart_controller.dart';
import '../core/theme/app_theme.dart';

/// Round cart button for page headers: shows how many items are in the cart and opens it.
class CartButton extends StatelessWidget {
  const CartButton({super.key});

  @override
  Widget build(BuildContext context) {
    final count = context.watch<CartController>().itemCount;
    return Tooltip(
      message: 'Giỏ hàng',
      child: Material(
        color: Colors.white,
        shape: const CircleBorder(side: BorderSide(color: AppColors.border)),
        child: InkWell(
          key: const Key('page-cart'),
          customBorder: const CircleBorder(),
          onTap: () => context.go('/shop/cart'),
          child: SizedBox(
            width: 44,
            height: 44,
            child: Center(
              child: Badge(
                isLabelVisible: count > 0,
                label: Text('$count'),
                backgroundColor: AppColors.teaDark,
                child: const Icon(Icons.shopping_cart_outlined, size: 24, color: AppColors.teaDark),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
