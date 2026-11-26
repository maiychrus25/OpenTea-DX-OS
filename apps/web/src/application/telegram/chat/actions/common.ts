// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ParcelSummary } from '@/domain/farm/ports/ParcelPort'
import { visibleParcels } from '../tools/common'
import type { Choice, ChatUser } from '../types'

/** The parcels the user may pick, as choices labelled by parcel code. */
export async function parcelChoices(user: ChatUser, keep: (parcel: ParcelSummary) => boolean = () => true): Promise<Choice[]> {
  return (await visibleParcels(user)).filter(keep).map((parcel) => ({ value: parcel.id, label: parcel.parcel_code }))
}

/** The code of a parcel the user may see; the id when it is no longer in their list. */
export async function parcelCode(user: ChatUser, parcelId: string): Promise<string> {
  const parcel = (await visibleParcels(user)).find((candidate) => candidate.id === parcelId)
  return parcel?.parcel_code ?? parcelId
}
