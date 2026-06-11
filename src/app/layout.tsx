import type { Metadata, Viewport } from 'next'
import { Inter, Fraunces } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces' })

export const metadata: Metadata = {
  title: 'SundayHarvest',
  description: 'Et bibelsk gjettespill for ungdomsgrupper — hveten og ugresset.',
}

export const viewport: Viewport = {
  themeColor: '#1A1626',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="no" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="bg-[#1A1626] text-[#F2EFE6] min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
