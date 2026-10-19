# AGENTS.md — working in `suited-dashboard`

Orientation for a coding agent asked to change this repo. `README.md` is the
human onboarding doc and the source of truth for the data contract; read it
first, then this.

This repo was handed to the Suited team. It is a **read-only dashboard**: it
reads chain data and public APIs, renders a page, and owns no money, no
credentials and no writes. Keep it that way.

## Non-negotiables

1. **Never sum rake and creator fees.** They are separate revenue streams. A
   combined figure only ever appears as **protocol ops** = rake + the 20% house
   leg, labelled as such. Breaking this is the one change that would misinform.
2. **Never commit data or tokens.** `data/` and every `.env` are gitignored.
   `.env.example` must keep a placeholder token — never a real one.
3. **Preserve the freshness rule.** Envio wins a stream only when its latest UTC
   day is `>=` the file series' latest day. Do not "simplify" it to
   prefer-Envio; that regresses the chart whenever the local indexer stalls.
4. **Never invent numbers.** If a field is missing, render `—` or an empty panel.
   Placeholders that are not really available stay `0` and are documented as such.
5. **Keep docs self-contained.** Everything needed to run this repo must live in
   this repo. No references to private infrastructure, hosts, or personal paths.

## Map

| Path | Role |
| --- | --- |
| `vite.config.ts` | the only server code: `/api/snapshot` + the Envio read path |
| `src/types.ts` | every payload shape; change here first when data changes |
| `src/render.ts` | panels, tables, copy (returns HTML strings) |
| `src/charts.ts` | SVG line charts, sparklines, week pager |
| `src/format.ts` | money / number / date helpers |
| `src/main.ts` | bootstrap, tabs, refresh |
| `src/style.css` | felt-green theme |
| `indexer/` | Envio HyperIndex; see `indexer/README.md` |

## Commands

```bash
npm install && npm run dev      # UI on :4177 (middleware included)
npm run build                   # tsc --noEmit && vite build — must pass
npm run preview                 # serves dist/ + /api/snapshot on :4177

cd indexer
pnpm install && pnpm dev        # Postgres + Hasura + indexer, GraphQL on :8080
pnpm dev:reset                  # full resync after schema/ABI changes
pnpm codegen                    # regenerate Envio types
```

`tsconfig.json` type-checks **only `src/`**. `vite.config.ts` is transpiled by
Vite, not checked, so verify changes there by actually calling the endpoint.

## Conventions

- Vanilla TypeScript, no framework, no router. `render()` returns an HTML string.
- 2-space indent, double quotes, named exports, `type` imports.
- Any string interpolated into HTML goes through `esc()` (see `render.ts`).
- Styling is plain CSS with the felt-green tokens already in `src/style.css`; match
  the existing lowercase register in user-visible copy.
- USDG is 6 decimals; convert at the edge and expose human units. Days are UTC.
- Keep additive: new snapshot keys and new panels must not break older payloads.

## Data flow

```
indexer/ (Envio -> Hasura :8080)  ---\
data/*.json (any producer)         --->  /api/snapshot  --->  src/ UI
suited.club public API             ---/
```

Per request the middleware: fetches live suited.club data, reads the JSON files,
queries the indexer, picks a winner per revenue stream by freshness, and returns
one object. Full field list: `README.md` → Data contract, and `src/types.ts`.

## Recipes

**Add a panel.** Add the field to `src/types.ts`, read it in `render.ts` with the
`num()`/`nested()` guards already there, render it with the existing `stat()` /
`panel` helpers, and add a row to the README table if it comes from a new source.

**Add a data source.** Prefer extending `snapshot()` in `vite.config.ts`: read it,
attach it to the returned object, and push a label into `sources` so the page can
say where the number came from. Wrap every external call in try/catch — a dead
source must degrade, never 500.

**Change the indexer.** Edit `indexer/config.yaml` or
`indexer/src/handlers/index.ts`, then `pnpm codegen` and `pnpm dev:reset`. Revenue
parity matters: the indexer's daily series must keep matching the on-chain events.

## Verifying a change

1. `npm run build` passes.
2. `npm run dev`, then check all three cases — they are the real regression suite:
   - indexer up + no files → `sources` shows the Envio entries;
   - indexer stale vs fresher files → `sources` shows the file entries;
   - `ENVIO_GRAPHQL=http://127.0.0.1:9/v1/graphql npm run dev` → HTTP 200, empty
     panels, no crash.
3. Revenue numbers unchanged: compare `rake.daily` and `creator_fees.daily` before
   and after. If they moved without a chain reason, the change is wrong.

## Known state and limits

- Rake/creator-fee history can lag whenever the indexer is not running; the
  freshness rule covers it, and `sources` tells you which one you are seeing.
- `live_state.claimable_now` / `owed_to_buyback_usdg` are placeholders (`0`).
- The dev server binds `0.0.0.0` with no auth — do not expose it publicly.
- `live.*` depends on a third-party public API (`suited.club`); its failures
  degrade panels but must not break revenue views.
- The collectors that produced `snapshots/`, `history.jsonl` and `social.json`
  are intentionally absent. Produce those shapes yourself if you want them.
