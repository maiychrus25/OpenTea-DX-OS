// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ApproveHarvestButton } from '@/components/features/schedule/ApproveHarvestButton'

const inDays = (n: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d.toISOString() }

test('is disabled with the days left when canApprove is false', () => {
  const safe = inDays(5)
  render(<ApproveHarvestButton parcelId="p1" parcelCode="T-01" canApprove={false} safeHarvestDate={safe} />)
  expect(screen.getByRole('button', { name: 'Nghiệm thu đạt cách ly' })).toBeDisabled()
  const text = new Date(safe).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  expect(screen.getByText(`Còn 5 ngày cách ly (an toàn từ ${text})`)).toBeInTheDocument()
})

test('asks for confirmation, POSTs, reports and refreshes', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { parcel: {} } }) }) as unknown as typeof fetch
  const onDone = jest.fn()
  render(<ApproveHarvestButton parcelId="p1" parcelCode="T-01" cycleLabel="Lứa 2" canApprove onDone={onDone} />)
  fireEvent.click(screen.getByRole('button', { name: 'Nghiệm thu đạt cách ly' }))
  expect(screen.getByText('Xác nhận nương T-01, lứa Lứa 2 đã qua thời gian cách ly và được phép thu hái?')).toBeInTheDocument()
  expect(global.fetch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }))
  await waitFor(() => expect(onDone).toHaveBeenCalled())
  expect(global.fetch).toHaveBeenCalledWith('/api/parcels/p1/approve-harvest', { method: 'POST' })
  expect(screen.getByRole('status')).toHaveTextContent('Đã nghiệm thu nương T-01.')
})

test('an API error is shown', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: { code: 'X', message: 'Còn trong thời gian cách ly.' } }) }) as unknown as typeof fetch
  render(<ApproveHarvestButton parcelId="p1" parcelCode="T-01" canApprove />)
  fireEvent.click(screen.getByRole('button', { name: 'Nghiệm thu đạt cách ly' }))
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Còn trong thời gian cách ly.')
})
