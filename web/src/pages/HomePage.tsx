import { useState } from 'react'
import { Link } from 'react-router'
import { useMe } from '../api/hooks'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'
import { SettingsSheet } from './SettingsSheet'

export function HomePage() {
  const me = useMe().data
  const [settings, setSettings] = useState(false)
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <>
      <div className="top">
        <div>
          <div className="sub">{date}</div>
          <h1>Hi{me ? `, ${me.name}` : ''}</h1>
        </div>
        <div className="row">
          <Link to="/insights" className="icon" aria-label="Insights">
            <Icon name="insights" />
          </Link>
          <button aria-label="Settings" onClick={() => setSettings(true)}>
            {me && <Avatar name={me.name} color={me.color} />}
          </button>
        </div>
      </div>
      <Link to="/snap" className="btn">
        <Icon name="camera" size={18} /> Snap your meal
      </Link>
      <SettingsSheet open={settings} onClose={() => setSettings(false)} />
    </>
  )
}
