import { indexer } from "envio";

// ── constants ────────────────────────────────────────────────────────────────

const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const CLAIMER = "0xeed5b0bd71b514eca311f96cdf5570a5e58419f1";
const STATS_ID = "protocol";

// UTC calendar day from a unix-seconds timestamp, e.g. "2026-10-12".
function dayId(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function emptyStats() {
  return {
    id: STATS_ID,
    totalRake: 0n,
    totalCheckpoints: 0n,
    lastCheckpointSeq: 0n,
    totalCredited: 0n,
    totalClaimedIn: 0n,
    totalForwarded: 0n,
    totalSplit: 0n,
    totalToHouse: 0n,
    totalToJackpot: 0n,
    totalToStakers: 0n,
    totalToTournaments: 0n,
    totalToBuyback: 0n,
    totalPaidHouse: 0n,
    totalPaidJackpot: 0n,
    totalPaidTournaments: 0n,
    totalPaidBuyback: 0n,
    lastUpdatedBlock: 0n,
    lastUpdatedTimestamp: 0n,
  };
}

function emptyFeeDay(id: string) {
  return {
    id,
    date: id,
    credited: 0n,
    claimedIn: 0n,
    forwarded: 0n,
    split: 0n,
    toHouse: 0n,
    toJackpot: 0n,
    toStakers: 0n,
    toTournaments: 0n,
    toBuyback: 0n,
    paidHouse: 0n,
    paidJackpot: 0n,
    paidTournaments: 0n,
    paidBuyback: 0n,
    cumulativeCredited: 0n,
  };
}

// Read-or-default the singleton. Reads only — safe in the preload pass.
async function readStats(context: any) {
  const existing = await context.ProtocolStats.get(STATS_ID);
  return existing ?? emptyStats();
}

function touch(stats: any, block: number, ts: number) {
  stats.lastUpdatedBlock = BigInt(block);
  stats.lastUpdatedTimestamp = BigInt(ts);
}

// ── 1. poker rake ────────────────────────────────────────────────────────────

indexer.onEvent(
  { contract: "Vault", event: "CheckpointApplied" },
  async ({ event, context }) => {
    const ts = event.block.timestamp;
    const block = event.block.number;
    const id = dayId(ts);

    const stats = await readStats(context);
    const day = await context.DailyRake.getOrCreate({
      id,
      date: id,
      checkpoints: 0n,
      playerCount: 0n,
      rake: 0n,
      cumulativeRake: 0n,
      firstBlock: BigInt(block),
      lastBlock: BigInt(block),
    });

    if (context.isPreload) return;

    context.Checkpoint.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      seq: event.params.seq,
      playerCount: event.params.playerCount,
      rake: event.params.rake,
      blockNumber: BigInt(block),
      timestamp: BigInt(ts),
      transactionHash: event.transaction.hash,
    });

    stats.totalRake += event.params.rake;
    stats.totalCheckpoints += 1n;
    stats.lastCheckpointSeq = event.params.seq;
    touch(stats, block, ts);
    context.ProtocolStats.set(stats);

    context.DailyRake.set({
      ...day,
      checkpoints: day.checkpoints + 1n,
      playerCount: day.playerCount + event.params.playerCount,
      rake: day.rake + event.params.rake,
      cumulativeRake: stats.totalRake,
      lastBlock: BigInt(block) > day.lastBlock ? BigInt(block) : day.lastBlock,
    });
  }
);

// ── 2. pons creator fees ─────────────────────────────────────────────────────

// PonsV2FeeEscrow.CreditedToken — gross fee generated (claimer, USDG only).
// `where` narrows at the HyperSync source: the escrow is shared across every
// Pons launch, so unfiltered this stream is dominated by other launches.
indexer.onEvent(
  {
    contract: "PonsV2FeeEscrow",
    event: "CreditedToken",
    where: { params: { recipient: CLAIMER, token: USDG } },
  },
  async ({ event, context }) => {
    const token = event.params.token.toLowerCase();
    const recipient = event.params.recipient.toLowerCase();
    if (token !== USDG || recipient !== CLAIMER) return;

    const ts = event.block.timestamp;
    const block = event.block.number;
    const id = dayId(ts);

    const stats = await readStats(context);
    const day = await context.DailyCreatorFee.getOrCreate(emptyFeeDay(id));

    if (context.isPreload) return;

    context.FeeCredit.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      recipient,
      token,
      depositor: event.params.depositor.toLowerCase(),
      amount: event.params.amount,
      blockNumber: BigInt(block),
      timestamp: BigInt(ts),
      transactionHash: event.transaction.hash,
    });

    stats.totalCredited += event.params.amount;
    touch(stats, block, ts);
    context.ProtocolStats.set(stats);

    context.DailyCreatorFee.set({
      ...day,
      credited: day.credited + event.params.amount,
      cumulativeCredited: stats.totalCredited,
    });
  }
);

// PonsV2FeeEscrow.ClaimedToken — USDG pulled into the claimer (claimer, USDG only).
indexer.onEvent(
  {
    contract: "PonsV2FeeEscrow",
    event: "ClaimedToken",
    where: { params: { recipient: CLAIMER, token: USDG } },
  },
  async ({ event, context }) => {
    const token = event.params.token.toLowerCase();
    const recipient = event.params.recipient.toLowerCase();
    if (token !== USDG || recipient !== CLAIMER) return;

    const ts = event.block.timestamp;
    const block = event.block.number;
    const id = dayId(ts);

    const stats = await readStats(context);
    const day = await context.DailyCreatorFee.getOrCreate(emptyFeeDay(id));

    if (context.isPreload) return;

    context.FeeClaimIn.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      recipient,
      token,
      amount: event.params.amount,
      blockNumber: BigInt(block),
      timestamp: BigInt(ts),
      transactionHash: event.transaction.hash,
    });

    stats.totalClaimedIn += event.params.amount;
    touch(stats, block, ts);
    context.ProtocolStats.set(stats);

    context.DailyCreatorFee.set({
      ...day,
      claimedIn: day.claimedIn + event.params.amount,
    });
  }
);

// CreatorFeeClaimer.Claimed — forwarded from escrow to the collector (USDG only).
indexer.onEvent(
  {
    contract: "CreatorFeeClaimer",
    event: "Claimed",
    where: { params: { token: USDG } },
  },
  async ({ event, context }) => {
    const token = event.params.token.toLowerCase();
    if (token !== USDG) return;

    const ts = event.block.timestamp;
    const block = event.block.number;
    const id = dayId(ts);

    const stats = await readStats(context);
    const day = await context.DailyCreatorFee.getOrCreate(emptyFeeDay(id));

    if (context.isPreload) return;

    context.FeeForward.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      token,
      by: event.params.by.toLowerCase(),
      fromEscrow: event.params.fromEscrow,
      forwarded: event.params.forwarded,
      blockNumber: BigInt(block),
      timestamp: BigInt(ts),
      transactionHash: event.transaction.hash,
    });

    stats.totalForwarded += event.params.forwarded;
    touch(stats, block, ts);
    context.ProtocolStats.set(stats);

    context.DailyCreatorFee.set({
      ...day,
      forwarded: day.forwarded + event.params.forwarded,
    });
  }
);

// CreatorFeeSplitter.Split — keeper pulls USDG from the collector and distributes.
indexer.onEvent(
  { contract: "CreatorFeeSplitter", event: "Split" },
  async ({ event, context }) => {
    const ts = event.block.timestamp;
    const block = event.block.number;
    const id = dayId(ts);

    const stats = await readStats(context);
    const day = await context.DailyCreatorFee.getOrCreate(emptyFeeDay(id));

    if (context.isPreload) return;

    context.FeeSplit.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      by: event.params.by.toLowerCase(),
      amount: event.params.amount,
      blockNumber: BigInt(block),
      timestamp: BigInt(ts),
      transactionHash: event.transaction.hash,
    });

    stats.totalSplit += event.params.amount;
    touch(stats, block, ts);
    context.ProtocolStats.set(stats);

    context.DailyCreatorFee.set({
      ...day,
      split: day.split + event.params.amount,
    });
  }
);

// CreatorFeeSplitter.Distributed — this call's computed shares (20/30/20/20/10).
indexer.onEvent(
  { contract: "CreatorFeeSplitter", event: "Distributed" },
  async ({ event, context }) => {
    const ts = event.block.timestamp;
    const block = event.block.number;
    const id = dayId(ts);

    const stats = await readStats(context);
    const day = await context.DailyCreatorFee.getOrCreate(emptyFeeDay(id));

    if (context.isPreload) return;

    context.FeeDistribution.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      toHouse: event.params.toHouse,
      toJackpot: event.params.toJackpot,
      toStakers: event.params.toStakers,
      toTournaments: event.params.toTournaments,
      toBuyback: event.params.toBuyback,
      blockNumber: BigInt(block),
      timestamp: BigInt(ts),
      transactionHash: event.transaction.hash,
    });

    stats.totalToHouse += event.params.toHouse;
    stats.totalToJackpot += event.params.toJackpot;
    stats.totalToStakers += event.params.toStakers;
    stats.totalToTournaments += event.params.toTournaments;
    stats.totalToBuyback += event.params.toBuyback;
    touch(stats, block, ts);
    context.ProtocolStats.set(stats);

    context.DailyCreatorFee.set({
      ...day,
      toHouse: day.toHouse + event.params.toHouse,
      toJackpot: day.toJackpot + event.params.toJackpot,
      toStakers: day.toStakers + event.params.toStakers,
      toTournaments: day.toTournaments + event.params.toTournaments,
      toBuyback: day.toBuyback + event.params.toBuyback,
    });
  }
);

// CreatorFeeSplitter.LegsPaid — what actually left this call (share + backlog).
indexer.onEvent(
  { contract: "CreatorFeeSplitter", event: "LegsPaid" },
  async ({ event, context }) => {
    const ts = event.block.timestamp;
    const block = event.block.number;
    const id = dayId(ts);

    const stats = await readStats(context);
    const day = await context.DailyCreatorFee.getOrCreate(emptyFeeDay(id));

    if (context.isPreload) return;

    context.FeePayout.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      house: event.params.house,
      jackpot: event.params.jackpot,
      tournaments: event.params.tournaments,
      buyback: event.params.buyback,
      blockNumber: BigInt(block),
      timestamp: BigInt(ts),
      transactionHash: event.transaction.hash,
    });

    stats.totalPaidHouse += event.params.house;
    stats.totalPaidJackpot += event.params.jackpot;
    stats.totalPaidTournaments += event.params.tournaments;
    stats.totalPaidBuyback += event.params.buyback;
    touch(stats, block, ts);
    context.ProtocolStats.set(stats);

    context.DailyCreatorFee.set({
      ...day,
      paidHouse: day.paidHouse + event.params.house,
      paidJackpot: day.paidJackpot + event.params.jackpot,
      paidTournaments: day.paidTournaments + event.params.tournaments,
      paidBuyback: day.paidBuyback + event.params.buyback,
    });
  }
);

// CreatorFeeSplitter.Deferred — held-back leg balances after a call.
indexer.onEvent(
  { contract: "CreatorFeeSplitter", event: "Deferred" },
  async ({ event, context }) => {
    if (context.isPreload) return;

    context.FeeDeferred.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      owedToHouse: event.params.owedToHouse,
      owedToJackpot: event.params.owedToJackpot,
      owedToTournaments: event.params.owedToTournaments,
      owedToBuyback: event.params.owedToBuyback,
      blockNumber: BigInt(event.block.number),
      timestamp: BigInt(event.block.timestamp),
    });
  }
);
