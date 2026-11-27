// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Modal } from '@/components/ui'
import {
  AGENT_PROVIDERS,
  CONFIGURABLE_AGENTS,
  DEFAULT_REPORT_TIME,
  EXTERNAL_PROVIDERS,
  REPORT_TIME_PATTERN,
  type AgentProvider,
  type ConfigurableAgent,
} from '@/domain/agent/settings'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import styles from './AgentSettingsPanel.module.css'

interface AgentSettingsResponse {
  agents: Record<ConfigurableAgent, { provider: AgentProvider; model: string | null }>
  report_time: string
  budget: { monthly_limit_usd: number | null; spent_usd: number; month: string; exhausted: boolean }
  providers: AgentProvider[]
  can_edit: boolean
}

interface AgentForm {
  provider: AgentProvider
  model: string
}

interface Draft {
  agents: Record<ConfigurableAgent, AgentForm>
  reportTime: string
  limitText: string
}

interface AgentSettingsPanelProps {
  role: 'manager' | 'officer'
}

const AGENT_LABEL: Record<ConfigurableAgent, string> = {
  'journal-review': 'Soát nhật ký (A1)',
  digest: 'Báo cáo tóm tắt (A6)',
  bulletin: 'Bản tin thị trường (A5)',
  assistant: 'Trợ lý Telegram (A7)',
  'daily-campaign': 'Chiến dịch ngày (A9)',
  improvement: 'Cải tiến hằng tuần (A10)',
  'app-builder': 'Xưởng mini-app (A12)',
  strategy: 'Kế hoạch mùa vụ (A11)',
}

/** What leaves the server when the agent uses an external provider. */
const AGENT_SHARES: Record<ConfigurableAgent, string> = {
  bulletin:
    'Dòng giá thị trường của mặt hàng: nguồn, chỉ số, giá trị, đơn vị và kỳ. Không có dữ liệu của nông hộ.',
  'journal-review':
    'Nhật ký chờ duyệt: mã thửa, ngày, hoạt động, thuốc, liều, số ngày cách ly và ghi chú. Số điện thoại, e-mail và số giấy tờ trong ghi chú được che; tên người viết trong ghi chú không được che. Không gửi ảnh nông hộ.',
  digest:
    'Chỉ số của bảng điều hành, đề xuất đang mở và lỗi hệ thống; không có tên hay số điện thoại của nông hộ.',
  assistant:
    'Câu bạn nhắn cho trợ lý (đã che số điện thoại, e-mail và số giấy tờ). Không gửi ảnh, vị trí hay dữ liệu trả lời.',
  'daily-campaign':
    'Tên các việc đề xuất hôm nay và mục tiêu của chúng (số thửa, số nhật ký). Không có tên hay số điện thoại của nông hộ.',
  'app-builder':
    'Yêu cầu app của trưởng HTX và câu trả lời của họ, tên và mô tả các app trong Kho ứng dụng. Không có dữ liệu của nông hộ.',
  improvement:
    'Số liệu tổng hợp của agent và chiến dịch (tỉ lệ duyệt, thời gian chờ, số ngày trượt mục tiêu). Không có tên hay số điện thoại của nông hộ.',
  strategy:
    'Số liệu tổng hợp của HTX theo quý (sản lượng, tỉ lệ nhật ký đúng hạn, tỉ lệ thửa có bệnh, doanh thu cửa hàng). Không có tên hay số điện thoại của nông hộ.',
}

const PROVIDER_LABEL: Record<AgentProvider, string> = {
  ollama: 'Ollama (máy chủ HTX)',
  anthropic: 'Claude (Anthropic)',
  openai: 'OpenAI',
}

const VENDOR_NAME: Partial<Record<AgentProvider, string>> = { anthropic: 'Anthropic', openai: 'OpenAI' }

const SAVE_FAILED_MESSAGE = 'Không thể lưu cài đặt. Vui lòng thử lại.'

function draftFrom(data: AgentSettingsResponse): Draft {
  const agents = Object.fromEntries(
    CONFIGURABLE_AGENTS.map((agent) => [
      agent,
      { provider: data.agents[agent].provider, model: data.agents[agent].model ?? '' },
    ])
  ) as Record<ConfigurableAgent, AgentForm>
  return {
    agents,
    reportTime: data.report_time || DEFAULT_REPORT_TIME,
    limitText: data.budget.monthly_limit_usd === null ? '' : String(data.budget.monthly_limit_usd),
  }
}

/** `2026-11` becomes `11/2026`. */
function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-')
  return `${monthNumber}/${year}`
}

/** Manager edits the agents' providers, models, report time and the monthly budget; officers see the same values read-only. */
export function AgentSettingsPanel({ role }: AgentSettingsPanelProps) {
  const [settings, setSettings] = useState<AgentSettingsResponse | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // An external provider is chosen in the list only after the manager confirms what leaves the server.
  const [pending, setPending] = useState<{ agent: ConfigurableAgent; provider: AgentProvider } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchJson<{ data: AgentSettingsResponse }>('/api/agent/settings')
      .then((json) => {
        if (cancelled) return
        setSettings(json.data)
        setDraft(draftFrom(json.data))
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const patchAgent = (agent: ConfigurableAgent, patch: Partial<AgentForm>) => {
    setDraft((current) =>
      current && { ...current, agents: { ...current.agents, [agent]: { ...current.agents[agent], ...patch } } }
    )
  }

  const chooseProvider = (agent: ConfigurableAgent, provider: AgentProvider) => {
    if (EXTERNAL_PROVIDERS.includes(provider) && provider !== draft?.agents[agent].provider) {
      setPending({ agent, provider })
      return
    }
    patchAgent(agent, { provider })
  }

  const confirmProvider = () => {
    if (pending) patchAgent(pending.agent, { provider: pending.provider })
    setPending(null)
  }

  const save = async () => {
    if (!draft) return
    const limit = draft.limitText.trim() === '' ? null : Number(draft.limitText)
    if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) {
      setError('Ngân sách phải là số dương, hoặc để trống nếu không giới hạn.')
      return
    }
    const missingModel = CONFIGURABLE_AGENTS.find(
      (agent) => draft.agents[agent].provider === 'openai' && draft.agents[agent].model.trim() === ''
    )
    if (missingModel) {
      setError(`${AGENT_LABEL[missingModel]}: OpenAI cần tên model. Nhập tên model trước khi lưu.`)
      return
    }
    if (!REPORT_TIME_PATTERN.test(draft.reportTime)) {
      setError('Giờ gửi báo cáo không hợp lệ.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/agent/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agents: Object.fromEntries(
            CONFIGURABLE_AGENTS.map((agent) => [
              agent,
              { provider: draft.agents[agent].provider, model: draft.agents[agent].model.trim() || null },
            ])
          ),
          report_time: draft.reportTime,
          monthly_limit_usd: limit,
        }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(json?.error?.message || SAVE_FAILED_MESSAGE)
        return
      }
      setSettings((current) => (current ? { ...current, ...json.data } : current))
      setDraft(draftFrom(json.data))
      toast.success('Đã lưu cài đặt agent')
    } catch {
      setError(SAVE_FAILED_MESSAGE)
    } finally {
      setSaving(false)
    }
  }

  if (loadFailed) {
    return (
      <div className={styles.container}>
        <p role="alert" className={styles.error}>{LOAD_FAILED_MESSAGE}</p>
      </div>
    )
  }
  if (!settings || !draft) {
    return (
      <div className={styles.container}>
        <p className={styles.note} role="status">Đang tải cài đặt…</p>
      </div>
    )
  }

  const readOnly = !settings.can_edit
  const externalReady = settings.providers.some((provider) => EXTERNAL_PROVIDERS.includes(provider))
  const providerOptions = AGENT_PROVIDERS.filter((provider) => provider === 'ollama' || settings.providers.includes(provider))
  const { budget } = settings

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>TRỢ LÝ VẬN HÀNH ({role === 'manager' ? 'TRƯỞNG HTX' : 'CÁN BỘ KT'})</span>
        <h1 className={styles.title}>Cài đặt agent</h1>
        <p className={styles.subtitle}>Chọn nhà cung cấp mô hình cho từng agent và ngân sách tháng của HTX.</p>
        <Link href={`/${role}/ai`} className={styles.backLink}>Quay lại hộp duyệt đề xuất</Link>
      </header>

      {readOnly && (
        <p className={styles.note}>Bạn đang xem ở chế độ chỉ đọc. Chỉ trưởng HTX được thay đổi cài đặt agent.</p>
      )}
      {!externalReady && (
        <p className={styles.note}>
          Máy chủ chưa bật nhà cung cấp ngoài nào. Người vận hành cần đặt khoá API cho agent; đến lúc đó agent chỉ dùng Ollama.
        </p>
      )}

      <section className={styles.section} aria-labelledby="agent-settings-heading">
        <h2 id="agent-settings-heading" className={styles.sectionTitle}>Agent</h2>
        {CONFIGURABLE_AGENTS.map((agent) => {
          const choice = draft.agents[agent]
          const modelId = `model-${agent}`
          return (
            <fieldset key={agent} className={styles.agentRow}>
              <legend className={styles.legend}>{AGENT_LABEL[agent]}</legend>
              <div className={styles.fields}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Nhà cung cấp mô hình</span>
                  <select
                    className={styles.input}
                    value={choice.provider}
                    disabled={readOnly}
                    onChange={(e) => chooseProvider(agent, e.target.value as AgentProvider)}
                  >
                    {providerOptions.map((provider) => (
                      <option key={provider} value={provider}>{PROVIDER_LABEL[provider]}</option>
                    ))}
                  </select>
                </label>
                <label htmlFor={modelId} className={styles.field}>
                  <span className={styles.fieldLabel}>Tên model (tuỳ chọn)</span>
                  <input
                    id={modelId}
                    className={styles.input}
                    type="text"
                    maxLength={128}
                    value={choice.model}
                    placeholder={choice.provider === 'openai' ? 'Bắt buộc với OpenAI' : 'Để trống để dùng model mặc định'}
                    required={choice.provider === 'openai'}
                    aria-describedby={choice.provider === 'openai' ? `${modelId}-hint` : undefined}
                    disabled={readOnly}
                    onChange={(e) => patchAgent(agent, { model: e.target.value })}
                  />
                  {choice.provider === 'openai' && (
                    <span id={`${modelId}-hint`} className={styles.share}>
                      Với OpenAI phải nhập tên model. Nếu để trống, agent không có model và sẽ dùng Ollama.
                    </span>
                  )}
                </label>
                {agent === 'digest' && (
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Giờ gửi báo cáo</span>
                    <input
                      className={styles.input}
                      type="time"
                      value={draft.reportTime}
                      disabled={readOnly}
                      onChange={(e) => setDraft((current) => current && { ...current, reportTime: e.target.value })}
                    />
                  </label>
                )}
              </div>
              {choice.provider !== 'ollama' && (
                <p className={styles.share}>
                  Dữ liệu gửi tới {VENDOR_NAME[choice.provider]}: {AGENT_SHARES[agent]}
                </p>
              )}
            </fieldset>
          )
        })}
      </section>

      <section className={styles.section} aria-labelledby="budget-heading">
        <h2 id="budget-heading" className={styles.sectionTitle}>Ngân sách tháng</h2>
        <label htmlFor="monthly-limit" className={styles.field}>
          <span className={styles.fieldLabel}>Ngân sách của HTX (USD mỗi tháng)</span>
          <input
            id="monthly-limit"
            className={styles.input}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={draft.limitText}
            placeholder="Để trống nếu không giới hạn"
            disabled={readOnly}
            onChange={(e) => setDraft((current) => current && { ...current, limitText: e.target.value })}
          />
        </label>
        <p className={styles.spend}>
          Đã dùng tháng {formatMonth(budget.month)}: {budget.spent_usd.toFixed(2)} USD
          {budget.monthly_limit_usd !== null ? ` trên ${budget.monthly_limit_usd.toFixed(2)} USD` : ''}
        </p>
        {budget.exhausted && (
          <p className={styles.note}>Đã hết ngân sách tháng này: agent dùng Ollama đến hết tháng.</p>
        )}
      </section>

      {error && <p role="alert" className={styles.error}>{error}</p>}

      {!readOnly && (
        <div className={styles.actions}>
          <Button variant="primary" onClick={save} isLoading={saving}>Lưu cài đặt</Button>
        </div>
      )}

      <Modal
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        title="Gửi dữ liệu ra ngoài máy chủ của HTX?"
        size="md"
      >
        {pending && (
          <div className={styles.confirm}>
            <p>
              {AGENT_LABEL[pending.agent]} sẽ dùng {VENDOR_NAME[pending.provider]}. Khi bật, dữ liệu sau rời máy chủ của HTX:
            </p>
            <p className={styles.share}>{AGENT_SHARES[pending.agent]}</p>
            <p>Dữ liệu này được gửi tới {VENDOR_NAME[pending.provider]}. Ollama thì mọi dữ liệu vẫn nằm trong máy chủ của HTX.</p>
            {pending.agent === 'journal-review' && (
              <p>
                Ghi chú trong nhật ký được gửi kèm, với số điện thoại, địa chỉ e-mail và số giấy tờ đã được che. Tên người viết trong ghi chú không được che tự động.
              </p>
            )}
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setPending(null)}>Huỷ</Button>
              <Button variant="primary" onClick={confirmProvider}>Đồng ý, chọn {VENDOR_NAME[pending.provider]}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
