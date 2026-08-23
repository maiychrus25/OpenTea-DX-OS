// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { useState, useEffect, useCallback } from 'react';
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

  // Initialize online state and queue count
  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    
    get<OfflineDiagnosisQueueItem[]>(QUEUE_KEY).then((queue) => {
      setQueueCount(queue?.length || 0);
    });

    const handleOnline = () => {
      setIsOnline(true);
      syncQueue();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      console.error('Lỗi khi lưu vào IndexedDB:', error);
      return false;
    }
  };

  const syncQueue = useCallback(async () => {
    if (isSyncing) return;
    
    try {
      setIsSyncing(true);
      const queue = await get<OfflineDiagnosisQueueItem[]>(QUEUE_KEY);
      
      if (!queue || queue.length === 0) {
        setIsSyncing(false);
        return;
      }

      console.log(`Đang đồng bộ ${queue.length} mục từ offline queue...`);
      let hasSuccess = false;
      
      // Đồng bộ tuần tự từng mục
      let remainingQueue = [...queue];
      for (const item of queue) {
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
            // Xóa mục đã thành công khỏi mảng còn lại
            remainingQueue = remainingQueue.filter(qItem => qItem.id !== item.id);
            await set(QUEUE_KEY, remainingQueue);
            setQueueCount(remainingQueue.length);
          } else {
            console.error('Đồng bộ thất bại cho mục:', item.id);
          }
        } catch (err) {
          console.error('Lỗi kết nối khi đồng bộ mục:', item.id, err);
          break; // Ngừng đồng bộ nếu mất mạng giữa chừng
        }
      }
      
      if (hasSuccess) {
         window.location.reload();
      }
    } catch (error) {
      console.error('Lỗi trong quá trình sync:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  return {
    isOnline,
    queueCount,
    isSyncing,
    saveToQueue,
    syncQueue
  };
}
