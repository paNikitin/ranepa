import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

const styles: Record<Variant, string> = {
  primary:
    "bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] active:opacity-80",
  secondary:
    "bg-[var(--brand-surface)] text-[var(--brand-fg)] active:bg-[var(--brand-border)]",
  ghost:
    "bg-transparent text-[var(--brand-primary)] active:opacity-60",
};

// iOS-style кнопка: высота 44pt (минимально-тапаемая по HIG),
// rounded-2xl, без teхт-выделения. Variant'ы примитивные —
// добавлять новые осторожно (агенту проще не плодить).
export function Button({ variant = "primary", className = "", ...rest }: Props) {
  return (
    <button
      {...rest}
      className={[
        "h-11 px-5 rounded-2xl font-semibold select-none",
        "transition active:scale-[0.98] disabled:opacity-50",
        styles[variant],
        className,
      ].join(" ")}
    />
  );
}
