// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import ManagerZones from '@/app/manager/farm-zones/_components/ManagerZones'

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
jest.mock('next/dynamic', () => () => () => null)

const parcel = (id: string, code: string, status: string) => ({ id, parcel_code: code, status, area_ha: 1.5, crop_type: 'Chè', household: { name: 'Hộ chè' }, polygon_geojson: null })

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [parcel('a', 'TC-1', 'TENDING'), parcel('b', 'TC-2', 'DRAFT')] }) })) as unknown as typeof fetch
})

it('counts the parcels, filters by status and gives the head no drawing action', async () => {
  render(<ManagerZones />)
  expect(await screen.findByRole('cell', { name: 'TC-1' })).toBeInTheDocument()
  expect(screen.getByText('3 ha')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Vẽ ranh giới/ })).not.toBeInTheDocument()
  expect(screen.getByText(/2 thửa chưa được vẽ ranh giới/)).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox', { name: 'Trạng thái' }), { target: { value: 'DRAFT' } })
  expect(screen.getByRole('cell', { name: 'TC-2' })).toBeInTheDocument()
  expect(screen.queryByRole('cell', { name: 'TC-1' })).not.toBeInTheDocument()
})
