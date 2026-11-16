// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/cart_controller.dart';
import '../../shared/widgets.dart';

/// Bottom navigation of guest and customer.
class CustomerShell extends StatelessWidget {
  const CustomerShell({super.key, required this.location, required this.child});
  final String location;
  final Widget child;

  static const destinations = [
    NavDestination('Tin tức', Icons.newspaper, '/shop'),
    NavDestination('Tour', Icons.hiking, '/shop/tours'),
    NavDestination('Sản phẩm', Icons.local_cafe_outlined, '/shop/products'),
    NavDestination('Giỏ hàng', Icons.shopping_basket_outlined, '/shop/cart'),
    NavDestination('Tài khoản', Icons.person_outline, '/shop/me'),
  ];

  @override
  Widget build(BuildContext context) {
    final cartCount = context.watch<CartController>().itemCount;
    return RoleShell(destinations: destinations, location: location, badges: {'/shop/cart': cartCount}, child: child);
  }
}
