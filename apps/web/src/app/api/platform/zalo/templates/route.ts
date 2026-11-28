// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { zaloRepository } from '@/application/zalo/zalo-services'
import { TEMPLATE_KEYS, TEMPLATE_PARAM_KEYS } from '@/domain/zalo/zalo-events'
import { requirePlatformAdmin } from '@/lib/api/platform'
import { jsonBody } from '@/lib/api/route-helpers'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { zaloTemplatesSchema } from '@/lib/validations/zalo.schema'

/** All four template keys, configured or not, with the parameter names each may use. */
async function view() {
  const stored = await zaloRepository().templates()
  return TEMPLATE_KEYS.map((key) => {
    const found = stored.find((t) => t.templateKey === key)
    return { template_key: key, configured: !!found, zns_template_id: found?.znsTemplateId ?? null, params: found?.params ?? [], allowed_params: TEMPLATE_PARAM_KEYS[key] }
  })
}

async function getTemplates() {
  await requirePlatformAdmin()
  return NextResponse.json({ data: await view() })
}

async function putTemplates(request: Request) {
  const admin = await requirePlatformAdmin()
  const body = zaloTemplatesSchema.parse(await jsonBody(request))
  await zaloRepository().saveTemplates(
    body.templates.map((t) => ({ templateKey: t.template_key, znsTemplateId: t.zns_template_id, params: t.params })),
    `user:${admin.userId}`,
  )
  return NextResponse.json({ data: await view() })
}

export const GET = withErrorHandler(getTemplates)
export const PUT = withErrorHandler(putTemplates)
