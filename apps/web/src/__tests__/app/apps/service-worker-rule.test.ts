/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

type Rule = { urlPattern: (ctx: { url: URL; sameOrigin: boolean }) => boolean; handler: string }

// Capture the options next.config.js hands to next-pwa, without building a service worker.
jest.mock('@ducanh2912/next-pwa', () => ({
  default: (options: unknown) => (config: object) => ({ ...config, pwaOptions: options }),
}))

const nextConfig = require('../../../../next.config.js') as { pwaOptions: { workboxOptions: { runtimeCaching: Rule[] } } }
const rules = nextConfig.pwaOptions.workboxOptions.runtimeCaching
const handlerFor = (href: string, sameOrigin = true) => rules.find(rule => rule.urlPattern({ url: new URL(href), sameOrigin }))?.handler

describe('service worker runtime caching', () => {
  test('never serves mini-app pages from the cache', () => {
    expect(handlerFor('http://localhost:3000/apps/hello')).toBe('NetworkOnly')
    expect(handlerFor('http://localhost:3000/apps/tea-tour/public/book?x=1')).toBe('NetworkOnly')
  })

  test('keeps the notification stream rule', () => {
    expect(handlerFor('http://localhost:3000/api/notifications/stream')).toBe('NetworkOnly')
  })

  test('leaves other and cross-origin requests to the default rules', () => {
    expect(handlerFor('http://localhost:3000/manager/apps/hello')).toBeUndefined()
    expect(handlerFor('https://example.com/apps/hello', false)).toBeUndefined()
  })
})
