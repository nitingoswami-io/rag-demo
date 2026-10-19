import type { ReactNode } from "react";

/**
 * A ruled panel in the shared live-demo look. A title that starts with a
 * number ("1. Pick a knowledge base") shows it as a red panel number.
 */
export default function Panel({
  title,
  subtitle,
  actions,
  children,
  bodyClassName = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  const numbered = typeof title === "string" ? /^(\d+)\.\s+(.*)$/.exec(title) : null;
  return (
    <section className="dl-panel flex h-full min-h-0 flex-col overflow-hidden">
      <header className="dl-panel__head">
        <div className="min-w-0">
          <h2 className="dl-panel__title">
            {numbered ? (
              <>
                <span className="dl-panel__num">{numbered[1]} ·</span>
                {numbered[2]}
              </>
            ) : (
              title
            )}
          </h2>
          {subtitle && <p className="dl-panel__desc">{subtitle}</p>}
        </div>
        {actions}
      </header>
      <div className={`min-h-0 flex-1 overflow-auto ${bodyClassName}`}>{children}</div>
    </section>
  );
}
