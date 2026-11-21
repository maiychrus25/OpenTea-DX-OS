// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:typed_data';

/// Shared sample classes, not a real classification or treatment guide.
const sampleDiseases = <(String, double)>[
  ('Đốm nâu (Brown blight)', 0.91),
  ('Thối búp (Bud blight)', 0.84),
  ('Rầy xanh gây cháy lá', 0.72),
  ('Lá khoẻ', 0.95),
  ('Chưa chắc chắn', 0.41),
];

/// Result of sending a leaf photo to the disease classifier (web: `POST /api/diagnosis`).
/// It carries the disease NAME and the CONFIDENCE only: never a treatment (AI invariant).
class DiagnosisReport {
  const DiagnosisReport({
    required this.id,
    required this.diseaseName,
    required this.confidence,
    required this.submittedAt,
    this.parcelCode,
    this.image,
    this.confirmed = false,
    this.serverUncertain,
  });
  final String id;
  final String diseaseName;

  /// 0 to 1.
  final double confidence;
  final DateTime submittedAt;
  final String? parcelCode;

  /// The photo that was sent, kept on the device for the result card.
  final Uint8List? image;

  /// True once the cooperative's officer confirmed the name.
  final bool confirmed;

  /// The classifier's own verdict when the server gave one.
  final bool? serverUncertain;

  /// The model is not sure and the farmer is asked to take a clearer photo: the server's verdict, or below 60%.
  bool get uncertain => serverUncertain ?? confidence < 0.6;
}
