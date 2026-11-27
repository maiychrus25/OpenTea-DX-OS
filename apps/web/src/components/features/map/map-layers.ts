// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import L from 'leaflet'

/** Native Leaflet radios switch only the base layer, never drawings or markers. */
export function addMapBaseLayers(map: L.Map) {
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri', maxNativeZoom: 19, maxZoom: 24,
  }).addTo(map)
  const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxNativeZoom: 19, maxZoom: 24,
  })
  L.control.layers({ 'Vệ tinh': satellite, 'Đường phố': street }, undefined, {
    position: 'topright', collapsed: false,
  }).addTo(map)
}
