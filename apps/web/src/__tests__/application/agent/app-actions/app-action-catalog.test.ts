/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { AppActionCatalog, type AgentAppRecord } from '@/application/agent/app-actions/AppActionCatalog'
import { windowFor, autoEligibility } from '@/application/agent/autopilot/eligibility'

const teaShop: AgentAppRecord = {
  appId: 'tea-shop',
  htxCodes: ['TC'],
  agent: {
    suggestions: '/agent/suggestions',
    actions: [
      {
        name: 'promotion.create',
        title_vi: 'Tạo khuyến mãi',
        risk: 'medium',
        approver_roles: ['manager'],
        money: true,
        path: '/agent/actions/promotion-create',
        payload: {
          type: 'object',
          required: ['product_id', 'discount_pct', 'days'],
          additionalProperties: false,
          properties: {
            product_id: { type: 'string', maxLength: 64 },
            discount_pct: { type: 'integer', minimum: 5, maximum: 30 },
            days: { type: 'integer', minimum: 1, maximum: 14 },
          },
        },
        preview_vi: 'Giảm {discount_pct}% cho {product_name} trong {days} ngày',
      },
      {
        name: 'note.add',
        title_vi: 'Ghi chú',
        risk: 'low',
        approver_roles: ['manager', 'officer'],
        path: '/agent/actions/note-add',
        payload: { type: 'object', properties: { text: { type: 'string', maxLength: 10 } } },
      },
    ],
  },
}

function setup(records: AgentAppRecord[] = [teaShop]) {
  let clock = 1_000_000
  const source = {
    listAgentApps: jest.fn(async () => records),
    expireOrphaned: jest.fn(async () => 0),
  }
  const run = jest.fn(async () => ({ promotion_id: 'p9' }))
  const catalog = new AppActionCatalog(source, run, 60_000, () => clock)
  return { catalog, source, run, advance: (ms: number) => (clock += ms) }
}

const approver = { userId: 'u', role: 'manager' as const, htxCode: 'TC', htxProfileId: 'h' }

describe('AppActionCatalog', () => {
  it('resolves nothing before the first load and for plain kinds', async () => {
    const { catalog } = setup()
    expect(catalog.find('app.tea-shop.promotion.create', 'TC')).toBeUndefined()
    await catalog.ensure()
    expect(catalog.find('journal.approve', 'TC')).toBeUndefined()
  })

  it('builds the definition from the manifest', async () => {
    const { catalog } = setup()
    await catalog.ensure()
    const def = catalog.find('app.tea-shop.promotion.create', 'TC')!
    expect(def).toMatchObject({
      kind: 'app.tea-shop.promotion.create',
      titleVi: 'Tạo khuyến mãi',
      risk: 'medium',
      approverRoles: ['manager'],
      origins: ['agent'],
      autonomy: 'never',
      channels: ['web', 'telegram'],
      subjectTable: null,
      repeatAfterHours: 24,
      expiresAfterHours: 72,
      money: true,
      editableFields: [],
      humanOnlyFields: [],
    })
    const payload = { product_id: 'p1', discount_pct: 10, days: 7, _labels: { product_name: 'Chè' } }
    expect(def.payloadSchema.safeParse(payload).success).toBe(true)
    expect(def.payloadSchema.safeParse({ ...payload, days: 99 }).success).toBe(false)
    expect(def.preview(payload)).toEqual(['Giảm 10% cho Chè trong 7 ngày'])
    expect(await def.isStale(payload, { rows: [], sha256: '' }, { htxCode: 'TC' })).toBe(false)
  })

  it('takes the subjects from the evidence rows of the app', async () => {
    const { catalog } = setup()
    await catalog.ensure()
    const def = catalog.find('app.tea-shop.promotion.create', 'TC')!
    const evidence = { rows: [{ table: 'app:tea-shop', id: 'p1', sha256: 'x' }], sha256: 'y' }
    expect(def.subjects({ product_id: 'p1' }, evidence)).toEqual(['p1'])
    expect(def.subjects({ product_id: 'p1' })).toEqual([])
  })

  it('makes non-money actions auto and money actions never autonomous', async () => {
    const { catalog } = setup()
    await catalog.ensure()
    const money = catalog.find('app.tea-shop.promotion.create', 'TC')!
    const plain = catalog.find('app.tea-shop.note.add', 'TC')!
    expect(plain.autonomy).toBe('auto')
    expect(money.autonomy).toBe('never')
    expect(windowFor(plain) / 60_000).toBe(0)
    const proposal = { origin: 'agent' as const, payload: {}, evidence: { rows: [], sha256: '' } }
    expect(autoEligibility(proposal, money, { unlockedKinds: [money.kind] }).eligible).toBe(false)
  })

  it('resolves only for a cooperative the app is enabled for; "*" means every cooperative', async () => {
    const { catalog } = setup([teaShop, { ...teaShop, appId: 'all-shop', htxCodes: ['*'] }])
    await catalog.ensure()
    expect(catalog.find('app.tea-shop.promotion.create', 'OTHER')).toBeUndefined()
    expect(catalog.find('app.tea-shop.promotion.create', 'TC')).toBeDefined()
    expect(catalog.find('app.all-shop.promotion.create', 'OTHER')).toBeDefined()
    expect(catalog.find('app.tea-shop.promotion.create')).toBeDefined()
  })

  it('does not resolve an unknown action or a bad manifest action', async () => {
    const bad = structuredClone(teaShop)
    bad.agent.actions[1].payload = { type: 'object', properties: { a: { type: 'string', pattern: 'x' } } }
    const { catalog } = setup([bad])
    await catalog.ensure()
    expect(catalog.find('app.tea-shop.nope', 'TC')).toBeUndefined()
    expect(catalog.find('app.tea-shop.note.add', 'TC')).toBeUndefined()
    expect(catalog.find('app.tea-shop.promotion.create', 'TC')).toBeDefined()
  })

  it('caches for 60 s, reloads after, and invalidate forces a reload', async () => {
    const { catalog, source, advance } = setup()
    await catalog.ensure()
    await catalog.ensure()
    expect(source.listAgentApps).toHaveBeenCalledTimes(1)
    advance(59_000)
    await catalog.ensure()
    expect(source.listAgentApps).toHaveBeenCalledTimes(1)
    advance(2_000)
    await catalog.ensure()
    expect(source.listAgentApps).toHaveBeenCalledTimes(2)
    catalog.invalidate()
    await catalog.ensure()
    expect(source.listAgentApps).toHaveBeenCalledTimes(3)
  })

  it('drops an app after it is removed and expires its open proposals on each load', async () => {
    const records = [teaShop]
    const { catalog, source, advance } = setup(records)
    await catalog.ensure()
    records.length = 0
    advance(61_000)
    await catalog.ensure()
    expect(catalog.find('app.tea-shop.promotion.create', 'TC')).toBeUndefined()
    expect(source.expireOrphaned).toHaveBeenCalledTimes(2)
  })

  it('keeps the old entries when a reload fails, and retries on the next call', async () => {
    const { catalog, source, advance } = setup()
    await catalog.ensure()
    source.listAgentApps.mockRejectedValueOnce(new Error('db down'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    advance(61_000)
    await expect(catalog.ensure()).resolves.toBeUndefined()
    expect(catalog.find('app.tea-shop.promotion.create', 'TC')).toBeDefined()
    await catalog.ensure()
    expect(source.listAgentApps).toHaveBeenCalledTimes(3)
    spy.mockRestore()
  })

  it('executes through the client with the payload minus _labels', async () => {
    const { catalog, run } = setup()
    await catalog.ensure()
    const def = catalog.find('app.tea-shop.promotion.create', 'TC')!
    const result = await def.execute({ product_id: 'p1', discount_pct: 10, days: 7, _labels: { a: 'b' } }, approver)
    expect(run).toHaveBeenCalledWith({
      appId: 'tea-shop',
      path: '/agent/actions/promotion-create',
      body: { product_id: 'p1', discount_pct: 10, days: 7 },
      approver,
    })
    expect(result).toEqual({ result: { promotion_id: 'p9' } })
  })
})
