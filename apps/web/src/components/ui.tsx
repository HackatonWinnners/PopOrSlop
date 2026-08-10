import type { ReactNode } from "react";

/**
 * Shared primitives for both themes. Everything styles off the CSS variables
 * in globals.css, so a data-theme swap restyles these without prop changes.
 */

export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  return (
    <Tag
      className={`rounded-[var(--radius-card)] border border-line bg-surface ${className}`}
    >
      {children}
    </Tag>
  );
}

/** Section heading: mono label + hairline rule; the index only shows in terminal. */
export function SectionLabel({
  children,
  index,
  right,
}: {
  children: ReactNode;
  index?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-3">
      {index && <span className="sec-num label text-faint">{index}</span>}
      <span className="label">{children}</span>
      <span className="h-px flex-1 bg-line" />
      {right}
    </div>
  );
}

type Tone = "neutral" | "accent" | "pos" | "neg" | "warn";

const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent",
  pos: "bg-pos-bg text-pos",
  neg: "bg-neg-bg text-neg",
  warn: "bg-warn-bg text-warn",
};

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`label rounded-[var(--radius-control)] px-1.5 py-0.5 ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  secondary: "border border-line-strong text-ink hover:bg-surface-2",
  danger: "bg-neg text-white hover:opacity-90",
  ghost: "text-muted hover:text-ink",
};

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: ButtonVariant;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold transition-opacity disabled:opacity-50 ${VARIANT[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export const inputClass =
  "w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-sm text-ink";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

/** Label above a large monospace figure — prices, balances, scores. */
export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "accent" | "pos" | "neg";
}) {
  const color = tone === "accent" ? "text-accent" : tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-ink";
  return (
    <div>
      <p className="label">{label}</p>
      <p className={`tnum text-2xl ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-faint">{sub}</p>}
    </div>
  );
}

export function PageHeader({ title, blurb }: { title: string; blurb?: ReactNode }) {
  return (
    <header className="py-6">
      <h1 className="page-title text-3xl font-bold tracking-tight">{title}</h1>
      {blurb && <p className="mt-1 max-w-2xl text-sm text-muted">{blurb}</p>}
    </header>
  );
}

/** Square startup logo with a letter fallback. */
export function Logo({
  name,
  url,
  size = 32,
}: {
  name: string;
  url?: string | null;
  size?: number;
}) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        style={{ width: size, height: size }}
        className="shrink-0 rounded-[var(--radius-control)] bg-surface-2 object-cover"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.44 }}
      className="flex shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-surface-2 font-bold text-muted"
    >
      {/* Spread, not [0]: an emoji first character is a surrogate pair and
          indexing splits it into a replacement glyph. */}
      {[...name][0]}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[var(--radius-card)] border border-dashed border-line p-8 text-center text-sm text-faint">
      {children}
    </p>
  );
}
