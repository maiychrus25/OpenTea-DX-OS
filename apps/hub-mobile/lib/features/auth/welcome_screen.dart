// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/theme/app_theme.dart';

/// First screen: browse as a guest or sign in.
class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(gradient: placeholderGradient(2)),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Spacer(),
                const Icon(Icons.eco, size: 72, color: Colors.white),
                const SizedBox(height: 16),
                Text(
                  'Về Xứ Chè',
                  textAlign: TextAlign.center,
                  style: Theme.of(
                    context,
                  ).textTheme.displaySmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                Text(
                  'Tour trải nghiệm và chè sạch từ các hợp tác xã',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(color: Colors.white.withValues(alpha: 0.9)),
                ),
                const Spacer(),
                FilledButton(
                  key: const Key('welcome-login'),
                  style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: AppColors.teaDark),
                  onPressed: () => context.go('/login'),
                  child: const Text('Đăng nhập'),
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  key: const Key('welcome-guest'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white),
                  ),
                  onPressed: () {
                    context.read<AppState>().continueAsGuest();
                    context.go('/shop');
                  },
                  child: const Text('Xem với tư cách khách'),
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
