import type { HTMLAttributes, ReactNode } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  interactive?: boolean;
};

// Унифицированная карточка — фон/радиус/тень. interactive=true делает
// её tappable (active-state, cursor). Используется в списках и формах.
export function Card({ interactive, className = "", children, ...rest }: Props) {
  return (
    <div
      {...rest}
      className={[
        "rounded-2xl bg-[var(--brand-surface)] p-4",
        "border border-[var(--brand-border)]",
        interactive
          ? "cursor-pointer active:scale-[0.99] transition"
          : "",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
