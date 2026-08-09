"use client";

import { useEffect, useState } from "react";

export type Theme = "broadsheet" | "terminal";

/** Reads/writes the same key the pre-paint bootstrap script in layout.tsx uses. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("broadsheet");

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (current === "terminal" || current === "broadsheet") setTheme(current);
  }, []);

  const swap = () => {
    const next: Theme = theme === "terminal" ? "broadsheet" : "terminal";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("pos-theme", next);
    } catch {
      /* private mode — theme just won't persist */
    }
    setTheme(next);
  };

  return (
    <button
      onClick={swap}
      title={theme === "terminal" ? "Switch to broadsheet" : "Switch to terminal"}
      aria-label="Toggle theme"
      className="label rounded-[var(--radius-control)] border border-line px-2 py-1 hover:border-line-strong hover:text-ink"
    >
      {theme === "terminal" ? "TERM" : "PAPER"}
    </button>
  );
}
