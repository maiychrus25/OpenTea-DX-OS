// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui'
import styles from './AppRequests.module.css'

const FAILED_MESSAGE = 'Không thể thực hiện. Vui lòng thử lại.'

/** POST to a route and refresh the server page; the message of a refusal is shown as it came. */
function useAction(refresh: boolean = true) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function run(url: string, body: unknown, done: string): Promise<boolean> {
    setBusy(true)
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        toast.error(payload?.error?.message ?? FAILED_MESSAGE)
        return false
      }
      toast.success(done)
      if (refresh) router.refresh()
      return true
    } catch {
      toast.error(FAILED_MESSAGE)
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}

export function NewRequestForm({ disabledReason }: { disabledReason: string | null }) {
  const [text, setText] = useState('')
  const { busy, run } = useAction()
  const tooShort = text.trim().length < 5
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (await run('/api/agent/app-requests', { request_text: text }, 'Đã nhận yêu cầu')) setText('')
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor="app-request-text" className={styles.label}>Bạn cần app làm gì?</label>
      <textarea
        id="app-request-text"
        className={styles.textarea}
        value={text}
        maxLength={500}
        rows={3}
        placeholder="Ví dụ: cần app theo dõi kho phân bón của hợp tác xã"
        onChange={(event) => setText(event.target.value)}
        disabled={disabledReason !== null}
      />
      <div className={styles.formFoot}>
        <span className={styles.hint}>{disabledReason ?? `${text.length}/500 ký tự`}</span>
        <Button type="submit" isLoading={busy} disabled={tooShort || disabledReason !== null}>Gửi yêu cầu</Button>
      </div>
    </form>
  )
}

export function AnswerForm({ requestId, questions }: { requestId: string; questions: string[] }) {
  const [text, setText] = useState('')
  const { busy, run } = useAction()
  return (
    <form
      className={styles.form}
      onSubmit={async (event) => {
        event.preventDefault()
        await run(`/api/agent/app-requests/${requestId}/answer`, { answer_text: text }, 'Đã gửi câu trả lời')
      }}
    >
      <p className={styles.label}>Trợ lý hỏi thêm:</p>
      <ol className={styles.questions}>
        {questions.map((question) => <li key={question}>{question}</li>)}
      </ol>
      <label htmlFor={`answer-${requestId}`} className={styles.label}>Câu trả lời của bạn</label>
      <textarea id={`answer-${requestId}`} className={styles.textarea} value={text} rows={3} maxLength={1000} onChange={(event) => setText(event.target.value)} />
      <div className={styles.formFoot}>
        <span className={styles.hint}>{text.length}/1000 ký tự</span>
        <Button type="submit" isLoading={busy} disabled={text.trim().length === 0}>Gửi câu trả lời</Button>
      </div>
    </form>
  )
}

export function CancelButton({ requestId }: { requestId: string }) {
  const { busy, run } = useAction()
  return (
    <Button variant="ghost" size="sm" isLoading={busy} onClick={() => run(`/api/agent/app-requests/${requestId}/cancel`, {}, 'Đã huỷ yêu cầu')}>
      Huỷ yêu cầu
    </Button>
  )
}

export function ApproveSpecButton({ proposalId }: { proposalId: string }) {
  const { busy, run } = useAction()
  return (
    <Button isLoading={busy} onClick={() => run(`/api/agent/proposals/${proposalId}/decision`, { decision: 'approve' }, 'Đã duyệt đặc tả. App sẽ được xây.')}>
      Duyệt đặc tả
    </Button>
  )
}
