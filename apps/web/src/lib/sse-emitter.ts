// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { EventEmitter } from 'events';

class SSEEmitter extends EventEmitter {}

// Use a global singleton to ensure the event emitter is shared across module reloads in Next.js development
const globalForSSEEmitter = global as unknown as { sseEmitter: SSEEmitter };

export const sseEmitter = globalForSSEEmitter.sseEmitter || new SSEEmitter();

if (process.env.NODE_ENV !== 'production') {
  globalForSSEEmitter.sseEmitter = sseEmitter;
}

export const SSE_EVENTS = {
  NEW_NOTIFICATION: 'new_notification',
};
