import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(root, "../data");
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

async function snapshot() {
  const liveData = await live();
  return {
    generated_at: new Date().toISOString(),
    live: liveData,
    track: latestSnapshot(),
    history: history(),
    rake: readJson("rake-daily.json"),
    creator_fees: readJson("creator-fees-daily.json"),
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
    configurePreviewServer(server) {
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
