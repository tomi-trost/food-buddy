import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api/client'
import { useMe, useUpdateHousehold, useUpdateMe } from '../api/hooks'
import { ACCENTS, type Accent, getAccent, setAccent, toggleTheme } from '../lib/theme'
import { Avatar } from '../ui/Avatar'
import { Sheet } from '../ui/Sheet'
import { Stepper } from '../ui/Stepper'

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const me = useMe().data
  const updateMe = useUpdateMe()
  const updateHousehold = useUpdateHousehold()
  const [accent, setAccentState] = useState<Accent>(getAccent)

  if (!me) return null
  const h = me.household

  return (
    <Sheet open={open} onClose={onClose} label="Settings">
      <h1>Settings</h1>
      <h2>Goals</h2>
      <div className="card">
        <div className="row">
          <span className="sp">Daily kcal goal</span>
          <Stepper label="kcal goal" value={me.goals.kcal} step={50} min={800} max={6000}
            onChange={(v) => updateMe.mutate({ goal_kcal: v })} />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <span className="sp">Protein goal</span>
          <Stepper label="protein goal" value={me.goals.protein} step={5} min={0} max={400} unit=" g"
            onChange={(v) => updateMe.mutate({ goal_protein: v })} />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <span className="sp">Fiber goal</span>
          <Stepper label="fiber goal" value={me.goals.fiber} step={2} min={0} max={100} unit=" g"
            onChange={(v) => updateMe.mutate({ goal_fiber: v })} />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <span className="sp">Sugar goal</span>
          <Stepper label="sugar goal" value={me.goals.sugar} step={5} min={10} max={300} unit=" g"
            onChange={(v) => updateMe.mutate({ goal_sugar: v })} />
        </div>
      </div>

      <h2>Croissant rewards</h2>
      <div className="card">
        <div className="row">
          <span className="sp">Treat-free days per croissant</span>
          <Stepper label="treat-free days per croissant" value={h.reward_per} min={2} max={3}
            onChange={(v) => updateHousehold.mutate({ reward_per: v })} />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <span className="sp">Max croissants / week</span>
          <Stepper label="croissants per week" value={h.reward_cap} min={1} max={5}
            onChange={(v) => updateHousehold.mutate({ reward_cap: v })} />
        </div>
      </div>

      <h2>Look</h2>
      <div className="card">
        <div className="row">
          <span className="sp">Dark mode</span>
          <button className="chip" onClick={toggleTheme}>Toggle</button>
        </div>
        <h3 style={{ marginTop: 14 }}>Accent colour</h3>
        <div className="sub" style={{ margin: '2px 0 10px' }}>On this device</div>
        <div className="chips" role="group" aria-label="Accent colour">
          {(Object.keys(ACCENTS) as Accent[]).map((key) => (
            <button
              key={key}
              className="swatch"
              style={{ background: ACCENTS[key].light }}
              aria-label={ACCENTS[key].name}
              aria-pressed={accent === key}
              onClick={() => {
                setAccent(key)
                setAccentState(key)
              }}
            />
          ))}
        </div>
      </div>

      <h2>Household · {h.name}</h2>
      <div className="card">
        <div className="list">
          {h.members.map((m) => (
            <div key={m.id}>
              <Avatar name={m.name} color={m.color} size={32} />
              <span className="sp">{m.name}{m.id === me.id ? ' (you)' : ''}</span>
            </div>
          ))}
        </div>
        <div className="sub" style={{ marginTop: 8 }}>
          Invite code for your partner: <b style={{ color: 'var(--ink)' }}>{h.invite_code}</b>
        </div>
      </div>
      {(updateMe.isError || updateHousehold.isError) && (
        <p className="error" role="alert">Couldn't save: {(updateMe.error ?? updateHousehold.error)?.message}</p>
      )}
      <button
        className="btn ghost"
        onClick={() => {
          api.logout()
          navigate('/login')
        }}
      >
        Log out
      </button>
    </Sheet>
  )
}
