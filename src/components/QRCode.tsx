'use client'

import { useMemo } from 'react'
import { encodeQR, EcLevel } from '@/lib/qr'

/**
 * Renders a QR code as a crisp SVG (no raster, scales to any projector size).
 * Dependency-free — the matrix comes from our tiny encoder in lib/qr.ts.
 */
export function QRCode({
  value,
  size = 256,
  ec = 'M',
  className,
  margin = 2,
  dark = '#1A1626',
  light = '#F2EFE6',
  title = 'QR-kode',
}: {
  value: string
  size?: number
  ec?: EcLevel
  className?: string
  /** Quiet-zone width in modules (spec minimum is 4). */
  margin?: number
  dark?: string
  light?: string
  title?: string
}) {
  const matrix = useMemo(() => encodeQR(value, ec), [value, ec])
  const count = matrix.length
  const dim = count + margin * 2

  // Merge each row's dark runs into a single path for a compact SVG.
  const path = useMemo(() => {
    let d = ''
    for (let r = 0; r < count; r++) {
      let c = 0
      while (c < count) {
        if (!matrix[r][c]) {
          c++
          continue
        }
        let run = 1
        while (c + run < count && matrix[r][c + run]) run++
        d += `M${c + margin} ${r + margin}h${run}v1h-${run}z`
        c += run
      }
    }
    return d
  }, [matrix, count, margin])

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${dim} ${dim}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <rect width={dim} height={dim} fill={light} />
      <path d={path} fill={dark} />
    </svg>
  )
}
