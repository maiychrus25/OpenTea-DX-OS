// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { render, screen } from '@testing-library/react'
import { TopBar } from '@/components/layout/TopBar/TopBar'

jest.mock('@/components/ui/GlobalSearch/GlobalSearchInput', () => ({ GlobalSearchInput: () => <input aria-label="search" /> }))

describe('TopBar', () => {
  it('shows the brand and a theme toggle', () => {
    render(<TopBar role="farmer" roleName="Nông hộ" userName="Lò Văn A" notificationSlot={<span />} />)
    expect(screen.getByText('OpenTea DX-OS')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /giao diện/i })).toBeInTheDocument()
  })

  it('renders no global search for a farmer', () => {
    render(<TopBar role="farmer" roleName="Nông hộ" userName="Lò Văn A" notificationSlot={<span />} />)
    expect(screen.queryByLabelText('search')).not.toBeInTheDocument()
  })

  it('renders the global search for an officer', () => {
    render(<TopBar role="officer" roleName="Cán bộ" userName="Lò Văn A" notificationSlot={<span />} />)
    expect(screen.getByLabelText('search')).toBeInTheDocument()
  })
})
