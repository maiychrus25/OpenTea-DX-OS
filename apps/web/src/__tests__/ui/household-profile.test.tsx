// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
                status: 'TENDING'
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

describe('HouseholdProfile — start a new harvest round', () => {
  const parcels = [
    { id: 'p1', crop_type: 'Chè Trung du', season: 'Lứa 1/2026', status: 'TENDING' },
    { id: 'p2', crop_type: 'Chè LDP1', season: 'Lứa 1/2026', status: 'HARVESTED', harvested_at: '2026-11-01T00:00:00.000Z' },
  ];
  let startRound: jest.Mock;

  beforeEach(() => {
    startRound = jest.fn();
    global.fetch = jest.fn((url: string, init?: RequestInit) => {
      if (url.includes('/start-round')) return startRound(url, init);
      if (url.includes('/api/farm/households/')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: { id: 'hh-1', name: 'Hộ bà C', parcel_count: 2 } }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: parcels }) });
    }) as jest.Mock;
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('shows the action only on a harvested parcel', async () => {
    render(<HouseholdProfile id="hh-1" />);
    expect(await screen.findAllByRole('button', { name: 'Bắt đầu lứa mới' })).toHaveLength(1);
  });

  test('asks for confirmation, then starts the round and shows its season', async () => {
    let finish: (v: unknown) => void = () => undefined;
    startRound.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<HouseholdProfile id="hh-1" />);
    const button = await screen.findByRole('button', { name: 'Bắt đầu lứa mới' });

    fireEvent.click(button);
    expect(window.confirm).toHaveBeenCalled();
    expect(startRound).toHaveBeenCalledWith('/api/parcels/p2/start-round', { method: 'POST' });
    await waitFor(() => expect(button).toBeDisabled());

    finish({ ok: true, status: 200, json: () => Promise.resolve({ data: { cycleId: 'c9', season: 'Lứa 2/2026' } }) });
    expect(await screen.findByText('Lứa 2/2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bắt đầu lứa mới' })).not.toBeInTheDocument();
  });

  test('does nothing when the officer cancels', async () => {
    (window.confirm as jest.Mock).mockReturnValue(false);
    render(<HouseholdProfile id="hh-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bắt đầu lứa mới' }));
    expect(startRound).not.toHaveBeenCalled();
  });

  test('shows the error in Vietnamese and keeps the action', async () => {
    startRound.mockResolvedValue({ ok: false, status: 422, json: () => Promise.resolve({ error: { code: 'DOMAIN_ERROR', message: 'Chỉ bắt đầu lứa mới khi thửa đã thu hoạch' } }) });
    render(<HouseholdProfile id="hh-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bắt đầu lứa mới' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Chỉ bắt đầu lứa mới khi thửa đã thu hoạch');
    expect(screen.getByRole('button', { name: 'Bắt đầu lứa mới' })).toBeEnabled();
  });
});
