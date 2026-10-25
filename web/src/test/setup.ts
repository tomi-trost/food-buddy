import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { reportReachable } from '../lib/online'
import { drop, pending } from '../lib/outbox'

afterEach(async () => {
  cleanup()
  localStorage.clear()
  reportReachable(true)
  for (const c of await pending()) await drop(c.id!) // nothing waits into the next test
})
