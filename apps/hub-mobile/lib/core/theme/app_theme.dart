// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';

/// "Về Xứ Chè" look: warm cream paper, deep tea green, lime and amber accents,
/// serif headings (system serif, no bundled font) and pill shaped controls.
class AppColors {
  AppColors._();
  static const cream = Color(0xFFF2F6F1);
  static const paper = Color(0xFFFBFDFA);
  static const ink = Color(0xFF123F2B);
  static const teaDark = Color(0xFF17452F);
  static const teaDeeper = Color(0xFF0F3A27);
  static const teaGreen = Color(0xFF3F7D1A);
  static const leaf = Color(0xFF4D9B25);
  static const leafDark = Color(0xFF2F7A1D);
  static const lime = Color(0xFFD6F05C);
  static const limeButton = Color(0xFFB6E65C);
  static const tile = Color(0xFFE4EFD9);
  static const tileLight = Color(0xFFE7F0EA);
  static const amber = Color(0xFFB45309);
  static const amberSoft = Color(0xFFFDE8D2);
  static const noteBg = Color(0xFFFFF8E1);
  static const noteBorder = Color(0xFFC5B88F);
  static const border = Color(0xFFDDE6DC);
  static const muted = Color(0xFF3B5A48);
  static const faint = Color(0xFF5D6F63);
  static const danger = Color(0xFFB3261E);
}

const double cardRadius = 20;
const List<String> serifFallback = ['Georgia', 'Times New Roman', 'Noto Serif', 'serif'];

/// Serif style for headings.
TextStyle serif(
  double size, {
  Color color = AppColors.ink,
  FontWeight weight = FontWeight.w700,
  double height = 1.15,
}) => TextStyle(
  fontFamily: 'Georgia',
  fontFamilyFallback: serifFallback,
  fontSize: size,
  fontWeight: weight,
  color: color,
  height: height,
);

ThemeData buildAppTheme() {
  final scheme =
      ColorScheme.fromSeed(
        seedColor: AppColors.teaDark,
        brightness: Brightness.light,
        surface: AppColors.cream,
      ).copyWith(
        primary: AppColors.teaDark,
        onPrimary: Colors.white,
        secondary: AppColors.teaGreen,
        error: AppColors.danger,
      );
  const pill = StadiumBorder();
  final base = ThemeData(useMaterial3: true, colorScheme: scheme, scaffoldBackgroundColor: AppColors.cream);
  return base.copyWith(
    textTheme: base.textTheme
        .apply(bodyColor: AppColors.ink, displayColor: AppColors.ink)
        .copyWith(
          headlineMedium: serif(30),
          headlineSmall: serif(26),
          titleLarge: serif(21),
          titleMedium: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: AppColors.ink),
        ),
    appBarTheme: AppBarTheme(
      backgroundColor: AppColors.cream,
      foregroundColor: AppColors.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: serif(19),
      shape: const Border(bottom: BorderSide(color: AppColors.border)),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(cardRadius),
        side: const BorderSide(color: AppColors.border),
      ),
    ),
    listTileTheme: const ListTileThemeData(iconColor: AppColors.teaDark, textColor: AppColors.ink),
    dividerTheme: const DividerThemeData(color: AppColors.border),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.teaDark,
        foregroundColor: Colors.white,
        minimumSize: const Size(48, 52),
        shape: pill,
        textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.ink,
        minimumSize: const Size(48, 52),
        shape: pill,
        side: const BorderSide(color: AppColors.teaDark, width: 2),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppColors.teaGreen,
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(foregroundColor: AppColors.teaDark)),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.paper,
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(28),
        borderSide: const BorderSide(color: AppColors.teaDark, width: 2),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(28),
        borderSide: const BorderSide(color: AppColors.teaDark, width: 2),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(28),
        borderSide: const BorderSide(color: AppColors.teaGreen, width: 2.5),
      ),
      labelStyle: const TextStyle(color: AppColors.muted),
    ),
    chipTheme: base.chipTheme.copyWith(shape: pill, side: BorderSide.none),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: AppColors.teaDark,
      contentTextStyle: TextStyle(color: Colors.white),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      indicatorColor: Colors.transparent,
      height: 64,
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(color: s.contains(WidgetState.selected) ? AppColors.teaDark : AppColors.faint, size: 24),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => TextStyle(
          fontSize: 11,
          fontWeight: s.contains(WidgetState.selected) ? FontWeight.w800 : FontWeight.w500,
          color: s.contains(WidgetState.selected) ? AppColors.teaDark : AppColors.faint,
        ),
      ),
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

/// Fallback "photo": a deterministic tea-green gradient.
LinearGradient placeholderGradient(int seed) {
  final colors = _palettes[seed.abs() % _palettes.length];
  return LinearGradient(colors: colors, begin: Alignment.topLeft, end: Alignment.bottomRight);
}
