// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import styles from './AutopilotSection.module.css'

type Autonomy = 'auto' | 'unlockable' | 'never'

interface KindView {
  kind: string
  title_vi: string
  autonomy: Autonomy
  risk: 'low' | 'medium' | 'high'
  window_minutes: number
  match_rate: number | null
  sample: number
  warning: boolean
}

interface AutopilotResponse {
  enabled: boolean
  enabled_by_name: string | null
  stop_reason: string | null
  daily_cap: number
  unlocked_kinds: string[]
  kinds: KindView[]
  today: { ran: number; blocked: number; pending: number }
  can_enable: boolean
}

interface AutopilotSectionProps {
  role: 'manager' | 'officer'
  /** True when the session's last sign-in is too old to turn the mode on. */
  reauthNeeded?: boolean
}

const ACK_TEXT = 'Tôi hiểu các việc trên sẽ tự chạy dưới tên tôi và tôi chịu trách nhiệm như khi tự duyệt'
const FAILED_MESSAGE = 'Không thể thực hiện. Vui lòng thử lại.'

const STOP_REASON_VI: Record<string, string> = {
  manual: 'Đã dừng theo yêu cầu.',
  enabler_lost: 'Đã dừng vì người bật không còn là trưởng HTX.',
  inactive: 'Đã dừng vì 7 ngày không có trưởng HTX nào thao tác.',
  brake_failures: 'Đã dừng (phanh): có 3 việc tự chạy bị lỗi trong 1 giờ.',
  brake_cap: 'Đã dừng (phanh): đã tự chạy đủ số việc tối đa trong ngày.',
  brake_blocks: 'Đã dừng (phanh): hơn 30% việc trong ngày bị chặn.',
  brake_volume: 'Đã dừng (phanh): một agent đề xuất nhiều gấp 3 lần mức thường ngày.',
}

function windowLabel(minutes: number): string {
  if (minutes === 0) return 'chạy ở lượt kế tiếp'
  if (minutes >= 60 && minutes % 60 === 0) return `chờ ${minutes / 60} giờ để chặn`
  return `chờ ${minutes} phút để chặn`
}

function RateLine({ kind }: { kind: KindView }) {
  if (kind.match_rate === null) return <span className={styles.rate}>Chưa có dữ liệu so sánh</span>
  const percent = Math.round(kind.match_rate * 100)
  return (
    <span className={kind.warning ? styles.rateWarning : styles.rate}>
      Khớp {percent}% ({kind.sample} đề xuất 30 ngày){kind.warning ? '. Dưới 90%: người thường quyết định khác AI' : ''}
    </span>
  )
}

/** "Tự vận hành" on the agent settings page: the enable screen, the status and the stop button (spec §11, contract C4). */
export function AutopilotSection({ role, reauthNeeded = false }: AutopilotSectionProps) {
  const [data, setData] = useState<AutopilotResponse | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [opened, setOpened] = useState<string[]>([])
  const [capText, setCapText] = useState('50')
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsLogin, setNeedsLogin] = useState(reauthNeeded)

  useEffect(() => {
    let cancelled = false
    fetchJson<{ data: AutopilotResponse }>('/api/agent/autopilot')
      .then((json) => {
        if (cancelled) return
        setData(json.data)
        setCapText(String(json.data.daily_cap))
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const post = async (path: string, body?: unknown): Promise<{ ok: boolean; status: number; json: any }> => {
    const response = await fetch(`/api/agent/autopilot${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { ok: response.ok, status: response.status, json: await response.json().catch(() => ({})) }
  }

  const enable = async () => {
    if (needsLogin) {
      // A fresh sign-in, then back to this page: Keycloak is asked for the credentials again.
      await signIn('keycloak', { callbackUrl: `/${role}/ai/settings` }, { prompt: 'login' })
      return
    }
    const cap = Number(capText)
    if (!Number.isInteger(cap) || cap < 1 || cap > 50) {
      setError('Giới hạn mỗi ngày phải là số nguyên từ 1 đến 50.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await post('/enable', { unlocked_kinds: opened, daily_cap: cap, acknowledged })
      if (result.status === 401 && result.json?.error?.code === 'REAUTH_REQUIRED') {
        setNeedsLogin(true)
        setError('Cần đăng nhập lại để xác nhận đây là bạn.')
        return
      }
      if (!result.ok) {
        setError(result.json?.error?.message || FAILED_MESSAGE)
        return
      }
      setData({ ...result.json.data, can_enable: true })
      setAcknowledged(false)
      toast.success('Đã bật tự vận hành')
    } catch {
      setError(FAILED_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  const stop = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await post('/stop')
      if (!result.ok) {
        setError(result.json?.error?.message || FAILED_MESSAGE)
        return
      }
      setData({ ...result.json.data, can_enable: role === 'manager' })
      toast.success('Đã dừng tự vận hành')
    } catch {
      setError(FAILED_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  if (loadFailed) {
    return (
      <div className={styles.container}>
        <p role="alert" className={styles.error}>{LOAD_FAILED_MESSAGE}</p>
      </div>
    )
  }
  if (!data) {
    return (
      <div className={styles.container}>
        <p className={styles.note} role="status">Đang tải tự vận hành…</p>
      </div>
    )
  }

  const group = (autonomy: Autonomy) => data.kinds.filter((k) => k.autonomy === autonomy)
  const toggle = (kind: string) =>
    setOpened((current) => (current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]))
  const unlockedTitles = data.kinds.filter((k) => data.unlocked_kinds.includes(k.kind)).map((k) => k.title_vi)

  return (
    <div className={styles.container}>
      <section className={styles.section} aria-labelledby="autopilot-heading">
        <div className={styles.titleRow}>
          <h2 id="autopilot-heading" className={styles.sectionTitle}>Tự vận hành</h2>
          <span className={data.enabled ? styles.pillOn : styles.pillOff}>{data.enabled ? 'Đang bật' : 'Đang tắt'}</span>
        </div>

        {data.enabled ? (
          <>
            <p className={styles.note}>
              Bật bởi {data.enabled_by_name ?? 'trưởng HTX'}. Đề xuất đủ điều kiện tự chạy sau thời gian chờ; ai cũng có thể chặn trước giờ chạy.
            </p>
            <dl className={styles.stats}>
              <div className={styles.stat}><dt>Đã tự chạy hôm nay</dt><dd>{data.today.ran}/{data.daily_cap}</dd></div>
              <div className={styles.stat}><dt>Bị chặn hôm nay</dt><dd>{data.today.blocked}</dd></div>
              <div className={styles.stat}><dt>Đang chờ giờ chạy</dt><dd>{data.today.pending}</dd></div>
            </dl>
            {unlockedTitles.length > 0 && <p className={styles.note}>Đã mở thêm: {unlockedTitles.join(', ')}.</p>}
            <div className={styles.actions}>
              <Button variant="danger" onClick={stop} isLoading={busy}>Dừng ngay</Button>
            </div>
          </>
        ) : (
          <>
            {data.stop_reason && <p className={styles.notice}>{STOP_REASON_VI[data.stop_reason] ?? 'Đã dừng.'} Chỉ bật lại được trên web.</p>}
            {role === 'officer' || !data.can_enable ? (
              <p className={styles.note}>Chỉ trưởng HTX được bật tự vận hành. Cán bộ xem trạng thái và dừng được khi chế độ đang bật.</p>
            ) : (
              <>
                <p className={styles.note}>
                  Khi bật, các việc dưới đây tự chạy sau thời gian chờ. Bạn và cán bộ nhận tin Telegram trước mỗi việc và có thể chặn.
                </p>

                <KindGroup title="Tự chạy" hint="Chạy sau thời gian chờ khi tự vận hành bật." kinds={group('auto')} />

                <div className={styles.group}>
                  <h3 className={styles.groupTitle}>Có thể mở thêm</h3>
                  <p className={styles.hint}>Mặc định luôn cần người duyệt. Chỉ tick những việc bạn muốn cho tự chạy.</p>
                  <ul className={styles.list}>
                    {group('unlockable').map((k) => {
                      const id = `unlock-${k.kind}`
                      return (
                        <li key={k.kind} className={styles.row}>
                          <label htmlFor={id} className={styles.check}>
                            <input id={id} type="checkbox" checked={opened.includes(k.kind)} onChange={() => toggle(k.kind)} />
                            <span className={styles.kindTitle}>{k.title_vi}</span>
                          </label>
                          <span className={styles.meta}>{windowLabel(k.window_minutes)}</span>
                          <RateLine kind={k} />
                        </li>
                      )
                    })}
                  </ul>
                </div>

                <KindGroup title="Luôn cần người" hint="Không bao giờ tự chạy, dù cài đặt thế nào." kinds={group('never')} plain />

                <label htmlFor="autopilot-cap" className={styles.field}>
                  <span className={styles.fieldLabel}>Tối đa việc tự chạy mỗi ngày (1 đến 50)</span>
                  <input
                    id="autopilot-cap"
                    className={styles.input}
                    type="number"
                    min="1"
                    max="50"
                    step="1"
                    inputMode="numeric"
                    value={capText}
                    onChange={(e) => setCapText(e.target.value)}
                  />
                </label>

                <label htmlFor="autopilot-ack" className={styles.ack}>
                  <input id="autopilot-ack" type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                  <span>{ACK_TEXT}</span>
                </label>

                {needsLogin && <p className={styles.notice}>Để bật, bạn cần đăng nhập lại trong vòng 5 phút trước đó.</p>}
                <div className={styles.actions}>
                  <Button variant="primary" onClick={enable} isLoading={busy} disabled={!acknowledged}>
                    {needsLogin ? 'Đăng nhập lại để bật' : 'Bật tự vận hành'}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </section>
    </div>
  )
}

function KindGroup({ title, hint, kinds, plain = false }: { title: string; hint: string; kinds: KindView[]; plain?: boolean }) {
  return (
    <div className={styles.group}>
      <h3 className={styles.groupTitle}>{title}</h3>
      <p className={styles.hint}>{hint}</p>
      <ul className={styles.list}>
        {kinds.map((k) => (
          <li key={k.kind} className={styles.row}>
            <span className={styles.kindTitle}>{k.title_vi}</span>
            {!plain && <span className={styles.meta}>{windowLabel(k.window_minutes)}</span>}
            {!plain && <RateLine kind={k} />}
          </li>
        ))}
      </ul>
    </div>
  )
}
