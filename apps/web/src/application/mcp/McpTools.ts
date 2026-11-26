// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CHAT_TOOLS } from '@/application/telegram/chat/tools'
import type { ArgHint, ChatRole } from '@/application/telegram/chat/types'

/** The only write tool an MCP client sees. It creates a proposal and never executes anything (M14 contract C1). */
export const CREATE_PROPOSAL_TOOL = 'create_proposal'

/** Roles that can approve at least one kind; only they are offered the proposal tool. */
const PROPOSAL_ROLES: readonly ChatRole[] = ['manager', 'officer']

export interface McpToolDescriptor {
  name: string
  title_vi: string
  description_vi: string
  input_schema: Record<string, unknown>
}

const PROPOSAL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', minLength: 1, maxLength: 128 },
    payload: { type: 'object' },
    reason_vi: { type: 'string', minLength: 1, maxLength: 500 },
  },
  required: ['kind', 'payload', 'reason_vi'],
  additionalProperties: false,
}

function argumentSchema(hint: ArgHint): Record<string, unknown> {
  const description = hint.descriptionVi
  if (hint.type === 'enum') return { type: 'string', enum: [...(hint.values ?? [])], description }
  if (hint.type === 'string') return { type: 'string', maxLength: 1000, description }
  return { type: hint.type, description }
}

function inputSchema(args: readonly ArgHint[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: Object.fromEntries(args.map((hint) => [hint.name, argumentSchema(hint)])),
    additionalProperties: false,
  }
}

/** The tools a person with this role may call through MCP: the chat read tools for the role, plus create_proposal for approvers. */
export function mcpToolsFor(role: ChatRole): McpToolDescriptor[] {
  const reads = CHAT_TOOLS.filter((tool) => tool.roles.includes(role)).map((tool) => ({
    name: tool.name,
    title_vi: tool.titleVi,
    description_vi: `Đọc ${tool.titleVi.toLowerCase()} của hợp tác xã.`,
    input_schema: inputSchema(tool.args),
  }))
  if (!PROPOSAL_ROLES.includes(role)) return reads
  return [
    ...reads,
    {
      name: CREATE_PROPOSAL_TOOL,
      title_vi: 'Tạo đề xuất',
      description_vi: 'Tạo một đề xuất để người có quyền xác nhận trên web hoặc Telegram. Không thực hiện ngay.',
      input_schema: PROPOSAL_INPUT_SCHEMA,
    },
  ]
}
