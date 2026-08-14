import { Outlet, useLocation } from 'react-router';

import { TabBar, TABS } from './components/TabBar.tsx';

export function App() {
  const { pathname } = useLocation();
  const titolo = TABS.find((t) => t.to === pathname)?.label ?? 'Homelab Hub';

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header
        className="sticky top-0 z-10 border-b border-line bg-bg/85 backdrop-blur"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
          <h1 className="text-lg font-semibold tracking-tight">{titolo}</h1>
        </div>
      </header>

      {/* pb: lascia spazio alla tab bar fissa + home indicator */}
      <main className="mx-auto max-w-3xl px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>

      <TabBar />
    </div>
  );
}
