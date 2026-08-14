import type { ReactNode } from 'react';

export function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <section className="mb-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </div>
      {children ? <div className="mt-3 text-sm text-muted">{children}</div> : null}
    </section>
  );
}

/** Segnaposto per le sezioni che arrivano nelle fasi successive. */
export function Placeholder({ fase, cosa }: { fase: string; cosa: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface-2 p-4 text-sm text-muted">
      <span className="font-medium text-ink">{fase}</span> — {cosa}
    </div>
  );
}
