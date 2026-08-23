// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { renderHook, act, waitFor } from '@testing-library/react';
import { useOfflineSync } from '../useOfflineSync';

let shouldThrowIdbGet = false;
let shouldThrowIdbSet = false;

// Mock idb-keyval
const mockStore: Record<string, unknown> = {};
jest.mock('idb-keyval', () => ({
  get: jest.fn(async (key: string) => {
    if (shouldThrowIdbGet) throw new Error('IndexedDB error');
    return mockStore[key];
  }),
  set: jest.fn(async (key: string, value: unknown) => {
    if (shouldThrowIdbSet) throw new Error('IndexedDB error');
    mockStore[key] = value;
  }),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as jest.Mock;

// Mock crypto.randomUUID
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => 'test-uuid-1234' },
});

const QUEUE_KEY = 'diagnosis_offline_queue';

describe('useOfflineSync', () => {
  beforeEach(() => {
    // Reset mocks và store trước mỗi test
    jest.clearAllMocks();
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
    mockFetch.mockReset();
    shouldThrowIdbGet = false;
    shouldThrowIdbSet = false;

    // Default: online
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Cleanup event listeners
    act(() => {
      window.dispatchEvent(new Event('offline')); // trigger offline để reset
    });
  });

  // Helper function to mount hook and wait for initial async effect to settle
  const renderHookAndWait = async () => {
    let hookResult: any;
    await act(async () => {
      hookResult = renderHook(() => useOfflineSync());
      // Cần đợi 1 tick để promise trong mount useEffect resolve
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    return hookResult;
  };

  // ─── saveToQueue ────────────────────────────────────────────────────────────

  it('saveToQueue: lưu item vào IndexedDB và tăng queueCount', async () => {
    const { result } = await renderHookAndWait();

    const file = new File(['data'], 'leaf.jpg', { type: 'image/jpeg' });

    await act(async () => {
      const saved = await result.current.saveToQueue('parcel-1', file);
      expect(saved).toBe(true);
    });

    expect(result.current.queueCount).toBe(1);

    const storedQueue = mockStore[QUEUE_KEY] as Array<{ parcelId: string }>;
    expect(storedQueue).toHaveLength(1);
    expect(storedQueue[0].parcelId).toBe('parcel-1');
  });

  it('saveToQueue: trả về false khi IndexedDB throw lỗi', async () => {
    const { result } = await renderHookAndWait();
    
    // Gây lỗi khi set vào db
    shouldThrowIdbSet = true;

    const file = new File(['data'], 'leaf.jpg', { type: 'image/jpeg' });

    await act(async () => {
      const saved = await result.current.saveToQueue('parcel-1', file);
      expect(saved).toBe(false);
    });
  });

  // ─── syncQueue ───────────────────────────────────────────────────────────────

  it('syncQueue: gọi fetch và xóa item thành công khỏi queue', async () => {
    // Chuẩn bị queue với 1 item
    const file = new File(['data'], 'leaf.jpg', { type: 'image/jpeg' });
    mockStore[QUEUE_KEY] = [
      { id: 'item-1', parcelId: 'parcel-1', imageFile: file, timestamp: Date.now() },
    ];

    mockFetch.mockResolvedValue({ ok: true });

    const { result } = await renderHookAndWait();

    await act(async () => {
      await result.current.syncQueue();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const remainingQueue = mockStore[QUEUE_KEY] as unknown[];
    expect(remainingQueue).toHaveLength(0);
  });

  it('syncQueue: không gọi fetch khi queue rỗng', async () => {
    mockStore[QUEUE_KEY] = [];

    const { result } = await renderHookAndWait();

    await act(async () => {
      await result.current.syncQueue();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('syncQueue: dừng sync loop khi fetch throw (mất mạng giữa chừng)', async () => {
    const file = new File(['data'], 'leaf.jpg', { type: 'image/jpeg' });
    mockStore[QUEUE_KEY] = [
      { id: 'item-1', parcelId: 'parcel-1', imageFile: file, timestamp: Date.now() },
      { id: 'item-2', parcelId: 'parcel-2', imageFile: file, timestamp: Date.now() + 1 },
    ];

    // Item đầu tiên thành công, item thứ hai throw network error
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('Network error'));

    const { result } = await renderHookAndWait();

    await act(async () => {
      await result.current.syncQueue();
    });

    // Chỉ gọi fetch 2 lần (item 1 success, item 2 throw → dừng loop)
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Item 1 đã bị xóa, item 2 còn lại
    const remainingQueue = mockStore[QUEUE_KEY] as Array<{ id: string }>;
    expect(remainingQueue).toHaveLength(1);
    expect(remainingQueue[0].id).toBe('item-2');
  });

  // ─── double-sync guard ───────────────────────────────────────────────────────

  it('syncQueue: isSyncing=true sau khi sync bắt đầu, false sau khi xong', async () => {
    const file = new File(['data'], 'leaf.jpg', { type: 'image/jpeg' });
    mockStore[QUEUE_KEY] = [
      { id: 'item-1', parcelId: 'parcel-1', imageFile: file, timestamp: Date.now() },
    ];

    // Delay fetch để capture isSyncing=true
    let resolveSync!: (value: unknown) => void;
    mockFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveSync = () => resolve({ ok: true });
      })
    );

    const { result } = await renderHookAndWait();

    let syncPromise: Promise<void>;
    act(() => {
      syncPromise = result.current.syncQueue();
    });

    // Chờ một tick để isSyncing được set
    await waitFor(() => expect(result.current.isSyncing).toBe(true));

    // Resolve fetch
    await act(async () => {
      resolveSync({});
      await syncPromise!;
    });

    expect(result.current.isSyncing).toBe(false);
  });

  // ─── online event trigger ────────────────────────────────────────────────────

  it('online event: tự động gọi syncQueueRef.current() khi có mạng trở lại', async () => {
    // Setup queue
    const file = new File(['data'], 'leaf.jpg', { type: 'image/jpeg' });
    mockStore[QUEUE_KEY] = [
      { id: 'item-1', parcelId: 'parcel-1', imageFile: file, timestamp: Date.now() },
    ];
    mockFetch.mockResolvedValue({ ok: true });

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    
    let hookResult: any;
    await act(async () => {
      hookResult = renderHook(() => useOfflineSync());
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    const { result } = hookResult;

    expect(result.current.isOnline).toBe(false);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.isOnline).toBe(true);
    // Sau khi online, syncQueueRef.current() được gọi → fetch được thực hiện
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  // ─── offline event ───────────────────────────────────────────────────────────

  it('offline event: cập nhật isOnline=false', async () => {
    const { result } = await renderHookAndWait();

    expect(result.current.isOnline).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.isOnline).toBe(false);
  });
});
