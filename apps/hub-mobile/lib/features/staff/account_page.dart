// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/theme/staff_theme.dart';
import '../shorts/shorts_section.dart';
import 'staff_nav.dart';
import 'staff_shell.dart';
import 'staff_widgets.dart';

/// Identity comes only from the signed-in claims, for every staff role.
class StaffAccountPage extends StatelessWidget {
  const StaffAccountPage({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final claims = state.claims;
    final kind = staffKindOf(claims);
    final nav = navFor(kind ?? StaffKind.manager);
    final htxCode = claims?.htxCode;
    return LayoutBuilder(
      builder: (context, constraints) {
        final gutter = constraints.maxWidth > 672 ? (constraints.maxWidth - 640) / 2 : 16.0;
        return ListView(
          padding: EdgeInsets.fromLTRB(gutter, 16, gutter, 28),
          children: [
            const PageHead('Hồ sơ tài khoản', compact: true),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 32,
                    backgroundColor: StaffColors.neutralSoft,
                    child: Text(
                      initialsOf(claims?.name ?? ''),
                      style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600, color: StaffColors.ink),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          claims?.name ?? '',
                          style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w600, height: 1.3),
                        ),
                        const SizedBox(height: 8),
                        Pill(nav.roleName),
                        if (htxCode != null && htxCode.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Mã HTX · $htxCode',
                            style: const TextStyle(fontSize: 13, color: StaffColors.muted, height: 1.4),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            SectionCard(
              title: 'Thông tin & tiện ích',
              divided: true,
              padded: false,
              child: Column(
                children: [
                  StaffListRow(title: 'Email', subtitle: claims?.email ?? ''),
                  if (kind != StaffKind.guide) ...[
                    const Divider(height: 1, indent: 16, endIndent: 16),
                    StaffListRow(
                      title: 'Thông báo',
                      onTap: () =>
                          context.go(kind == StaffKind.farmer ? '/farmer/notifications' : '/manager/notifications'),
                    ),
                  ],
                  if (kind == StaffKind.manager) ...[
                    const Divider(height: 1, indent: 16, endIndent: 16),
                    StaffListRow(title: 'Hồ sơ HTX', onTap: () => context.go('/manager/profile')),
                  ],
                  if (kind == StaffKind.manager || kind == StaffKind.officer) ...[
                    const Divider(height: 1, indent: 16, endIndent: 16),
                    StaffListRow(title: 'Tour', onTap: () => context.push('/manager/tours')),
                  ],
                  if (kind == StaffKind.guide) ...[
                    const Divider(height: 1, indent: 16, endIndent: 16),
                    StaffListRow(title: 'Lộ trình các tour được giao', onTap: () => context.go('/guide/schedule')),
                    StaffListRow(title: 'Thông báo', onTap: () => context.go('/guide/notifications')),
                  ],
                ],
              ),
            ),
            if (claims != null) const ShortsSection(),
            const SizedBox(height: 24),
            OutlinedButton.icon(
              key: const Key('account-logout'),
              onPressed: state.signOut,
              style: OutlinedButton.styleFrom(
                foregroundColor: StaffColors.ink,
                side: const BorderSide(color: StaffColors.border),
                minimumSize: const Size(44, 48),
              ),
              icon: const Icon(Icons.logout, size: 20),
              label: const Text('Đăng xuất'),
            ),
          ],
        );
      },
    );
  }
}
