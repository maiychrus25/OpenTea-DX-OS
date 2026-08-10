import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '@/styles/globals.css'

const inter = Inter({ subsets: ['vietnamese'], display: 'swap' })

export const metadata: Metadata = {
  title: 'DX-AgriMarket',
  description: 'Hệ điều hành số Nông nghiệp',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="vi">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
