// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { formatVnDate } from '@/application/agent/actions/journal-labels'
import { ListProposalsUseCase } from '@/application/agent/ListProposalsUseCase'
import { GetWeatherForecastUseCase } from '@/application/weather/get-weather-forecast-usecase'
import { PrismaProposalRepository } from '@/infrastructure/db/agent/PrismaProposalRepository'
import { PrismaWeatherRepository } from '@/infrastructure/db/weather/prisma-weather-repository'
import type { ChatTool } from '../types'
import { householdFilter, reply } from './common'
import { countJournal } from './journal'
import { upcomingHarvests } from './harvest-schedule'

const YEAR_DAYS = 365

/** Routes: `GET /api/weather`, `GET /api/journal`, `GET /api/schedule/harvest`; officers also see the proposal count. */
export const todayTool: ChatTool = {
  name: 'today',
  titleVi: 'Hôm nay',
  roles: ['farmer', 'officer', 'manager'],
  routes: ['GET /api/weather', 'GET /api/journal', 'GET /api/schedule/harvest'],
  args: [],
  async run(user, _args, now) {
    const zones = await new GetWeatherForecastUseCase(new PrismaWeatherRepository()).execute(user.tenant.htxProfileId)
    const weather = zones[0] ? [`Thời tiết: ${Math.round(zones[0].current.temperature)}°C, ${zones[0].current.condition}`] : []
    const scope = householdFilter(user)
    if (!scope) return reply('Tổng quan', weather)

    if (user.tenant.role === 'farmer') {
      const pending = await countJournal(user, { ...scope, status: 'PENDING_APPROVAL' })
      const changes = await countJournal(user, { ...scope, status: 'REQUEST_CHANGES' })
      const next = (await upcomingHarvests(user, now, YEAR_DAYS))
        .map((event) => event.estimatedHarvestDate)
        .filter((date): date is string => Boolean(date))
        .sort()[0]
      return reply('Tổng quan', [
        ...weather,
        `Nhật ký chờ duyệt: ${pending}`,
        `Nhật ký cần sửa: ${changes}`,
        ...(next ? [`Thu hoạch gần nhất: ${formatVnDate(next)}`] : []),
      ])
    }

    const pending = await countJournal(user, { status: 'PENDING_APPROVAL' })
    const open = await new ListProposalsUseCase(new PrismaProposalRepository()).execute(user.tenant.htxCode, { view: 'open' })
    return reply('Tổng quan', [...weather, `Nhật ký chờ duyệt: ${pending}`, `Đề xuất đang mở: ${open.length}`])
  },
}
