'use client'

import { cn } from '@/lib/cn'

// React 19 passes `ref` as a regular prop — no forwardRef needed.
type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  ref?: React.Ref<HTMLInputElement>
}

/**
 * Shared text input. text-base (≥16px) so iOS Safari never auto-zooms on focus;
 * gold focus border; consistent night-field surface. Collapses the repeated
 * border/bg/placeholder class strings from the join + host forms.
 */
export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'w-full rounded-xl border border-border bg-surface px-4 py-3',
        'text-base text-text placeholder:text-muted',
        'transition-colors focus:border-gold focus:outline-none',
        className,
      )}
      {...props}
    />
  )
}
