// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';

/// Colours of the DX-OS web app (apps/web), used by every staff screen.
/// The storefront for guests and customers keeps its own look in `app_theme.dart`.
class StaffColors {
  StaffColors._();
  static const primary = Color(0xFF176C4B);
  static const lime = Color(0xFFD6F05C);
  static const sidebar = Color(0xFF143C2D);
  static const sidebarDeep = Color(0xFF0E271D);
  static const background = Color(0xFFF5F7F3);
  static const card = Colors.white;
  static const border = Color(0xFFE2E8F0);
  static const secondary = Color(0xFFE7F0EA);
  static const ink = Color(0xFF19231E);
  static const muted = Color(0xFF5B6B62);
  static const faint = Color(0xFF8A978F);
  static const ok = Color(0xFF176C4B);
  static const okSoft = Color(0xFFE2F1E8);
  static const warn = Color(0xFF9A5B00);
  static const warnSoft = Color(0xFFFDF0D2);
  static const bad = Color(0xFFB3261E);
  static const badSoft = Color(0xFFFBE4E1);
  static const neutral = Color(0xFF475569);
  static const neutralSoft = Color(0xFFEAEFEC);
}

const double staffRadius = 16;

ThemeData buildStaffTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: StaffColors.primary, brightness: Brightness.light).copyWith(
    primary: StaffColors.primary,
    onPrimary: Colors.white,
    secondary: StaffColors.secondary,
    onSecondary: StaffColors.primary,
    surface: StaffColors.background,
    error: StaffColors.bad,
  );
  final base = ThemeData(useMaterial3: true, colorScheme: scheme, scaffoldBackgroundColor: StaffColors.background);
  final rounded = RoundedRectangleBorder(borderRadius: BorderRadius.circular(12));
  return base.copyWith(
    textTheme: base.textTheme.apply(bodyColor: StaffColors.ink, displayColor: StaffColors.ink),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: StaffColors.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: StaffColors.ink),
      shape: Border(bottom: BorderSide(color: StaffColors.border)),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(staffRadius),
        side: const BorderSide(color: StaffColors.border),
      ),
    ),
    listTileTheme: const ListTileThemeData(iconColor: StaffColors.primary, textColor: StaffColors.ink),
    dividerTheme: const DividerThemeData(color: StaffColors.border, space: 1),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: StaffColors.primary,
        foregroundColor: Colors.white,
        minimumSize: const Size(48, 48),
        shape: rounded,
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: StaffColors.primary,
        minimumSize: const Size(48, 48),
        shape: rounded,
        side: const BorderSide(color: StaffColors.primary),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: StaffColors.primary,
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(foregroundColor: StaffColors.ink)),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: StaffColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: StaffColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: StaffColors.primary, width: 2),
      ),
      labelStyle: const TextStyle(color: StaffColors.muted),
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: StaffColors.sidebar,
      contentTextStyle: TextStyle(color: Colors.white),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      indicatorColor: StaffColors.secondary,
      height: 64,
      iconTheme: WidgetStateProperty.resolveWith(
        (s) =>
            IconThemeData(color: s.contains(WidgetState.selected) ? StaffColors.primary : StaffColors.muted, size: 22),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => TextStyle(
          fontSize: 11,
          fontWeight: s.contains(WidgetState.selected) ? FontWeight.w800 : FontWeight.w500,
          color: s.contains(WidgetState.selected) ? StaffColors.primary : StaffColors.muted,
        ),
      ),
    ),
  );
}
