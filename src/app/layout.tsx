import type { Metadata, Viewport } from 'next'
import { Playfair_Display, Hanken_Grotesk } from 'next/font/google'
import './globals.css'

// Suite brand fonts: Playfair Display (display/wordmark) + Hanken Grotesk (body).
const display = Playfair_Display({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
})
const body = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
})

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
    <html lang="no" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen bg-field font-sans text-text antialiased">
        {children}
      </body>
    </html>
  )
}
