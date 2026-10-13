import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import type { PushConfig } from '../api/types'
import * as push from '../lib/push'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { NotificationSettings } from './NotificationSettings'

vi.mock('../lib/push', () => ({
  pushSupport: vi.fn(() => 'ok'),
  currentSubscription: vi.fn(async () => null),
  enablePush: vi.fn(async () => {}),
  disablePush: vi.fn(async () => {}),
}))

const ON: PushConfig = { enabled: true, public_key: 'BKEY', off: [] }
const render = () => renderAt('/', <Route path="/" element={<NotificationSettings partner="Ana" />} />)

function serve(config: PushConfig = ON) {
  let current = config
  return mockFetch((url, init) => {
    if (url === '/api/push/prefs') {
      current = { ...current, off: JSON.parse(String(init!.body)).off }
      return jsonResponse(current)
    }
    if (url === '/api/push/test') return jsonResponse({ sent: 1 })
    return jsonResponse(current)
  })
}

beforeEach(() => {
  tokenStore.set('tok')
  vi.mocked(push.pushSupport).mockReturnValue('ok')
  vi.mocked(push.currentSubscription).mockResolvedValue(null)
})

describe('NotificationSettings', () => {
  it('says when the server has no push keys', async () => {
    serve({ enabled: false, public_key: null, off: [] })
    render()
    expect(await screen.findByText("Notifications aren't set up on the server yet.")).toBeInTheDocument()
  })

  it('explains Add to Home Screen in iPhone Safari', async () => {
    vi.mocked(push.pushSupport).mockReturnValue('install')
    serve()
    render()
    expect(await screen.findByText(/Add to Home Screen/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).not.toBeInTheDocument()
  })

  it('explains blocked notifications', async () => {
    vi.mocked(push.pushSupport).mockReturnValue('denied')
    serve()
    render()
    expect(await screen.findByText(/Notifications are blocked/)).toBeInTheDocument()
  })

  it('turns notifications on with the server key, then shows the six switches', async () => {
    serve()
    render()
    vi.mocked(push.enablePush).mockImplementation(async () => {
      vi.mocked(push.currentSubscription).mockResolvedValue({ endpoint: 'https://x' } as PushSubscription)
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }))
    await waitFor(() => expect(push.enablePush).toHaveBeenCalledWith('BKEY'))
    expect(await screen.findByRole('switch', { name: /Photo analyzed/ })).toBeChecked()
    expect(screen.getAllByRole('switch')).toHaveLength(6)
    expect(screen.getByRole('switch', { name: /Weekly menu/ })).toBeChecked()
    expect(screen.getByRole('switch', { name: /Ana rated/ })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /Ana logged a meal/ })).toBeChecked()
  })

  it('shows why turning on failed', async () => {
    serve()
    vi.mocked(push.enablePush).mockRejectedValue(new Error('Notifications were not allowed'))
    render()
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Notifications were not allowed')
  })

  describe('when on', () => {
    beforeEach(() => {
      vi.mocked(push.currentSubscription).mockResolvedValue({ endpoint: 'https://x' } as PushSubscription)
    })

    it('mutes and unmutes one kind', async () => {
      const fetch = serve({ ...ON, off: ['daily'] })
      render()
      const daily = await screen.findByRole('switch', { name: /Evening reminder/ })
      expect(daily).not.toBeChecked()
      fireEvent.click(screen.getByRole('switch', { name: /Rate after eating/ }))
      await waitFor(() => expect(screen.getByRole('switch', { name: /Rate after eating/ })).not.toBeChecked())
      const [, init] = fetch.mock.calls.find(([url]) => url === '/api/push/prefs')!
      expect(JSON.parse(String(init!.body))).toEqual({ off: ['daily', 'rate'] })
    })

    it('sends a test notification', async () => {
      serve()
      render()
      fireEvent.click(await screen.findByRole('button', { name: 'Send a test' }))
      expect(await screen.findByText(/Sent: it should pop up/)).toBeInTheDocument()
    })

    it('turns off on this phone', async () => {
      serve()
      render()
      vi.mocked(push.disablePush).mockImplementation(async () => {
        vi.mocked(push.currentSubscription).mockResolvedValue(null)
      })
      fireEvent.click(await screen.findByRole('button', { name: 'Turn off on this phone' }))
      expect(await screen.findByRole('button', { name: 'Turn on notifications' })).toBeInTheDocument()
    })
  })
})
