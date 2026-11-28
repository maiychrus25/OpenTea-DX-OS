// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { Download, Eye, Layers, Leaf, List, Map as MapIcon, PauseCircle, Plus, Sprout } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState, PageHeader, Pill } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { Pager, Sample, StatCards, Tabs, pageOf } from '@/components/features/manager-web/parts'
import ui from '@/components/features/manager-web/kit.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import table from '@/components/features/dashboard/dashboard.module.css'
import type { ParcelSummary } from '@/domain/farm/ports/ParcelPort'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { PARCEL_STATUS_CONFIG, isCultivating, parcelStatusLabel } from '@/lib/map-config'
import styles from './zones.module.css'

const ZoneMap = dynamic(() => import('@/components/features/map/ZoneMap'), { ssr: false })

type View = 'map' | 'list'

const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
const areaOf = (parcels: ParcelSummary[]) => parcels.reduce((sum, p) => sum + (p.area_ha ?? 0), 0)

function downloadGeoJson(parcels: ParcelSummary[]) {
  const features = parcels.filter((p) => p.polygon_geojson).map((p) => ({
    type: 'Feature',
    properties: { parcel_code: p.parcel_code, status: p.status, crop_type: p.crop_type, household: p.household, area_ha: p.area_ha },
    geometry: p.polygon_geojson,
  }))
  const url = URL.createObjectURL(new Blob([JSON.stringify({ type: 'FeatureCollection', features })], { type: 'application/geo+json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'vung-trong.geojson'
  link.click()
  URL.revokeObjectURL(url)
}

/** The head's read-only view of the cooperative's parcels. Boundaries are drawn by the officers. */
export default function ManagerZones() {
  const householdId = useSearchParams().get('householdId')
  const [parcels, setParcels] = useState<ParcelSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState<View>('map')
  const [status, setStatus] = useState('')
  const [crop, setCrop] = useState('')
  const [page, setPage] = useState(1)
  const [focus, setFocus] = useState<string | null>(null)
  const [opened, setOpened] = useState<ParcelSummary | null>(null)

  useEffect(() => {
    fetchJson<{ data?: ParcelSummary[] }>(householdId ? `/api/farm/parcels?household_id=${householdId}` : '/api/farm/parcels')
      .then((body) => { setParcels(body.data ?? []); setFailed(false) })
      .catch(() => { setParcels([]); setFailed(true) })
  }, [householdId])

  const all = parcels ?? []
  const crops = Array.from(new Set(all.map((p) => p.crop_type).filter(Boolean))) as string[]
  const listed = all.filter((p) => (!status || p.status === status) && (!crop || p.crop_type === crop))
  const growing = all.filter((p) => isCultivating(p.status))
  const drawn = listed.filter((p) => p.polygon_geojson).length
  const paged = pageOf(listed, page, 5)
  const undrawn = all.filter((p) => !p.polygon_geojson).length
  // A parcel with a boundary or a recorded point is shown on the map; one with neither opens its details.
  const look = (p: ParcelSummary) => { if (p.polygon_geojson || (p.centroid_lat && p.centroid_lng)) { setFocus(p.id); setView('map') } else setOpened(p) }

  const rows = (full: boolean) => (
    <>
      <div className={table.tableWrap}>
        <table className={table.table}>
          <thead>
            <tr><th>#</th><th>Nương</th>{full && <th>Nông hộ</th>}<th>Diện tích (ha)</th><th>Giống chè</th><th>Trạng thái</th><th>Thao tác</th></tr>
          </thead>
          <tbody>
            {paged.rows.map((p, index) => (
              <tr key={p.id}>
                <td>{paged.start + index + 1}</td>
                <td><strong>{p.parcel_code}</strong></td>
                {full && <td>{p.household?.name || '—'}</td>}
                <td>{p.area_ha != null ? number(p.area_ha) : '—'}</td>
                <td>{p.crop_type || '—'}</td>
                <td><Pill tone={isCultivating(p.status) ? 'green' : 'neutral'}>{parcelStatusLabel(p.status)}</Pill></td>
                <td><button type="button" className={ui.small} aria-label={`Xem ${p.parcel_code}`} onClick={() => look(p)}><Eye size={14} aria-hidden="true" />Xem</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager current={paged.current} pages={paged.pages} start={paged.start} shown={paged.rows.length} total={listed.length} unit="thửa" onPage={setPage} />
    </>
  )

  const state = parcels === null
    ? <div className={kit.state}>Đang tải...</div>
    : failed
      ? <div className={kit.state}>{LOAD_FAILED_MESSAGE}</div>
      : listed.length === 0
        ? <EmptyState icon={<Sprout />} title="Không tìm thấy thửa đất nào" />
        : null

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<MapIcon size={28} />}
        title="Vùng trồng"
        description="Quản lý diện tích, vị trí và thông tin các nương chè của HTX."
        actions={
          <button type="button" className={kit.primary} onClick={() => toast.info('Thêm và vẽ vùng trồng là việc của cán bộ kỹ thuật.')}>
            <Plus size={16} aria-hidden="true" />Thêm vùng trồng <Sample />
          </button>
        }
      />

      {parcels !== null && !failed && (
        <StatCards items={[
          { label: 'Tổng diện tích', value: `${number(areaOf(all))} ha`, icon: <Leaf size={26} /> },
          { label: 'Tổng số nương', value: `${all.length} nương`, icon: <Layers size={26} /> },
          { label: 'Đang canh tác', value: `${growing.length} nương`, icon: <Sprout size={26} /> },
          { label: 'Tạm dừng', value: `${all.length - growing.length} nương`, icon: <PauseCircle size={26} />, tone: 'amber' },
        ]} />
      )}

      <div className={ui.bar}>
        <Tabs<View>
          label="Cách xem"
          value={view}
          onChange={(key) => { setView(key); setPage(1) }}
          items={[{ key: 'map', label: 'Bản đồ vùng trồng' }, { key: 'list', label: 'Danh sách nương' }]}
        />
        <span className={ui.grow} />
        <select className={ui.control} aria-label="Trạng thái" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Trạng thái: Tất cả</option>
          {Object.entries(PARCEL_STATUS_CONFIG).map(([key, config]) => <option key={key} value={key}>{config.label}</option>)}
        </select>
        <select className={ui.control} aria-label="Giống chè" value={crop} onChange={(e) => { setCrop(e.target.value); setPage(1) }}>
          <option value="">Giống chè: Tất cả</option>
          {crops.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      {view === 'map' ? (
        <div className={styles.workspace}>
          <div className={styles.map}>
            <ZoneMap parcels={listed} focusId={focus} satellite />
            {undrawn > 0 && <p className={styles.note}>{undrawn} thửa chưa được vẽ ranh giới; chấm trên bản đồ là vị trí đã lưu của thửa.</p>}
          </div>
          <section className={kit.card} aria-label="Danh sách vùng trồng">
            <h2 className={styles.title}><List size={18} aria-hidden="true" />Danh sách vùng trồng</h2>
            {state ?? rows(false)}
          </section>
        </div>
      ) : (
        <section className={kit.card} aria-label="Danh sách vùng trồng">
          <div className={styles.titleRow}>
            <h2 className={styles.title}><List size={18} aria-hidden="true" />Danh sách nương</h2>
            <button type="button" className={ui.small} disabled={drawn === 0} onClick={() => downloadGeoJson(listed)}><Download size={14} aria-hidden="true" />Xuất GeoJSON</button>
          </div>
          {state ?? rows(true)}
        </section>
      )}

      <Modal isOpen={!!opened} onClose={() => setOpened(null)} title={`Nương ${opened?.parcel_code ?? ''}`} size="sm">
        {opened && (
          <dl className={styles.detail}>
            <div><dt>Nông hộ</dt><dd>{opened.household?.name || '—'}</dd></div>
            <div><dt>Diện tích</dt><dd>{opened.area_ha != null ? `${number(opened.area_ha)} ha` : '—'}</dd></div>
            <div><dt>Giống chè</dt><dd>{opened.crop_type || '—'}</dd></div>
            <div><dt>Trạng thái</dt><dd>{parcelStatusLabel(opened.status)}</dd></div>
            <div><dt>Ranh giới</dt><dd>Chưa vẽ</dd></div>
          </dl>
        )}
      </Modal>
    </div>
  )
}
