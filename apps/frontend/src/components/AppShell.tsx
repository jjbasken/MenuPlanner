import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { Icon, type IconName } from './Icon.js'

type NavItem = { to: string; label: string; icon: IconName; badge?: number }

// Destinations that exist so far. On phones these render as a bottom tab bar;
// from tablet width up they move into the header as pill buttons.
export const NAV_ITEMS: NavItem[] = [
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

export function formatDateLabel(d = new Date()) {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

export function AppShell({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="app">
      <div className="tablecloth" aria-hidden="true" />
      <header className="app-header">
        <div className="app-heading">
          <div className="eyebrow">{formatDateLabel()}</div>
          <h1 className="page-title">{title}</h1>
        </div>
        <nav className="top-nav" aria-label="Main">
          {NAV_ITEMS.map(item => <NavPill key={item.to} item={item} />)}
          {actions}
        </nav>
      </header>
      <main className="app-main">{children}</main>
      <nav className="tab-bar" aria-label="Main">
        {NAV_ITEMS.map(item => (
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
