// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import type { InputItemPatch, InputPort, NewInputItem } from '@/domain/ledger/ports/InputPort'
import type { InputItemView } from '@/domain/ledger/views'

interface Actor {
  role: string
  htxProfileId: string
}

/** The item catalogue of a cooperative. A pesticide item is linked to a product of the S1 catalogue. */
export class ManageInputItemsUseCase {
  constructor(private readonly port: InputPort) {}

  async list(actor: Actor): Promise<InputItemView[]> {
    if (!['manager', 'accountant', 'officer'].includes(actor.role)) throw new ForbiddenError('Forbidden')
    return this.port.listItems(actor.htxProfileId)
  }

  async create(actor: Actor, data: Omit<NewInputItem, 'pesticide_product_id'> & { pesticide_product_id?: string | null }): Promise<InputItemView> {
    this.requireStaff(actor)
    const item = { ...data, pesticide_product_id: data.pesticide_product_id ?? null }
    await this.checkLink(item.kind, item.pesticide_product_id)
    await this.checkName(actor.htxProfileId, item.name)
    return this.port.createItem(actor.htxProfileId, item)
  }

  async update(actor: Actor, id: string, patch: InputItemPatch): Promise<InputItemView> {
    this.requireStaff(actor)
    const current = await this.port.itemById(actor.htxProfileId, id)
    if (!current) throw new NotFoundError('Không tìm thấy vật tư')
    const kind = patch.kind ?? current.kind
    const product = patch.pesticide_product_id !== undefined ? patch.pesticide_product_id : current.pesticide_product_id
    await this.checkLink(kind, product)
    if (patch.name !== undefined && patch.name !== current.name) await this.checkName(actor.htxProfileId, patch.name)
    const updated = await this.port.updateItem(actor.htxProfileId, id, { ...patch, pesticide_product_id: product })
    if (!updated) throw new NotFoundError('Không tìm thấy vật tư')
    return updated
  }

  private requireStaff(actor: Actor): void {
    if (actor.role !== 'manager' && actor.role !== 'accountant') throw new ForbiddenError('Forbidden')
  }

  private async checkLink(kind: string, productId: string | null): Promise<void> {
    if (kind !== 'PESTICIDE' && productId) throw new ValidationError('Chỉ vật tư loại thuốc mới gắn được với danh mục thuốc.')
    if (productId && !(await this.port.pesticideExists(productId))) throw new ValidationError('Không tìm thấy thuốc trong danh mục.')
  }

  private async checkName(htxProfileId: string, name: string): Promise<void> {
    if (await this.port.itemByName(htxProfileId, name)) throw new ConflictError('ITEM_EXISTS', 'Đã có vật tư tên này.')
  }
}
