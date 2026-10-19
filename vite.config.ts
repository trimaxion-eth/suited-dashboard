import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
// Snapshots live in ./data when this app is checked out on its own, and in
// ../data when it sits inside the parent tracker repo. Prefer the local one.
const localData = path.resolve(root, "data");
const dataDir = fs.existsSync(localData) ? localData : path.resolve(root, "../data");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0 Safari/537.36";

function readJson(name: string): unknown {
  const p = path.join(dataDir, name);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function latestSnapshot(): unknown {
  const dir = path.join(dataDir, "snapshots");
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("suited-") && f.endsWith(".json"))
    .sort();
  if (!files.length) return null;
  return JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8"));
}

function history(): unknown[] {
  const p = path.join(dataDir, "history.jsonl");
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function club(pathName: string): Promise<unknown> {
  const r = await fetch(`https://suited.club/api/${pathName}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`${pathName} ${r.status}`);
  return r.json();
}

async function live(): Promise<Record<string, unknown>> {
  const settled = await Promise.allSettled([
    club("stats"),
    club("staking"),
    club("leaderboard?period=week&minHands=5"),
    club("tournaments"),
  ]);
  const pick = (i: number) =>
    settled[i].status === "fulfilled" ? settled[i].value : { error: String((settled[i] as PromiseRejectedResult).reason) };
  return {
    stats: pick(0),
    staking: pick(1),
    leaderboard: pick(2),
    tournaments: pick(3),
  };
}

/* ---------------------------------------------------------------------------
 * Envio source (optional)
 *
 * `indexer/` is an Envio HyperIndex that reconstructs both USDG revenue streams
 * from HyperSync and serves them over Hasura GraphQL. When it is running the
 * daily rake / creator-fee series come from there instead of data/*.json.
 *
 * Point somewhere else with ENVIO_GRAPHQL. The files always stay the fallback:
 * a stalled local indexer understates its newest day, so Envio only wins when
 * its latest day is at least as recent as the series on disk.
 * ------------------------------------------------------------------------- */

const ENVIO_GRAPHQL = process.env.ENVIO_GRAPHQL ?? "http://localhost:8080/v1/graphql";
const USDG_DECIMALS = 6;
const MAX_SPLIT_USDG = 50_000;
// Vault beta start -> token/poker launch (Pons V2 fair launch, Sep 29 2026 22:48:39 UTC).
const LAUNCH_TS = Math.floor(Date.UTC(2026, 8, 29, 22, 48, 39) / 1000);

const usd = (raw: unknown): number =>
  Math.round((Number(raw ?? 0) / 10 ** USDG_DECIMALS) * 100) / 100;

const iso = (d: Date): string => d.toISOString().slice(0, 19) + "Z";

function dayRange(first: string, last: string): string[] {
  const days: string[] = [];
  const d = new Date(`${first}T00:00:00Z`);
  const end = new Date(`${last}T00:00:00Z`);
  while (d <= end) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

type EnvioData = {
  ProtocolStats_by_pk: Record<string, unknown> | null;
  rake: { id: string; checkpoints: unknown; rake: unknown }[];
  fees: {
    id: string;
    credited: unknown;
    claimedIn: unknown;
    forwarded: unknown;
    split: unknown;
    toHouse: unknown;
    toJackpot: unknown;
    toStakers: unknown;
    toTournaments: unknown;
    toBuyback: unknown;
  }[];
  prelaunch: { rake: unknown }[];
};

async function envio<T>(query: string): Promise<T> {
  const res = await fetch(ENVIO_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`envio ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: unknown };
  if (body.errors) throw new Error(`envio: ${JSON.stringify(body.errors).slice(0, 200)}`);
  if (!body.data) throw new Error("envio: empty response");
  return body.data;
}

async function envioDaily(): Promise<{ rake: unknown; creator_fees: unknown }> {
  const data = await envio<EnvioData>(`{
    ProtocolStats_by_pk(id: "protocol") {
      totalRake totalCheckpoints lastUpdatedBlock
      totalCredited totalClaimedIn totalForwarded totalSplit
      totalToHouse totalToJackpot totalToStakers totalToTournaments totalToBuyback
    }
    rake: DailyRake(order_by: {id: asc}) { id checkpoints rake }
    fees: DailyCreatorFee(order_by: {id: asc}) {
      id credited claimedIn forwarded split toHouse toJackpot toStakers toTournaments toBuyback
    }
    prelaunch: Checkpoint(where: {timestamp: {_lt: ${LAUNCH_TS}}}) { rake }
  }`);

  const stats = data.ProtocolStats_by_pk ?? {};
  const generatedAt = iso(new Date());

  const rakeRows = data.rake ?? [];
  const rakeByDay = new Map(rakeRows.map((r) => [r.id, r]));
  const rakeDaily: {
    date: string;
    checkpoints: number;
    rake_usdg: number;
    cumulative_usdg: number;
  }[] = [];
  let cum = 0;
  if (rakeRows.length) {
    for (const day of dayRange(rakeRows[0].id, rakeRows[rakeRows.length - 1].id)) {
      const r = rakeByDay.get(day);
      const raw = Number(r?.rake ?? 0);
      cum += raw;
      rakeDaily.push({
        date: day,
        checkpoints: Number(r?.checkpoints ?? 0),
        rake_usdg: usd(raw),
        cumulative_usdg: usd(cum),
      });
    }
  }
  const preRows = data.prelaunch ?? [];

  const feeRows = data.fees ?? [];
  const feeByDay = new Map(feeRows.map((r) => [r.id, r]));
  const feeDaily: Record<string, unknown>[] = [];
  let feeCum = 0;
  if (feeRows.length) {
    for (const day of dayRange(feeRows[0].id, feeRows[feeRows.length - 1].id)) {
      const r = feeByDay.get(day);
      feeCum += Number(r?.credited ?? 0);
      feeDaily.push({
        date: day,
        credited: usd(r?.credited),
        claimed_in: usd(r?.claimedIn),
        forwarded: usd(r?.forwarded),
        split: usd(r?.split),
        house: usd(r?.toHouse),
        jackpot: usd(r?.toJackpot),
        stakers: usd(r?.toStakers),
        tournaments: usd(r?.toTournaments),
        buyback: usd(r?.toBuyback),
        cumulative_credited_usdg: usd(feeCum),
      });
    }
  }

  const totals = {
    credited: usd(stats.totalCredited),
    claimed_in: usd(stats.totalClaimedIn),
    forwarded: usd(stats.totalForwarded),
    split: usd(stats.totalSplit),
    house: usd(stats.totalToHouse),
    jackpot: usd(stats.totalToJackpot),
    stakers: usd(stats.totalToStakers),
    tournaments: usd(stats.totalToTournaments),
    buyback: usd(stats.totalToBuyback),
  };

  return {
    rake: {
      generated_at: generatedAt,
      total_checkpoints: Number(stats.totalCheckpoints ?? 0),
      head_block: Number(stats.lastUpdatedBlock ?? 0),
      total_rake_usdg: usd(stats.totalRake),
      launch_ts: new Date(LAUNCH_TS * 1000).toISOString(),
      prelaunch: {
        checkpoints: preRows.length,
        rake_usdg: usd(preRows.reduce((a, r) => a + Number(r.rake ?? 0), 0)),
        note: "vault beta before the token/poker launch (2026-09-29 22:48 UTC)",
      },
      source: "envio:DailyRake",
      daily: rakeDaily,
    },
    creator_fees: {
      generated_at: generatedAt,
      head_block: Number(stats.lastUpdatedBlock ?? 0),
      totals,
      live_state: {
        max_split_usdg: MAX_SPLIT_USDG,
        total_to_house_usdg: totals.house,
        total_to_jackpot_usdg: totals.jackpot,
        total_to_stakers_usdg: totals.stakers,
        total_to_tournaments_usdg: totals.tournaments,
        total_to_buyback_usdg: totals.buyback,
      },
      source: "envio:DailyCreatorFee",
      daily: feeDaily,
    },
  };
}

function lastDay(payload: unknown): string {
  const daily = (payload as { daily?: { date: string }[] } | null)?.daily;
  return daily?.length ? daily[daily.length - 1].date : "";
}

/** Envio wins only if it is at least as recent as what is on disk. */
function atLeastAsFresh(envioPayload: unknown, filePayload: unknown): boolean {
  const a = lastDay(envioPayload);
  return Boolean(a) && a >= lastDay(filePayload);
}

async function snapshot() {
  const liveData = await live();

  const fileRake = readJson("rake-daily.json");
  const fileFees = readJson("creator-fees-daily.json");
  let rake = fileRake;
  let creatorFees = fileFees;
  const sources: string[] = [];

  try {
    const e = await envioDaily();
    if (atLeastAsFresh(e.rake, fileRake)) {
      rake = e.rake;
      sources.push("envio:DailyRake");
    } else {
      sources.push("data/rake-daily.json");
    }
    if (atLeastAsFresh(e.creator_fees, fileFees)) {
      creatorFees = e.creator_fees;
      sources.push("envio:DailyCreatorFee");
    } else {
      sources.push("data/creator-fees-daily.json");
    }
  } catch {
    sources.push("data/rake-daily.json", "data/creator-fees-daily.json");
  }

  return {
    generated_at: new Date().toISOString(),
    sources,
    live: liveData,
    track: latestSnapshot(),
    history: history(),
    rake,
    creator_fees: creatorFees,
    staking_funded: readJson("staking-funded.json"),
    social: readJson("social.json"),
  };
}

function sendJson(res: ServerResponse, body: unknown) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function snapshotPlugin(): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url?.split("?")[0] ?? "";
    if (url !== "/api/snapshot") {
      next();
      return;
    }
    try {
      sendJson(res, await snapshot());
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(err) }));
    }
  };

  return {
    name: "suited-snapshot",
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        void handle(req, res, next);
      });
    },
    configurePreviewServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        void handle(req, res, next);
      });
    },
  };
}

export default defineConfig({
  plugins: [snapshotPlugin()],
  server: { port: 4177, host: "0.0.0.0" },
});
