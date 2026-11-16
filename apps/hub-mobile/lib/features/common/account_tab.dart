// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/role/role.dart';
import '../../core/theme/app_theme.dart';

/// "Tài khoản" tab used by every role. [extra] adds role specific entries.
class AccountTab extends StatelessWidget {
  const AccountTab({super.key, this.extra = const []});
  final List<Widget> extra;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final claims = state.claims;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Tài khoản', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const CircleAvatar(
                  radius: 28,
                  backgroundColor: AppColors.leaf,
                  child: Icon(Icons.person, color: Colors.white),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(claims?.name ?? 'Khách', style: Theme.of(context).textTheme.titleMedium),
                      Text(claims?.email ?? 'Chưa đăng nhập'),
                      Text(
                        roleLabel(state.role),
                        style: const TextStyle(color: AppColors.teaGreen, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        ...extra,
        const SizedBox(height: 12),
        if (claims == null)
          FilledButton(
            key: const Key('account-login'),
            onPressed: () => context.go('/login'),
            child: const Text('Đăng nhập'),
          )
        else
          OutlinedButton.icon(
            key: const Key('account-logout'),
            onPressed: () => state.signOut(),
            icon: const Icon(Icons.logout),
            label: const Text('Đăng xuất'),
          ),
      ],
    );
  }
}
