// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { CREATE_PROPOSAL_TOOL } from '@/application/mcp/McpTools'
import { createMcpProposal } from '@/application/mcp/CreateMcpProposal'
import { resolveMcpUser } from '@/application/mcp/McpUser'
import { notifyProposalCreated } from '@/application/telegram/telegram-services'
import { CHAT_TOOLS } from '@/application/telegram/chat/tools'
import { NO_DATA_VI, TOOL_LINE_MAX, sanitizeArgs } from '@/application/telegram/chat/ChatEngine'
import { ForbiddenError, NotFoundError } from '@/domain/errors'
import { requireMcpCaller } from '@/lib/api/mcp-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const callSchema = z.object({ arguments: z.record(z.unknown()).default({}) })
const createSchema = z.object({
  kind: z.string().trim().min(1).max(128),
  payload: z.record(z.unknown()),
  reason_vi: z.string().trim().min(1).max(500),
})

/** Runs one read tool as the bearer's person and answers the same lines the Telegram engine sends. */
async function postMcpTool(request: Request, context: { params: Promise<{ name: string }> }) {
  const caller = await requireMcpCaller(request)
  const { name } = await context.params
  const body = callSchema.parse(await request.json().catch(() => null))
  const user = await resolveMcpUser(caller.sub)

  if (name === CREATE_PROPOSAL_TOOL) {
    const input = createSchema.parse(body.arguments)
    const created = await createMcpProposal(user.tenant, {
      kind: input.kind,
      payload: input.payload,
      reasonVi: input.reason_vi,
    })
    if (!created) return NextResponse.json({ error: { code: 'CONFLICT', message: 'Đã có đề xuất đang mở cho việc này.' } }, { status: 409 })
    await notifyProposalCreated(user.tenant.htxCode, created.id)
    return NextResponse.json(
      { proposal_id: created.id, status: 'proposed', message_vi: 'Đã tạo đề xuất. Bạn cần xác nhận trên web hoặc Telegram.' },
      { status: 201 }
    )
  }

  const tool = CHAT_TOOLS.find((candidate) => candidate.name === name)
  if (!tool) throw new NotFoundError('Tool not found')
  if (!tool.roles.includes(user.tenant.role)) throw new ForbiddenError('Forbidden')

  const result = await tool.run(user, sanitizeArgs(tool.args, body.arguments), new Date())
  const lines = result.lines.length ? result.lines.slice(0, TOOL_LINE_MAX) : [NO_DATA_VI]
  return NextResponse.json({ text: [...lines, `Nguồn: ${result.source}`].join('\n') })
}

export const POST = withErrorHandler(postMcpTool)
