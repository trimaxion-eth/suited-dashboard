import type { DayFees, DayRake, Snapshot } from "./types";
import { avg, int, last, money, moneyK, pct, shortDate, usdg6, when } from "./format";
import { dailyLast, lineChart, sparkline, weekPanel } from "./charts";

function nested(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function num(v: unknown): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

function big(v: unknown, dec: number): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v / 10 ** dec : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n / 10 ** dec : null;
  }
  return null;
}

function stat(label: string, value: string, sub = "", extra = ""): string {
  return `<div class="stat">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ""}
    ${extra}
  </div>`;
}

function lastN<T>(xs: T[], n: number): T[] {
  return xs.slice(-n);
}

function meanDays(days: { value: number }[], n: number): number | null {
  const slice = lastN(days, n).map((d) => d.value);
  return avg(slice);
}

function row(cells: string[]): string {
  return `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
}

function esc(v: unknown): string {
  return String(v ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}

function sday(iso: string | null | undefined): string {
  return iso ? shortDate(iso.slice(0, 10)) : "";
}

function reach(n: number | null | undefined): string {
  if (n == null) return `<span class="dim">—</span>`;
  return n >= 10000 ? moneyK(n) : int(n);
}

function socialStat(label: string, value: string, sub = ""): string {
  return stat(label, value, sub);
}

function socialMemberLink(handle: string | null, name: string | null, url: string | null): string {
  const label = name ? `${esc(name)} <span class="dim">@${esc(handle)}</span>` : `@${esc(handle)}`;
  return url
    ? `<a href="${esc(url)}" target="_blank" rel="noreferrer">${label}</a>`
    : label;
}

function socialPanel(snap: Snapshot): string {
  const s = snap.social;
  if (!s) {
    return `<section class="panel" data-tab-panel="social" hidden>
      <div class="panel-head">
        <h2>social</h2>
        <p>run <span class="mono">python3 scripts/suited_social.py</span> to build the social dataset.</p>
      </div>
    </section>`;
  }
  const x = s.x;
  const d = s.discord;

  const joinsSeries = d.joins_by_day.map((j) => ({ date: j.date, value: j.count }));
  const engTop = d.engagement.top;
  const engRows = engTop
    .map((r, i) =>
      row([
        `<span class="rank">${i + 1}</span>`,
        esc(r.author),
        int(r.messages),
        int(r.channel_count),
        r.channels.slice(0, 4).map((c) => `<span class="chip tiny">#${esc(c)}</span>`).join(" ") ||
          `<span class="dim">—</span>`,
      ]),
    )
    .join("");

  const chanRows = d.engagement.top_channels
    .slice(0, 12)
    .map((c) => row([`#${esc(c.name)}`, int(c.messages)]))
    .join("");

  const roleChips = d.role_counts
    .filter((r) => !r.id.startsWith("1540373023893495901"))
    .map((r) => `<span class="chip">${esc(r.name)} <b>${int(r.count)}</b></span>`)
    .join(" ");

  const engX = x.engaged
    .map((m, i) => {
      const e = m.engagement!;
      return row([
        `<span class="rank">${i + 1}</span>`,
        socialMemberLink(m.handle, m.name, m.url),
        m.verified ? `<span class="vf">✓</span>` : "",
        int(e.retweets),
        int(e.quotes),
        int(e.replies),
        `<b>${int(e.score)}</b>`,
      ]);
    })
    .join("");

  const notableRows = x.notable
    .slice(0, 50)
    .map((m, i) =>
      row([
        `<span class="rank">${i + 1}</span>`,
        socialMemberLink(m.handle, m.name, m.url),
        m.verified ? `<span class="vf">✓</span>` : "",
        reach(m.followers),
        m.account_age_days != null ? `${int(m.account_age_days / 365)}y` : "",
      ]),
    )
    .join("");

  const allRows = x.members
    .map((m) =>
      row([
        socialMemberLink(m.handle, m.name, m.url),
        m.verified ? `<span class="vf">✓</span>` : "",
        reach(m.followers),
      ]),
    )
    .join("");

  const engagementBlock = x.engagement.collected
    ? `<div class="table-wrap"><table class="social-table">
        <thead><tr><th>#</th><th>account</th><th></th><th>rt</th><th>quotes</th><th>replies</th><th>score</th></tr></thead>
        <tbody>${engX}</tbody></table></div>`
    : `<p class="note">no engagement set yet — run <span class="mono">python3 scripts/suited_x_engagement.py</span> from the box with the logged-in X profile to pull who retweeted / quoted / replied to @${esc(x.handle)}'s recent posts. until then, "notable followers" below ranks the audience by reach.</p>`;

  return `
    <section class="panel" data-tab-panel="social" hidden>
      <div class="panel-head">
        <h2>social</h2>
        <p>the audience behind the room: x followers and their reach, discord members and who actually talks.</p>
      </div>

      <div class="strip strip-tight">
        ${socialStat("x followers", int(x.count), x.followers_reported != null && x.followers_reported !== x.count ? `x reports ${int(x.followers_reported)}` : `@${esc(x.handle)}`)}
        ${socialStat("verified", int(x.verified_count), x.count ? `${pct((x.verified_count / x.count) * 100, 0)} of followers` : "")}
        ${socialStat("discord members", int(d.member_count), `${int(d.humans)} humans · ${int(d.bots)} bots`)}
      </div>

      <h3 class="sub">discord · ${esc(d.guild)}</h3>
      <div class="grid-3">
        ${socialStat("members", int(d.member_count), d.captured_at ? `snapshot ${sday(d.captured_at)}` : "")}
        ${socialStat("online (live)", int(num(nested(snap.track, ["discord", "online"]))), "from the last tracker run")}
        ${socialStat("boosters", int(d.role_counts.find((r) => r.name === "Server Booster")?.count), d.premium_tier ? `tier ${d.premium_tier}` : "")}
      </div>
      <div class="charts-row">
        <figure class="chart-wrap">
          <figcaption><span class="swatch mint"></span> joins per utc day</figcaption>
          ${lineChart(joinsSeries, { color: "#8fc3a6" })}
        </figure>
        <figure class="chart-wrap">
          <figcaption>role breakdown</figcaption>
          <div class="chips">${roleChips}</div>
        </figure>
      </div>

      <h3 class="sub">most engaged · discord</h3>
      <p class="note">messages per member across ${int(d.engagement.scans)} channel scans (${int(d.engagement.sampled_messages)} sampled messages${d.engagement.last_scan ? `, last ${esc(d.engagement.last_scan)}` : ""}). a sample, not a full history.</p>
      <div class="social-cols">
        <div class="table-wrap"><table class="social-table">
          <thead><tr><th>#</th><th>member</th><th>msgs</th><th>chans</th><th>seen in</th></tr></thead>
          <tbody>${engRows}</tbody></table></div>
        <div class="table-wrap"><table class="social-table">
          <thead><tr><th>channel</th><th>msgs</th></tr></thead>
          <tbody>${chanRows}</tbody></table></div>
      </div>

      <h3 class="sub">x · most engaged accounts</h3>
      ${engagementBlock}

      <h3 class="sub">x · notable followers <span class="dim">by reach</span></h3>
      <p class="note">${int(x.counted)} of ${int(x.count)} followers have a captured follower count. ranked by audience size.</p>
      <div class="table-wrap"><table class="social-table">
        <thead><tr><th>#</th><th>account</th><th></th><th>followers</th><th>age</th></tr></thead>
        <tbody>${notableRows}</tbody></table></div>

      <h3 class="sub">x · full follower list</h3>
      <input class="filter" id="xfilter" type="search" placeholder="filter @handle or name…" />
      <div class="table-wrap tall"><table class="social-table" id="xm">
        <thead><tr><th>account</th><th></th><th>followers</th></tr></thead>
        <tbody>${allRows}</tbody></table></div>
    </section>`;
}

export function render(s: Snapshot): string {
  const stats = s.live.stats ?? {};
  const lb = s.live.leaderboard ?? {};
  const track = s.track ?? {};
  const poker = (track.poker as Record<string, unknown> | undefined) ?? {};
  const staking = (track.staking as Record<string, unknown> | undefined) ?? {};
  const holders = (track.holders as Record<string, unknown> | undefined) ?? {};
  const dex = (track.dex as Record<string, unknown> | undefined) ?? {};
  const discord = (track.discord as Record<string, unknown> | undefined) ?? {};
  const tour = ((s.live.tournaments as { tournaments?: unknown[] } | undefined)?.tournaments?.[0] ??
    track.tournament) as Record<string, unknown> | undefined;

  const players = num(stats.players) ?? num(poker.players_total);
  const seated = num(stats.seated) ?? num(poker.seated);
  const hands = num(stats.handsDealt) ?? num(poker.hands_dealt);
  const handsWeek = num(stats.handsThisWeek) ?? num(poker.hands_this_week);
  const liveTables = num(stats.liveTables) ?? num(poker.live_tables);
  const tables = num(stats.tables) ?? num(poker.tables);
  const inPlay = usdg6(stats.inPlay) ?? num(poker.in_play_usd);
  const jackpot = usdg6(stats.jackpot) ?? num(poker.jackpot_usd);
  const vault = usdg6(stats.custodied) ?? num(poker.custodied_usd);
  const weekPlayers = num(lb.players) ?? num(nested(track, ["leaderboard", "week_players"]));
  const holderCount = num(holders.count);
  const staked = num(staking.total_staked);
  const fdv = num(dex.fdv);
  const price = num(dex.price);

  const rakeDays: DayRake[] = s.rake?.daily ?? [];
  const feeDays: DayFees[] = s.creator_fees?.daily ?? [];
  const rakeSeries = rakeDays.map((d) => ({ date: d.date, value: d.rake_usdg }));
  const feeSeries = feeDays.map((d) => ({ date: d.date, value: d.credited }));
  const todayRake = last(rakeDays);
  const ydayRake = rakeDays.length > 1 ? rakeDays[rakeDays.length - 2] : undefined;
  const todayFee = last(feeDays);
  const ydayFee = feeDays.length > 1 ? feeDays[feeDays.length - 2] : undefined;
  const utcToday = new Date().toISOString().slice(0, 10);
  const rakeDone = rakeSeries.filter((d) => d.date < utcToday && d.date >= "2026-09-29");
  const feeDone = feeSeries.filter((d) => d.date < utcToday && d.date >= "2026-09-29");
  const rake3 = meanDays(rakeDone, 3);
  const fee3 = meanDays(feeDone, 3);
  const rakePost = rakeDays.filter((d) => d.date >= "2026-09-29");
  const feePost = feeDays.filter((d) => d.date >= "2026-09-29");

  const histPlayers = dailyLast(
    s.history
      .filter((h) => h.players != null)
      .map((h) => ({ date: h.at.slice(0, 10), value: h.players as number })),
  );
  if (players != null) {
    const today = new Date().toISOString().slice(0, 10);
    const lastP = histPlayers[histPlayers.length - 1];
    if (!lastP || lastP.date !== today) histPlayers.push({ date: today, value: players });
    else lastP.value = players;
  }
  const histHolders = dailyLast(
    s.history
      .filter((h) => h.holders != null)
      .map((h) => ({ date: h.at.slice(0, 10), value: h.holders as number })),
  );
  if (holderCount != null) {
    const today = new Date().toISOString().slice(0, 10);
    const lastH = histHolders[histHolders.length - 1];
    if (!lastH || lastH.date !== today) histHolders.push({ date: today, value: holderCount });
    else lastH.value = holderCount;
  }

  const activation = players && holderCount ? (players / holderCount) * 100 : null;
  const weeklyShare = players && weekPlayers ? (weekPlayers / players) * 100 : null;
  const houseToday = todayFee?.house ?? 0;
  const productToday = (todayRake?.rake_usdg ?? 0) + houseToday;

  const split = s.creator_fees?.totals ?? {};
  const liveStake = s.live.staking;
  const liveTiers = nested(liveStake, ["apr", "current", "perTier"]);
  const liveApr =
    Array.isArray(liveTiers) && liveTiers[0] && typeof liveTiers[0] === "object"
      ? num((liveTiers[0] as { pct?: unknown }).pct)
      : null;
  const apr = liveApr ?? num(staking.apr_current_base);

  // buyback & burn — from the live /api/staking tracker (falls back to snapshot)
  const liveBuyback = (liveStake as Record<string, unknown> | undefined)?.buyback as
    | Record<string, unknown>
    | undefined;
  const bbTotals = (liveBuyback?.totals as Record<string, unknown> | undefined) ?? {};
  const bbDaysRaw = Array.isArray(liveBuyback?.days)
    ? (liveBuyback?.days as Record<string, unknown>[])
    : [];
  const bbBurnt = big(bbTotals.burnt, 18) ?? num(staking.buyback_burnt);
  const bbSpent = big(bbTotals.spent, 6) ?? num(staking.buyback_spent_usd);
  const bbRuns = num(bbTotals.runs) ?? num(staking.buyback_runs);
  const supply = big(nested(liveStake, ["token", "totalSupply"]), 18) ?? num(staking.total_supply);
  const supplyBurnt = supply != null ? 1_000_000_000 - supply : null;
  const avgBuy = bbSpent != null && bbBurnt ? bbSpent / bbBurnt : null;
  const priceNow =
    price ?? big(nested(liveStake, ["apr", "priceUsdg"]), 6) ?? num(staking.price_usdg);
  const bbBurntSeries = bbDaysRaw
    .map((d) => ({
      date: String(d.day ?? ""),
      value: big(d.burnt, 18) ?? big(d.bought, 18) ?? 0,
    }))
    .filter((d) => d.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const bbSpentSeries = bbDaysRaw
    .map((d) => ({ date: String(d.day ?? ""), value: big(d.spent, 6) ?? 0 }))
    .filter((d) => d.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const bbLastDate = bbBurntSeries.length ? bbBurntSeries[bbBurntSeries.length - 1].date : null;
  const bbLastSpent = bbSpentSeries.length
    ? bbSpentSeries[bbSpentSeries.length - 1].value
    : num(staking.last_buyback_spent_usd);

  const tName = typeof tour?.name === "string" ? tour.name : null;
  const tEntrants = num(tour?.entrants) ?? num(tour?.max);
  const tState = typeof tour?.state === "string" ? tour.state : "";

  const tableRows = [...rakePost].reverse().slice(0, 14).map((r) => {
    const f = feeDays.find((d) => d.date === r.date);
    return row([
      r.date,
      money(r.rake_usdg),
      int(r.checkpoints),
      money(f?.credited ?? 0),
      money(f?.house ?? 0),
      money((r.rake_usdg ?? 0) + (f?.house ?? 0)),
    ]);
  });

  return `
    <header class="top">
      <a class="brand" href="https://suited.club/" target="_blank" rel="noreferrer">
        <svg class="diamond" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.4 21.2 12 12 21.6 2.8 12Z"/></svg>
        suited
        <span class="brand-sub">protocol</span>
      </a>
      <nav>
        <a href="https://suited.club/docs" target="_blank" rel="noreferrer">docs</a>
        <a href="https://suited.club/" target="_blank" rel="noreferrer">play</a>
        <button type="button" class="refresh" id="refresh">refresh</button>
      </nav>
    </header>

    <div class="tabs" id="tabs">
      <button type="button" class="tab active" data-tab="overview">overview</button>
      <button type="button" class="tab" data-tab="social">social</button>
    </div>

    <div data-tab-panel="overview">
    <section class="hero">
      <div>
        <p class="kicker">pmf + revenue · robinhood chain</p>
        <h1>the room, the tape, the cut.</h1>
        <p class="lede">product-market fit is players, hands, and chips in the vault. revenue is two separate usd streams — poker rake, and creator fees from lp trading — never summed without a label.</p>
        <ul class="ticks">
          <li>rake is the room's cut of the game</li>
          <li>creator fees are the pons tax on suited volume</li>
          <li>house share of fees is 20% of the split</li>
        </ul>
      </div>
      <div class="hero-meta">
        <div class="pill">${when(s.generated_at)}</div>
        <div class="pill mono">${price != null ? `$${price.toFixed(6)}` : "—"} · fdv ${moneyK(fdv)}</div>
        ${tName ? `<div class="pill">${tState} · ${tName}${tEntrants != null ? ` · ${int(tEntrants)} in` : ""}</div>` : ""}
      </div>
    </section>

    <section class="strip">
      ${stat("players", int(players), weekPlayers != null ? `${int(weekPlayers)} active this week` : "lifetime unique")}
      ${stat("seated now", int(seated), `${int(liveTables)} live / ${int(tables)} tables`)}
      ${stat("hands dealt", int(hands), handsWeek != null ? `${int(handsWeek)} this week` : "")}
      ${stat("usdg in play", money(inPlay), "chips in front of players")}
      ${stat("vault", money(vault), "custodied bankroll")}
      ${stat("jackpot", money(jackpot), "daily prize pool")}
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>product-market fit</h2>
        <p>holders can sit out. players cannot. watch the cohort, not the ticker.</p>
      </div>
      <div class="grid-3">
        ${stat("holders → players", activation != null ? pct(activation, 1) : "—", `${int(players)} of ${int(holderCount)} holders have sat`)}
        ${stat("weekly return", weeklyShare != null ? pct(weeklyShare, 0) : "—", `${int(weekPlayers)} of ${int(players)} played this week (≥5 hands)`)}
        ${stat("discord", int(num(discord.members)), `${int(num(discord.online))} online · seated ${discord.players_channel ?? "—"}`)}
      </div>
      <div class="charts-row">
        <figure class="chart-wrap">
          <figcaption>lifetime players</figcaption>
          ${lineChart(histPlayers, { color: "#e6ece7" })}
        </figure>
        <figure class="chart-wrap">
          <figcaption>token holders</figcaption>
          ${lineChart(histHolders, { color: "#c9a961" })}
        </figure>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>revenue</h2>
        <p>two clocks. the room (rake) vs the tape (creator fees credited that utc day).</p>
      </div>
      <div class="strip strip-tight">
        ${stat("rake today", money(todayRake?.rake_usdg), ydayRake ? `yesterday ${money(ydayRake.rake_usdg)}` : "", sparkline(lastN(rakeSeries, 14), "#c9a961"))}
        ${stat("lp / creator fees today", money(todayFee?.credited), ydayFee ? `yesterday ${money(ydayFee.credited)}` : "", sparkline(lastN(feeSeries, 14), "#8fc3a6"))}
        ${stat("rake run-rate", money(rake3), "last 3 complete utc days / day")}
        ${stat("fee run-rate", money(fee3), "last 3 complete utc days / day")}
        ${stat("lifetime rake", money(s.rake?.total_rake_usdg), s.rake?.prelaunch ? `incl. ${money(s.rake.prelaunch.rake_usdg)} prelaunch` : "")}
        ${stat("lifetime creator fees", money(split.credited), "pons tax, usd")}
      </div>
      <div class="chart-stack">
        ${weekPanel('<span class="swatch gold"></span> daily rake · usdg', {
          color: "#c9a961",
          money: true,
          series: rakeSeries.filter((d) => d.date >= "2026-09-29"),
        })}
        ${weekPanel('<span class="swatch mint"></span> daily creator fees · usdg', {
          color: "#8fc3a6",
          money: true,
          series: feeSeries.filter((d) => d.date >= "2026-09-29"),
        })}
      </div>
      <p class="note">creator fees were front-loaded by the launch. the run-rate is the number that matters for pmf; the lifetime total is a launch artifact. the splitter caps at ${money(s.creator_fees?.live_state?.max_split_usdg ?? 50000)} / day.</p>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>where the money goes</h2>
        <p>poker rake stays in the room's circuit. creator fees split 20 / 30 / 20 / 20 / 10.</p>
      </div>
      <div class="legs">
        ${stat("house 20%", money(split.house), "operating cut of trading tax")}
        ${stat("jackpot 30%", money(split.jackpot), "")}
        ${stat("stakers 20%", money(split.stakers), apr != null ? `apr ${pct(apr, 0)} current base` : "")}
        ${stat("tournaments 20%", money(split.tournaments), "")}
        ${stat("buyback 10%", money(split.buyback), staking.buyback_burnt != null ? `${moneyK(num(staking.buyback_burnt))} burnt` : "")}
      </div>
      <div class="strip strip-tight">
        ${stat("today · room + house", money(productToday), `rake ${money(todayRake?.rake_usdg)} + house ${money(houseToday)}`)}
        ${stat("staked supply", staked != null ? moneyK(staked) : "—", "suited locked")}
        ${stat("staking funded", money(s.staking_funded?.total_added_usdg), "rewards added on chain")}
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>buyback &amp; burn</h2>
        <p>the 10% creator-fee buyback leg, spent at midnight New York over 15 clips; every token bought is burnt.</p>
      </div>
      <div class="strip strip-tight">
        ${stat("burnt · tracker", bbBurnt != null ? `${moneyK(bbBurnt)} SUITED` : "—", bbRuns != null ? `${int(bbRuns)} daily runs` : "")}
        ${stat("usdg spent", money(bbSpent), "buyback wallet out")}
        ${stat("avg buy price", avgBuy != null ? `$${avgBuy.toFixed(6)}` : "—", "spent ÷ burnt")}
        ${stat("price now", priceNow != null ? `$${priceNow.toFixed(6)}` : "—", "market")}
        ${stat("burnt · on supply", supplyBurnt != null ? moneyK(supplyBurnt) : "—", "1b − totalSupply")}
        ${stat("last run", money(bbLastSpent), bbLastDate ?? "")}
      </div>
      <div class="chart-stack">
        ${weekPanel('<span class="swatch ember"></span> daily burnt · SUITED', {
          color: "#d98b6a",
          money: false,
          series: bbBurntSeries,
        })}
        ${weekPanel('<span class="swatch gold"></span> daily buyback spend · usdg', {
          color: "#c9a961",
          money: true,
          series: bbSpentSeries,
        })}
      </div>
      <p class="note">spend is in usdg, the burn is in SUITED — divide one by the other (the avg buy price) to compare, which is why the token count never equals 10% of fees. the wallet is funded by the splitter's 10% leg plus operator top-ups.</p>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>daily ledger</h2>
        <p>utc days since launch. "protocol ops" = rake + house leg only — not the full creator-fee print.</p>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>date</th>
              <th>rake</th>
              <th>checkpoints</th>
              <th>creator fees</th>
              <th>house 20%</th>
              <th>ops (rake+house)</th>
            </tr>
          </thead>
          <tbody>${tableRows.join("")}</tbody>
        </table>
      </div>
      <p class="note">on-chain series from <span class="mono">data/rake-daily.json</span> and <span class="mono">data/creator-fees-daily.json</span>. live room stats from suited.club. refresh parent scripts to update the ledger.</p>
    </section>
    </div>

    ${socialPanel(s)}

    <footer>
      <span>not the room — a watch on it.</span>
      <span class="mono">${int(rakePost.length)} rake days · ${int(feePost.length)} fee days</span>
    </footer>
  `;
}
