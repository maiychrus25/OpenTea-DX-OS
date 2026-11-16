// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/theme/staff_theme.dart';
import 'staff_nav.dart';
import 'staff_shell.dart';
import 'staff_widgets.dart';

/// "Hồ sơ" / "Tài khoản": who is signed in, and sign out. Same for all staff roles.
class StaffAccountPage extends StatelessWidget {
  const StaffAccountPage({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final claims = state.claims;
    final kind = staffKindOf(claims);
    final nav = navFor(kind ?? StaffKind.manager);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
      children: [
        const PageHead('Hồ sơ tài khoản'),
        SectionCard(
          title: claims?.name ?? '',
          child: Column(
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: StaffColors.secondary,
                    child: Text(
                      initialsOf(claims?.name ?? ''),
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: StaffColors.primary),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(claims?.email ?? '', style: const TextStyle(fontSize: 14)),
                        const SizedBox(height: 4),
                        Pill(nav.roleName, tone: Tone.ok),
                      ],
                    ),
                  ),
                ],
              ),
              if (claims?.htxCode != null) ...[const SizedBox(height: 12), DetailRow('Mã HTX', claims!.htxCode!)],
            ],
          ),
        ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          key: const Key('account-logout'),
          onPressed: state.signOut,
          icon: const Icon(Icons.logout),
          label: const Text('Đăng xuất'),
        ),
      ],
    );
  }
}
