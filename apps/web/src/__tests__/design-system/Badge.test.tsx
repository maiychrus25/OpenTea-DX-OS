// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import * as React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Badge } from '@/components/ui'

describe('Badge', () => {
  const statuses = [
    { status: 'sowing', label: 'Gieo trá»“ng' },
    { status: 'tending', label: 'ChÄƒm sÃ³c' },
    { status: 'harvest-approved', label: 'Chá» thu hoáº¡ch' },
    { status: 'harvested', label: 'ÄÃ£ thu hoáº¡ch' },
    { status: 'draft', label: 'NhÃ¡p' },
  ] as const

  statuses.forEach(({ status, label }) => {
    it(`renders "${status}" with Vietnamese label "${label}"`, () => {
      render(<Badge status={status} />)
      expect(screen.getByRole('status')).toHaveTextContent(label)
      expect(screen.getByTestId(`badge-${status}`)).toBeInTheDocument()
    })
  })

  it('has correct ARIA attributes', () => {
    render(<Badge status="sowing" />)
    const badge = screen.getByRole('status')
    expect(badge).toHaveAttribute('aria-label', expect.stringContaining('Gieo trá»“ng'))
  })
})
