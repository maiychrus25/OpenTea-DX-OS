// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

function formatContext(context?: unknown): unknown {
  if (context instanceof Error) {
    return {
      // @ts-ignore - Need to spread other properties from the Error object safely
      ...context,
      name: context.name,
      message: context.message,
      stack: context.stack,
    }
  }
  if (context !== null && typeof context === 'object') {
    const formatted: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(context)) {
      if (value instanceof Error) {
        formatted[key] = {
          name: value.name,
          message: value.message,
          stack: value.stack,
        }
      } else {
        formatted[key] = value
      }
    }
    return formatted
  }
  return context
}

export const logger = {
  error: (message: string, context?: unknown) => {
    if (typeof process !== 'undefined' && process.stderr) {
      try {
        process.stderr.write(
          JSON.stringify({
            level: 'error',
            timestamp: new Date().toISOString(),
            message,
            context: formatContext(context),
          }) + '\n'
        )
      } catch (e) {
        // Fallback for circular references or other serialization errors
        process.stderr.write(
          JSON.stringify({
            level: 'error',
            timestamp: new Date().toISOString(),
            message,
            context: '[Serialization Error]',
          }) + '\n'
        )
      }
    }
  },
  info: (message: string, context?: unknown) => {
    if (typeof process !== 'undefined' && process.stdout) {
      try {
        process.stdout.write(
          JSON.stringify({
            level: 'info',
            timestamp: new Date().toISOString(),
            message,
            context: formatContext(context),
          }) + '\n'
        )
      } catch (e) {
        process.stdout.write(
          JSON.stringify({
            level: 'info',
            timestamp: new Date().toISOString(),
            message,
            context: '[Serialization Error]',
          }) + '\n'
        )
      }
    }
  },
}
