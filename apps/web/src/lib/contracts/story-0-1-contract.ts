// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export type Role = 'manager' | 'officer' | 'farmer'

export type RouteAccess = {
  path: string
  roles: readonly Role[]
  public?: boolean
}

export const canonicalRoutes: readonly RouteAccess[] = [
  { path: '/manager/chat', roles: ['manager'] },
  { path: '/officer/chat', roles: ['officer'] },
  { path: '/officer/journal', roles: ['officer'] },
  { path: '/officer/lots', roles: ['officer'] },
  { path: '/manager/lots', roles: ['manager'] },
  { path: '/farmer/bulletin-notifications', roles: ['farmer'] },
  { path: '/manager/profile', roles: ['manager'] },
  { path: '/officer/profile', roles: ['officer'] },
  { path: '/farmer/profile', roles: ['farmer'] },
  { path: '/lot/[lot_code]', roles: [], public: true },
]

export type ContractDeviation = {
  key: string
  replacementStory: string
  reason: string
}

export const routeDeviations: readonly ContractDeviation[] = [
  ...[
    '/manager/chat',
    '/officer/chat',
    '/officer/journal',
    '/officer/lots',
    '/manager/lots',
    '/farmer/bulletin-notifications',
    '/officer/profile',
    '/farmer/profile',
  ].map((key) => ({
    key,
    replacementStory: '10-1-platform-be-contract-completion',
    reason: 'Canonical page is not implemented yet.',
  })),
]

export const schemaDeviations: readonly ContractDeviation[] = [
  ...[
    'ParcelCropCycle.crop',
    'ParcelCropCycle.planting_date',
    'ParcelCropCycle.estimated_harvest_date',
    'JournalEntry.parcel_crop_cycle_id',
    'Lot.harvest_date',
    'Lot.packaging_type',
    'Lot.public_page_data',
    'Lot.certificate_minio_keys',
    'Bulletin.generated_at',
  ].map((key) => ({
    key,
    replacementStory: '10-1-platform-be-contract-completion',
    reason: 'Canonical database field is not present in Prisma yet.',
  })),
]

export const roleOwnership = {
  manager: {
    owns: ['market', 'profile', 'partners'],
    reads: ['farm', 'lots'],
  },
  officer: {
    owns: ['farm', 'journal', 'harvest', 'lot', 'qr', 'disease-review'],
    reads: [],
  },
  farmer: {
    owns: ['household', 'parcels', 'journal', 'diagnosis', 'notifications'],
    reads: ['own-household', 'own-parcels', 'own-journal'],
  },
} as const satisfies Record<Role, { owns: readonly string[]; reads: readonly string[] }>

export const officerOnlyMutations = [
  'farm.household.create',
  'farm.parcel.create',
  'journal.create',
  'journal.update',
  'lot.create',
  'lot.export-qr',
] as const

export const farmerIsolationRules = [
  'farmer may access only records linked to their household',
  'farmer may submit diagnosis only for an accessible parcel',
  'farmer may read only their own journal and notifications',
] as const

export type SuccessEnvelope<T = unknown> = { data: T; meta?: Record<string, unknown> }
export type ErrorEnvelope = {
  error: { code: string; message: string; details?: unknown }
}

export function isSuccessEnvelope(value: unknown): value is SuccessEnvelope {
  if (!isRecord(value) || !('data' in value) || 'error' in value) return false
  if (value.data === undefined) return false
  return !('meta' in value) || isRecord(value.meta)
}

export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (!isRecord(value) || 'data' in value || !isRecord(value.error)) return false
  const { error } = value
  return typeof error.code === 'string' &&
    error.code.length > 0 &&
    typeof error.message === 'string' &&
    error.message.length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function roleCanAccess(path: string, role: Role): boolean {
  const route = canonicalRoutes.find((candidate) => matchesRoute(candidate.path, path))
  return route?.public === true || route?.roles.includes(role) === true
}

function matchesRoute(template: string, path: string): boolean {
  const templateParts = template.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)
  if (templateParts.length !== pathParts.length) return false

  return templateParts.every((part, index) =>
    part.startsWith('[') && part.endsWith(']') || part === pathParts[index]
  )
}

export function canPerformOfficerMutation(role: Role, mutation: string): boolean {
  return role === 'officer' && officerOnlyMutations.includes(mutation as (typeof officerOnlyMutations)[number])
}
