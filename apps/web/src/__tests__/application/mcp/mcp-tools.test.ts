/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CHAT_TOOLS } from '@/application/telegram/chat/tools'
import { mcpToolsFor } from '@/application/mcp/McpTools'

describe('mcpToolsFor', () => {
  it('gives a farmer only the read tools that allow farmers, and no proposal tool', () => {
    const names = mcpToolsFor('farmer').map((tool) => tool.name)
    const expected = CHAT_TOOLS.filter((tool) => tool.roles.includes('farmer')).map((tool) => tool.name)
    expect(names).toEqual(expected)
    expect(names).not.toContain('create_proposal')
    expect(names).not.toContain('lots')
  })

  it('adds create_proposal for a manager and an officer', () => {
    for (const role of ['manager', 'officer'] as const) {
      const proposal = mcpToolsFor(role).find((tool) => tool.name === 'create_proposal')
      expect(proposal?.input_schema).toMatchObject({
        type: 'object',
        required: ['kind', 'payload', 'reason_vi'],
        additionalProperties: false,
        properties: { reason_vi: { type: 'string', minLength: 1, maxLength: 500 } },
      })
    }
  })

  it('gives every tool a JSON Schema whose properties are the chat tool arguments', () => {
    for (const tool of mcpToolsFor('manager')) {
      expect(tool.input_schema.type).toBe('object')
      expect(typeof tool.title_vi).toBe('string')
      expect(tool.description_vi.length).toBeGreaterThan(0)
      const source = CHAT_TOOLS.find((chat) => chat.name === tool.name)
      if (source) {
        expect(Object.keys(tool.input_schema.properties as object)).toEqual(source.args.map((arg) => arg.name))
      }
    }
  })
})
