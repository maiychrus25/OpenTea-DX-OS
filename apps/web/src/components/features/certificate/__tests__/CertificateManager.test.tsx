// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CertificateManager } from '../CertificateManager'

describe('CertificateManager Component', () => {
  it('renders certificate list and "Thêm chứng nhận" button in manage mode', () => {
    render(<CertificateManager mode="manage" />)

    expect(screen.getByText('Chứng nhận & Kiểm định')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Thêm chứng nhận/i })).toBeInTheDocument()
    expect(screen.getByText('Chứng nhận VietGAP')).toBeInTheDocument()
  })

  it('opens modal when "Thêm chứng nhận" button is clicked and stays open', () => {
    render(<CertificateManager mode="manage" />)

    const addButton = screen.getByRole('button', { name: /Thêm chứng nhận/i })
    fireEvent.click(addButton)

    // Modal should be opened and remain open
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Thêm chứng nhận mới')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('VD: Chứng nhận VietGAP 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Hủy/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tải lên/i })).toBeInTheDocument()
  })

  it('closes modal when "Hủy" button inside modal is clicked', () => {
    render(<CertificateManager mode="manage" />)

    const addButton = screen.getByRole('button', { name: /Thêm chứng nhận/i })
    fireEvent.click(addButton)

    expect(screen.getByRole('dialog')).toBeInTheDocument()

    const cancelButton = screen.getByRole('button', { name: /Hủy/i })
    fireEvent.click(cancelButton)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
