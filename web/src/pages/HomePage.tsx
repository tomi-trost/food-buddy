import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { api } from '../api/client'

export function HomePage() {
  const navigate = useNavigate()
  const me = useQuery({ queryKey: ['me'], queryFn: api.me })

  if (me.isError) {
    api.logout()
    navigate('/login', { replace: true })
  }

  return (
    <main className="screen">
      <h1>Hi{me.data ? `, ${me.data.name}` : ''}</h1>
      <Link to="/snap" className="btn primary">Snap your meal</Link>
      {me.data && (
        <section className="card">
          <h2>{me.data.household.name}</h2>
          <p className="sub">
            Invite code for your partner: <b>{me.data.household.invite_code}</b>
          </p>
        </section>
      )}
      <button
        className="btn"
        onClick={() => {
          api.logout()
          navigate('/login')
        }}
      >
        Log out
      </button>
    </main>
  )
}
