/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { GET as getTasks } from '@/app/api/internal/staff/tasks/route'
import { POST as postAck } from '@/app/api/internal/staff/tasks/[proposal_id]/ack/route'
import { PUT as putRoster } from '@/app/api/internal/staff/roster/route'
import { PUT as putAttendance } from '@/app/api/internal/staff/attendance/route'
import { ForbiddenError } from '@/domain/errors'
import { requireStaffCaller } from '@/lib/api/internal-staff-auth'

const PROPOSAL_ID = '00000000-0000-4000-8000-0000000000b1'
const repo = {
  pendingTasks: jest.fn(),
  acknowledge: jest.fn(),
  replaceRoster: jest.fn(),
  saveAttendance: jest.fn(),
}
const parcelCodesByIds = jest.fn()

jest.mock('@/lib/api/internal-staff-auth', () => ({ requireStaffCaller: jest.fn(async () => ({ htxCode: 'TC' })) }))
jest.mock('@/infrastructure/db/agent/PrismaStaffSyncRepository', () => ({
  PrismaStaffSyncRepository: jest.fn().mockImplementation(() => mockRepo()),
}))
jest.mock('@/infrastructure/db/agent/PrismaCampaignCandidateSource', () => ({
  PrismaCampaignCandidateSource: jest.fn().mockImplementation(() => ({ parcelCodesByIds: (...a: unknown[]) => parcelCodesByIds(...a) })),
}))
function mockRepo() {
  return repo
}

const request = (url: string, method: string, body?: unknown) =>
  new Request(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const ackContext = (id: string) => ({ params: Promise.resolve({ proposal_id: id }) }) as never
const ackUrl = `http://localhost/api/internal/staff/tasks/${PROPOSAL_ID}/ack`

beforeEach(() => {
  jest.clearAllMocks()
  jest.useRealTimers()
})

describe('staff routes guard', () => {
  it('refuses every route when the staff token is refused', async () => {
    ;(requireStaffCaller as jest.Mock).mockRejectedValue(new ForbiddenError('Staff sync role required'))
    for (const res of [
      await getTasks(request('http://localhost/api/internal/staff/tasks', 'GET'), {} as never),
      await postAck(request(ackUrl, 'POST', { task_id: 't-1' }), ackContext(PROPOSAL_ID)),
      await putRoster(request('http://localhost/api/internal/staff/roster', 'PUT', { staff: [] }), {} as never),
      await putAttendance(request('http://localhost/api/internal/staff/attendance', 'PUT', { day: '2026-11-27', present: 1 }), {} as never),
    ]) {
      expect(res.status).toBe(403)
    }
    expect(repo.pendingTasks).not.toHaveBeenCalled()
    expect(repo.acknowledge).not.toHaveBeenCalled()
    expect(repo.replaceRoster).not.toHaveBeenCalled()
    expect(repo.saveAttendance).not.toHaveBeenCalled()
    ;(requireStaffCaller as jest.Mock).mockImplementation(async () => ({ htxCode: 'TC' }))
  })
})

describe('GET /api/internal/staff/tasks', () => {
  it('lists the cooperative of the token with the effective fields and the parcel code', async () => {
    repo.pendingTasks.mockResolvedValue([
      {
        proposalId: PROPOSAL_ID,
        payload: { title_vi: 'Hái chè thửa P-TC-002', due_date: '2026-11-27', parcel_id: 'parcel-2', assignee_ref: 'E2', note_vi: 'Mang găng tay' },
        approvedByName: 'Anh Quản lý',
        approvedAt: new Date('2026-11-27T01:00:00Z'),
      },
      { proposalId: 'p-2', payload: { title_vi: 'Tưới thửa', due_date: '2026-11-27' }, approvedByName: null, approvedAt: null },
    ])
    parcelCodesByIds.mockResolvedValue(new Map([['parcel-2', 'P-TC-002']]))

    const res = await getTasks(request('http://localhost/api/internal/staff/tasks', 'GET'), {} as never)

    expect(res.status).toBe(200)
    expect(repo.pendingTasks).toHaveBeenCalledWith('TC')
    expect(parcelCodesByIds).toHaveBeenCalledWith('TC', ['parcel-2'])
    expect(await res.json()).toEqual({
      data: {
        tasks: [
          {
            proposal_id: PROPOSAL_ID,
            title_vi: 'Hái chè thửa P-TC-002',
            note_vi: 'Mang găng tay',
            parcel_code: 'P-TC-002',
            due_date: '2026-11-27',
            assignee_ref: 'E2',
            approved_by_name: 'Anh Quản lý',
            approved_at: '2026-11-27T01:00:00.000Z',
          },
          { proposal_id: 'p-2', title_vi: 'Tưới thửa', note_vi: null, parcel_code: null, due_date: '2026-11-27', assignee_ref: null, approved_by_name: null, approved_at: null },
        ],
      },
    })
  })

  it('answers an empty list when the cooperative has nothing waiting', async () => {
    repo.pendingTasks.mockResolvedValue([])
    const res = await getTasks(request('http://localhost/api/internal/staff/tasks', 'GET'), {} as never)
    expect(await res.json()).toEqual({ data: { tasks: [] } })
    expect(parcelCodesByIds).not.toHaveBeenCalled()
  })
})

describe('POST /api/internal/staff/tasks/{proposal_id}/ack', () => {
  it('acknowledges with the task id for the cooperative of the token', async () => {
    repo.acknowledge.mockResolvedValue('acknowledged')
    const res = await postAck(request(ackUrl, 'POST', { task_id: 'task-9' }), ackContext(PROPOSAL_ID))
    expect(res.status).toBe(200)
    expect(repo.acknowledge).toHaveBeenCalledWith('TC', PROPOSAL_ID, 'task-9')
    expect((await res.json()).data).toMatchObject({ task_id: 'task-9', already: false })
  })

  it('answers 200 again for a repeat with the same task id', async () => {
    repo.acknowledge.mockResolvedValue('already')
    const res = await postAck(request(ackUrl, 'POST', { task_id: 'task-9' }), ackContext(PROPOSAL_ID))
    expect(res.status).toBe(200)
    expect((await res.json()).data.already).toBe(true)
  })

  it('answers 404 for a proposal of another cooperative or one that does not exist', async () => {
    repo.acknowledge.mockResolvedValue('not_found')
    expect((await postAck(request(ackUrl, 'POST', { task_id: 'task-9' }), ackContext(PROPOSAL_ID))).status).toBe(404)
    expect((await postAck(request(ackUrl, 'POST', { task_id: 'task-9' }), ackContext('not-a-uuid'))).status).toBe(404)
  })

  it('answers 409 when the proposal no longer waits for the staff app (expired or another task id)', async () => {
    repo.acknowledge.mockResolvedValue('conflict')
    const res = await postAck(request(ackUrl, 'POST', { task_id: 'task-9' }), ackContext(PROPOSAL_ID))
    expect(res.status).toBe(409)
  })

  it('answers 400 without a task id', async () => {
    expect((await postAck(request(ackUrl, 'POST', {}), ackContext(PROPOSAL_ID))).status).toBe(400)
    expect(repo.acknowledge).not.toHaveBeenCalled()
  })
})

describe('PUT /api/internal/staff/roster', () => {
  const url = 'http://localhost/api/internal/staff/roster'

  it('replaces the roster of the token cooperative', async () => {
    const res = await putRoster(
      request(url, 'PUT', { staff: [{ staff_ref: 'E1', name: 'Lan', department: 'Kỹ thuật', active: true }, { staff_ref: 'E2', name: 'Minh', active: false }] }),
      {} as never
    )
    expect(res.status).toBe(200)
    expect(repo.replaceRoster).toHaveBeenCalledWith('TC', [
      { staffRef: 'E1', name: 'Lan', department: 'Kỹ thuật', active: true },
      { staffRef: 'E2', name: 'Minh', department: null, active: false },
    ])
  })

  it('accepts an empty roster, which deactivates everybody', async () => {
    expect((await putRoster(request(url, 'PUT', { staff: [] }), {} as never)).status).toBe(200)
    expect(repo.replaceRoster).toHaveBeenCalledWith('TC', [])
  })

  it('refuses more than 500 staff, a repeated staff_ref, extra fields and phone numbers', async () => {
    const one = (i: number) => ({ staff_ref: `E${i}`, name: 'Lan', active: true })
    const many = Array.from({ length: 501 }, (_, i) => one(i))
    expect((await putRoster(request(url, 'PUT', { staff: many }), {} as never)).status).toBe(400)
    expect((await putRoster(request(url, 'PUT', { staff: [one(1), one(1)] }), {} as never)).status).toBe(400)
    expect((await putRoster(request(url, 'PUT', { staff: [{ ...one(1), phone: '0901' }] }), {} as never)).status).toBe(400)
    expect((await putRoster(request(url, 'PUT', {}), {} as never)).status).toBe(400)
    expect(repo.replaceRoster).not.toHaveBeenCalled()
  })
})

describe('PUT /api/internal/staff/attendance', () => {
  const url = 'http://localhost/api/internal/staff/attendance'

  it('stores the count for today in Vietnam only', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-26T20:00:00Z')) // 27 Nov 03:00 in Vietnam
    expect((await putAttendance(request(url, 'PUT', { day: '2026-11-27', present: 7 }), {} as never)).status).toBe(200)
    expect(repo.saveAttendance).toHaveBeenCalledWith('TC', '2026-11-27', 7)

    expect((await putAttendance(request(url, 'PUT', { day: '2026-11-26', present: 7 }), {} as never)).status).toBe(400)
    expect((await putAttendance(request(url, 'PUT', { day: '2026-11-28', present: 7 }), {} as never)).status).toBe(400)
    expect(repo.saveAttendance).toHaveBeenCalledTimes(1)
  })

  it('refuses a negative, fractional or missing count and an impossible day', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-26T20:00:00Z'))
    for (const body of [{ day: '2026-11-27', present: -1 }, { day: '2026-11-27', present: 1.5 }, { day: '2026-11-27' }, { day: '2026-02-31', present: 1 }]) {
      expect((await putAttendance(request(url, 'PUT', body), {} as never)).status).toBe(400)
    }
    expect(repo.saveAttendance).not.toHaveBeenCalled()
  })
})
