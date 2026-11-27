// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { listAppRequests, type AppRequestSummary } from '@/application/appbuilder/app-request-view'
import { ACTIVE_REQUEST_STATUSES } from '@/domain/appbuilder/app-build'
import { PrismaAppBuildRepository } from '@/infrastructure/db/appbuilder/PrismaAppBuildRepository'
import { requireTenant } from '@/lib/api/tenant'
import { isLabsEnabled } from '@/lib/labs'
import { AnswerForm, CancelButton, NewRequestForm } from './_components/AppRequestActions'
import styles from './_components/AppRequests.module.css'

export const metadata = { title: 'Xưởng mini-app' }
export const dynamic = 'force-dynamic'

const pillClass = (status: AppRequestSummary['status']) =>
  ['passed', 'installed'].includes(status) ? styles.pillOk : status === 'failed' ? styles.pillBad : ['asking', 'spec_proposed'].includes(status) ? styles.pillWait : styles.pill

export default async function ManagerAiAppsPage() {
  if (!isLabsEnabled()) notFound()
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user?.role !== 'manager') redirect('/unauthorized')

  const tenant = await requireTenant()
  const requests = await listAppRequests(new PrismaAppBuildRepository(), tenant.htxCode)
  const active = requests.some((request) => ACTIVE_REQUEST_STATUSES.includes(request.status))

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Xưởng mini-app</h1>
          <p className={styles.subtitle}>Nói bạn cần app gì. Trợ lý chọn cách rẻ nhất: app có sẵn, Sổ tự tạo, hoặc viết app mới.</p>
        </div>
        <Link href="/manager/ai" className={styles.back}>Về hộp duyệt</Link>
      </header>

      <section className={styles.section} aria-labelledby="new-request">
        <h2 id="new-request" className={styles.sectionTitle}>Yêu cầu mới</h2>
        <NewRequestForm disabledReason={active ? 'HTX đang có một yêu cầu xây app chưa xong.' : null} />
      </section>

      <section className={styles.section} aria-labelledby="request-list">
        <h2 id="request-list" className={styles.sectionTitle}>Các yêu cầu</h2>
        {requests.length === 0 ? (
          <p className={styles.empty}>Chưa có yêu cầu nào.</p>
        ) : (
          <ul className={styles.list}>
            {requests.map((request) => (
              <li key={request.id} className={styles.item}>
                <div className={styles.itemHead}>
                  <span className={`${styles.pill} ${pillClass(request.status)}`}>{request.statusVi}</span>
                  <span className={styles.hint}>{new Date(request.createdAt).toLocaleDateString('vi-VN')}</span>
                </div>
                <p className={styles.requestText}>{request.requestText}</p>
                {request.errorVi && <p className={styles.error}>{request.errorVi}</p>}
                {request.answerText && <p className={styles.hint}>Bạn đã trả lời: {request.answerText}</p>}
                {request.canAnswer && <AnswerForm requestId={request.id} questions={request.questions} />}
                <div className={styles.actions}>
                  <Link href={`/manager/ai/apps/${request.id}`} className={styles.link}>Xem chi tiết</Link>
                  {request.canCancel && <CancelButton requestId={request.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
