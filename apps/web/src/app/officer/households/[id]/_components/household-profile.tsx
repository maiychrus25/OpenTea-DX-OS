// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface HouseholdProfileProps {
  id: string;
}

interface HouseholdHistory {
  id: string;
  crop: string;
  season: string;
  yield: string;
  status: string;
}

interface HouseholdProfileData {
  id: string;
  household_code: string;
  name: string;
  phone: string;
  address: string;
  parcel_count: number;
  total_area_ha: number;
  joinedAt: string;
  history: HouseholdHistory[];
}

export function HouseholdProfile({ id }: HouseholdProfileProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HouseholdProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Simulate fetching profile with mock delay
    const timer = setTimeout(() => {
      if (id === 'error-mock') {
        setError('Không tìm thấy nông hộ này hoặc bạn không có quyền truy cập.');
      } else {
        setData({
          id,
          household_code: `HH-${id.substring(0, 4)}`,
          name: 'Hộ ông B',
          phone: '0987654321',
          address: 'Xã Phú Hội, Huyện Đức Trọng',
          parcel_count: 3,
          total_area_ha: 5.2,
          joinedAt: '2025-03-01T00:00:00Z',
          history: [
            { id: 'h1', crop: 'Cà phê', season: 'Mùa khô 2025', yield: '12 tấn', status: 'Đã thu hoạch' },
            { id: 'h2', crop: 'Sầu riêng', season: 'Mùa mưa 2025', yield: 'N/A', status: 'Đang sinh trưởng' },
          ]
        });
      }
      setLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center p-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-red-200 dark:border-red-900">
        <h3 className="text-lg font-medium text-red-800 dark:text-red-400 mb-2">Lỗi truy cập</h3>
        <p className="text-gray-600 dark:text-gray-300 mb-4">{error || 'Đã có lỗi xảy ra.'}</p>
        <Link href="/officer/households">
          <Button variant="primary">Quay lại danh sách</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{data.name}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Mã: {data.household_code} • Tham gia: {new Date(data.joinedAt).toLocaleDateString('vi-VN')}
              </p>
            </div>
            <Link href="/officer/households">
              <Button variant="secondary">Quay lại</Button>
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Liên hệ</h3>
              <p className="mt-1 text-sm text-gray-900 dark:text-white">📞 {data.phone}</p>
              <p className="mt-1 text-sm text-gray-900 dark:text-white">📍 {data.address}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Quy mô sản xuất</h3>
              <p className="mt-1 text-sm text-gray-900 dark:text-white">Thửa đất: {data.parcel_count}</p>
              <p className="mt-1 text-sm text-gray-900 dark:text-white">Tổng diện tích: {data.total_area_ha} ha</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href={`/officer/farm-zones?householdId=${id}`} className="block h-full">
          <Card className="h-full hover:border-green-500 transition-colors cursor-pointer">
            <div className="p-4 flex flex-col items-center justify-center text-center">
              <span className="text-3xl mb-2">🗺️</span>
              <h3 className="font-medium text-gray-900 dark:text-white">Bản đồ thửa đất</h3>
              <p className="text-sm text-gray-500 mt-1">Xem {data.parcel_count} thửa đất của nông hộ</p>
            </div>
          </Card>
        </Link>
        
        <Link href={`/officer/journal?householdId=${id}`} className="block h-full">
          <Card className="h-full hover:border-green-500 transition-colors cursor-pointer">
            <div className="p-4 flex flex-col items-center justify-center text-center">
              <span className="text-3xl mb-2">📓</span>
              <h3 className="font-medium text-gray-900 dark:text-white">Nhật ký canh tác</h3>
              <p className="text-sm text-gray-500 mt-1">Lịch sử hoạt động, vật tư</p>
            </div>
          </Card>
        </Link>
        
        <Link href={`/officer/diseases?householdId=${id}`} className="block h-full">
          <Card className="h-full hover:border-green-500 transition-colors cursor-pointer">
            <div className="p-4 flex flex-col items-center justify-center text-center">
              <span className="text-3xl mb-2">🦠</span>
              <h3 className="font-medium text-gray-900 dark:text-white">Lịch sử dịch hại</h3>
              <p className="text-sm text-gray-500 mt-1">Các báo cáo và chẩn đoán AI</p>
            </div>
          </Card>
        </Link>
      </div>

      <Card>
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Lịch sử sản xuất</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cây trồng</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vụ mùa</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sản lượng</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-transparent divide-y divide-gray-200 dark:divide-gray-700">
              {data.history.map((h: HouseholdHistory) => (
                <tr key={h.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{h.crop}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{h.season}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{h.yield}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{h.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
