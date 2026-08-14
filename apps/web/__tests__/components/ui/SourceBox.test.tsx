// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { SourceBox } from '@/components/ui'
import React from 'react'

test('SourceBox renders count and sources', () => {
  render(<SourceBox count={3} sources={['VietGAP', 'Sở NN&PTNT', 'Chợ đầu mối']} />)
  expect(screen.getByText(/3 nguồn đã kiểm chứng/)).toBeInTheDocument()
  expect(screen.getByText(/VietGAP/)).toBeInTheDocument()
  expect(screen.getByText(/Chợ đầu mối/)).toBeInTheDocument()
})
