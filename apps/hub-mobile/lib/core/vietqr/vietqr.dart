// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/// VietQR / NAPAS (EMVCo) payload for a bank transfer. The structure and the
/// bank list follow `miniapps/tea-tour/tea_tour/domain/vietqr.py` (branch
/// `feat/tea-tour-pro`). Nobody has scanned a code from this app with a real
/// banking app yet.
class Bank {
  const Bank(this.bin, this.name);
  final String bin;
  final String name;
}

const banks = <Bank>[
  Bank('970405', 'Agribank'),
  Bank('970446', 'Co-opBank'),
  Bank('970418', 'BIDV'),
  Bank('970415', 'VietinBank'),
  Bank('970436', 'Vietcombank'),
  Bank('970422', 'MB'),
  Bank('970407', 'Techcombank'),
  Bank('970416', 'ACB'),
  Bank('970432', 'VPBank'),
  Bank('970423', 'TPBank'),
  Bank('970403', 'Sacombank'),
  Bank('970437', 'HDBank'),
  Bank('970441', 'VIB'),
  Bank('970443', 'SHB'),
  Bank('970449', 'LPBank'),
  Bank('970431', 'Eximbank'),
  Bank('970426', 'MSB'),
  Bank('970448', 'OCB'),
  Bank('970440', 'SeABank'),
  Bank('970428', 'Nam A Bank'),
  Bank('970409', 'Bac A Bank'),
];

Bank? bankByBin(String bin) {
  for (final bank in banks) {
    if (bank.bin == bin) return bank;
  }
  return null;
}

/// Longest transfer note most banking apps accept.
const vietQrContentMax = 25;

String _field(String tag, String value) => '$tag${value.length.toString().padLeft(2, '0')}$value';

/// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) as 4 upper-case hex digits.
String crc16(String text) {
  var crc = 0xFFFF;
  for (final byte in text.codeUnits) {
    crc ^= (byte & 0xFF) << 8;
    for (var i = 0; i < 8; i++) {
      crc = (crc & 0x8000) != 0 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toRadixString(16).toUpperCase().padLeft(4, '0');
}

/// Builds the dynamic VietQR string (amount and note included).
/// Throws [ArgumentError] on bad input.
String buildVietQrPayload({
  required String bankBin,
  required String account,
  required int amountVnd,
  required String content,
}) {
  if (!RegExp(r'^[0-9]{6}$').hasMatch(bankBin)) {
    throw ArgumentError('BIN phải đủ 6 chữ số');
  }
  if (!RegExp(r'^[0-9]{6,19}$').hasMatch(account)) {
    throw ArgumentError('Số tài khoản phải từ 6 đến 19 chữ số');
  }
  if (amountVnd <= 0) throw ArgumentError('Số tiền phải lớn hơn 0');
  if (!RegExp(r'^[\x20-\x7E]+$').hasMatch(content) || content.length > vietQrContentMax) {
    throw ArgumentError('Nội dung chuyển khoản phải là chữ ASCII, tối đa $vietQrContentMax ký tự');
  }
  final beneficiary = _field('00', bankBin) + _field('01', account);
  final merchant = _field('00', 'A000000727') + _field('01', beneficiary) + _field('02', 'QRIBFTTA');
  final fields = [
    _field('00', '01'),
    _field('01', '12'),
    _field('38', merchant),
    _field('53', '704'),
    _field('54', amountVnd.toString()),
    _field('58', 'VN'),
    _field('62', _field('08', content)),
  ];
  final body = '${fields.join()}6304';
  return '$body${crc16(body)}';
}
