# suited-dashboard

Internal watch on **Suited**, a no-limit hold'em poker room on Robinhood Chain
(4663) — product-market fit (players, hands, vault) and protocol revenue (poker
rake vs Pons creator/LP fees). Felt-green, lowercase, same type as
[suited.club](https://suited.club/).

Not a player-facing product. This repo is the **UI plus the indexer that feeds
it**: `indexer/` is an Envio HyperIndex that reconstructs both USDG revenue
streams from HyperSync and serves them over Hasura GraphQL.

```
indexer/            Envio HyperIndex -> Hasura GraphQL on :8080   (rake + creator fees)
src/                the dashboard UI
vite.config.ts      /api/snapshot: merges indexer + data/*.json + suited.club
```

## Run

```bash
npm install
npm run dev          # http://127.0.0.1:4177
```

## Data sources

The daily rake / creator-fee series have two possible origins; the dashboard
picks per stream and reports the choice in the ledger note.

### 1. The bundled Envio indexer (live, no chain scan)

```bash
cd indexer
cp .env.example .env     # then set ENVIO_API_TOKEN (free at envio.dev)
pnpm install
pnpm dev                 # Postgres + Hasura + indexer; GraphQL on :8080
```

Prereqs: Docker + pnpm. Then `npm run dev` here and the middleware reads
`DailyRake` / `DailyCreatorFee` straight from HyperSync. Point the dashboard at
another endpoint with `ENVIO_GRAPHQL` (default `http://localhost:8080/v1/graphql`).

### 2. Snapshot JSON on disk

Snapshots are gitignored. The app looks in `./data` first, then `../data` (which
is where the parent tracker repo keeps them), so the same checkout works in both
places.

| File | Contents |
| --- | --- |
| `rake-daily.json` | daily poker rake (`CheckpointApplied` events), UTC days |
| `creator-fees-daily.json` | daily Pons creator fees (`CreatorFeeClaimer` / `CreatorFeeSplitter`) |
| `staking-funded.json` | staking rewards funded over time |
| `snapshots/suited-*.json` | holders / players snapshot, one file per run |
| `history.jsonl` | one JSON object per snapshot, oldest first |
| `social.json` | X followers + Discord roster/engagement summary |

### Which one wins

Both are computed, then compared per stream: **Envio is used only when its
latest UTC day is at least as recent as the series on disk.** A stalled local
indexer understates its newest day, so the files stay authoritative in that
case. If the endpoint is unreachable the files are used silently. The chosen
sources appear under the daily ledger as `envio:DailyRake` /
`data/rake-daily.json` and friends.

Missing everything renders as empty panels — the app boots without data.

Rake and creator fees are **separate streams**. The dashboard never presents
them as one unnamed "revenue" number; "ops" is labeled as rake plus the 20%
house leg of the fee split only.
