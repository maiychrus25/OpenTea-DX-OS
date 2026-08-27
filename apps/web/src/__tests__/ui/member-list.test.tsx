// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemberList } from '@/app/manager/members/_components/member-list';
import '@testing-library/jest-dom';

jest.mock('focus-trap-react', () => {
  return function MockFocusTrap({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  };
});

describe('MemberList UI', () => {
  beforeEach(() => {
    // Mock window.confirm
    window.confirm = jest.fn(() => true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('8.11-UNIT-001: role-specific list renders correctly', () => {
    render(<MemberList />);
    
    // Check if the mock members are rendered
    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    expect(screen.getByText('Trưởng HTX')).toBeInTheDocument();
    
    expect(screen.getByText('Lê Văn C')).toBeInTheDocument();
    
    // There are two "Chờ xác nhận" (one in filter select, one in table row)
    const pendingTexts = screen.getAllByText('Chờ xác nhận');
    expect(pendingTexts.length).toBeGreaterThanOrEqual(1);
  });

  test('8.11-UNIT-002: invite flow requires confirmation (shows modal)', async () => {
    render(<MemberList />);
    
    const inviteButton = screen.getByText('Mời thành viên');
    fireEvent.click(inviteButton);
    
    // Modal should open
    expect(screen.getByText('Mời thành viên mới')).toBeInTheDocument();
    
    const emailInput = screen.getByPlaceholderText('vd: nongdan@example.com');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    
    const submitBtn = screen.getByText('Gửi lời mời');
    fireEvent.click(submitBtn);
    
    // The button text changes during submit
    expect(screen.getByText('Đang gửi...')).toBeInTheDocument();
    
    await waitFor(() => {
      // Mock member should be added
      expect(screen.getByText(/test@example\.com/)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  test('8.11-UNIT-002: delete flow requires confirmation', () => {
    render(<MemberList />);
    
    const deleteButtons = screen.getAllByText('Xóa');
    fireEvent.click(deleteButtons[0]);
    
    expect(window.confirm).toHaveBeenCalled();
  });
});
