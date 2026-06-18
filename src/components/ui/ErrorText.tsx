import { cn } from '@/lib/cn'

type ErrorTextProps = {
  children: React.ReactNode
  className?: string
}

/**
 * Consistent inline error message. Replaces the ad-hoc bare-<p> error strings
 * scattered across the forms with one styled, accessible (role="alert") element
 * in the app's blight colour — readable on the night field (AA).
 */
export function ErrorText({ children, className }: ErrorTextProps) {
  if (!children) return null
  return (
    <p
      role="alert"
      className={cn(
        'rounded-lg border border-blight/40 bg-blight/15 px-3 py-2 text-center text-sm text-blight-text',
        className,
      )}
    >
      {children}
    </p>
  )
}
