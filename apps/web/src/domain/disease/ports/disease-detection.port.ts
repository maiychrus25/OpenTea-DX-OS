// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface DiseaseDetectionResult {
  disease_name: string;
  confidence_score: number;
  // AI INVARIANT: MUST NOT CONTAIN treatment OR recommendation
}

export interface DiseaseDetectionPort {
  /**
   * Predicts crop disease from an image.
   * Throws an error if the AI service is unavailable.
   */
  predict(imageBlob: Blob): Promise<DiseaseDetectionResult>;
}
