// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen } from '@testing-library/react'
import { WeatherHero } from '@/components/features/farmer-web/WeatherHero'

const cached = { temperature: 24, condition: 'U ám', humidity: 80, rainMm: 0 }
const show = () => render(<WeatherHero eyebrow="Nông hộ" title="Chào" subtitle="." actions={[]} place="Tân Cương" cached={cached} />)

function live(code: number) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: [{ weather: { current: { temperature: 19.2, humidity: 86, code, windSpeed: 5, isDay: false, rainMm: 0 }, daily: [{ rainMm: 2 }] } }] }),
  }) as unknown as typeof fetch
}

beforeAll(() => {
  window.HTMLCanvasElement.prototype.getContext = jest.fn(() => null) as never
})

describe('WeatherHero', () => {
  it('rains on the banner only when it is raining', async () => {
    live(63)
    const { unmount } = show()
    expect(await screen.findByText('19°C')).toBeInTheDocument()
    expect(screen.getByTestId('hero-rain')).toBeInTheDocument()
    expect(screen.getByText('2 mm')).toBeInTheDocument()
    unmount()

    live(0)
    show()
    expect(await screen.findByText('19°C')).toBeInTheDocument()
    expect(screen.queryByTestId('hero-rain')).not.toBeInTheDocument()
  })

  it('keeps the stored reading when the live one fails', () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    show()
    expect(screen.getByText('U ám')).toBeInTheDocument()
    expect(screen.getByText('24°C')).toBeInTheDocument()
  })
})
