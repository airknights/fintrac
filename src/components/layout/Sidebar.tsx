import { NavLink } from 'react-router-dom'

const NAV = [
  { to: '/dashboard',    label: 'Dashboard',     icon: '◈' },
  { to: '/transactions', label: 'Transactions',  icon: '↕' },
  { to: '/accounts',     label: 'Accounts',      icon: '▤' },
  { to: '/budgets',      label: 'Budgets',       icon: '◉' },
  { to: '/settings',     label: 'Settings',      icon: '⚙' },
]

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-zinc-800">
        <span className="text-lg font-bold text-white tracking-tight">Fintrac</span>
        <span className="ml-2 text-xs text-gray-500">CA</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600/20 text-indigo-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-zinc-800'
              }`
            }
          >
            <span className="text-base">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom note */}
      <div className="px-5 py-4 border-t border-zinc-800">
        <p className="text-xs text-gray-600">Data stored in your Google Sheet</p>
      </div>
    </aside>
  )
}
