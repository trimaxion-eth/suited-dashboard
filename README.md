# suited-dashboard

Internal watch on **Suited**, a no-limit hold'em poker room on Robinhood Chain
(4663) — product-market fit (players, hands, vault) and protocol revenue (poker
rake vs Pons creator/LP fees). Felt-green, lowercase, same type as
[suited.club](https://suited.club/).

Not a player-facing product. This app is the **UI only**: it reads JSON
snapshots produced by the tracker, plus the public suited.club APIs.

## Run

```bash
npm install
npm run dev          # http://127.0.0.1:4177
```

The dev server mounts `/api/snapshot` (Vite middleware), which assembles:

- live `/api/stats`, `/api/staking`, `/api/leaderboard`, `/api/tournaments`
  from `https://suited.club/api/*` (public)
- the newest `snapshots/suited-*.json` and `history.jsonl`
- `rake-daily.json`, `creator-fees-daily.json`, `staking-funded.json`,
  `social.json`

Missing files render as empty panels, so the app boots without any data — it
just has nothing to show.

## Where the data lives

Snapshots are gitignored either way. The app looks for them in `./data` first,
then falls back to `../data`, so the same checkout works in both places:

- **Standalone** (this directory is its own repo): put the files in `./data/`.
- **Inside the tracker repo**: the tracker writes to the repo-root `data/`,
  which this app picks up as `../data`.

| File | Contents |
| --- | --- |
| `snapshots/suited-*.json` | holders / players snapshot, one file per run |
| `history.jsonl` | one JSON object per snapshot, oldest first |
| `rake-daily.json` | daily poker rake (`CheckpointApplied` events), UTC days |
| `creator-fees-daily.json` | daily Pons creator fees (`CreatorFeeClaimer` / `CreatorFeeSplitter`) |
| `staking-funded.json` | staking rewards funded over time |
| `social.json` | X followers + Discord roster/engagement summary |

Rake and creator fees are **separate streams**. The dashboard never presents
them as one unnamed "revenue" number; "ops" is labeled as rake plus the 20%
house leg of the fee split only.
