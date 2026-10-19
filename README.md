# suited-dashboard

A read-only internal watch on **Suited** — a no-limit hold'em poker room on
Robinhood Chain (4663). It shows two things:

- **product-market fit** — players, hands, chips in the vault, holders, staking
- **protocol revenue** — poker rake and Pons creator/LP fees, as separate streams

Felt-green, lowercase, same type as [suited.club](https://suited.club/).

**This repo is a handover.** It was built as a personal watch and is documented
here so the Suited team can run it, understand every number on it, and fold the
pieces into an existing dashboard. There is no framework and no build magic:
one middleware file, a handful of TypeScript modules, and an Envio indexer.

Not player-facing. Not authenticated. Not a source of truth for money — read the
contracts for that.

---

## Architecture

Three independent inputs, merged per request into one JSON snapshot:

```
                     HyperSync (Robinhood Chain 4663)
                              |
                     indexer/ (Envio HyperIndex)          data/*.json
                              |                            (any producer)
                     Hasura GraphQL  :8080                       |
                              |                                  |
                              +---------------+------------------+
                                              |
                            vite.config.ts  GET /api/snapshot
                              (+ suited.club public API)
                                              |
                            src/ (vanilla TS, no framework)
```

- **`indexer/`** — an [Envio HyperIndex](https://docs.envio.dev/docs/HyperIndex/overview)
  that reconstructs both USDG revenue series from HyperSync and serves them over
  GraphQL. Its own README covers entities, events and parity checks.
- **`vite.config.ts`** — dev-server middleware that assembles `/api/snapshot`
  from the indexer, the JSON files, and the public `suited.club` API.
- **`src/`** — the UI. Plain TypeScript returning HTML strings; no React, no router.

Each input is optional. Missing data renders as an empty panel rather than an error.

---

## Quick start

Requires Node 20.19+ or 22.12+ (Vite 7).

### Path A — UI only, with your own data

```bash
npm install
npm run dev          # http://127.0.0.1:4177
```

Drop JSON into `./data/` (see [Data contract](#data-contract)) and the panels fill
in. Nothing else is needed. The UI boots with no data at all.

### Path B — the full stack, including the indexer

```bash
cd indexer
cp .env.example .env     # then set ENVIO_API_TOKEN — free at https://envio.dev
pnpm install
pnpm dev                 # Postgres + Hasura + indexer; GraphQL on :8080
```

Leave that running, then in a second terminal:

```bash
npm install && npm run dev      # http://127.0.0.1:4177
```

`indexer/` needs Docker and pnpm. First sync takes a few minutes; after that it
follows the chain head. See `indexer/README.md` for `dev:reset`, schema queries,
and how to run it beside another local Envio project.

### Production build

```bash
npm run build        # tsc --noEmit && vite build  ->  dist/
npm run preview      # serves dist/ + /api/snapshot on :4177
```

> **Static hosting gotcha.** `/api/snapshot` is a *dev/preview middleware*, not a
> module in the bundle. A plain `dist/` served by nginx/S3 has no snapshot
> endpoint and the page will show its error state. Either run `npm run preview`
> behind your proxy, port the middleware in `vite.config.ts` into your server, or
> pre-generate a `snapshot.json` at build time and point the client at it.

---

## Configuration

| Variable | Default | Used by | Meaning |
| --- | --- | --- | --- |
| `ENVIO_GRAPHQL` | `http://localhost:8080/v1/graphql` | middleware | Hasura endpoint for the Envio source |
| `ENVIO_API_TOKEN` | — | `indexer/` | Envio HyperSync token; bring your own |
| `PORT` | `4177` | vite | dev/preview port |
| — | `8080` | Hasura | GraphQL + console |
| — | `5432` | Postgres | indexer storage (Docker) |

The dev server binds `0.0.0.0`. It has no auth and proxies suited.club and your
indexer, so do not expose it to the public internet as-is.

---

## HTTP contract

One endpoint, no parameters, no auth:

```bash
curl -s http://127.0.0.1:4177/api/snapshot | jq '{sources, rake: .rake.total_rake_usdg}'
```

Response headers include `Cache-Control: no-store`. There are no CORS headers —
same-origin fetches only, so a cross-origin embed needs a proxy.

| Top-level key | Type | Source |
| --- | --- | --- |
| `generated_at` | ISO string | request time |
| `sources` | `string[]` | which origin each revenue stream used (see below) |
| `live` | object | `suited.club` public API: `stats`, `staking`, `leaderboard`, `tournaments` |
| `track` | object \| null | newest `data/snapshots/suited-*.json` |
| `history` | array | `data/history.jsonl` |
| `rake` | object \| null | Envio `DailyRake` or `data/rake-daily.json` |
| `creator_fees` | object \| null | Envio `DailyCreatorFee` or `data/creator-fees-daily.json` |
| `staking_funded` | object \| null | `data/staking-funded.json` |
| `social` | object \| null | `data/social.json` |

`sources` is the honest record of what you are looking at, e.g.
`["envio:DailyRake", "data/creator-fees-daily.json"]`. It is rendered under the
daily ledger. The TypeScript shapes live in `src/types.ts`.

---

## Data contract

Everything is gitignored; the app reads it, it never writes it. The middleware
looks in `./data/` first, then `../data/` — so this repo works standalone *and*
when it sits inside a parent tracker repo.

| File | Shape |
| --- | --- |
| `rake-daily.json` | `{ generated_at, total_rake_usdg, head_block, prelaunch: { rake_usdg, checkpoints, note }, source, daily: [{ date, checkpoints, rake_usdg, cumulative_usdg }] }` |
| `creator-fees-daily.json` | `{ generated_at, head_block, totals: { credited, claimed_in, forwarded, split, house, jackpot, stakers, tournaments, buyback }, live_state: { max_split_usdg, … }, source, daily: [{ date, credited, claimed_in, forwarded, split, house, jackpot, stakers, tournaments, buyback, cumulative_credited_usdg }] }` |
| `staking-funded.json` | `{ generated_at, total_added_usdg, daily: [{ date, added_usdg }] }` |
| `snapshots/suited-*.json` | newest file wins (sorted by name); keys read: `poker` (`players_total`, `seated`, `hands_dealt`, `hands_this_week`, `live_tables`, `tables`, `in_play_usd`, `jackpot_usd`, `custodied_usd`), `staking` (`total_staked`, `apr_current_base`), `holders.count`, `dex` (`price`, `fdv`), `leaderboard.week_players`, `discord`, `tournament` |
| `history.jsonl` | one object per line: `{ at, price, fdv, liq, holders, staked, burnt, hands, players, seated, in_play, vault, discord_members }` |
| `social.json` | X followers/engaged accounts + Discord roster/engagement; full type in `src/types.ts` |

Every field is optional. Anything the UI cannot find renders as `—` or an empty
panel; nothing throws.

`snapshots/`, `history.jsonl` and `social.json` came from a private tracker in
the original setup. You can produce equivalent JSON from your own pipeline — the
UI only depends on the shapes above, not on who wrote them.

---

## Metrics, defined

- **rake** — the poker room's cut. `Vault.CheckpointApplied(uint256 seq, uint256
  playerCount, uint256 rake)` events, bucketed by UTC day.
- **creator fees** — the Pons creator tax on SUITED trading volume. Escrow →
  claimer → splitter. Named the "tape" in the UI.
- **The two are never summed into one "revenue" number.** Where a combined figure
  appears it is labelled **protocol ops** = rake + the 20% house leg only.
- **split legs** — the splitter distributes each split 20/30/20/20/10 to
  house / jackpot / stakers / tournaments / buyback.
- **prelaunch** — rake from the vault beta before the token/poker launch
  (2026-09-29 22:48:39 UTC). Shown separately, never folded into the main total.
- **USDG** has 6 decimals. All dollar fields are already human units; raw
  contract integers are not exposed.
- Days run continuously from the first to the last event; zero-activity days are
  present with `0`, so charts have no holes.
- **run-rate** figures are the mean of the last 3 *complete* UTC days, excluding
  today.

### Which source wins

Both origins are computed, then compared **per stream**: the Envio series is used
only when its latest UTC day is **at least as recent as** the series on disk.
Otherwise the files win. A stalled local indexer understates its newest day, and
this rule keeps that from silently corrupting the chart. If the endpoint is
unreachable, files are used and the page still loads.

---

## Reference values

| | |
| --- | --- |
| Chain | Robinhood Chain, id `4663` |
| Vault | `0x156473aD685321B310c8F7c88936f49bc79E3C33` (deploy block `59,727,258`) |
| Token / poker launch | 2026-09-29 22:48:39 UTC |
| Creator fee escrow | `0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e` |
| Claimer | `0xeEd5b0Bd71b514Eca311F96cDf5570a5e58419f1` |
| Splitter | `0xf893bD8957DB937626224A23d7096890CA4B877b` |
| Collector | `0x6dD5a948E4E48446DcfaF4ec0aA6D78ac0FFe678` |
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` |
| Splitter per-day cap (`max_split_usdg`) | 50,000 |

`indexer/config.yaml` and `indexer/schema.graphql` are the machine-readable
version of the chain side.

---

## Putting it into your own dashboard

Three levels, cheapest first:

1. **Consume the JSON contract.** Have your pipeline emit the shapes in
   [Data contract](#data-contract) and build your own views. You never have to
   run this repo.
2. **Consume `/api/snapshot`.** Run `npm run dev`/`preview` (or port the
   middleware into your server) and fetch one URL. Fields are additive —
   ignore what you don't use.
3. **Reuse the parts.** `indexer/` is a self-contained Envio project; the
   revenue builders in `vite.config.ts` and the presentational modules in
   `src/render.ts` / `src/charts.ts` are plain functions with no framework
   coupling, so they lift cleanly into a React/Next app.

---

## Gotchas

- A static `dist/` has **no** `/api/snapshot` — see the production note above.
- No CORS headers; same-origin only.
- Zero-activity days are filled with `0`, so a flat run is a real quiet day, not
  missing data.
- Envio is only preferred when it is not stale. If the revenue chart looks frozen,
  check `sources` in the snapshot before blaming the UI.
- `live_state.claimable_now` and `owed_to_buyback_usdg` are placeholders (`0`)
  in the Envio payload — they would need a contract call, and the UI only reads
  `max_split_usdg`.
- `live.*` comes from `suited.club`, a third party to this repo. If it 404s or
  changes shape, those panels degrade but the revenue panels keep working.
- The indexer's first sync is slow (full history from HyperSync). Later starts
  are incremental.

---

## Layout

```
README.md              this file
AGENTS.md              orientation for coding agents working in this repo
index.html             shell; loads src/main.ts
vite.config.ts         /api/snapshot middleware + Envio read path
src/types.ts           every payload shape, in one place
src/render.ts          panels + tables (HTML strings)
src/charts.ts          SVG line charts, sparklines, week pager
src/format.ts          money/number/date formatting
src/main.ts            bootstrap, tabs, refresh wiring
src/style.css          felt-green theme
indexer/               Envio HyperIndex (own README)
data/                  your snapshots — gitignored, never committed
```

---

## What is deliberately not here

The private tracker that produced `snapshots/`, `history.jsonl` and `social.json`
(X follower counts, Discord roster and engagement) is **not** part of this repo.
Only the shapes are documented, on purpose: those collectors use personal
sessions and are not safe to hand over or run at scale. If you want that data,
point your own pipeline at the same JSON shapes.

## License & ownership

Code for the Suited team. `indexer/` declares MIT in its `package.json`; there is
no top-level licence file.
