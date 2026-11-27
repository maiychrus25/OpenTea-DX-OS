// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { ExportQrUseCase } from '@/application/lot/ExportQrUseCase'
import { PrismaCertificateRepository } from '@/infrastructure/db/certificate/PrismaCertificateRepository'
import { PrismaLotRepository } from '@/infrastructure/db/lot/PrismaLotRepository'
import { PrismaLotTraceRepository } from '@/infrastructure/db/repositories/prisma-lot-trace-repository'
import { MinioDocumentAdapter } from '@/infrastructure/storage/minio-document.adapter'
import { MinioStorageAdapter } from '@/infrastructure/storage/minio-storage.adapter'
import { TenantGuard } from '@/lib/api/tenant-guard'
import type { ChatAction, ChatUser } from '../types'
import { MAX_CHOICES, inCooperative, notFound } from './scope'

type LotExportPayload = { lot_id: string }

async function readyLots(user: ChatUser) {
  const lots = await new PrismaLotRepository().findAll({ htx_profile_id: user.tenant.htxProfileId, status: 'READY' })
  return lots.slice(0, MAX_CHOICES)
}

/**
 * Routes: `POST /api/lots/[id]/export-qr`. The public link comes from `NEXT_PUBLIC_BASE_URL`, as no request carries a host.
 * High, with two cards (spec §13.7): an exported lot is public and frozen.
 */
export const lotExportQrAction: ChatAction<LotExportPayload> = {
  name: 'lot.export_qr',
  titleVi: 'Xuất mã QR lô hàng',
  risk: 'high',
  roles: ['officer', 'manager'],
  routes: ['POST /api/lots/[id]/export-qr'],
  args: [],
  steps: [
    {
      kind: 'choice',
      slot: 'lot_id',
      promptVi: 'Chọn lô cần xuất mã QR:',
      choices: async (user) => (await readyLots(user)).map((lot) => ({ value: lot.id, label: lot.lot_code })),
    },
  ],
  payloadSchema: z.object({ lot_id: z.string().min(1) }),
  consequenceVi: 'Lô sẽ có trang truy xuất công khai. Sau khi xuất mã QR, dữ liệu lô không sửa được nữa.',
  async preview(payload, user) {
    const lot = (await readyLots(user)).find((candidate) => candidate.id === payload.lot_id)
    if (!lot) throw notFound()
    return [`Lô: ${lot.lot_code}`, `Sản phẩm: ${lot.commodity}`]
  },
  async execute(payload, user) {
    await inCooperative(new TenantGuard(user.tenant).lot(payload.lot_id))
    const lots = new PrismaLotRepository()
    const lot = await lots.findById(payload.lot_id)
    if (!lot) throw notFound()
    await new ExportQrUseCase(lots, new PrismaLotTraceRepository(), new MinioStorageAdapter(), new MinioDocumentAdapter(), user.tenant.htxCode, new PrismaCertificateRepository()).execute(
      payload.lot_id,
      undefined,
      process.env.NEXT_PUBLIC_BASE_URL,
      { htxProfileId: user.tenant.htxProfileId }
    )
    return `Đã xuất mã QR cho lô ${lot.lot_code}.`
  },
}
