// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';

/// Calm tea-green look ("Về Xứ Chè"): soft cream background, rounded cards,
/// gradients instead of photos.
class AppColors {
  AppColors._();
  static const teaGreen = Color(0xFF2F6B4F);
  static const teaDark = Color(0xFF1E4634);
  static const leaf = Color(0xFF7FB069);
  static const cream = Color(0xFFF5F7EE);
  static const amber = Color(0xFFC98A2B);
  static const danger = Color(0xFFB3412F);
}

const double cardRadius = 20;

ThemeData buildAppTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: AppColors.teaGreen,
    brightness: Brightness.light,
    surface: AppColors.cream,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.cream,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.cream,
      foregroundColor: AppColors.teaDark,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(cardRadius),
        side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.5)),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(48, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(48, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: AppColors.leaf.withValues(alpha: 0.3),
      labelTextStyle: WidgetStateProperty.all(const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
    ),
  );
}

const _palettes = <List<Color>>[
  [Color(0xFF2F6B4F), Color(0xFF9CCB86)],
  [Color(0xFF3E7C59), Color(0xFFD4E3A3)],
  [Color(0xFF1E4634), Color(0xFF7FB069)],
  [Color(0xFF5C7F3F), Color(0xFFE6E2A8)],
  [Color(0xFF2B5E5A), Color(0xFFA8D5BA)],
];

/// Placeholder "photo": a deterministic tea-green gradient.
LinearGradient placeholderGradient(int seed) {
  final colors = _palettes[seed.abs() % _palettes.length];
  return LinearGradient(colors: colors, begin: Alignment.topLeft, end: Alignment.bottomRight);
}
