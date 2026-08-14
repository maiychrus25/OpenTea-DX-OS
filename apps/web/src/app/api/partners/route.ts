import { NextResponse } from 'next/server'
import { prisma } from '@/infrastructure/db/prisma.client'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { auth } from '@/auth'
import { partnerCreateSchema } from '@/lib/validations/partner.schema'

async function getPartners(request: Request) {
  const url = new URL(request.url)
  const type = url.searchParams.get('type')
  const where: any = {}
  if (type) where.partner_type = type

  const partners = await prisma.partner.findMany({ where, orderBy: { created_at: 'desc' } })
  return NextResponse.json({ data: partners })
}

async function postPartner(request: Request) {
  const session = await auth()
  if (!session || !session.user) return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const parse = partnerCreateSchema.safeParse(body)
  if (!parse.success) return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } }, { status: 400 })

  // If no lat/lng, try to geocode server-side via nominatim
  let lat = parse.data.lat
  let lng = parse.data.lng
  if ((lat == null || lng == null) && parse.data.address) {
    const params = new URLSearchParams({ q: parse.data.address, format: 'json', limit: '1' })
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, { headers: { 'User-Agent': 'OpenTea-DX-OS/1.0 (dev@local)' } })
    if (res.ok) {
      const j = await res.json()
      if (j && j[0]) {
        lat = parseFloat(j[0].lat)
        lng = parseFloat(j[0].lon)
      }
    }
  }

  const created = await prisma.partner.create({ data: {
    name: parse.data.name,
    partner_type: parse.data.partner_type as any,
    contact_phone: parse.data.contact_phone || null,
    primary_commodities: parse.data.primary_commodities || [],
    address: parse.data.address || null,
    lat: lat ?? 0,
    lng: lng ?? 0,
  }})

  return NextResponse.json({ data: created })
}

export const GET = withErrorHandler(getPartners)
export const POST = withErrorHandler(postPartner)
