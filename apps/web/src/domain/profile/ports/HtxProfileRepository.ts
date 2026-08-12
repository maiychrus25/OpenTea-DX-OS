// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { type HtxProfile } from '@/domain/profile/entities/HtxProfile'
import { type HtxProfileUpdateInput } from '@/domain/profile/schemas/htxProfileSchema'

export interface HtxProfileRepository {
  getProfile(): Promise<HtxProfile | null>
  updateProfile(data: HtxProfileUpdateInput): Promise<HtxProfile>
}
