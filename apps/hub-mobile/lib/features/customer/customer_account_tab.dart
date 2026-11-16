// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../common/account_tab.dart';

/// Account tab of guest and customer: orders and tickets for customers.
class CustomerAccountTab extends StatelessWidget {
  const CustomerAccountTab({super.key});

  @override
  Widget build(BuildContext context) {
    final signedIn = context.watch<AppState>().claims != null;
    return AccountTab(
      showTitle: false,
      extra: [
        if (signedIn) ...[
          Card(
            child: ListTile(
              key: const Key('go-orders'),
              leading: const Icon(Icons.receipt_long_outlined),
              title: const Text('Đơn hàng của tôi'),
              onTap: () => context.push('/shop/orders'),
            ),
          ),
          const SizedBox(height: 8),
          Card(
            child: ListTile(
              key: const Key('go-tickets'),
              leading: const Icon(Icons.confirmation_number_outlined),
              title: const Text('Vé của tôi'),
              onTap: () => context.push('/shop/tickets'),
            ),
          ),
        ] else
          const Padding(
            padding: EdgeInsets.all(8),
            child: Text('Đăng nhập để đặt tour, mua hàng và xem đơn, vé của bạn.'),
          ),
      ],
    );
  }
}
