// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { BulletinCard } from '@/components/features/bulletin/BulletinCard'

describe('BulletinCard', () => {
  it('renders market category with green pill', () => {
    render(
      <BulletinCard
        category="market"
        headline="Thị trường chè"
        summary="Giá chè tăng mạnh"
        date="Hôm nay"
        sourceCount={2}
      />
    )
    
    const pill = screen.getByText('Thị trường')
    expect(pill).toBeInTheDocument()
    expect(pill.className).toMatch(/green/i)
  })

  it('renders weather category with blue pill', () => {
    render(
      <BulletinCard
        category="weather"
        headline="Dự báo thời tiết"
        summary="Trời mưa to"
        date="Hôm nay"
        sourceCount={3}
      />
    )
    
    const pill = screen.getByText('Thời tiết')
    expect(pill).toBeInTheDocument()
    expect(pill.className).toMatch(/blue/i)
  })

  it('renders technical category with amber pill', () => {
    render(
      <BulletinCard
        category="technical"
        headline="Kỹ thuật canh tác"
        summary="Cách bón phân"
        date="Hôm nay"
        sourceCount={4}
      />
    )
    
    const pill = screen.getByText('Kỹ thuật')
    expect(pill).toBeInTheDocument()
    expect(pill.className).toMatch(/amber/i)
  })

  it('renders headline, summary and source count', () => {
    render(
      <BulletinCard
        category="market"
        headline="Headline Test"
        summary="Summary Test"
        date="Hôm nay"
        sourceCount={5}
      />
    )
    
    expect(screen.getByText('Headline Test')).toBeInTheDocument()
    expect(screen.getByText('Summary Test')).toBeInTheDocument()
    expect(screen.getByText('5 nguồn đã kiểm chứng')).toBeInTheDocument()
  })

  it('renders audio button', () => {
    render(
      <BulletinCard
        category="market"
        headline="Headline"
        summary="Summary"
        date="Hôm nay"
        sourceCount={1}
      />
    )
    
    const btn = screen.getByRole('button', { name: /nghe bản tin/i })
    expect(btn).toBeInTheDocument()
  })
})
