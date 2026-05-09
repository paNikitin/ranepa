import type { ReactNode } from "react";

type Props = {
  title?: string;
  onBack?: () => void;
  children: ReactNode;
};

// Универсальный layout-контейнер экрана: safe-area-aware top-bar
// (с опциональной кнопкой «назад») + scrollable content. Использовать
// его как корень каждого route-компонента.
export function Screen({ title, onBack, children }: Props) {
  return (
    <div className="min-h-dvh flex flex-col bg-[var(--brand-bg)] text-[var(--brand-fg)]">
      {(title !== undefined || onBack) && (
        <header className="pt-safe-top sticky top-0 z-10 bg-[var(--brand-bg)]/85 backdrop-blur border-b border-[var(--brand-border)]">
          <div className="h-12 px-4 flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="-ml-2 px-2 h-10 rounded-xl text-[var(--brand-primary)] active:opacity-60"
                aria-label="Назад"
              >
                ‹ Назад
              </button>
            )}
            {title && <h1 className="text-base font-semibold">{title}</h1>}
          </div>
        </header>
      )}

      <main className="flex-1 px-4 pb-safe-bottom">{children}</main>
    </div>
  );
}
