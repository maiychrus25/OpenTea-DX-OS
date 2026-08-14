// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MetricCard } from '@/components/ui'
import { Sprout } from 'lucide-react'
import React from 'react'

test('MetricCard renders label and value', () => {
  render(
    <MetricCard icon={<Sprout />} label="Vùng canh tác" value="12 ha" detail="Đang hoạt động" />
  )
  expect(screen.getByText('Vùng canh tác')).toBeInTheDocument()
  expect(screen.getByText('12 ha')).toBeInTheDocument()
  expect(screen.getByText('Đang hoạt động')).toBeInTheDocument()
})

test('MetricCard applies tone class', () => {
  const { container } = render(
    <MetricCard icon={<Sprout />} label="Test" value="0" tone="amber" />
  )
  expect(container.firstChild).toHaveClass('amber')
})

test('MetricCard detail is optional', () => {
  render(<MetricCard icon={<Sprout />} label="Test" value="5" />)
  expect(screen.getByText('Test')).toBeInTheDocument()
})
