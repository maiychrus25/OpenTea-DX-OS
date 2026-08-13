// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import '@/styles/globals.css'

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-inter',
})

import { Providers } from './providers'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  title: 'DX-AgriMarket',
  description: 'Há»‡ Ä‘iá» u hÃ nh sá»‘ NÃ´ng nghiá»‡p',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="vi" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
