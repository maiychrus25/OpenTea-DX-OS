// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/core/format/formatting.dart';
import 'package:hub_mobile/core/money/money.dart';

void main() {
  group('formatVnd', () {
    test('groups thousands with dots', () {
      expect(formatVnd(0), '0 ₫');
      expect(formatVnd(999), '999 ₫');
      expect(formatVnd(1000), '1.000 ₫');
      expect(formatVnd(1250000), '1.250.000 ₫');
      expect(formatVnd(100000000), '100.000.000 ₫');
    });
    test('negative amounts (refunds) keep the sign', () {
      expect(formatVnd(-350000), '-350.000 ₫');
    });
  });

  group('parseVnd', () {
    test('accepts common spellings', () {
      expect(parseVnd('1.250.000'), 1250000);
      expect(parseVnd('1,250,000 đ'), 1250000);
      expect(parseVnd(' 90000 ₫ '), 90000);
      expect(parseVnd('500 VND'), 500);
    });
    test('rejects text without a clean number', () {
      expect(parseVnd(''), isNull);
      expect(parseVnd('abc'), isNull);
      expect(parseVnd('12a3'), isNull);
    });
    test('round trips with formatVnd', () {
      for (final v in [0, 5, 1234, 987654321]) {
        expect(parseVnd(formatVnd(v)), v);
      }
    });
  });

  group('formatting', () {
    test('dates', () {
      expect(formatDate(DateTime(2026, 11, 5)), '05/11/2026');
      expect(formatDateTime(DateTime(2026, 11, 5, 7, 3)), '05/11/2026 07:03');
      expect(formatDateLong(DateTime(2026, 11, 21)), 'Thứ bảy, 21/11/2026');
    });
    test('stripDiacritics makes a bank-note-safe string', () {
      expect(stripDiacritics('Nguyễn Thị Đào'), 'Nguyen Thi Dao');
      expect(stripDiacritics('Chè Tân Cương'), 'Che Tan Cuong');
      expect(stripDiacritics('ĐƠN HÀNG 01'), 'DON HANG 01');
    });
  });
}
