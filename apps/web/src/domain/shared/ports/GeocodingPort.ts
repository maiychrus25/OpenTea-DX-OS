// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export type GeocodingResult = {
  display_name: string
  lat: string
  lon: string
}

export interface GeocodingPort {
  search(query: string): Promise<GeocodingResult[]>
}
