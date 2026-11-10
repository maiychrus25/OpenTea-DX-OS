// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PHOTO_UNAVAILABLE_MESSAGE, ReportPhoto } from '@/components/features/disease/ReportPhoto'

describe('ReportPhoto', () => {
  it('shows the photo', () => {
    render(<ReportPhoto src="http://localhost:9000/agrimarket-private/a.jpg" />)
    expect(screen.getByAltText('Ảnh bệnh')).toHaveAttribute('src', 'http://localhost:9000/agrimarket-private/a.jpg')
    expect(screen.queryByText(PHOTO_UNAVAILABLE_MESSAGE)).not.toBeInTheDocument()
  })

  it('shows a notice instead of a broken image when the object is missing', () => {
    render(<ReportPhoto src="http://localhost:9000/agrimarket-private/missing.jpg" />)
    fireEvent.error(screen.getByAltText('Ảnh bệnh'))
    expect(screen.queryByAltText('Ảnh bệnh')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: PHOTO_UNAVAILABLE_MESSAGE })).toBeVisible()
  })
})
