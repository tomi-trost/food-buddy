import { type FormEvent, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api } from '../api/client'

type Mode = 'login' | 'create' | 'join'

export function LoginPage() {
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const [mode, setMode] = useState<Mode>('login')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    const value = (key: string) => String(f.get(key) ?? '').trim()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') await api.login(value('email'), String(f.get('password')))
      else
        await api.register({
          email: value('email'),
          password: String(f.get('password')),
          name: value('name'),
          ...(mode === 'create' ? { household_name: value('household') } : { invite_code: value('invite') }),
        })
      navigate(from, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="app screen bare">
      <h1>Food Buddy</h1>
      <p className="sub">Snap your meal, see the macros, plan the week together.</p>
      <div className="seg" role="group" aria-label="Account">
        {(['login', 'create', 'join'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
            {{ login: 'Log in', create: 'New household', join: 'Join partner' }[m]}
          </button>
        ))}
      </div>
      <form
        className="card"
        aria-label={mode === 'login' ? 'Log in' : 'Create account'}
        onSubmit={onSubmit}
        style={{ display: 'grid', gap: 12 }}
      >
        {mode !== 'login' && (
          <label className="field">
            Your name
            <input name="name" required autoComplete="given-name" />
          </label>
        )}
        <label className="field">
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label className="field">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={mode === 'login' ? undefined : 8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        {mode === 'create' && (
          <label className="field">
            Household name
            <input name="household" required placeholder="Our kitchen" />
          </label>
        )}
        {mode === 'join' && (
          <label className="field">
            Invite code from your partner
            <input name="invite" required autoCapitalize="off" autoCorrect="off" />
          </label>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>
    </main>
  )
}
