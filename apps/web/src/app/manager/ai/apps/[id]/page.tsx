// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { appRequestDetail } from '@/application/appbuilder/app-request-view'
import { PrismaAppBuildRepository } from '@/infrastructure/db/appbuilder/PrismaAppBuildRepository'
import { requireTenant } from '@/lib/api/tenant'
import { isLabsEnabled } from '@/lib/labs'
import { ApproveSpecButton, CancelButton } from '../_components/AppRequestActions'
import styles from '../_components/AppRequests.module.css'

export const metadata = { title: 'Chi tiết yêu cầu app' }
export const dynamic = 'force-dynamic'

const SHOT_LABEL: Record<string, string> = {
  'desktop-light.png': 'Máy tính, nền sáng',
  'desktop-dark.png': 'Máy tính, nền tối',
  'mobile-light.png': 'Điện thoại, nền sáng',
  'mobile-dark.png': 'Điện thoại, nền tối',
}
const ROLE_VI = { farmer: 'Nông hộ', officer: 'Cán bộ', manager: 'Trưởng HTX' } as const

export default async function ManagerAiAppRequestPage({ params }: { params: Promise<{ id: string }> | { id: string } }) {
  if (!isLabsEnabled()) notFound()
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user?.role !== 'manager') redirect('/unauthorized')

  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const tenant = await requireTenant()
  const detail = await appRequestDetail(new PrismaAppBuildRepository(), tenant.htxCode, id)
  if (!detail) notFound()
  const { spec } = detail

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{spec?.name_vi ?? 'Yêu cầu app'}</h1>
          <p className={styles.subtitle}>{detail.statusVi}</p>
        </div>
        <Link href="/manager/ai/apps" className={styles.back}>Về danh sách</Link>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Yêu cầu</h2>
        <p className={styles.requestText}>{detail.requestText}</p>
        {detail.errorVi && <p className={styles.error}>{detail.errorVi}</p>}
        <div className={styles.actions}>
          {detail.specProposalId && <ApproveSpecButton proposalId={detail.specProposalId} />}
          {detail.canCancel && <CancelButton requestId={detail.id} />}
        </div>
      </section>

      {spec && (
        <section className={styles.section} aria-labelledby="spec">
          <h2 id="spec" className={styles.sectionTitle}>Đặc tả</h2>
          <p className={styles.requestText}>{spec.summary_vi}</p>
          <dl className={styles.spec}>
            <div className={styles.specRow}>
              <dt>Mã app</dt>
              <dd>{spec.app_id}</dd>
            </div>
            <div className={styles.specRow}>
              <dt>Ai dùng</dt>
              <dd>{spec.roles.map((role) => `${ROLE_VI[role.role]}: ${role.can_vi}`).join('; ')}</dd>
            </div>
            <div className={styles.specRow}>
              <dt>Màn hình</dt>
              <dd>{spec.screens.map((screen) => `${screen.title_vi} (${screen.purpose_vi})`).join('; ')}</dd>
            </div>
            {spec.data.map((table) => (
              <div key={table.table} className={styles.specRow}>
                <dt>Dữ liệu {table.table}</dt>
                <dd>{table.fields.map((field) => field.label_vi).join(', ')}</dd>
              </div>
            ))}
            {spec.agent_reads.length > 0 && (
              <div className={styles.specRow}>
                <dt>Số liệu cho trợ lý</dt>
                <dd>{spec.agent_reads.map((read) => read.description_vi).join('; ')}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {detail.gates.length > 0 && (
        <section className={styles.section} aria-labelledby="gates">
          <h2 id="gates" className={styles.sectionTitle}>Báo cáo kiểm tra {detail.buildVersion ? `(v${detail.buildVersion})` : ''}</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th scope="col">Cổng</th><th scope="col">Kết quả</th><th scope="col">Chi tiết</th></tr>
              </thead>
              <tbody>
                {detail.gates.map((gate) => (
                  <tr key={gate.name}>
                    <td>{gate.name}</td>
                    <td><span className={`${styles.pill} ${gate.ok ? styles.pillOk : styles.pillBad}`}>{gate.ok ? 'Đạt' : 'Trượt'}</span></td>
                    <td>{gate.detail_vi}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail.review && (
            <>
              <h3 className={styles.label}>AI thứ hai đọc mã</h3>
              <pre className={styles.review}>{detail.review}</pre>
            </>
          )}
        </section>
      )}

      {detail.screenshots.length > 0 && (
        <section className={styles.section} aria-labelledby="shots">
          <h2 id="shots" className={styles.sectionTitle}>Ảnh chụp</h2>
          <ul className={styles.shots}>
            {detail.screenshots.map((shot) => (
              <li key={shot.name} className={styles.shot}>
                {/* eslint-disable-next-line @next/next/no-img-element -- served by an authenticated route, not an optimisable asset */}
                <img src={shot.url} alt={SHOT_LABEL[shot.name] ?? shot.name} loading="lazy" />
                <span className={styles.hint}>{SHOT_LABEL[shot.name] ?? shot.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
