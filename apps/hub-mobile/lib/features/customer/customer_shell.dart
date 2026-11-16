// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';

import '../../shared/widgets.dart';

/// Bottom navigation of guest and customer: Khám phá, Bản đồ, Lịch trình, Đã lưu.
/// Cart, orders, tours and products live under "Khám phá".
class CustomerShell extends StatelessWidget {
  const CustomerShell({super.key, required this.location, required this.child});
  final String location;
  final Widget child;

  static const destinations = [
    NavDestination('Khám phá', Icons.explore_outlined, '/shop'),
    NavDestination('Bản đồ', Icons.place_outlined, '/shop/map'),
    NavDestination('Lịch trình', Icons.event_note_outlined, '/shop/trips'),
    NavDestination('Đã lưu', Icons.bookmark_border, '/shop/saved'),
  ];

  static int indexFor(String location) {
    if (location.startsWith('/shop/map')) return 1;
    if (location.startsWith('/shop/trips')) return 2;
    if (location.startsWith('/shop/saved')) return 3;
    return 0;
  }

  @override
  Widget build(BuildContext context) =>
      RoleShell(destinations: destinations, location: location, indexFor: indexFor, child: child);
}
