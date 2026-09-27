// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { DiseaseDetectionPort, DiseaseDetectionResult } from '@/domain/disease/ports/disease-detection.port'

export class DiseaseApiAdapter implements DiseaseDetectionPort {
  private readonly apiUrl: string

  constructor(apiUrl?: string) {
    this.apiUrl = apiUrl || process.env.DISEASE_API_URL || 'http://disease-api:8000'
  }

  async predict(imageBlob: Blob): Promise<DiseaseDetectionResult> {
    const form = new FormData()
    form.append('file', imageBlob, 'diagnosis.jpg')

    try {
      const response = await fetch(`${this.apiUrl}/predict`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(60000), // 60s timeout for slow CPU inference
      })

      if (!response.ok) {
        throw new Error(`Disease API returned status ${response.status}`)
      }

      const prediction = await response.json()

      // Map to strictly defined fields and ignore EVERYTHING else to enforce AI Invariant
      return {
        disease_name: prediction.disease_name_vi,
        confidence_score: prediction.confidence,
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error('Disease API timeout')
      }
      throw error // Propagate error to use case/route handler
    }
  }
}
