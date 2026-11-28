// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { render, screen } from '@testing-library/react'
import ManagerAiSettingsPage from '@/app/manager/ai/settings/page'

jest.mock('@/auth', () => ({ auth: jest.fn(async () => ({ user: { role: 'manager' }, authTime: 0 })) }))
jest.mock('next/navigation', () => ({ redirect: jest.fn() }))
jest.mock('@/components/features/agent/AgentSettingsPanel', () => ({ AgentSettingsPanel: () => <div>settings-panel</div> }))
jest.mock('@/components/features/agent/AutopilotSection', () => ({ AutopilotSection: () => <div>autopilot-section</div> }))
jest.mock('@/components/features/agent/CrossCheckThresholds', () => ({ CrossCheckThresholdsSection: () => <div>cross-check-section</div> }))

const previous = process.env.DXOS_LABS
afterEach(() => {
  if (previous === undefined) delete process.env.DXOS_LABS
  else process.env.DXOS_LABS = previous
})

describe('manager AI settings page', () => {
  test('manager AI settings page hides the autopilot section without DXOS_LABS', async () => {
    delete process.env.DXOS_LABS
    render(await ManagerAiSettingsPage())
    expect(screen.getByText('settings-panel')).toBeInTheDocument()
    expect(screen.getByText('cross-check-section')).toBeInTheDocument()
    expect(screen.queryByText('autopilot-section')).not.toBeInTheDocument()
  })

  test('shows the autopilot section with DXOS_LABS on', async () => {
    process.env.DXOS_LABS = '1'
    render(await ManagerAiSettingsPage())
    expect(screen.getByText('autopilot-section')).toBeInTheDocument()
  })
})
