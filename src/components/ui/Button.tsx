'use client'

import { cn } from '@/lib/cn'

type Variant = 'primary' | 'sage' | 'blight' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  // Gold primary — the suite hero accent. Ink text for AA contrast on gold.
  primary: 'bg-gold text-ink hover:bg-gold-light',
  // Sage = the faithful / "join" affirmative action.
  sage: 'bg-sage text-ink hover:brightness-110',
  // Blight = the betrayer / destructive choice (used sparingly).
  blight: 'bg-blight text-text hover:brightness-110',
  // Ghost = quiet secondary action on the night field.
  ghost: 'border border-border bg-surface text-muted hover:text-text hover:border-gold/50',
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
}

/**
 * Shared button. Collapses the verbose, repeated class strings across the app
 * into one tasteful primitive: ≥44px touch target, gold focus ring (from
 * globals.css), consistent disabled state, and a subtle press response.
 */
export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-3',
        'text-sm font-medium transition-[transform,filter,opacity,background-color,border-color]',
        'active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
}
