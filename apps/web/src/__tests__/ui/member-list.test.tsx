import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemberList } from '@/app/manager/members/_components/member-list';
import '@testing-library/jest-dom';

jest.mock('focus-trap-react', () => {
  return function MockFocusTrap({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  };
});

const mockMembers = [
  { id: '1', name: 'Nguyễn Văn A', email: 'a@ex.com', phone: '012', role: 'MANAGER', status: 'ACTIVE' },
  { id: '2', name: 'Lê Văn C', email: 'c@ex.com', phone: '013', role: 'FARMER', status: 'PENDING' }
];

describe('MemberList UI', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: mockMembers })
      })
    ) as jest.Mock;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('8.11-UNIT-001: role-specific list renders correctly', async () => {
    await act(async () => {
      render(<MemberList />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Trưởng HTX')).toBeInTheDocument();
    expect(screen.getByText('Lê Văn C')).toBeInTheDocument();
    
    const pendingTexts = screen.getAllByText('Chờ xác nhận');
    expect(pendingTexts.length).toBeGreaterThanOrEqual(1);
  });

  test('8.11-UNIT-002: invite flow requires confirmation (shows modal)', async () => {
    await act(async () => {
      render(<MemberList />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    });

    const inviteButton = screen.getByText('Mời thành viên');
    fireEvent.click(inviteButton);
    
    expect(screen.getByText('Mời thành viên mới')).toBeInTheDocument();
    
    const emailInput = screen.getByPlaceholderText('vd: nongdan@example.com');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    
    const submitBtn = screen.getByText('Gửi lời mời');
    fireEvent.click(submitBtn);
    
    expect(screen.getByText('Đang gửi...')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText(/test@example\.com/)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  test('8.11-UNIT-002: delete flow requires confirmation', async () => {
    await act(async () => {
      render(<MemberList />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Lê Văn C')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByText('Xóa');
    fireEvent.click(deleteButtons[0]); // Click delete on first member
    
    // Check if Custom Modal appears instead of window.confirm
    expect(screen.getByText('Xác nhận xóa')).toBeInTheDocument();
    expect(screen.getByText(/Hành động này không thể hoàn tác/)).toBeInTheDocument();
  });
});
