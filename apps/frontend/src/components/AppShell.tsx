import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router'
import { longDateLabel } from '@menu/shared'
import { Icon, type IconName } from './Icon.js'
import { useToday } from '../hooks/useToday.js'
import { trpc } from '../lib/trpc.js'

type NavItem = { to: string; label: string; icon: IconName; badge?: number }

// Destinations that exist so far. On phones these render as a bottom tab bar;
// from tablet width up they move into the header as pill buttons.
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Tonight', icon: 'tonight' },
  { to: '/plan', label: 'Plan', icon: 'plan' },
  { to: '/shopping', label: 'Shopping', icon: 'shopping' },
  { to: '/feedback', label: 'Feedback', icon: 'feedback' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

export function AppShell({ title, children, actions, badges, kiosk = false }: {
  title: string
  children: ReactNode
  actions?: ReactNode
  /** Badge counts by route, e.g. { '/shopping': 4 }. */
  badges?: Record<string, number>
  /** Full-screen kitchen display: no navigation, larger type. */
  kiosk?: boolean
}) {
  const today = useToday()
  const { data: pendingCount } = trpc.shopping.pendingCount.useQuery(undefined, { enabled: !kiosk, staleTime: 60_000 })
  const items = NAV_ITEMS.map(i => ({ ...i, badge: badges?.[i.to] ?? (i.to === '/shopping' ? pendingCount : undefined) }))
  if (kiosk) {
    return (
      <div className="app app--kiosk">
        <div className="tablecloth" aria-hidden="true" />
        <header className="app-header">
          <div className="app-heading">
            <div className="eyebrow">{longDateLabel(today)}</div>
            <h1 className="page-title">{title}</h1>
          </div>
          <nav className="kiosk-nav" aria-label="Display">
            <FullscreenToggle />
            <NavLink to="/" className="nav-pill">Exit</NavLink>
          </nav>
        </header>
        <main className="app-main">{children}</main>
      </div>
    )
  }
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
          <NavLink to="/kiosk" className="nav-pill nav-pill--quiet"><Icon name="fullscreen" /><span>Full screen</span></NavLink>
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

function FullscreenToggle() {
  const [isFull, setIsFull] = useState(() => !!document.fullscreenElement)
  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  // iPhone Safari has no Fullscreen API; installed to the home screen it's already full-screen.
  if (!document.documentElement.requestFullscreen) return null
  return (
    <button className="nav-pill" onClick={() => (isFull ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}>
      <Icon name="fullscreen" /><span>{isFull ? 'Exit full screen' : 'Full screen'}</span>
    </button>
  )
}
