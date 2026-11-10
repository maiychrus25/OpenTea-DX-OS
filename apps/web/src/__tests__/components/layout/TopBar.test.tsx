// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { render, screen } from '@testing-library/react'
import { TopBar } from '@/components/layout/TopBar/TopBar'

jest.mock('@/components/ui/GlobalSearch/GlobalSearchInput', () => ({ GlobalSearchInput: () => null }))

describe('TopBar', () => {
  it('shows the brand and a theme toggle', () => {
    render(<TopBar role="farmer" roleName="Nông hộ" userName="Lò Văn A" notificationSlot={<span />} />)
    expect(screen.getByText('OpenTea DX-OS')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /giao diện/i })).toBeInTheDocument()
  })
})
