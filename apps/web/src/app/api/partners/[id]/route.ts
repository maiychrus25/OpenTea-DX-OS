import { NextResponse } from 'next/server'
import { prisma } from '@/infrastructure/db/prisma.client'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { requireTenant } from '@/lib/api/tenant'
import { ForbiddenError, NotFoundError } from '@/domain/errors'
import { partnerUpdateSchema } from '@/lib/validations/partner.schema'

// A partner of another cooperative, or of none, does not exist for the caller.
async function ownPartner(id: string, htxProfileId: string) {
  const partner = await prisma.partner.findFirst({ where: { id, htx_profile_id: htxProfileId } })
  if (!partner) throw new NotFoundError('Không tìm thấy đối tác')
}

async function putPartner(request: Request, context: any) {
  const { params } = context || {}
  const { role, htxProfileId } = await requireTenant()
  if (role !== 'manager') throw new ForbiddenError('Forbidden')

  const body = await request.json().catch(() => ({}))
  const parse = partnerUpdateSchema.safeParse(body)
  if (!parse.success) return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } }, { status: 400 })

  await ownPartner(params.id, htxProfileId)
  const updated = await prisma.partner.update({ where: { id: params.id }, data: {
    name: parse.data.name as any,
    partner_type: parse.data.partner_type as any,
    contact_phone: parse.data.contact_phone ?? undefined,
    primary_commodities: parse.data.primary_commodities ?? undefined,
    address: parse.data.address ?? undefined,
    lat: parse.data.lat ?? undefined,
    lng: parse.data.lng ?? undefined,
  }})

  return NextResponse.json({ data: updated })
}

async function deletePartner(_request: Request, context: any) {
  const { params } = context || {}
  const { role, htxProfileId } = await requireTenant()
  if (role !== 'manager') throw new ForbiddenError('Forbidden')

  await ownPartner(params.id, htxProfileId)
  await prisma.partner.delete({ where: { id: params.id } })
  return NextResponse.json({ data: { id: params.id } })
}

export const PUT = withErrorHandler(putPartner)
export const DELETE = withErrorHandler(deletePartner)
