// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { DiseaseDetectionPort, DiseaseDetectionResult } from '@/domain/disease/ports/disease-detection.port'
import { CoreUnauthorizedError, CoreUnavailableError, ForbiddenError } from '@/domain/errors'
import { logger } from '@/lib/logger'

export class DiseaseApiAdapter implements DiseaseDetectionPort {
  /** The caller passes the user's core token (getCoreToken) so the adapter stays testable. */
  constructor(private readonly token: string) {}

  async predict(imageBlob: Blob): Promise<DiseaseDetectionResult> {
    const form = new FormData()
    form.append('file', imageBlob, 'diagnosis.jpg')

    try {
      const response = await fetch(`${process.env.CORE_GATEWAY_URL}/api/ai/disease/predict`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` },
        body: form,
        signal: AbortSignal.timeout(60000), // 60s timeout for slow CPU inference
      })

      if (!response.ok) {
        // Log only the status: the request carries the token.
        logger.error('Core gateway refused the disease request', { status: response.status })
        if (response.status === 401) throw new CoreUnauthorizedError()
        if (response.status === 403) throw new ForbiddenError('Bạn không có quyền dùng chẩn đoán bệnh')
        if (response.status >= 500) throw new CoreUnavailableError()
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
      if (error instanceof TypeError) {
        logger.error('Core gateway disease request failed', { cause: error })
        throw new CoreUnavailableError()
      }
      throw error // Propagate error to use case/route handler
    }
  }
}
