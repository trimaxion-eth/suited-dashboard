# suited-indexer

An [Envio HyperIndex](https://docs.envio.dev/docs/HyperIndex/overview) for
**Suited's on-chain protocol revenue** on Robinhood Chain (chain ID `4663`).

It turns the room's events into a local **Postgres + Hasura GraphQL API**, so a
dashboard or app can read **daily poker rake** and **daily creator fees**
directly instead of rescanning `eth_getLogs` and bucketing by day in Python.

All amounts are raw **USDG** (6 decimals) — divide by `1e6` for dollars.
Timestamps/block numbers are raw `BigInt` seconds/height.

## Contracts and events

| Contract | Address | Events |
|---|---|---|
| Vault | `0x156473aD685321B310c8F7c88936f49bc79E3C33` | `CheckpointApplied` |
| PonsV2FeeEscrow | `0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e` | `CreditedToken`, `ClaimedToken` |
| CreatorFeeClaimer | `0xeEd5b0Bd71b514Eca311F96cDf5570a5e58419f1` | `Claimed` |
| CreatorFeeSplitter | `0xf893bD8957DB937626224A23d7096890CA4B877b` | `Split`, `Distributed`, `LegsPaid`, `Deferred` |

Data comes from **Envio HyperSync** (`robinhood.hypersync.xyz`); there is no RPC
block in `config.yaml`. `start_block: 0` is safe — HyperSync fast-forwards to the
first matching log.

The escrow and claimer are **shared across every Pons launch** the operator
runs, so both are narrowed at the source (`where` in `src/handlers/index.ts` to
the Suited claimer + USDG, and USDG respectively) — otherwise the escrow stream
is dominated by unrelated launches.

## Entities

Raw row per event:
`Checkpoint`, `FeeCredit`, `FeeClaimIn`, `FeeForward`, `FeeSplit`,
`FeeDistribution` (computed shares), `FeePayout` (actual payouts),
`FeeDeferred`.

UTC-day aggregates (what a dashboard reads):
`DailyRake` — `id = "YYYY-MM-DD"`, `checkpoints`, `playerCount`, `rake`,
`cumulativeRake`.
`DailyCreatorFee` — `id = "YYYY-MM-DD"`, `credited`, `claimedIn`, `forwarded`,
`split`, the five computed legs `toHouse/toJackpot/toStakers/toTournaments/toBuyback`,
the actual payouts `paid*`, `cumulativeCredited`.

Lifetime singleton:
`ProtocolStats` (`id = "protocol"`).

> Zero-activity days are simply absent from the daily tables; the consumer
> should left-join/fill gaps if it wants a continuous calendar.

## Quick start

Prereqs: Docker, Node, pnpm.

```bash
cp .env.example .env      # then set ENVIO_API_TOKEN (get one free at envio.dev)
pnpm install
pnpm codegen
pnpm dev                  # starts Postgres + Hasura + the indexer, then syncs
```

GraphQL endpoint: **http://localhost:8080/v1/graphql** (Hasura console: same host).

Full resync from scratch after a config/schema/ABI change:

```bash
pnpm dev:reset
```

Stop and remove the local stack:

```bash
pnpx envio stop
```

## Running alongside another local Envio project

Envio's local Postgres/Hasura containers are shared, so a second project with a
different `name`/`contracts` is rejected unless you namespace it. Use a
dedicated PG schema and indexer port:

```bash
ENVIO_PG_SCHEMA=suited ENVIO_INDEXER_PORT=9899 pnpm dev
```

Note this **retracks Hasura's tables** to this project — another project's
GraphQL fields disappear from `/v1/graphql` until that project is run again
(its data stays in Postgres).

## Example queries

Headline totals:

```bash
curl -s http://localhost:8080/v1/graphql -H 'content-type: application/json' -d '
  { ProtocolStats_by_pk(id: "protocol") { totalRake totalCheckpoints
      totalCredited totalForwarded totalSplit totalToStakers } }'
```

Daily rake:

```bash
curl -s http://localhost:8080/v1/graphql -H 'content-type: application/json' -d '
  { DailyRake(order_by: {id: asc}) { id checkpoints rake cumulativeRake } }'
```

Daily creator fees + legs:

```bash
curl -s http://localhost:8080/v1/graphql -H 'content-type: application/json' -d '
  { DailyCreatorFee(order_by: {id: asc}) {
      id credited claimedIn forwarded split
      toHouse toJackpot toStakers toTournaments toBuyback } }'
```

A full current-day report is just the two daily tables plus an
`order_by: {id: desc}, limit: 1`.

## Verified parity

Against the Python trackers in `../scripts` (same UTC-day bucketing, full
history through 2026-10-12):

- rake: `35,866` checkpoints / **$17,384.30** — exact
- creator fees: credited = claimed = forwarded = split = **$115,474.34**;
  legs sum to 100% (`23,094.87 / 34,642.30 / 23,094.87 / 23,094.87 / 11,547.43`)
  — exact

`LegsPaid` is indexed separately from `Distributed` because `Distributed` is the
shares **computed** for a call, while `LegsPaid` is what **actually left** (a
paused/frozen leg defers its share to `Deferred`).

## Layout

```
config.yaml            chains, contracts, events, field_selection
schema.graphql         entity types (the GraphQL API shape)
src/handlers/index.ts  event -> entity logic (day bucketing, aggregates)
abis/*.json            contract ABIs (copied from ../contracts/sources)
.env.example           your own Envio token + optional overrides
```
