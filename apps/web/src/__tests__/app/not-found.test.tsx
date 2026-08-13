// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen } from '@testing-library/react'
import NotFoundPage from '@/app/not-found'

describe('not-found.tsx', () => {
  it('1.2a-UNIT-004: renders Không tìm thấy trang', () => {
    render(<NotFoundPage />)
    expect(screen.getByText(/không tìm thấy trang/i)).toBeInTheDocument()
  })
})
