// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';

import '../../shared/widgets.dart';
import 'customer_drawer.dart';

/// Bottom navigation of guest and customer: Khám phá, Reels (full-screen video feed, next to the home tab), Tour,
/// Lịch trình, Tài khoản.
/// Cart, orders, tours and products live under "Khám phá".
class CustomerShell extends StatelessWidget {
  const CustomerShell({super.key, required this.location, required this.child});
  final String location;
  final Widget child;

  static const destinations = [
    NavDestination('Khám phá', Icons.home_outlined, '/shop'),
    NavDestination('Reels', Icons.smart_display_outlined, '/shop/videos', opensOnTop: true),
    NavDestination('Tour', Icons.hiking, '/shop/tours'),
    NavDestination('Lịch trình', Icons.event_note_outlined, '/shop/trips'),
    NavDestination('Tài khoản', Icons.person_outline, '/shop/me'),
  ];

  static int indexFor(String location) {
    if (location.startsWith('/shop/tours')) return 2;
    if (location.startsWith('/shop/trips')) return 3;
    if (location.startsWith('/shop/me')) return 4;
    return 0;
  }

  /// Every storefront screen is served by the sample repository until the
  /// Gian hàng mini-app exists; only the account page holds no shop data.
  @override
  Widget build(BuildContext context) => RoleShell(
    destinations: destinations,
    location: location,
    indexFor: indexFor,
    drawer: CustomerDrawer(location: location),
    child: child,
  );
}
