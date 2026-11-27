// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import L from 'leaflet'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'

function esriTiles(service: string, options: L.TileLayerOptions = {}) {
  return L.tileLayer(`${ESRI}/${service}/MapServer/tile/{z}/{y}/{x}`, {
    attribution: 'Tiles &copy; Esri', maxNativeZoom: 19, maxZoom: 24, ...options,
  })
}

/**
 * Both base layers carry place names: a street map, and satellite imagery with
 * road and place labels on top. Switching never touches drawings or markers.
 */
export function addMapBaseLayers(map: L.Map, initial: 'street' | 'satellite' = 'street') {
  const street = esriTiles('World_Street_Map')
  const satellite = L.layerGroup([
    esriTiles('World_Imagery'),
    esriTiles('Reference/World_Transportation', { zIndex: 2 }),
    esriTiles('Reference/World_Boundaries_and_Places', { zIndex: 3 }),
  ])
  ;(initial === 'street' ? street : satellite).addTo(map)
  L.control.layers({ 'Bản đồ': street, 'Vệ tinh': satellite }, undefined, {
    position: 'topright', collapsed: false,
  }).addTo(map)
}
