// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { HouseholdProfile } from '@/app/officer/households/[id]/_components/household-profile';
import '@testing-library/jest-dom';

describe('HouseholdProfile UI', () => {
  beforeEach(() => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('error-mock')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (url.includes('/api/farm/households/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            data: {
              id: '1234',
              household_code: 'HH-1234',
              name: 'Hộ ông B',
              parcel_count: 3,
              joinedAt: '2026-01-01T00:00:00.000Z',
              history: [
                {
                  id: 'h1',
                  crop: 'Cà phê',
                  season: 'Mùa khô 2026',
                  yield: 'Dự kiến 3 tấn',
                  status: 'Đang sinh trưởng'
                }
              ]
            }
          })
        });
      }
      if (url.includes('/api/farm/parcels')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            data: [
              {
                id: 'p1',
                crop_type: 'Cà phê',
                season: 'Mùa khô 2026',
                status: 'GROWING'
              }
            ]
          })
        });
      }
      return Promise.reject(new Error('Lỗi kết nối máy chủ.'));
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
  test('8.11-UNIT-001: role-specific detail renders correctly', async () => {
    render(<HouseholdProfile id="1234" />);
    
    // Initially loading
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    
    await waitFor(() => {
      // Mock data loaded
      expect(screen.getByText('Hộ ông B')).toBeInTheDocument();
    });
    
    // Parcel count and history links
    expect(screen.getByText('Xem 3 thửa đất của nông hộ')).toBeInTheDocument();
    expect(screen.getByText('Bản đồ thửa đất')).toBeInTheDocument();
    expect(screen.getByText('Nhật ký canh tác')).toBeInTheDocument();
    expect(screen.getByText('Lịch sử dịch hại')).toBeInTheDocument();
    
    // Production history
    expect(await screen.findByText('Cà phê')).toBeInTheDocument();
  });

  test('8.11-UNIT-001: renders error state properly', async () => {
    render(<HouseholdProfile id="error-mock" />);
    
    await waitFor(() => {
      expect(screen.getByText('Lỗi truy cập')).toBeInTheDocument();
      expect(screen.getByText('Không tìm thấy nông hộ này hoặc bạn không có quyền truy cập.')).toBeInTheDocument();
    });
  });
});
