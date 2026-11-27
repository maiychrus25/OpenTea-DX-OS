// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import PartnerMap from '@/components/features/partner-map/PartnerMap'
import FarmZoneReadOnly from '@/app/manager/farm-zones/_components/FarmZoneReadOnly'
import ZoneMap from '@/components/features/map/ZoneMap'
import L from 'leaflet'

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), info: jest.fn(), success: jest.fn() } }))
jest.mock('@/components/ui/Modal/Modal', () => ({
  Modal: ({ isOpen, children, title, onClose }: any) => isOpen ? <div role="dialog" aria-label={title}>{children}<button onClick={onClose}>Đóng</button></div> : null,
}))
jest.mock('leaflet', () => {
  const map = { on: jest.fn(), remove: jest.fn(), invalidateSize: jest.fn(), fitBounds: jest.fn(), flyTo: jest.fn(), flyToBounds: jest.fn() }
  const layer = () => ({ addTo: jest.fn().mockReturnThis(), remove: jest.fn(), clearLayers: jest.fn(), addLayer: jest.fn(), bindPopup: jest.fn().mockReturnThis(), setLatLng: jest.fn(), getBounds: () => ({ isValid: () => true }) })
  return {
    __esModule: true,
    Icon: { Default: Object.assign(function () {}, { mergeOptions: jest.fn() }) },
    default: {
      map: jest.fn(() => map), Icon: { Default: Object.assign(function () {}, { mergeOptions: jest.fn() }) },
      tileLayer: jest.fn(layer), layerGroup: jest.fn(layer), marker: jest.fn(layer), geoJSON: jest.fn(layer),
      latLngBounds: jest.fn((points) => points), control: { layers: jest.fn(layer) },
    },
  }
})

const partner = { id: 'partner-1', name: 'Đối tác thật', partner_type: 'BUYER', lat: 21.56, lng: 105.81, address: 'Tân Cương' }
const parcel = { id: 'parcel-1', parcel_code: 'TC-001', status: 'TENDING', area_ha: 1.25, crop_type: 'Chè', household: { name: 'Hộ chè' }, centroid_lat: 21.56, centroid_lng: 105.81, polygon_geojson: null }
const respond = (data: unknown, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => ({ data }) })

beforeEach(() => { jest.clearAllMocks(); global.fetch = jest.fn().mockResolvedValue(respond([])) })

test('partner map starts at Tan Cuong, has both credited layers, and opens the form only on request', async () => {
  render(<PartnerMap />)
  await screen.findByText('Công ty Chè Tân Thái')
  expect(screen.getByText('Mẫu')).toBeInTheDocument()
  expect(screen.queryByPlaceholderText('Nhập tên đối tác')).not.toBeInTheDocument()
  expect(L.map).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ center: [21.55, 105.80], zoom: 14 }))
  expect(L.control.layers).toHaveBeenCalledWith(expect.objectContaining({ 'Vệ tinh': expect.anything(), 'Đường phố': expect.anything() }), undefined, expect.anything())
  expect(L.tileLayer).toHaveBeenCalledWith(expect.stringContaining('arcgisonline'), expect.objectContaining({ attribution: expect.stringContaining('Esri') }))
  expect(L.tileLayer).toHaveBeenCalledWith(expect.stringContaining('openstreetmap'), expect.objectContaining({ attribution: expect.stringContaining('OpenStreetMap') }))
  fireEvent.click(screen.getByRole('button', { name: 'Thêm đối tác' }))
  expect(screen.getByPlaceholderText('Nhập tên đối tác')).toBeInTheDocument()
})

test('real partners replace samples; category chips filter both list and pins', async () => {
  global.fetch = jest.fn().mockResolvedValue(respond([partner, { ...partner, id: 'warehouse', name: 'Kho chè', partner_type: 'WAREHOUSE', lat: 21.57 }]))
  render(<PartnerMap />)
  await screen.findByText('Đối tác thật')
  expect(screen.queryByText('Mẫu')).not.toBeInTheDocument()
  expect((L.map as jest.Mock).mock.results[0].value.fitBounds).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /Nhà kho · 1/ }))
  expect(screen.queryByText('Đối tác thật')).not.toBeInTheDocument()
  expect(screen.getByText('Kho chè')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Xem dạng bảng/ })).toHaveAttribute('href', '/manager/partners')
})

test('a failed partner load does not masquerade as sample or empty data', async () => {
  global.fetch = jest.fn().mockResolvedValue(respond([], false))
  render(<PartnerMap />)
  expect(await screen.findByText('Không thể tải danh sách đối tác')).toBeInTheDocument()
  expect(screen.queryByText('Mẫu')).not.toBeInTheDocument()
})

test('map click opens partner form and preserves selected pin on create', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(respond([])).mockResolvedValueOnce(respond(partner))
  render(<PartnerMap />)
  await screen.findByText('Công ty Chè Tân Thái')
  const map = (L.map as jest.Mock).mock.results[0].value
  const click = map.on.mock.calls.find(([event]: string[]) => event === 'click')[1]
  act(() => click({ latlng: { lat: 21.56, lng: 105.81 } }))
  fireEvent.change(screen.getByPlaceholderText('Nhập tên đối tác'), { target: { value: 'Đối tác thật' } })
  fireEvent.click(screen.getByRole('button', { name: 'Thêm Đối Tác' }))
  await screen.findByText('Đối tác thật')
  expect(global.fetch).toHaveBeenLastCalledWith('/api/partners', expect.objectContaining({ method: 'POST', body: expect.stringContaining('"lat":21.56') }))
  expect(screen.queryByPlaceholderText('Nhập tên đối tác')).not.toBeInTheDocument()
})

test('edit and delete still use the existing API and confirmation flow', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(respond([partner])).mockResolvedValueOnce(respond({ ...partner, name: 'Đối tác sửa' })).mockResolvedValueOnce(respond({}))
  render(<PartnerMap />)
  await screen.findByText('Đối tác thật')
  fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa đối tác' }))
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByDisplayValue('Đối tác thật'), { target: { value: 'Đối tác sửa' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }))
  await screen.findByText('Đối tác sửa')
  expect(global.fetch).toHaveBeenLastCalledWith('/api/partners/partner-1', expect.objectContaining({ method: 'PUT' }))
  fireEvent.click(screen.getByRole('button', { name: 'Xóa đối tác' }))
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận xóa' }))
  await screen.findByText('Công ty Chè Tân Thái')
  expect(global.fetch).toHaveBeenLastCalledWith('/api/partners/partner-1', { method: 'DELETE' })
})

test('farm parcels without boundaries keep schematic samples, labels, setup link and disabled export', async () => {
  global.fetch = jest.fn().mockResolvedValue(respond([parcel]))
  render(<FarmZoneReadOnly />)
  const schematic = await screen.findByRole('region', { name: 'Sơ đồ thửa minh hoạ' })
  expect(within(schematic).getByText('Mẫu')).toBeInTheDocument()
  expect(within(schematic).getByText('TC-001')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Vẽ ranh giới ngay' })).toHaveAttribute('href', '/officer/farm-zones/setup')
  expect(screen.getByRole('button', { name: 'Xuất GeoJSON' })).toBeDisabled()
  expect(screen.getByRole('checkbox', { name: 'Đang chăm sóc' })).toBeChecked()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Đang chăm sóc' }))
  expect(screen.queryByRole('region', { name: 'Sơ đồ thửa minh hoạ' })).not.toBeInTheDocument()
})

test('zone map renders and fits polygons on the first mount even without centroids', async () => {
  const polygon = { type: 'Polygon', coordinates: [[[105.8, 21.55], [105.81, 21.55], [105.81, 21.56], [105.8, 21.55]]] }
  render(<ZoneMap parcels={[{ ...parcel, centroid_lat: null, centroid_lng: null, polygon_geojson: polygon } as any]} />)
  await waitFor(() => expect(L.geoJSON).toHaveBeenCalled())
  expect((L.map as jest.Mock).mock.results[0].value.fitBounds).toHaveBeenCalled()
})
