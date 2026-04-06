import { NavLink } from 'react-router-dom';
import { Activity, Monitor, Briefcase, BarChart2, Globe, Newspaper, Search, Command, Sun, Moon, Calendar, LayoutGrid } from 'lucide-react';
import { useAppStore } from '../store';
import AlertSystem from './AlertSystem';

const NAV_ITEMS = [
  { to: '/terminal',  label: 'Terminal',  Icon: Monitor },
  { to: '/portfolio', label: 'Portfolio', Icon: Briefcase },
  { to: '/screener',  label: 'Screener',  Icon: BarChart2 },
  { to: '/markets',   label: 'Markets',   Icon: Globe },
  { to: '/news',      label: 'News',      Icon: Newspaper },
  { to: '/heatmap',   label: 'Heatmap',   Icon: LayoutGrid },
  { to: '/calendar',  label: 'Calendar',  Icon: Calendar },
];

export default function Navbar() {
  const { setSearchOpen, theme, toggleTheme } = useAppStore();

  return (
    <nav className="h-10 bg-navy-900 border-b border-navy-600 flex items-center px-4 shrink-0">
      {/* Logo */}
      <NavLink to="/terminal" className="flex items-center gap-2 mr-6">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-accent-cyan to-accent-green flex items-center justify-center">
          <Activity size={12} className="text-navy-950" strokeWidth={2.5} />
        </div>
        <span className="text-sm font-bold text-white tracking-wide hidden sm:block">FinVision</span>
      </NavLink>

      {/* Nav links */}
      <div className="flex items-center gap-0.5">
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-navy-700 border border-transparent'
              }`
            }
          >
            <Icon size={12} />
            <span className="hidden lg:inline">{label}</span>
          </NavLink>
        ))}
      </div>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-2">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-navy-700 transition-all"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        {/* Alerts */}
        <AlertSystem />

        {/* Search */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 px-3 py-1 rounded-lg bg-navy-700 border border-navy-600 text-slate-500 hover:text-slate-300 hover:border-navy-500 transition-all text-xs font-mono"
        >
          <Search size={11} />
          <span className="hidden md:inline">Search</span>
          <div className="flex items-center gap-0.5">
            <kbd className="bg-navy-600 px-1 rounded text-[9px]"><Command size={8} className="inline" /></kbd>
            <kbd className="bg-navy-600 px-1 rounded text-[9px]">K</kbd>
          </div>
        </button>
      </div>
    </nav>
  );
}
