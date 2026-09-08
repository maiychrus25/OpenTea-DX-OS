// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CertificateManager } from '../CertificateManager'

describe('CertificateManager Component', () => {
  beforeAll(() => {
    global.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/mock-blob-uuid')
    global.URL.revokeObjectURL = jest.fn()
    window.confirm = jest.fn(() => true)
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders certificate list and "Thêm chứng nhận" button in manage mode', () => {
    render(<CertificateManager mode="manage" />)

    expect(screen.getByText('Chứng nhận & Kiểm định')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Thêm chứng nhận/i })).toBeInTheDocument()
    expect(screen.getByText('Chứng nhận VietGAP')).toBeInTheDocument()
    expect(screen.getByText('Chứng nhận Hữu cơ (Organic)')).toBeInTheDocument()
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

  it('successfully creates a new certificate when file and info are provided', () => {
    render(<CertificateManager mode="manage" />)

    // Open Add Modal
    fireEvent.click(screen.getByRole('button', { name: /Thêm chứng nhận/i }))

    // Fill form fields
    const nameInput = screen.getByLabelText(/Tên chứng nhận/i)
    fireEvent.change(nameInput, { target: { value: 'Chứng nhận GlobalGAP 2026' } })

    const dateInput = screen.getByLabelText(/Ngày hết hạn/i)
    fireEvent.change(dateInput, { target: { value: '2028-12-31' } })

    // Attach mock file
    const fileInput = screen.getByLabelText(/File scan/i)
    const mockFile = new File(['mock pdf content'], 'globalgap.pdf', { type: 'application/pdf' })
    fireEvent.change(fileInput, { target: { files: [mockFile] } })

    // Submit form
    const form = screen.getByRole('dialog').querySelector('form')!
    fireEvent.submit(form)

    // Verify modal is closed
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Verify new certificate is displayed in list
    expect(screen.getByText('Chứng nhận GlobalGAP 2026')).toBeInTheDocument()
    expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockFile)
  })

  it('opens preview modal with valid fileUrl when "Xem tài liệu" is clicked', () => {
    render(<CertificateManager mode="manage" />)

    const viewButtons = screen.getAllByLabelText('Xem tài liệu')
    expect(viewButtons.length).toBeGreaterThan(0)

    fireEvent.click(viewButtons[0])

    // Preview modal should appear
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Xem chứng nhận: Chứng nhận VietGAP/i)).toBeInTheDocument()
  })

  it('updates existing certificate in-place when "Cập nhật chứng nhận" is clicked without creating duplicates', () => {
    render(<CertificateManager mode="manage" />)

    const initialCards = screen.getAllByRole('heading', { level: 4 })
    const initialCount = initialCards.length

    // Click edit on the first certificate ("Chứng nhận VietGAP")
    const editButtons = screen.getAllByLabelText('Cập nhật chứng nhận')
    fireEvent.click(editButtons[0])

    // Verify modal title shows editing state
    expect(screen.getByText(/Cập nhật chứng nhận: Chứng nhận VietGAP/i)).toBeInTheDocument()

    // Verify input is pre-populated
    const nameInput = screen.getByLabelText(/Tên chứng nhận/i) as HTMLInputElement
    expect(nameInput.value).toBe('Chứng nhận VietGAP')

    // Change the certificate name
    fireEvent.change(nameInput, { target: { value: 'Chứng nhận VietGAP Nâng Cao 2026' } })

    // Submit the update
    const form = screen.getByRole('dialog').querySelector('form')!
    fireEvent.submit(form)

    // Verify modal is closed
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Verify updated title is in DOM
    expect(screen.getByText('Chứng nhận VietGAP Nâng Cao 2026')).toBeInTheDocument()

    // Verify card count is EXACTLY the same (NO duplicate card created)
    const updatedCards = screen.getAllByRole('heading', { level: 4 })
    expect(updatedCards.length).toBe(initialCount)
  })

  it('deletes a certificate when "Xóa chứng nhận" is clicked', () => {
    render(<CertificateManager mode="manage" />)

    expect(screen.getByText('Chứng nhận VietGAP')).toBeInTheDocument()

    const deleteButtons = screen.getAllByLabelText('Xóa chứng nhận')
    fireEvent.click(deleteButtons[0])

    expect(window.confirm).toHaveBeenCalledWith('Bạn có chắc chắn muốn xóa chứng nhận này?')
    expect(screen.queryByText('Chứng nhận VietGAP')).not.toBeInTheDocument()
  })
})
