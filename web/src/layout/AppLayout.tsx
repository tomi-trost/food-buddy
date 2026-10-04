import { NavLink, Outlet, useNavigate } from 'react-router'
import { Icon, type IconName } from '../ui/Icon'

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
  const navigate = useNavigate()
  return (
    <div className="app">
      <main className="screen">
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Main">
        <Tab {...TABS[0]} />
        <Tab {...TABS[1]} />
        <button className="fab" aria-label="Snap meal" onClick={() => navigate('/snap')}>
          <Icon name="camera" size={26} />
        </button>
        <Tab {...TABS[2]} />
        <Tab {...TABS[3]} />
      </nav>
    </div>
  )
}

/** Full-screen pages (snap flow) without the tab bar. */
export function BareLayout() {
  return (
    <div className="app">
      <main className="screen bare">
        <Outlet />
      </main>
    </div>
  )
}
