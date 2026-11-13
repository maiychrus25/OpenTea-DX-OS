// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { InstalledApp } from '@/domain/entities/installed-app'
import { UNSAFE_SEGMENT } from '@/lib/apps/unsafe-segment'
import { createIpLimiter } from '@/lib/ip-rate-limit'
import { logger } from '@/lib/logger'

const TIMEOUT_MS = 10_000
const CSP = "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'self'"
// An allowlist, so the browser's cookie, authorization and x-hasura-* headers never reach the gateway.
// content-length keeps a streamed body from going out chunked, which a stdlib app server cannot read.
const FORWARDED_REQUEST_HEADERS = ['content-type', 'accept', 'content-length']
// An allowlist too: set-cookie and the app's own CSP are dropped (content-disposition is kept below, attachments only).
const KEPT_RESPONSE_HEADERS = ['content-type', 'location']
const SIGNED_OUT_PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Cần đăng nhập</title></head>
<body><p>Phiên đăng nhập đã hết hạn. <a href="/login" target="_top">Đăng nhập lại</a> để tiếp tục.</p></body></html>`

// Spec §6.5: public app routes take 10 requests a minute per client IP, counted across every app.
// DXOS_APP_PUBLIC_LIMIT raises it only where one IP sends many requests on purpose (the CI browser specs).
function publicLimit(): number {
  const max = Number(process.env.DXOS_APP_PUBLIC_LIMIT)
  return Number.isInteger(max) && max > 0 ? max : 10
}
export const createPublicLimiter = () => createIpLimiter({ max: publicLimit(), windowMs: 60_000, maxKeys: 10_000 })

export interface ForwardToAppDeps {
  getToken: () => Promise<string>
  fetchImpl: typeof fetch
  clientIp: string
  /** One limiter per process, made with `createPublicLimiter`; true means the IP is over the limit. */
  isPublicLimited: (ip: string) => boolean
  /** The signed-in user's HTX, or null without a session HTX. Only read on protected paths. */
  getHtxCode: () => Promise<string | null>
  /** Whether the app is enabled for the HTX or for every HTX (platform.app_enablements). */
  isEnabledFor: (appId: string, htxCode: string) => Promise<boolean>
}

const HTX_CODE = /^[A-Za-z0-9_-]{1,20}$/

/**
 * Which tenant a request belongs to: a path under a public prefix names its HTX in the segment right after the prefix
 * (`/public/<htxCode>/...`), every other path uses the signed-in user's HTX. `/public` alone counts as public, with no HTX.
 */
export function appTenant(app: InstalledApp, path: string[]): { kind: 'protected' } | { kind: 'public'; htxCode: string | null } {
  const joined = `/${path.join('/')}/`
  const prefix = app.publicPrefixes.find(candidate => joined.startsWith(candidate))
  if (prefix === undefined) return { kind: 'protected' }
  const segment = joined.slice(prefix.length).split('/')[0]
  return { kind: 'public', htxCode: HTX_CODE.test(segment) ? segment : null }
}

/** A redirect may only send the frame to another page of the same app (an open redirect otherwise). */
function staysInApp(location: string, req: Request, appId: string): boolean {
  let target: URL
  try {
    target = new URL(location, req.url)
  } catch {
    return false
  }
  const prefix = `/apps/${appId}`
  return target.origin === new URL(req.url).origin && (target.pathname === prefix || target.pathname.startsWith(`${prefix}/`))
}

/**
 * R18: the proxy attaches the session token, so a form posted by another site would act as the signed-in user.
 * Without an Origin header only the browser's own Sec-Fetch-Site: cross-site marks a request as foreign.
 * req.url's host is no use here: the standalone server builds it from HOSTNAME (0.0.0.0), so the web origin is
 * req.url's scheme with the browser's Host header or, behind a proxy, AUTH_URL (the origin next-auth already uses).
 */
function isCrossSiteWrite(req: Request): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return false
  const origin = req.headers.get('origin')
  if (origin === null) return req.headers.get('sec-fetch-site') === 'cross-site'
  const host = req.headers.get('host')
  const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL
  try {
    const sameHost = host !== null && origin === `${new URL(req.url).protocol}//${host}`
    return !sameHost && !(authUrl && new URL(authUrl).origin === origin)
  } catch {
    return true // an unreadable AUTH_URL
  }
}

/** Every response under `/apps/` carries the no-script CSP (spec §6.6). */
export function appResponse(body: BodyInit | null, status: number, headers: HeadersInit = { 'content-type': 'text/plain; charset=utf-8' }) {
  const out = new Headers(headers)
  out.set('content-security-policy', CSP)
  out.set('x-content-type-options', 'nosniff')
  return new Response(body, { status, headers: out })
}

/** Sends a browser request for `/apps/<id>/<path>` to the gateway, with the user's token on protected paths (spec §6.7). */
export async function forwardToApp(req: Request, app: InstalledApp, path: string[], deps: ForwardToAppDeps): Promise<Response> {
  if (path.some(segment => UNSAFE_SEGMENT.test(segment))) return appResponse('Đường dẫn không hợp lệ', 400)
  if (isCrossSiteWrite(req)) return appResponse('Yêu cầu bị từ chối vì được gửi từ trang khác.', 403)

  const headers = new Headers()
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers.get(name)
    if (value !== null) headers.set(name, value)
  }

  const tenant = appTenant(app, path)
  let htxCode: string | null
  if (tenant.kind === 'public') {
    if (deps.isPublicLimited(deps.clientIp)) return appResponse('Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau một phút.', 429)
    htxCode = tenant.htxCode
  } else {
    try {
      headers.set('authorization', `Bearer ${await deps.getToken()}`)
    } catch {
      return appResponse(SIGNED_OUT_PAGE, 401, { 'content-type': 'text/html; charset=utf-8' })
    }
    htxCode = await deps.getHtxCode().catch(() => null)
  }
  // An app a cooperative did not enable is as good as absent for it, so the answer is the same 404 as for a missing app.
  try {
    if (htxCode === null || !(await deps.isEnabledFor(app.id, htxCode))) return appResponse('Không có ứng dụng này', 404)
  } catch (cause) {
    logger.error('Mini-app enablement lookup failed', { app: app.id, cause })
    return appResponse('Ứng dụng tạm thời không phản hồi. Vui lòng thử lại sau.', 503)
  }

  const url = `${process.env.CORE_GATEWAY_URL}/apps/${app.id}/${path.map(encodeURIComponent).join('/')}${new URL(req.url).search}`
  let upstream: Response
  try {
    upstream = await deps.fetchImpl(url, {
      method: req.method,
      headers,
      // The browser follows the app's redirects itself, through this proxy again.
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Streamed, not buffered; Node's fetch needs duplex for a stream body.
      ...(req.body ? { body: req.body, duplex: 'half' } : {}),
    } as RequestInit)
  } catch (cause) {
    logger.error('Mini-app request failed', { app: app.id, cause })
    return appResponse('Ứng dụng tạm thời không phản hồi. Vui lòng thử lại sau.', 503)
  }

  const location = upstream.headers.get('location')
  if (location !== null && !staysInApp(location, req, app.id)) {
    logger.error('Mini-app redirect refused', { app: app.id })
    await upstream.body?.cancel()
    return appResponse('Ứng dụng chuyển hướng tới địa chỉ không được phép.', 502)
  }

  const kept = new Headers()
  for (const name of KEPT_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value !== null) kept.set(name, value)
  }
  // A download link in the app (CSV) needs this; anything but an attachment (inline, a script-like name) is dropped.
  const disposition = upstream.headers.get('content-disposition')
  if (disposition !== null && /^attachment\b/i.test(disposition)) kept.set('content-disposition', disposition)
  return appResponse(upstream.body, upstream.status, kept)
}
