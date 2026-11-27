/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Every frozen route must answer before the repository, the database or the caller's auth is touched.
const prismaTouched = jest.fn()
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: new Proxy({}, { get: () => { prismaTouched(); throw new Error('database touched') } }),
}))
jest.mock('@/auth', () => ({ auth: jest.fn(() => { throw new Error('auth touched') }) }))

import * as appRequests from '@/app/api/agent/app-requests/route'
import * as appRequestAnswer from '@/app/api/agent/app-requests/[id]/answer/route'
import * as appRequestCancel from '@/app/api/agent/app-requests/[id]/cancel/route'
import * as appRequestFile from '@/app/api/agent/app-requests/[id]/files/[name]/route'
import * as autopilot from '@/app/api/agent/autopilot/route'
import * as autopilotEnable from '@/app/api/agent/autopilot/enable/route'
import * as autopilotStop from '@/app/api/agent/autopilot/stop/route'
import * as autopilotTick from '@/app/api/internal/agent/autopilot/tick/route'
import * as builderRequests from '@/app/api/internal/agent/app-builder/requests/route'
import * as builderAnnounce from '@/app/api/internal/agent/app-builder/requests/[id]/announce/route'
import * as builderQuestions from '@/app/api/internal/agent/app-builder/requests/[id]/questions/route'
import * as builderRoute from '@/app/api/internal/agent/app-builder/requests/[id]/route/route'
import * as builderSpec from '@/app/api/internal/agent/app-builder/requests/[id]/spec/route'
import * as strategyInputs from '@/app/api/internal/agent/strategy/inputs/route'
import * as strategyPlans from '@/app/api/internal/agent/strategy/plans/route'
import * as mcpTools from '@/app/api/mcp/tools/route'
import * as mcpTool from '@/app/api/mcp/tools/[name]/route'
import * as staffAttendance from '@/app/api/internal/staff/attendance/route'
import * as staffRoster from '@/app/api/internal/staff/roster/route'
import * as staffTasks from '@/app/api/internal/staff/tasks/route'
import * as staffAck from '@/app/api/internal/staff/tasks/[proposal_id]/ack/route'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (request: Request, context: any) => Promise<Response>

const routes: [string, Handler][] = [
  ['POST /api/agent/app-requests', appRequests.POST],
  ['POST /api/agent/app-requests/[id]/answer', appRequestAnswer.POST],
  ['POST /api/agent/app-requests/[id]/cancel', appRequestCancel.POST],
  ['GET /api/agent/app-requests/[id]/files/[name]', appRequestFile.GET],
  ['GET /api/agent/autopilot', autopilot.GET],
  ['POST /api/agent/autopilot/enable', autopilotEnable.POST],
  ['POST /api/agent/autopilot/stop', autopilotStop.POST],
  ['POST /api/internal/agent/autopilot/tick', autopilotTick.POST],
  ['GET /api/internal/agent/app-builder/requests', builderRequests.GET],
  ['POST /api/internal/agent/app-builder/requests/[id]/announce', builderAnnounce.POST],
  ['POST /api/internal/agent/app-builder/requests/[id]/questions', builderQuestions.POST],
  ['POST /api/internal/agent/app-builder/requests/[id]/route', builderRoute.POST],
  ['POST /api/internal/agent/app-builder/requests/[id]/spec', builderSpec.POST],
  ['GET /api/internal/agent/strategy/inputs', strategyInputs.GET],
  ['POST /api/internal/agent/strategy/plans', strategyPlans.POST],
  ['GET /api/mcp/tools', mcpTools.GET],
  ['POST /api/mcp/tools/[name]', mcpTool.POST],
  ['PUT /api/internal/staff/attendance', staffAttendance.PUT],
  ['PUT /api/internal/staff/roster', staffRoster.PUT],
  ['GET /api/internal/staff/tasks', staffTasks.GET],
  ['POST /api/internal/staff/tasks/[proposal_id]/ack', staffAck.POST],
]

const previous = process.env.DXOS_LABS
beforeEach(() => {
  delete process.env.DXOS_LABS
})
afterEach(() => {
  if (previous === undefined) delete process.env.DXOS_LABS
  else process.env.DXOS_LABS = previous
})

describe('frozen routes without DXOS_LABS', () => {
  test.each(routes)('%s answers 404 NOT_FOUND and does not touch the database', async (_name, handler) => {
    const request = new Request('http://localhost/x', { method: 'POST', body: '{}' })
    const response = await handler(request, { params: Promise.resolve({ id: 'x', name: 'x', proposal_id: 'x' }) })
    expect(response.status).toBe(404)
    expect((await response.json()).error.code).toBe('NOT_FOUND')
    expect(prismaTouched).not.toHaveBeenCalled()
  })
})
