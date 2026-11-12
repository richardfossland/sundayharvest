import { describe, expect, it } from 'vitest'

import { hostLoginEnabled } from './auth-config'

describe('hostLoginEnabled (host SSO is optional)', () => {
  it('is off when either issuer variable is missing or blank', () => {
    expect(hostLoginEnabled(undefined, undefined)).toBe(false)
    expect(hostLoginEnabled('https://x.supabase.co', undefined)).toBe(false)
    expect(hostLoginEnabled(undefined, 'anon')).toBe(false)
    expect(hostLoginEnabled('  ', 'anon')).toBe(false)
  })
  it('is on when both are set', () => {
    expect(hostLoginEnabled('https://x.supabase.co', 'anon')).toBe(true)
  })
})
