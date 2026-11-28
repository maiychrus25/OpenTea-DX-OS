// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'

export interface DiseaseTrainingConsent { enabled: boolean; at: string | null; by: string | null }

const select = { disease_training_consent: true, disease_training_consent_at: true, disease_training_consent_by: true } as const
const view = (htx: { disease_training_consent: boolean; disease_training_consent_at: Date | null; disease_training_consent_by: string | null }): DiseaseTrainingConsent => ({
  enabled: htx.disease_training_consent,
  at: htx.disease_training_consent_at?.toISOString() ?? null,
  by: htx.disease_training_consent_by,
})

/** Whether a cooperative lets its confirmed disease photos train the tea model. Off until the head turns it on. */
export class PrismaDiseaseConsentRepository {
  async get(htxProfileId: string): Promise<DiseaseTrainingConsent> {
    return view(await prisma.htxProfile.findUniqueOrThrow({ where: { id: htxProfileId }, select }))
  }

  async set(htxProfileId: string, userId: string, enabled: boolean): Promise<DiseaseTrainingConsent> {
    return prisma.$transaction(async (tx) => {
      // Row audit events of this write name the person.
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${`user:${userId}`}, true)`
      return view(
        await tx.htxProfile.update({
          where: { id: htxProfileId },
          data: { disease_training_consent: enabled, disease_training_consent_at: new Date(), disease_training_consent_by: userId },
          select,
        })
      )
    })
  }
}
