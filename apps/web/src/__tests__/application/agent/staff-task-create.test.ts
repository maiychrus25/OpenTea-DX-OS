/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ACTION_CATALOG } from '@/application/agent/action-catalog'
import { staffTaskCreateAction, WAITING_FOR_STAFF_APP } from '@/application/agent/actions/staff-task-create.action'
import type { Tenant } from '@/lib/api/tenant'

const manager: Tenant = { userId: 'mgr-1', role: 'manager', htxCode: 'TC', htxProfileId: 'htx-tc' }
const base = { title_vi: 'Hái chè thửa P-TC-002', due_date: '2026-11-27', source: { kind: 'harvest.approve', proposal_id: 'p-1' } }

describe('staff.task.create (C2)', () => {
  it('is a medium-risk, manager-approved, automatic action for web and Telegram', () => {
    expect(ACTION_CATALOG['staff.task.create']).toBe(staffTaskCreateAction)
    expect(staffTaskCreateAction).toMatchObject({
      risk: 'medium',
      approverRoles: ['manager'],
      autonomy: 'auto',
      channels: ['web', 'telegram'],
      editableFields: ['assignee_ref', 'due_date', 'note_vi'],
      humanOnlyFields: ['note_vi'],
    })
  })

  it('accepts the contract payload and refuses anything else', () => {
    const schema = staffTaskCreateAction.payloadSchema
    expect(schema.safeParse(base).success).toBe(true)
    expect(schema.safeParse({ ...base, assignee_ref: 'E1', parcel_id: 'parcel-1', note_vi: 'Mang găng tay' }).success).toBe(true)
    expect(schema.safeParse({ ...base, title_vi: '' }).success).toBe(false)
    expect(schema.safeParse({ ...base, title_vi: 'x'.repeat(121) }).success).toBe(false)
    expect(schema.safeParse({ ...base, note_vi: 'x'.repeat(501) }).success).toBe(false)
    expect(schema.safeParse({ ...base, due_date: '27/11/2026' }).success).toBe(false)
    expect(schema.safeParse({ ...base, due_date: '2026-02-31' }).success).toBe(false)
    expect(schema.safeParse({ ...base, extra: 1 }).success).toBe(false)
    expect(schema.safeParse({ ...base, source: undefined }).success).toBe(false)
  })

  it('reports that it waits for the staff app instead of finishing', async () => {
    await expect(staffTaskCreateAction.execute(base as never, manager)).resolves.toEqual({ state: WAITING_FOR_STAFF_APP })
  })

  it('previews the title, the due date and the optional people', () => {
    const lines = staffTaskCreateAction.preview({ ...base, assignee_ref: 'E1', note_vi: 'Mang găng tay' } as never)
    expect(lines[0]).toBe('Hái chè thửa P-TC-002')
    expect(lines.join('\n')).toContain('27/11/2026')
    expect(lines.join('\n')).toContain('E1')
    expect(lines.join('\n')).toContain('Mang găng tay')
  })

  it('uses the source proposal as its subject', () => {
    expect(staffTaskCreateAction.subjects(base as never)).toEqual(['p-1'])
    expect(staffTaskCreateAction.subjects({ ...base, source: { kind: 'x' } } as never)).toEqual([])
  })
})
