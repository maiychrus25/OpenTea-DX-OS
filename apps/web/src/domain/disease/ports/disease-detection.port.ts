// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import type { DiseaseModel } from '../select-disease-model'

export interface DiseaseDetectionResult {
  /** null only when `uncertain`: the model gave no name. */
  disease_name: string | null;
  confidence_score: number;
  uncertain: boolean;
  // AI INVARIANT: MUST NOT CONTAIN treatment OR recommendation
}

export interface DiseaseDetectionPort {
  /**
   * Predicts crop disease from an image with the given model.
   * Throws an error if the AI service or that model is unavailable; never falls back to another model.
   */
  predict(imageBlob: Blob, model: DiseaseModel): Promise<DiseaseDetectionResult>;
}
