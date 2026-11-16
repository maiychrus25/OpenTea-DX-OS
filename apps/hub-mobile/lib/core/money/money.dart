// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/// Money is always whole Vietnamese dong (VND has no minor unit), kept as int.
String formatVnd(int amount) {
  final negative = amount < 0;
  final digits = amount.abs().toString();
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write('.');
    buffer.write(digits[i]);
  }
  return '${negative ? '-' : ''}$buffer ₫';
}

/// Parses text such as "1.250.000", "1250000 đ" or "1,250,000" to whole dong.
/// Returns null when there are no digits or the text has other characters.
int? parseVnd(String input) {
  final cleaned = input.replaceAll(RegExp(r'[\s.,₫đĐ]|VND', caseSensitive: false), '');
  if (cleaned.isEmpty || !RegExp(r'^[0-9]+$').hasMatch(cleaned)) return null;
  return int.parse(cleaned);
}
