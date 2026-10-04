import { NavLink } from 'react-router'

export function PlanTabs() {
  return (
    <nav className="subtabs" aria-label="Plan sections">
      <NavLink to="/plan" end className={({ isActive }) => `subtab${isActive ? ' subtab--active' : ''}`}>Week</NavLink>
      <NavLink to="/plan/recipes" className={({ isActive }) => `subtab${isActive ? ' subtab--active' : ''}`}>Recipes</NavLink>
    </nav>
  )
}
