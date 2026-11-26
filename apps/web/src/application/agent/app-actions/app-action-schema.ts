// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'

const ALLOWED_PROPERTY_KEYS = new Set(['type', 'enum', 'minimum', 'maximum', 'minLength', 'maxLength'])
const ALLOWED_ROOT_KEYS = new Set(['type', 'required', 'additionalProperties', 'properties'])

type Json = Record<string, unknown>

function propertySchema(name: string, spec: Json): z.ZodTypeAny {
  for (const key of Object.keys(spec)) {
    if (!ALLOWED_PROPERTY_KEYS.has(key)) throw new Error(`Unsupported keyword '${key}' in property '${name}'`)
  }
  const values = spec.enum
  if (values !== undefined) {
    if (!Array.isArray(values) || values.length === 0 || !values.every((v) => ['string', 'number', 'boolean'].includes(typeof v))) {
      throw new Error(`Bad enum in property '${name}'`)
    }
  }
  switch (spec.type) {
    case 'string': {
      let schema = z.string()
      if (typeof spec.minLength === 'number') schema = schema.min(spec.minLength)
      if (typeof spec.maxLength === 'number') schema = schema.max(spec.maxLength)
      if (values !== undefined) return schema.refine((v) => (values as unknown[]).includes(v), 'not in enum')
      return schema
    }
    case 'integer':
    case 'number': {
      let schema = spec.type === 'integer' ? z.number().int() : z.number()
      if (typeof spec.minimum === 'number') schema = schema.min(spec.minimum)
      if (typeof spec.maximum === 'number') schema = schema.max(spec.maximum)
      if (values !== undefined) return schema.refine((v) => (values as unknown[]).includes(v), 'not in enum')
      return schema
    }
    case 'boolean':
      return z.boolean()
    default:
      throw new Error(`Unsupported type in property '${name}'`)
  }
}

/** Builds the zod schema of an action payload from the C1 JSON Schema subset, plus the optional `_labels` the agent adds. */
export function buildPayloadSchema(jsonSchema: unknown): z.ZodType<Record<string, unknown>, z.ZodTypeDef, unknown> {
  const root = jsonSchema as Json
  if (!root || root.type !== 'object') throw new Error('The payload schema must be an object schema')
  for (const key of Object.keys(root)) {
    if (!ALLOWED_ROOT_KEYS.has(key)) throw new Error(`Unsupported keyword '${key}'`)
  }
  const properties = (root.properties ?? {}) as Record<string, Json>
  const required = new Set((root.required ?? []) as string[])
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [name, spec] of Object.entries(properties)) {
    if (name === '_labels') throw new Error("'_labels' is reserved")
    const schema = propertySchema(name, spec)
    shape[name] = required.has(name) ? schema : schema.optional()
  }
  for (const name of Array.from(required)) {
    if (!(name in shape)) throw new Error(`Required property '${name}' is not declared`)
  }
  shape._labels = z.record(z.string(), z.string()).optional()
  return z.object(shape).strict() as unknown as z.ZodType<Record<string, unknown>, z.ZodTypeDef, unknown>
}

/** `{name}` placeholders come from the payload, then from the suggestion labels; a missing value shows as an ellipsis. */
export function fillPreview(template: string, payload: Record<string, unknown>, labels: Record<string, string>): string {
  return template.replace(/\{([a-z0-9_]+)\}/gi, (_m, key: string) => {
    const value = payload[key] ?? labels[key]
    return value === undefined || value === null ? '…' : String(value)
  })
}
