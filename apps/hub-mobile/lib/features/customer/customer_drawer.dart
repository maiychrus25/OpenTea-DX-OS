// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../app/cart_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

/// The full menu of guests and customers, opened from the menu icon of the home page.
class CustomerDrawer extends StatelessWidget {
  const CustomerDrawer({super.key, required this.location});
  final String location;

  void _go(BuildContext context, String path, {bool push = false}) {
    Navigator.of(context).pop();
    if (push) {
      context.push(path);
    } else {
      context.go(path);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final signedIn = state.claims != null;
    final cart = context.watch<CartController>().itemCount;

    Widget item(String key, IconData icon, String label, String path, {bool push = false, int badge = 0}) {
      final selected = !push && (path == '/shop' ? location == '/shop' : location.startsWith(path));
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
        child: Material(
          color: selected ? AppColors.lime : Colors.transparent,
          borderRadius: BorderRadius.circular(14),
          child: ListTile(
            key: Key('menu-$key'),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            leading: Icon(icon, color: AppColors.teaDark),
            title: Text(
              label,
              style: TextStyle(fontWeight: selected ? FontWeight.w800 : FontWeight.w600, color: AppColors.ink),
            ),
            trailing: badge > 0
                ? Badge(label: Text('$badge'), backgroundColor: AppColors.amber)
                : const Icon(Icons.chevron_right, color: AppColors.faint),
            onTap: () => _go(context, path, push: push),
          ),
        ),
      );
    }

    Widget group(String text) => Padding(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 4),
      child: Text(
        text,
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.faint),
      ),
    );

    return Drawer(
      backgroundColor: AppColors.cream,
      child: SafeArea(
        child: Column(
          children: [
            Container(
              width: double.infinity,
              color: AppColors.teaDark,
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 18),
              child: Row(
                children: [
                  const LeafLogo(size: 44),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Về Xứ Chè', style: serif(22, color: Colors.white)),
                        const SizedBox(height: 2),
                        Text(
                          signedIn ? (state.claims?.name ?? 'Khách hàng') : 'Bạn đang xem với tư cách khách',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          key: const Key('menu-user'),
                          style: const TextStyle(color: Color(0xCCFFFFFF), fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.only(bottom: 12),
                children: [
                  group('KHÁM PHÁ'),
                  item('home', Icons.home_outlined, 'Trang chủ', '/shop'),
                  item('tours', Icons.hiking, 'Tour trải nghiệm', '/shop/tours'),
                  item('products', Icons.local_mall_outlined, 'Sản phẩm', '/shop/products'),
                  item('news', Icons.newspaper_outlined, 'Tin tức', '/shop/news'),
                  group('CỦA TÔI'),
                  item('cart', Icons.shopping_cart_outlined, 'Giỏ hàng', '/shop/cart', badge: cart),
                  item('trips', Icons.event_note_outlined, 'Lịch trình', '/shop/trips'),
                  item('notifications', Icons.notifications_none, 'Thông báo', '/shop/notifications'),
                  if (signedIn) ...[
                    item('tickets', Icons.confirmation_number_outlined, 'Vé của tôi', '/shop/tickets', push: true),
                    item('orders', Icons.receipt_long_outlined, 'Đơn hàng', '/shop/orders', push: true),
                  ],
                  item('account', Icons.person_outline, 'Tài khoản', '/shop/me'),
                ],
              ),
            ),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(14),
              child: SizedBox(
                width: double.infinity,
                height: 48,
                child: signedIn
                    ? OutlinedButton.icon(
                        key: const Key('menu-signout'),
                        onPressed: () {
                          Navigator.of(context).pop();
                          state.signOut();
                        },
                        icon: const Icon(Icons.logout),
                        label: const Text('Đăng xuất'),
                      )
                    : FilledButton.icon(
                        key: const Key('menu-signin'),
                        onPressed: () => _go(context, '/login?from=${Uri.encodeComponent(location)}', push: true),
                        icon: const Icon(Icons.login),
                        label: const Text('Đăng nhập'),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
