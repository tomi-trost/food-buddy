import { describe, expect, it } from 'vitest'
import { NETWORK_ONLY_PAGES } from './swRoutes'

const networkOnly = (path: string) => NETWORK_ONLY_PAGES.some((re) => re.test(path))

describe('NETWORK_ONLY_PAGES', () => {
  it("leaves Cloudflare Access' sign-in callback to the network", () => {
    expect(networkOnly('/cdn-cgi/access/authorized')).toBe(true)
    expect(networkOnly('/cdn-cgi/access/logout')).toBe(true)
  })

  it('leaves the API and the reauth stop to the network', () => {
    expect(networkOnly('/api/reauth')).toBe(true)
    expect(networkOnly('/api/auth/me')).toBe(true)
  })

  it('serves app screens from the cache', () => {
    for (const path of ['/', '/login', '/meals/3', '/apiary', '/plan']) expect(networkOnly(path)).toBe(false)
  })
})
