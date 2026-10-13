import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAddFood } from '../add/AddFood'
import { syncPush } from '../lib/push'
import { Icon, type IconName } from '../ui/Icon'
import { OfflineBanner } from './OfflineBanner'
import { PendingBanner } from './PendingBanner'

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/meals', label: 'Meals', icon: 'meals' },
  { to: '/plan', label: 'Plan', icon: 'plan' },
  { to: '/ingredients', label: 'Ingredients', icon: 'basket' },
]

function Tab({ to, label, icon }: (typeof TABS)[number]) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `tab${isActive ? ' on' : ''}`}>
      <Icon name={icon} size={22} />
      {label}
    </NavLink>
  )
}

export function AppLayout() {
  const addFood = useAddFood()
  useEffect(() => {
    syncPush().catch(() => {}) // best effort: keeps this phone's subscription current
  }, [])
  return (
    <div className="app">
      <main className="screen">
        <OfflineBanner />
        <Outlet />
        <PendingBanner />
      </main>
      <nav className="tabbar" aria-label="Main">
        <Tab {...TABS[0]} />
        <Tab {...TABS[1]} />
        <button className="fab" aria-label="Add food" onClick={() => addFood()}>
          <Icon name="plus" size={28} />
        </button>
        <Tab {...TABS[2]} />
        <Tab {...TABS[3]} />
      </nav>
    </div>
  )
}

/** Full-screen pages (checking a photo, editing a meal) without the tab bar. */
export function BareLayout() {
  return (
    <div className="app">
      <main className="screen bare">
        <OfflineBanner />
        <Outlet />
      </main>
    </div>
  )
}
