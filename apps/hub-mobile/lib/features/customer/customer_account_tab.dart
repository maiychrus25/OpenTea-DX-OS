// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/activity_controller.dart';
import '../../app/app_state.dart';
import '../../app/cart_controller.dart';
import '../../core/role/role.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/soft_card.dart';

/// Account tab of guest and customer: the profile, shortcuts to orders, tickets and the cart, and sign out.
class CustomerAccountTab extends StatefulWidget {
  const CustomerAccountTab({super.key});

  @override
  State<CustomerAccountTab> createState() => _CustomerAccountTabState();
}

class _CustomerAccountTabState extends State<CustomerAccountTab> {
  @override
  void initState() {
    super.initState();
    // The counters of orders and tickets come from the activity: load them when the page opens.
    if (context.read<AppState>().claims != null) context.read<ActivityController>().refresh();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final claims = state.claims;
    final signedIn = claims != null;
    final cart = context.watch<CartController>();
    final activity = context.watch<ActivityController>();
    final name = claims?.name ?? '';
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        SoftCard(
          padding: const EdgeInsets.all(18),
          child: Row(
            children: [
              CircleAvatar(
                radius: 30,
                backgroundColor: AppColors.teaDark,
                child: signedIn && name.isNotEmpty
                    ? Text(
                        name.trim().split(' ').last.characters.first.toUpperCase(),
                        style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w700),
                      )
                    : const Icon(Icons.person, color: Colors.white, size: 30),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      claims?.name ?? 'Khách',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.ink),
                    ),
                    const SizedBox(height: 2),
                    Text(claims?.email ?? 'Chưa đăng nhập', style: const TextStyle(color: AppColors.muted)),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFFD8E8D1),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        roleLabel(state.role),
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.teaDark),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (signedIn) ...[
          Row(
            children: [
              Expanded(child: _Stat(Icons.receipt_long_outlined, '${activity.orders.length}', 'Đơn hàng')),
              const SizedBox(width: 10),
              Expanded(child: _Stat(Icons.confirmation_number_outlined, '${activity.bookings.length}', 'Vé tour')),
              const SizedBox(width: 10),
              Expanded(child: _Stat(Icons.shopping_cart_outlined, '${cart.itemCount}', 'Trong giỏ')),
            ],
          ),
          const SizedBox(height: 12),
          SoftCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                _MenuRow(
                  key: const Key('go-orders'),
                  icon: Icons.receipt_long_outlined,
                  title: 'Đơn hàng của tôi',
                  subtitle: 'Theo dõi và thanh toán đơn mua chè',
                  onTap: () => context.push('/shop/orders'),
                ),
                const Divider(height: 1, indent: 64),
                _MenuRow(
                  key: const Key('go-tickets'),
                  icon: Icons.confirmation_number_outlined,
                  title: 'Vé của tôi',
                  subtitle: 'Vé tham quan và mã QR',
                  onTap: () => context.push('/shop/tickets'),
                ),
                const Divider(height: 1, indent: 64),
                _MenuRow(
                  key: const Key('go-cart'),
                  icon: Icons.shopping_cart_outlined,
                  title: 'Giỏ hàng',
                  subtitle: cart.isEmpty ? 'Chưa có sản phẩm' : '${cart.itemCount} sản phẩm đang chọn',
                  onTap: () => context.go('/shop/cart'),
                ),
                const Divider(height: 1, indent: 64),
                _MenuRow(
                  key: const Key('go-notifications'),
                  icon: Icons.notifications_none,
                  title: 'Thông báo',
                  subtitle: 'Tin về đơn hàng và chuyến đi',
                  onTap: () => context.push('/shop/notifications'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 4),
          SizedBox(
            height: 52,
            child: OutlinedButton.icon(
              key: const Key('account-logout'),
              onPressed: () => state.signOut(),
              icon: const Icon(Icons.logout),
              label: const Text('Đăng xuất'),
            ),
          ),
        ] else ...[
          const SoftCard(
            child: Text(
              'Đăng nhập để đặt tour, mua hàng và xem đơn, vé của bạn.',
              style: TextStyle(height: 1.45, color: AppColors.muted),
            ),
          ),
          SizedBox(
            height: 52,
            child: FilledButton(
              key: const Key('account-login'),
              onPressed: () => context.go('/login'),
              child: const Text('Đăng nhập'),
            ),
          ),
        ],
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.icon, this.value, this.label);
  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(vertical: 14),
    decoration: BoxDecoration(color: AppColors.tile, borderRadius: BorderRadius.circular(18)),
    child: Column(
      children: [
        Icon(icon, size: 22, color: AppColors.teaDark),
        const SizedBox(height: 6),
        Text(
          value,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.teaDark),
        ),
        Text(label, style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
      ],
    ),
  );
}

class _MenuRow extends StatelessWidget {
  const _MenuRow({super.key, required this.icon, required this.title, required this.subtitle, required this.onTap});
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: AppColors.tile, borderRadius: BorderRadius.circular(12)),
            child: Icon(icon, size: 22, color: AppColors.teaDark),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5)),
                const SizedBox(height: 1),
                Text(subtitle, style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: AppColors.faint),
        ],
      ),
    ),
  );
}
