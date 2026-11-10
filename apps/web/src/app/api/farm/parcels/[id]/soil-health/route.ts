// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { prisma } from '@/infrastructure/db/prisma.client'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast'

interface SoilHealthDataPoint {
  date: string
  soil_moisture: number | null
  soil_temperature: number | null
}

interface DiseaseRecord {
  id: string
  detection_date: string
  ai_disease_name: string
  ai_confidence: number
  confirmed_diagnosis: string | null
  status: string
  treatment_notes: string | null
}

async function getSoilHealth(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await new TenantGuard(await requireTenant()).parcel(id)

  try {

    const parcel = await prisma.parcel.findUnique({
      where: { id },
      select: {
        id: true,
        parcel_code: true,
        centroid_lat: true,
        centroid_lng: true,
        crop_type: true,
        status: true,
        area_ha: true,
        household_id: true,
      },
    })

    if (!parcel) {
      return NextResponse.json({ error: 'Không tìm thấy thửa đất' }, { status: 404 })
    }

    // 1) Lịch sử dịch bệnh từ DB (dữ liệu thật)
    const diseaseReports = await prisma.diseaseReport.findMany({
      where: { parcel_id: id },
      orderBy: { detection_date: 'desc' },
      select: {
        id: true,
        detection_date: true,
        ai_disease_name: true,
        ai_confidence: true,
        confirmed_diagnosis: true,
        status: true,
        treatment_notes: true,
      },
    })

    const diseaseHistory: DiseaseRecord[] = diseaseReports.map((r) => ({
      id: r.id,
      detection_date: r.detection_date.toISOString(),
      ai_disease_name: r.ai_disease_name,
      ai_confidence: r.ai_confidence,
      confirmed_diagnosis: r.confirmed_diagnosis,
      status: r.status,
      treatment_notes: r.treatment_notes,
    }))

    if (!parcel.centroid_lat || !parcel.centroid_lng) {
      return NextResponse.json({
        data: {
          parcel: { id: parcel.id, parcel_code: parcel.parcel_code, crop_type: parcel.crop_type, status: parcel.status, area_ha: parcel.area_ha, centroid_lat: null, centroid_lng: null },
          soil_health: [],
          disease_history: diseaseHistory,
          pest_risk: null,
          metadata: { source: 'Open-Meteo (open-source weather API)', license: 'CC BY 4.0', period_days: 30, data_depth: '0-7cm', timezone: 'Asia/Ho_Chi_Minh' },
        },
      })
    }

    // 2) Open-Meteo: soil + weather data
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(endDate.getDate() - 30)
    const formatDate = (d: Date) => d.toISOString().split('T')[0]

    const url = new URL(OPEN_METEO_BASE)
    url.searchParams.set('latitude', parcel.centroid_lat.toString())
    url.searchParams.set('longitude', parcel.centroid_lng.toString())
    url.searchParams.set('hourly', 'soil_moisture_0_to_7cm,soil_temperature_0cm,temperature_2m,relative_humidity_2m')
    url.searchParams.set('start_date', formatDate(startDate))
    url.searchParams.set('end_date', formatDate(endDate))
    url.searchParams.set('timezone', 'Asia/Ho_Chi_Minh')

    const meteoResponse = await fetch(url.toString(), { next: { revalidate: 3600 } })
    if (!meteoResponse.ok) {
      return NextResponse.json({ error: 'Không thể lấy dữ liệu từ Open-Meteo' }, { status: 502 })
    }

    const meteoData = await meteoResponse.json()
    const hourlyTimes: string[] = meteoData.hourly?.time || []
    const hourlyMoisture: (number | null)[] = meteoData.hourly?.soil_moisture_0_to_7cm || []
    const hourlyTemp: (number | null)[] = meteoData.hourly?.soil_temperature_0cm || []
    const hourlyAirTemp: (number | null)[] = meteoData.hourly?.temperature_2m || []
    const hourlyHumidity: (number | null)[] = meteoData.hourly?.relative_humidity_2m || []

    type DailyAgg = { moistureSum: number; tempSum: number; airTempSum: number; humiditySum: number; moistureCount: number; tempCount: number; airTempCount: number; humidityCount: number }
    const dailyMap = new Map<string, DailyAgg>()

    for (let i = 0; i < hourlyTimes.length; i++) {
      const day = hourlyTimes[i].split('T')[0]
      if (!dailyMap.has(day)) {
        dailyMap.set(day, { moistureSum: 0, tempSum: 0, airTempSum: 0, humiditySum: 0, moistureCount: 0, tempCount: 0, airTempCount: 0, humidityCount: 0 })
      }
      const e = dailyMap.get(day)!
      if (hourlyMoisture[i] != null) { e.moistureSum += hourlyMoisture[i]!; e.moistureCount++ }
      if (hourlyTemp[i] != null) { e.tempSum += hourlyTemp[i]!; e.tempCount++ }
      if (hourlyAirTemp[i] != null) { e.airTempSum += hourlyAirTemp[i]!; e.airTempCount++ }
      if (hourlyHumidity[i] != null) { e.humiditySum += hourlyHumidity[i]!; e.humidityCount++ }
    }

    const dailyData: SoilHealthDataPoint[] = []
    let totalRiskScore = 0
    let riskDays = 0
    let highRiskDays = 0

    for (const [date, v] of Array.from(dailyMap.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      const moisture = v.moistureCount > 0 ? Math.round((v.moistureSum / v.moistureCount) * 1000) / 1000 : null
      const soilTemp = v.tempCount > 0 ? Math.round((v.tempSum / v.tempCount) * 10) / 10 : null
      dailyData.push({ date, soil_moisture: moisture, soil_temperature: soilTemp })

      // 3) Pest risk calculation based on agricultural research
      const avgAirTemp = v.airTempCount > 0 ? v.airTempSum / v.airTempCount : null
      const avgHumidity = v.humidityCount > 0 ? v.humiditySum / v.humidityCount : null

      if (avgAirTemp != null && avgHumidity != null) {
        let dayRisk = 0
        if (avgAirTemp >= 25 && avgAirTemp <= 35 && avgHumidity >= 80) dayRisk += 40
        else if (avgAirTemp >= 20 && avgHumidity >= 70) dayRisk += 20
        if (moisture != null && moisture > 0.4) dayRisk += 20
        if (soilTemp != null && soilTemp > 30) dayRisk += 15
        if (avgHumidity >= 90) dayRisk += 15
        dayRisk = Math.min(dayRisk, 100)
        totalRiskScore += dayRisk
        riskDays++
        if (dayRisk >= 60) highRiskDays++
      }
    }

    const avgRisk = riskDays > 0 ? Math.round(totalRiskScore / riskDays) : 0
    const riskLevel = avgRisk >= 60 ? 'HIGH' : avgRisk >= 35 ? 'MEDIUM' : 'LOW'

    const riskFactors: string[] = []
    const lastWeek = dailyData.slice(-7)
    const avgMoistureLastWeek = lastWeek.reduce((s, d) => s + (d.soil_moisture || 0), 0) / lastWeek.length
    const avgTempLastWeek = lastWeek.reduce((s, d) => s + (d.soil_temperature || 0), 0) / lastWeek.length

    if (avgMoistureLastWeek > 0.4) riskFactors.push('Độ ẩm đất cao — rủi ro thối rễ, nấm đất')
    if (avgTempLastWeek > 30) riskFactors.push('Nhiệt độ đất cao — stress nhiệt cho rễ cây')
    if (avgRisk >= 35) riskFactors.push('Điều kiện ẩm nóng — thuận lợi cho bệnh nấm lá chè, chấm xám')
    if (riskFactors.length === 0) riskFactors.push('Điều kiện thời tiết ổn định — rủi ro sâu bệnh thấp')

    return NextResponse.json({
      data: {
        parcel: { id: parcel.id, parcel_code: parcel.parcel_code, crop_type: parcel.crop_type, status: parcel.status, area_ha: parcel.area_ha, centroid_lat: parcel.centroid_lat, centroid_lng: parcel.centroid_lng },
        soil_health: dailyData,
        disease_history: diseaseHistory,
        pest_risk: { average_score: avgRisk, level: riskLevel, high_risk_days: highRiskDays, total_analyzed_days: riskDays, risk_factors: riskFactors, total_disease_reports: diseaseHistory.length },
        metadata: { source: 'Open-Meteo (open-source weather API)', license: 'CC BY 4.0', period_days: 30, data_depth: '0-7cm', timezone: 'Asia/Ho_Chi_Minh' },
      },
    })
  } catch {
    return NextResponse.json({ error: 'Lỗi hệ thống khi truy vấn dữ liệu sức khỏe đất' }, { status: 500 })
  }
}

export const GET = withErrorHandler(getSoilHealth)
