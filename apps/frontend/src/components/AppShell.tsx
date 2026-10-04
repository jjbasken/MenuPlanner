import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { longDateLabel } from '@menu/shared'
import { Icon, type IconName } from './Icon.js'
import { useToday } from '../hooks/useToday.js'

type NavItem = { to: string; label: string; icon: IconName; badge?: number }

// Destinations that exist so far. On phones these render as a bottom tab bar;
// from tablet width up they move into the header as pill buttons.
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Tonight', icon: 'tonight' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

export function AppShell({ title, children, actions, badges }: {
  title: string
  children: ReactNode
  actions?: ReactNode
  /** Badge counts by route, e.g. { '/shopping': 4 }. */
  badges?: Record<string, number>
}) {
  const today = useToday()
  const items = NAV_ITEMS.map(i => ({ ...i, badge: badges?.[i.to] }))
  return (
    <div className="app">
      <div className="tablecloth" aria-hidden="true" />
      <header className="app-header">
        <div className="app-heading">
          <div className="eyebrow">{longDateLabel(today)}</div>
          <h1 className="page-title">{title}</h1>
        </div>
        <nav className="top-nav" aria-label="Main">
          {items.map(item => <NavPill key={item.to} item={item} />)}
          {actions}
        </nav>
      </header>
      <main className="app-main">{children}</main>
      <nav className="tab-bar" aria-label="Main">
        {items.map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `tab${isActive ? ' tab--active' : ''}`}>
            <span className="tab-icon">
              <Icon name={item.icon} size={22} />
              {item.badge ? <span className="badge">{item.badge}</span> : null}
            </span>
            <span className="tab-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function NavPill({ item }: { item: NavItem }) {
  return (
    <NavLink to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-pill${isActive ? ' nav-pill--active' : ''}`}>
      <Icon name={item.icon} />
      <span>{item.label}</span>
      {item.badge ? <span className="badge">{item.badge}</span> : null}
    </NavLink>
  )
}
