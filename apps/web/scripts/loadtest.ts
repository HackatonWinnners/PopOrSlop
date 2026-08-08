import "dotenv/config";

/**
 * Room-scale load test (spec §12.5 D6): N users, sustained trade rate,
 * 80% of flow concentrated on one market — worst case for the per-market
 * advisory lock. HTTP-level against a running server.
 *
 * Usage: pnpm tsx scripts/loadtest.ts [baseUrl] [users] [seconds] [rate]
 * Pass criteria (checked here + check-invariants after):
 *   - zero unexpected errors (guard rejections are fine)
 *   - p95 trade latency < 300ms target (report only)
 */
const BASE = process.argv[2] ?? "http://localhost:3000";
const USERS = Number(process.argv[3] ?? 150);
const SECONDS = Number(process.argv[4] ?? 60);
const RATE = Number(process.argv[5] ?? 30); // trades/second target

interface Client {
  handle: string;
  cookie: string;
}

async function signup(i: number): Promise<Client | null> {
  const handle = `load_${Date.now().toString(36)}_${i}`;
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ handle, team: `LoadTeam${i % 10}` }),
  });
  if (!res.ok) return null;
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("pos_session="));
  return cookie ? { handle, cookie: cookie.split(";")[0]! } : null;
}

async function markets(): Promise<{ id: string; status: string; outcomes: string[]; bPoints: number }[]> {
  const url = `${BASE}/api/trpc/market.list?input=${encodeURIComponent(JSON.stringify({ json: null, meta: { values: ["undefined"] } }))}`;
  const res = await fetch(url);
  const body = (await res.json()) as { result: { data: { json: never } } };
  return body.result.data.json;
}

async function main() {
  console.log(`signing up ${USERS} users…`);
  const clients: Client[] = [];
  for (let batch = 0; batch < USERS; batch += 20) {
    const created = await Promise.all(
      Array.from({ length: Math.min(20, USERS - batch) }, (_, j) => signup(batch + j)),
    );
    clients.push(...created.filter((c): c is Client => c !== null));
    // Signup route rate-limits per IP at 10/min — pause between batches only
    // when hitting localhost limits. For load testing we bypass by patience:
    await new Promise((r) => setTimeout(r, 50));
  }
  console.log(`have ${clients.length} clients`);
  if (clients.length < USERS * 0.5) {
    console.warn("many signups rejected (IP rate limit) — raise the limit for load runs");
  }

  const open = (await markets()).filter((m) => m.status === "OPEN");
  if (open.length === 0) throw new Error("no OPEN markets — seed first");
  const flagship = open.sort((a, b) => b.bPoints - a.bPoints)[0]!;
  const others = open.filter((m) => m.id !== flagship.id);
  console.log(`flagship (80% of flow): ${flagship.id}, ${open.length} open markets total`);

  const latencies: number[] = [];
  let ok = 0;
  let guardRejected = 0;
  let failed = 0;
  const failures = new Map<string, number>();

  async function oneTrade() {
    const client = clients[Math.floor(Math.random() * clients.length)]!;
    const market = Math.random() < 0.8 || others.length === 0 ? flagship : others[Math.floor(Math.random() * others.length)]!;
    const outcomeIdx = Math.floor(Math.random() * market.outcomes.length);
    const budget = String((1 + Math.floor(Math.random() * 10)) * 1_000_000);
    const start = performance.now();
    try {
      const res = await fetch(`${BASE}/api/trpc/trade.execute`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: client.cookie },
        body: JSON.stringify({ json: { marketId: market.id, outcomeIdx, budget, maxCost: budget } }),
      });
      latencies.push(performance.now() - start);
      if (res.ok) {
        ok++;
      } else {
        const body = (await res.json().catch(() => null)) as
          | { error?: { json?: { message?: string } } }
          | null;
        const msg = body?.error?.json?.message ?? `HTTP ${res.status}`;
        if (/INSUFFICIENT_BALANCE|POSITION_CAP|PRICE_MOVED|CANNOT_SHORT|trade size is zero/.test(msg)) {
          guardRejected++;
        } else {
          failed++;
          failures.set(msg, (failures.get(msg) ?? 0) + 1);
        }
      }
    } catch (e) {
      latencies.push(performance.now() - start);
      failed++;
      const msg = (e as Error).message;
      failures.set(msg, (failures.get(msg) ?? 0) + 1);
    }
  }

  console.log(`firing ~${RATE} trades/s for ${SECONDS}s…`);
  const started = Date.now();
  const inflight = new Set<Promise<void>>();
  let launched = 0;
  while (Date.now() - started < SECONDS * 1000) {
    const shouldHaveLaunched = ((Date.now() - started) / 1000) * RATE;
    while (launched < shouldHaveLaunched) {
      const p = oneTrade().finally(() => inflight.delete(p));
      inflight.add(p);
      launched++;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  await Promise.all(inflight);

  latencies.sort((a, b) => a - b);
  const pct = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))]?.toFixed(0);
  console.log(`
results:
  trades ok:        ${ok}
  guard rejections: ${guardRejected} (expected: balance/cap exhaustion)
  FAILED:           ${failed}${failed ? ` ← ${[...failures].map(([m, n]) => `${n}× ${m}`).join("; ")}` : ""}
  throughput:       ${(ok / SECONDS).toFixed(1)} trades/s sustained
  latency ms:       p50 ${pct(50)}  p95 ${pct(95)}  p99 ${pct(99)}  max ${latencies[latencies.length - 1]?.toFixed(0)}
`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
