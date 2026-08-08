"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { trpc } from "~/lib/trpc";

const COLORS = ["#34d399", "#f87171", "#60a5fa", "#fbbf24", "#c084fc", "#f472b6", "#4ade80", "#fb923c"];

export function PriceChart({ marketId, outcomes }: { marketId: string; outcomes: string[] }) {
  const history = trpc.market.history.useQuery({ marketId }, { refetchInterval: 3000 });
  if (!history.data || history.data.length < 2) return null;

  const data = history.data.map((h) => {
    const point: Record<string, number | string> = {
      t: new Date(h.ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    };
    outcomes.forEach((o, i) => {
      point[o] = (h.pAfter[i] ?? 0) / 10_000;
    });
    return point;
  });

  // Show at most 4 series to keep the chart legible on mobile.
  const latest = history.data[history.data.length - 1]!.pAfter;
  const shown = outcomes
    .map((o, i) => ({ o, p: latest[i] ?? 0, i }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 4);

  return (
    <div className="h-44 w-full rounded border border-zinc-800 bg-zinc-900/50 p-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#71717a" }} interval="preserveStartEnd" />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "#71717a" }}
            width={32}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }}
            formatter={(v: number) => `${v.toFixed(1)}%`}
          />
          {shown.map(({ o, i }) => (
            <Line
              key={o}
              dataKey={o}
              stroke={COLORS[i % COLORS.length]}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
