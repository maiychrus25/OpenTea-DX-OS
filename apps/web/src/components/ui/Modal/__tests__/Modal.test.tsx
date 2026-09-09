// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Modal } from '../Modal'

describe('Modal Component', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    title: 'Test Modal Title',
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders correctly when isOpen is true', () => {
    render(
      <Modal {...defaultProps}>
        <p>Modal Body Content</p>
      </Modal>
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Test Modal Title')).toBeInTheDocument()
    expect(screen.getByText('Modal Body Content')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    render(
      <Modal {...defaultProps} isOpen={false}>
        <p>Modal Body Content</p>
      </Modal>
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    render(
      <Modal {...defaultProps}>
        <p>Modal Body Content</p>
      </Modal>
    )

    const closeBtn = screen.getByLabelText('Đóng')
    fireEvent.click(closeBtn)

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when clicking outside on the backdrop overlay', () => {
    const { container } = render(
      <Modal {...defaultProps}>
        <p>Modal Body Content</p>
      </Modal>
    )

    // The overlay is the first div rendered inside focus trap
    const overlay = container.querySelector('[tabindex="-1"]')
    expect(overlay).toBeInTheDocument()

    // Clicking overlay directly
    fireEvent.click(overlay!)
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onClose when clicking inside the modal content', () => {
    render(
      <Modal {...defaultProps}>
        <button type="button">Inside Button</button>
      </Modal>
    )

    const insideButton = screen.getByText('Inside Button')
    fireEvent.click(insideButton)

    expect(defaultProps.onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when Escape key is pressed', () => {
    const { container } = render(
      <Modal {...defaultProps}>
        <p>Modal Body Content</p>
      </Modal>
    )

    const overlay = container.querySelector('[tabindex="-1"]')
    fireEvent.keyDown(overlay!, { key: 'Escape', code: 'Escape' })

    expect(defaultProps.onClose).toHaveBeenCalled()
  })
})
