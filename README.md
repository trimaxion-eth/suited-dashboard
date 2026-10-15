# suited-dashboard

Internal watch on **Suited** — product-market fit (players, hands, vault) and
protocol revenue (poker rake vs Pons creator/LP fees). Felt-green, lowercase,
same type as [suited.club](https://suited.club/).

Not a player-facing product. Reads the parent tracker’s JSON plus the public
suited.club APIs.

```bash
cd suited-dashboard
npm install
npm run dev          # http://127.0.0.1:4177
```

`/api/snapshot` (Vite middleware) assembles:

- live `/api/stats`, `/api/staking`, `/api/leaderboard`, `/api/tournaments`
- latest `data/snapshots/suited-*.json` and `data/history.jsonl`
- `data/rake-daily.json`, `data/creator-fees-daily.json`, `data/staking-funded.json`

Refresh the ledger from the repo root before expecting new days:

```bash
python3 scripts/suited_dashboard_up.py     # Envio bridge + trackers + serve :4177
# revenue alone, straight from the local Envio indexer (no RPC scan):
python3 scripts/suited_indexer_daily.py
# chain-scan fallback when the indexer is down:
python3 scripts/suited_rake.py
python3 scripts/suited_creator_fees.py
python3 scripts/suited_track.py
```

`data/rake-daily.json` and `data/creator-fees-daily.json` are written by
`suited_indexer_daily.py` from the `suited-indexer/` Envio GraphQL tables
(`DailyRake` / `DailyCreatorFee`); `suited_dashboard_up.py` uses it first and
falls back to the python chain scanners only if Hasura is unreachable.

Rake and creator fees are **separate streams**. The dashboard never presents
them as one unnamed “revenue” number; “ops” is labeled as rake + the 20% house
leg of the fee split only.
