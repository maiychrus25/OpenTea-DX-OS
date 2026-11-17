// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:typed_data';

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

  /// Below this the model is not sure and the farmer is asked to take a clearer photo.
  bool get uncertain => confidence < 0.6;
}
