// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveMcpUser } from '@/application/mcp/McpUser'
import { CHAT_TOOLS } from '@/application/telegram/chat/tools'
import { NO_DATA_VI, TOOL_LINE_MAX, sanitizeArgs } from '@/application/telegram/chat/ChatEngine'
import { ForbiddenError, NotFoundError } from '@/domain/errors'
import { requireMcpCaller } from '@/lib/api/mcp-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const callSchema = z.object({ arguments: z.record(z.unknown()).default({}) })

/** Runs one read tool as the bearer's person and answers the same lines the Telegram engine sends. */
async function postMcpTool(request: Request, context: { params: Promise<{ name: string }> }) {
  const caller = await requireMcpCaller(request)
  const { name } = await context.params
  const body = callSchema.parse(await request.json().catch(() => null))
  const user = await resolveMcpUser(caller.sub)

  const tool = CHAT_TOOLS.find((candidate) => candidate.name === name)
  if (!tool) throw new NotFoundError('Tool not found')
  if (!tool.roles.includes(user.tenant.role)) throw new ForbiddenError('Forbidden')

  const result = await tool.run(user, sanitizeArgs(tool.args, body.arguments), new Date())
  const lines = result.lines.length ? result.lines.slice(0, TOOL_LINE_MAX) : [NO_DATA_VI]
  return NextResponse.json({ text: [...lines, `Nguồn: ${result.source}`].join('\n') })
}

export const POST = withErrorHandler(postMcpTool)
