/**
 * @jest-environment node
 */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Labels printed before phase 2 point at /lot/<code>. The redirect lives in next.config.js so the server answers a
// real 308 before any page renders (a redirect thrown from a streamed page arrives as 200 with a client redirect).
const config = require('../../../next.config.js')

describe('/lot/[lot_code]', () => {
  it('redirects permanently to the one public trace page', async () => {
    expect(await config.redirects()).toContainEqual({ source: '/lot/:lot_code', destination: '/q/:lot_code', permanent: true })
  })
})
