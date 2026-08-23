// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { useState, useEffect, useCallback, useRef } from 'react';
import { get, set } from 'idb-keyval';

export interface OfflineDiagnosisQueueItem {
  id: string;
  parcelId: string;
  imageFile: File;
  timestamp: number;
}

const QUEUE_KEY = 'diagnosis_offline_queue';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // [H1] Dùng ref để event listener luôn trỏ tới syncQueue mới nhất, tránh stale closure bug
  const syncQueueRef = useRef<() => Promise<void>>(async () => {});

  const syncQueue = useCallback(async () => {
    // Đọc trực tiếp từ IndexedDB thay vì dùng isSyncing state (tránh stale closure)
    const queue = await get<OfflineDiagnosisQueueItem[]>(QUEUE_KEY);
    if (!queue || queue.length === 0) return;

    setIsSyncing((prev) => {
      if (prev) return prev; // Đang sync rồi, bỏ qua
      return true;
    });

    // Kiểm tra một lần nữa sau set để tránh race condition
    const currentlyQueued = await get<OfflineDiagnosisQueueItem[]>(QUEUE_KEY);
    if (!currentlyQueued || currentlyQueued.length === 0) {
      setIsSyncing(false);
      return;
    }

    try {
      if (process.env.NODE_ENV === 'development') {
        console.log(`Đang đồng bộ ${currentlyQueued.length} mục từ offline queue...`);
      }
      let hasSuccess = false;
      let remainingQueue = [...currentlyQueued];

      for (const item of currentlyQueued) {
        try {
          const formData = new FormData();
          formData.append('image', item.imageFile);
          formData.append('parcelId', item.parcelId);

          const res = await fetch('/api/diagnosis', {
            method: 'POST',
            body: formData,
          });

          if (res.ok) {
            hasSuccess = true;
            remainingQueue = remainingQueue.filter((qItem) => qItem.id !== item.id);
            await set(QUEUE_KEY, remainingQueue);
            setQueueCount(remainingQueue.length);
          } else if (process.env.NODE_ENV === 'development') {
            console.error('Đồng bộ thất bại cho mục:', item.id);
          }
        } catch (err) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Lỗi kết nối khi đồng bộ mục:', item.id, err);
          }
          break; // Ngừng đồng bộ nếu mất mạng giữa chừng
        }
      }

      if (hasSuccess) {
        window.location.reload();
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Lỗi trong quá trình sync:', error);
      }
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Luôn cập nhật ref trỏ tới syncQueue mới nhất
  useEffect(() => {
    syncQueueRef.current = syncQueue;
  }, [syncQueue]);

  // Mount một lần: khởi tạo state và đăng ký event listeners
  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    get<OfflineDiagnosisQueueItem[]>(QUEUE_KEY).then((queue) => {
      setQueueCount(queue?.length || 0);
    });

    const handleOnline = () => {
      setIsOnline(true);
      // Dùng ref để luôn gọi syncQueue mới nhất — tránh stale closure
      syncQueueRef.current();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []); // deps=[] an toàn vì dùng syncQueueRef thay vì syncQueue trực tiếp

  const saveToQueue = async (parcelId: string, imageFile: File) => {
    try {
      const existingQueue = (await get<OfflineDiagnosisQueueItem[]>(QUEUE_KEY)) || [];
      const newItem: OfflineDiagnosisQueueItem = {
        id: crypto.randomUUID(),
        parcelId,
        imageFile,
        timestamp: Date.now(),
      };
      const newQueue = [...existingQueue, newItem];
      await set(QUEUE_KEY, newQueue);
      setQueueCount(newQueue.length);
      return true;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Lỗi khi lưu vào IndexedDB:', error);
      }
      return false;
    }
  };

  return {
    isOnline,
    queueCount,
    isSyncing,
    saveToQueue,
    syncQueue,
  };
}
