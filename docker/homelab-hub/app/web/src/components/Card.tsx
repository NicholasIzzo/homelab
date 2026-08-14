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
    <section className="card mb-2.5 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="titolo-card">{title}</h2>
        {hint ? <span className="nota shrink-0">{hint}</span> : null}
      </div>
      {children ? <div className="corpo mt-2.5">{children}</div> : null}
    </section>
  );
}
