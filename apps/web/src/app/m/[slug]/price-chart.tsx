"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { trpc } from "~/lib/trpc";

/**
 * Probability over time for the leading outcomes. Categorical identity, so
 * hues are assigned in fixed slot order (never cycled) from the validated
 * --series-N tokens, and every series is legended — identity is never
 * carried by colour alone.
 */
const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];
const MAX_SERIES = 4;

export function PriceChart({ marketId, outcomes }: { marketId: string; outcomes: string[] }) {
  const history = trpc.market.history.useQuery({ marketId }, { refetchInterval: 3000 });
  if (!history.data || history.data.length < 2) return null;

  // Leading outcomes only — beyond four, colour stops being readable.
  const latest = history.data[history.data.length - 1]!.pAfter;
  const shown = outcomes
    .map((o, i) => ({ o, p: latest[i] ?? 0, i }))
    .sort((a, b) => b.p - a.p)
    .slice(0, MAX_SERIES);

  const data = history.data.map((h) => {
    const point: Record<string, number | string> = {
      t: new Date(h.ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    };
    for (const s of shown) point[s.o] = (h.pAfter[s.i] ?? 0) / 10_000;
    return point;
  });

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-3">
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
        {shown.map((s, slot) => (
          <span key={s.o} className="flex items-center gap-1.5 text-xs text-muted">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: SERIES[slot] }}
            />
            {s.o}
          </span>
        ))}
      </div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="t"
              tick={{ fontSize: 10, fill: "var(--faint)" }}
              interval="preserveStartEnd"
              stroke="var(--line)"
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: "var(--faint)" }}
              width={34}
              stroke="var(--line)"
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius)",
                fontSize: 12,
                color: "var(--ink)",
              }}
              formatter={(v: number) => `${v.toFixed(1)}%`}
            />
            {shown.map((s, slot) => (
              <Line
                key={s.o}
                dataKey={s.o}
                stroke={SERIES[slot]}
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
