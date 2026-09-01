// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';

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
    async function loadData() {
      try {
        const [hhRes, parcelsRes] = await Promise.all([
          fetch(`/api/farm/households/${id}`),
          fetch(`/api/farm/parcels?household_id=${id}`)
        ])
        
        if (!hhRes.ok) {
          setError('Không tìm thấy nông hộ này hoặc bạn không có quyền truy cập.')
          setLoading(false)
          return
        }

        const hhData = await hhRes.json()
        const parcelsData = parcelsRes.ok ? await parcelsRes.json() : { data: [] }
        const h = hhData.data
        const parcels = parcelsData.data || []
        
        const history = parcels.map((p: any) => ({
          id: p.id,
          crop: p.crop_type || 'Chưa gán',
          season: p.season || 'N/A',
          yield: 'N/A',
          status: p.status === 'GROWING' ? 'Đang sinh trưởng' : 
                 (p.status === 'HARVEST_READY' ? 'Sắp thu hoạch' : 
                 (p.status === 'HARVEST_APPROVED' ? 'Đã thu hoạch' : p.status))
        }))

        setData({
          id: h.id,
          household_code: h.household_code || `HH-${h.id.substring(0, 4)}`,
          name: h.name || 'Không xác định',
          phone: h.phone || 'Chưa cập nhật',
          address: h.address || 'Chưa cập nhật',
          parcel_count: h.parcel_count || 0,
          total_area_ha: h.total_area_ha || 0,
          joinedAt: new Date().toISOString(), // Mocked as API lacks created_at
          history
        })
      } catch (err) {
        setError('Lỗi kết nối máy chủ.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
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
      <div className="text-center p-12 bg-white rounded-lg shadow-sm border border-red-200">
        <h3 className="text-lg font-medium text-red-800 mb-2">Lỗi truy cập</h3>
        <p className="text-gray-600 mb-4">{error || 'Đã có lỗi xảy ra.'}</p>
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
          <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center shrink-0 border-2 border-green-200">
                <svg className="w-8 h-8 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 leading-tight">{data.name}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <Pill tone="blue" size="sm">Mã: {data.household_code}</Pill>
                  <span className="text-sm text-gray-500">Tham gia: {new Date(data.joinedAt).toLocaleDateString('vi-VN')}</span>
                </div>
              </div>
            </div>
            <Link href="/officer/households">
              <Button variant="secondary">Quay lại</Button>
            </Link>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 rounded-xl p-5 border border-gray-100">
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Thông tin liên hệ</h3>
              <div className="space-y-2">
                <div className="flex items-center text-sm text-gray-700">
                  <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  {data.phone}
                </div>
                <div className="flex items-start text-sm text-gray-700">
                  <svg className="w-4 h-4 mr-2 mt-0.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  {data.address}
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quy mô sản xuất</h3>
              <div className="space-y-2">
                <div className="flex items-center text-sm text-gray-700">
                  <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                  <span className="font-medium mr-1">{data.parcel_count}</span> thửa đất
                </div>
                <div className="flex items-center text-sm text-gray-700">
                  <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                  Tổng diện tích: <span className="font-medium ml-1">{data.total_area_ha} ha</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href={`/officer/farm-zones?householdId=${id}`} className="block h-full">
          <Card className="h-full hover:border-green-500 transition-all hover:shadow-md cursor-pointer group">
            <div className="p-5 flex flex-col items-center justify-center text-center">
              <div className="h-12 w-12 bg-green-50 rounded-full flex items-center justify-center mb-3 group-hover:bg-green-100 transition-colors">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
              </div>
              <h3 className="font-semibold text-gray-900">Bản đồ thửa đất</h3>
              <p className="text-sm text-gray-500 mt-1">Xem {data.parcel_count} thửa đất của nông hộ</p>
            </div>
          </Card>
        </Link>
        
        <Link href={`/officer/journal?householdId=${id}`} className="block h-full">
          <Card className="h-full hover:border-blue-500 transition-all hover:shadow-md cursor-pointer group">
            <div className="p-5 flex flex-col items-center justify-center text-center">
              <div className="h-12 w-12 bg-blue-50 rounded-full flex items-center justify-center mb-3 group-hover:bg-blue-100 transition-colors">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              </div>
              <h3 className="font-semibold text-gray-900">Nhật ký canh tác</h3>
              <p className="text-sm text-gray-500 mt-1">Lịch sử hoạt động, vật tư</p>
            </div>
          </Card>
        </Link>
        
        <Link href={`/officer/diseases?householdId=${id}`} className="block h-full">
          <Card className="h-full hover:border-amber-500 transition-all hover:shadow-md cursor-pointer group">
            <div className="p-5 flex flex-col items-center justify-center text-center">
              <div className="h-12 w-12 bg-amber-50 rounded-full flex items-center justify-center mb-3 group-hover:bg-amber-100 transition-colors">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <h3 className="font-semibold text-gray-900">Lịch sử dịch hại</h3>
              <p className="text-sm text-gray-500 mt-1">Các báo cáo và chẩn đoán AI</p>
            </div>
          </Card>
        </Link>
      </div>

      <Card>
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Lịch sử sản xuất</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cây trồng</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vụ mùa</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sản lượng</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.history.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    Chưa có thửa đất nào được gán cho nông hộ này.
                  </td>
                </tr>
              ) : (
                data.history.map((h: HouseholdHistory) => (
                  <tr key={h.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{h.crop}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{h.season}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{h.yield}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <Pill 
                        tone={
                          h.status === 'Đang sinh trưởng' ? 'green' : 
                          h.status === 'Sắp thu hoạch' ? 'amber' : 
                          h.status === 'Đã thu hoạch' ? 'blue' : 'neutral'
                        }
                      >
                        {h.status}
                      </Pill>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

