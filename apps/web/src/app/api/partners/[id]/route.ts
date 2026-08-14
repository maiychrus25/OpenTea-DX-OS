import { NextResponse } from 'next/server'
import { prisma } from '@/infrastructure/db/prisma.client'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { auth } from '@/auth'
import { partnerUpdateSchema } from '@/lib/validations/partner.schema'

async function putPartner(request: Request, context: any) {
  const { params } = context || {}
  const session = await auth()
  if (!session || !session.user) return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const parse = partnerUpdateSchema.safeParse(body)
  if (!parse.success) return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } }, { status: 400 })

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
  const session = await auth()
  if (!session || !session.user) return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  if (session.user.role !== 'manager') return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 })

  await prisma.partner.delete({ where: { id: params.id } })
  return NextResponse.json({ data: { id: params.id } })
}

export const PUT = withErrorHandler(putPartner)
export const DELETE = withErrorHandler(deletePartner)
