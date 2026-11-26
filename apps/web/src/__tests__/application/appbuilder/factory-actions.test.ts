/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ACTION_CATALOG } from '@/application/agent/action-catalog'
import { appSpecApproveAction } from '@/application/agent/actions/app-spec-approve.action'
import { miniappInstallAction } from '@/application/agent/actions/miniapp-install.action'
import { miniappRemoveAction } from '@/application/agent/actions/miniapp-remove.action'
import { autoEligibility } from '@/application/agent/autopilot/eligibility'
import { requestEvidenceRow } from '@/application/appbuilder/evidence'
import type { AppBuildRequest } from '@/domain/appbuilder/app-build'
import { evidenceDigest } from '@/domain/agent/evidence'

const spec = {
  app_id: 'gen-kho-phan', name_vi: 'Kho phân bón', summary_vi: 'Theo dõi phân bón', roles: [{ role: 'manager', can_vi: 'xem' }],
  screens: [{ path: '/', title_vi: 'Tồn kho', purpose_vi: 'xem' }],
  data: [{ table: 'stock', fields: [{ name: 'kind', type: 'text', label_vi: 'Loại phân' }] }], agent_reads: [],
}
const request = { id: '11111111-1111-4111-8111-111111111111', htxCode: 'TC', status: 'spec_proposed', path: 'build', appId: 'gen-kho-phan', spec } as unknown as AppBuildRequest

describe('the factory actions in the catalogue (contract C3)', () => {
  it('are registered with the risk and autonomy of the contract', () => {
    expect(ACTION_CATALOG['app.spec.approve']).toMatchObject({ risk: 'medium', autonomy: 'auto', approverRoles: ['manager'] })
    for (const kind of ['miniapp.install', 'miniapp.remove']) expect(ACTION_CATALOG[kind]).toMatchObject({ risk: 'high', autonomy: 'unlockable', approverRoles: ['manager'] })
  })

  it('never run on their own until the kind is unlocked, for install and remove', () => {
    const evidence = { rows: [], sha256: evidenceDigest([]) }
    for (const def of [miniappInstallAction, miniappRemoveAction] as unknown as Parameters<typeof autoEligibility>[1][]) {
      expect(autoEligibility({ origin: 'agent', payload: {}, evidence }, def, { unlockedKinds: [] }).reason).toBe('not_unlocked')
    }
  })

  it('previews the spec for approval, with the build time', () => {
    const row = requestEvidenceRow(request, null)
    const lines = appSpecApproveAction.preview({ request_id: request.id }, undefined, { rows: [row], sha256: evidenceDigest([row]) })
    expect(lines.join('\n')).toContain('Kho phân bón')
    expect(lines.join('\n')).toContain('Loại phân')
    expect(lines.at(-1)).toBe('Xây mất khoảng 10–30 phút.')
  })

  it('previews an install of a generated app with the label and the gate summary', () => {
    const row = requestEvidenceRow({ ...request, status: 'passed' } as AppBuildRequest, { gates: [{ ok: true }, { ok: true }, { ok: false }] } as never)
    const lines = miniappInstallAction.preview({ app_id: 'gen-kho-phan' }, undefined, { rows: [row], sha256: evidenceDigest([row]) })
    expect(lines).toEqual(['Bật "Kho phân bón" cho HTX của bạn', 'App do AI xây', 'Qua 2/3 cổng kiểm tra'])
  })

  it('accepts payloads of the manifest id shape only, and no extra keys', () => {
    expect(miniappInstallAction.payloadSchema.safeParse({ app_id: 'gen-kho-phan' }).success).toBe(true)
    expect(miniappInstallAction.payloadSchema.safeParse({ app_id: 'Bad_Id' }).success).toBe(false)
    expect(miniappInstallAction.payloadSchema.safeParse({ app_id: 'tea-shop', htx_code: 'LB' }).success).toBe(false)
    expect(appSpecApproveAction.payloadSchema.safeParse({ request_id: 'x' }).success).toBe(false)
  })
})
