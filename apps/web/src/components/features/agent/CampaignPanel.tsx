// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Button, Card, Modal, Pill, Skeleton } from '@/components/ui'
import type { ApproveCampaignResult } from '@/application/agent/campaign/ApproveCampaignUseCase'
import type { CampaignView } from '@/application/agent/campaign/campaign-view'
import { formatIsoDate, TELEGRAM_TEXT } from '@/application/telegram/messages'
import type { CampaignStatus, } from '@/domain/agent/campaign'
import type { ProposalStatus } from '@/domain/agent/proposal'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import styles from './CampaignPanel.module.css'

/** Sent after any campaign or proposal decision, so the panel and the inbox list reload together. */
export const CAMPAIGN_CHANGED_EVENT = 'dxos:campaign-changed'

const DECISION_FAILED = 'Không cập nhật được chiến dịch. Vui lòng thử lại.'

const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: 'green' | 'amber' | 'blue' | 'neutral' }> = {
  draft: { label: 'Chờ duyệt', tone: 'amber' },
  approved: { label: 'Đã duyệt', tone: 'green' },
  partial: { label: 'Duyệt một phần', tone: 'blue' },
  done: { label: 'Đã xong', tone: 'green' },
  dropped: { label: 'Đã bỏ', tone: 'neutral' },
}

const ITEM_STATUS: Record<ProposalStatus, string> = {
  proposed: 'Chờ duyệt',
  approved: 'Đã duyệt',
  executed: 'Đã thực hiện',
  failed: 'Thực thi lỗi',
  rejected: 'Đã từ chối',
  expired: 'Hết hạn',
  stale: 'Dữ liệu đã đổi',
}

export interface CampaignPanelViewProps {
  campaign: CampaignView
  busy: boolean
  result: ApproveCampaignResult | null
  error: string | null
  onApproveAll: () => void
  onDrop: () => void
}

/** The campaign card: summary, items, the two decisions and the result line. Presentational only. */
export function CampaignPanelView({ campaign, busy, result, error, onApproveAll, onDrop }: CampaignPanelViewProps) {
  const [confirmDrop, setConfirmDrop] = useState(false)
  const open = campaign.status === 'draft' || campaign.status === 'partial'
  const status = CAMPAIGN_STATUS[campaign.status]

  return (
    <Card className={styles.panel} aria-labelledby="campaign-panel-title">
      <div className={styles.header}>
        <div className={styles.heading}>
          <h2 id="campaign-panel-title" className={styles.title}>Chiến dịch hôm nay</h2>
          <p className={styles.day}>Ngày {formatIsoDate(campaign.day)}</p>
        </div>
        <Pill tone={status.tone} size="md">{status.label}</Pill>
      </div>

      <p className={styles.summary}>{campaign.summaryVi}</p>

      <ol className={styles.items}>
        {campaign.items.map((item) => (
          <li key={item.proposalId} className={styles.item}>
            <span className={styles.position} aria-hidden="true">{item.position}</span>
            <div className={styles.itemBody}>
              <span className={styles.itemTitle}>{item.titleVi}</span>
              <span className={styles.itemGoal}>{item.goalLine}</span>
            </div>
            <div className={styles.itemMeta}>
              {item.risk === 'high' && <Pill tone="amber">Rủi ro cao</Pill>}
              <span className={styles.itemStatus}>{ITEM_STATUS[item.status]}</span>
              <a className={styles.itemLink} href={`#proposal-${item.proposalId}`}>Xem trong danh sách</a>
            </div>
          </li>
        ))}
      </ol>

      {open && (
        <div className={styles.actions}>
          <Button variant="primary" onClick={onApproveAll} isLoading={busy}>Duyệt cả chiến dịch</Button>
          <Button variant="secondary" onClick={() => setConfirmDrop(true)} disabled={busy}>Bỏ chiến dịch</Button>
        </div>
      )}

      {result && <p role="status" className={styles.result}>{TELEGRAM_TEXT.campaignApproved(result)}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}

      <Modal isOpen={confirmDrop} onClose={() => setConfirmDrop(false)} title="Bỏ chiến dịch hôm nay?" size="sm">
        <p className={styles.confirmText}>
          Các việc trong chiến dịch sẽ trở lại thành đề xuất thường, chờ duyệt như trước.
        </p>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => setConfirmDrop(false)}>Quay lại</Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmDrop(false)
              onDrop()
            }}
          >
            Bỏ chiến dịch
          </Button>
        </div>
      </Modal>
    </Card>
  )
}

/** Loads today's campaign and decides it. Renders nothing when the cooperative has no campaign today. */
export function CampaignPanel() {
  const [campaign, setCampaign] = useState<CampaignView | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ApproveCampaignResult | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [decisionError, setDecisionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const json = await fetchJson<{ campaign: CampaignView | null }>('/api/agent/campaigns/today')
      setCampaign(json.campaign)
      setLoadError(null)
    } catch {
      setLoadError(LOAD_FAILED_MESSAGE)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    load()
    window.addEventListener(CAMPAIGN_CHANGED_EVENT, load)
    return () => window.removeEventListener(CAMPAIGN_CHANGED_EVENT, load)
  }, [load])

  const decide = async (decision: 'approve_all' | 'drop') => {
    if (!campaign) return
    setBusy(true)
    setDecisionError(null)
    try {
      const res = await fetch(`/api/agent/campaigns/${campaign.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDecisionError(json?.error?.message || DECISION_FAILED)
        await load()
        return
      }
      if (decision === 'approve_all') setResult(json.data)
      window.dispatchEvent(new Event(CAMPAIGN_CHANGED_EVENT))
    } catch {
      setDecisionError(DECISION_FAILED)
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) {
    return (
      <Card className={styles.panel} aria-busy="true">
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="100%" />
      </Card>
    )
  }
  if (!campaign) return loadError ? <p role="alert" className={styles.error}>{loadError}</p> : null
  return (
    <CampaignPanelView
      campaign={campaign}
      busy={busy}
      result={result}
      error={decisionError}
      onApproveAll={() => decide('approve_all')}
      onDrop={() => decide('drop')}
    />
  )
}
