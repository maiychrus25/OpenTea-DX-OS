// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AccountSection } from '@/components/ui'
import { signOutAction } from '@/app/actions/signout-action'

// Mock signout action
jest.mock('@/app/actions/signout-action', () => ({
  signOutAction: jest.fn(),
}))

describe('AccountSection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('T1: Manager role renders avatar initials and role label', () => {
    render(<AccountSection name="Nguyễn Văn An" role="manager" />)
    
    expect(screen.getByText('N')).toBeInTheDocument()
    expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument()
    expect(screen.getByText('Trưởng HTX')).toBeInTheDocument()
  })

  it('T2: Officer role renders đúng role label', () => {
    render(<AccountSection name="Trần Thị Lan" role="officer" />)
    
    expect(screen.getByText('T')).toBeInTheDocument()
    expect(screen.getByText('Cán bộ KT/CL')).toBeInTheDocument()
  })

  it('T3: Farmer role renders đúng role label', () => {
    render(<AccountSection name="Lê Văn Bình" role="farmer" />)
    
    expect(screen.getByText('L')).toBeInTheDocument()
    expect(screen.getByText('Nông dân')).toBeInTheDocument()
  })

  it('T4: Empty name -> avatar hiển thị "U"', () => {
    render(<AccountSection name="" role="farmer" />)
    
    expect(screen.getByText('U')).toBeInTheDocument()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('T5: 3 security rows đều hiển thị', () => {
    render(<AccountSection name="Test User" role="manager" />)
    
    expect(screen.getByText('Vân tay / FaceID')).toBeInTheDocument()
    expect(screen.getByText('Mã PIN 6 số')).toBeInTheDocument()
    expect(screen.getByText('Thiết bị đăng nhập')).toBeInTheDocument()
  })

  it('T6: "Đổi PIN" button tồn tại', () => {
    render(<AccountSection name="Test User" role="manager" />)
    
    expect(screen.getByRole('button', { name: 'Đổi PIN' })).toBeInTheDocument()
  })

  it('T7: "Quản lý" button tồn tại', () => {
    render(<AccountSection name="Test User" role="manager" />)
    
    expect(screen.getByRole('button', { name: 'Quản lý' })).toBeInTheDocument()
  })

  it('T8: "Đăng xuất" button tồn tại và enable by default', () => {
    render(<AccountSection name="Test User" role="manager" />)
    
    const logoutBtn = screen.getByRole('button', { name: 'Đăng xuất' })
    expect(logoutBtn).toBeInTheDocument()
    expect(logoutBtn).not.toBeDisabled()
  })

  it('T9: Logout button gọi signOutAction khi click', () => {
    render(<AccountSection name="Test User" role="manager" />)
    
    const logoutBtn = screen.getByRole('button', { name: 'Đăng xuất' })
    fireEvent.click(logoutBtn)
    
    expect(signOutAction).toHaveBeenCalledTimes(1)
  })
})
