import { NextResponse } from 'next/server'
import { prisma } from '@/infrastructure/db/prisma.client'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await auth()
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Bạn cần đăng nhập trước!' }, { status: 401 })
    }

    const userId = session.user.id
    
    // Tìm hoặc tạo Household
    let household = await prisma.household.findFirst({
      where: { keycloak_user_id: userId }
    })

    if (!household) {
      household = await prisma.household.create({
        data: {
          name: session.user.name || 'Nông dân Test',
          phone: '090' + Math.floor(10000000 + Math.random() * 90000000).toString(),
          keycloak_user_id: userId,
        }
      })
    }

    // Tạo Parcel
    const parcel = await prisma.parcel.create({
      data: {
        household_id: household.id,
        parcel_code: `P-TEST-${Math.floor(Math.random() * 10000)}`,
        crop_type: 'Lúa ST25',
        area_ha: 2.5,
        status: 'TENDING'
      }
    })

    // Tạo Weather
    await prisma.weatherCache.create({
      data: {
        parcel_id: parcel.id,
        recorded_at: new Date(),
        condition: 'Nắng đẹp (Test)',
        temperature_c: 29.5,
        precipitation_mm: 0,
        humidity_pct: 65,
        source: 'seed'
      }
    })

    return NextResponse.json({
      message: 'Đã tạo dữ liệu seed thành công!',
      household,
      parcel
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
