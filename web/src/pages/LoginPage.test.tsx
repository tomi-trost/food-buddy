import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router'
import { describe, expect, it } from 'vitest'
import { tokenStore } from '../api/client'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { LoginPage } from './LoginPage'

const routes = (
  <>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/" element={<p>home page</p>} />
  </>
)

describe('LoginPage', () => {
  it('joins a partner household with an invite code', async () => {
    const fetch = mockFetch(() => jsonResponse({ access_token: 'tok' }, 201))
    renderAt('/login', routes)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Join partner' }))
    await user.type(screen.getByLabelText('Your name'), 'Partner')
    await user.type(screen.getByLabelText('Email'), 'p@example.com')
    await user.type(screen.getByLabelText('Password'), 'long enough')
    await user.type(screen.getByLabelText('Invite code from your partner'), 'abc123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('home page')).toBeInTheDocument()
    expect(tokenStore.get()).toBe('tok')
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body))
    expect(body).toEqual({
      email: 'p@example.com', password: 'long enough', name: 'Partner', invite_code: 'abc123',
    })
  })

  it('shows the error from a failed login and stays on the page', async () => {
    mockFetch(() => jsonResponse({ detail: 'Wrong email or password' }, 401))
    renderAt('/login', routes)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 't@example.com')
    await user.type(screen.getByLabelText('Password'), 'nope')
    const form = screen.getByRole('form', { name: 'Log in' })
    await user.click(within(form).getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password')
    expect(screen.queryByText('home page')).not.toBeInTheDocument()
  })
})
