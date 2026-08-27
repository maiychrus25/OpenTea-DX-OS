// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { HouseholdProfile } from '@/app/officer/households/[id]/_components/household-profile';
import '@testing-library/jest-dom';

describe('HouseholdProfile UI', () => {
  test('8.11-UNIT-001: role-specific detail renders correctly', async () => {
    render(<HouseholdProfile id="1234" />);
    
    // Initially loading
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    
    await waitFor(() => {
      // Mock data loaded
      expect(screen.getByText('Hộ ông B')).toBeInTheDocument();
    });
    
    // Parcel count and history links
    expect(screen.getByText('Thửa đất: 3')).toBeInTheDocument();
    expect(screen.getByText('Bản đồ thửa đất')).toBeInTheDocument();
    expect(screen.getByText('Nhật ký canh tác')).toBeInTheDocument();
    expect(screen.getByText('Lịch sử dịch hại')).toBeInTheDocument();
    
    // Production history
    expect(screen.getByText('Cà phê')).toBeInTheDocument();
  });

  test('8.11-UNIT-001: renders error state properly', async () => {
    render(<HouseholdProfile id="error-mock" />);
    
    await waitFor(() => {
      expect(screen.getByText('Lỗi truy cập')).toBeInTheDocument();
      expect(screen.getByText('Không tìm thấy nông hộ này hoặc bạn không có quyền truy cập.')).toBeInTheDocument();
    });
  });
});
