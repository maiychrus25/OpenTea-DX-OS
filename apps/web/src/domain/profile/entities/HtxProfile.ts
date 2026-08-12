// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface HtxProfile {
  id: string
  name: string
  address: string
  contact_phone: string | null
  contact_email: string | null
  crop_types: string[]
  season_label: string | null
  htx_code: string
  total_area_ha: number
}
