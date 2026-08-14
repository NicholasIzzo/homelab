import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

type Tab = { to: string; label: string; icon: ReactNode };

const icon = (d: string) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-6 w-6"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

export const TABS: Tab[] = [
  { to: '/stato', label: 'Stato', icon: icon('M3 12h4l3 8 4-16 3 8h4') },
  {
    to: '/scadenze',
    label: 'Scadenze',
    icon: icon('M8 3v4M16 3v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z'),
  },
  {
    to: '/finanze',
    label: 'Soldi',
    icon: icon('M12 2v20M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.8 5 3.3 5 1.4 5 3.3-2.2 3-5 3-5-1.1-5-3'),
  },
  {
    to: '/impostazioni',
    label: 'Impostazioni',
    icon: icon('M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V1a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 17 2.6a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z'),
  },
];

export function TabBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navigazione principale"
    >
      <ul className="mx-auto flex max-w-3xl">
        {TABS.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              className={({ isActive }) =>
                [
                  'flex min-h-[3.5rem] flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors',
                  isActive ? 'text-accent' : 'text-muted',
                ].join(' ')
              }
            >
              {tab.icon}
              <span>{tab.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
