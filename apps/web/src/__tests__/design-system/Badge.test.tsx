import * as React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Badge } from '@/components/ui'

describe('Badge', () => {
  const statuses = [
    { status: 'sowing', label: 'Gieo trồng' },
    { status: 'tending', label: 'Chăm sóc' },
    { status: 'harvest-approved', label: 'Chờ thu hoạch' },
    { status: 'harvested', label: 'Đã thu hoạch' },
    { status: 'draft', label: 'Nháp' },
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
    expect(badge).toHaveAttribute('aria-label', expect.stringContaining('Gieo trồng'))
  })
})
