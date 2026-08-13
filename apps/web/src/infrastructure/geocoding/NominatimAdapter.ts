// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { GeocodingPort, GeocodingResult } from '@/domain/shared/ports/GeocodingPort'
import { DomainError } from '@/domain/errors'

const NOMINATIM_USER_AGENT = 'DX-AgriMarket/1.0 (contact@htx-md2.vn)'

export class NominatimGeocodingAdapter implements GeocodingPort {
  async search(query: string): Promise<GeocodingResult[]> {
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search')
      url.searchParams.append('q', query)
      url.searchParams.append('format', 'json')
      url.searchParams.append('addressdetails', '0')
      url.searchParams.append('limit', '5')

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': NOMINATIM_USER_AGENT,
        },
        // Cache is recommended by Nominatim. Next.js fetch cache is used here.
        next: { revalidate: 3600 }, 
      })

      if (!response.ok) {
        throw new DomainError('Geocoding service unavailable')
      }

      const data = await response.json()
      
      interface NominatimResponseItem {
        display_name: string;
        lat: string;
        lon: string;
      }

      // Map to GeocodingResult
      return data.map((item: NominatimResponseItem) => ({
        display_name: item.display_name,
        lat: item.lat,
        lon: item.lon,
      }))
    } catch (error) {
      if (error instanceof DomainError) throw error
      throw new DomainError('Geocoding failed')
    }
  }
}
