import { int, money, shortDate } from "./format";

export type Series = { date: string; value: number };

function escAttr(v: string): string {
  return v.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}

function tipText(date: string, value: number, moneyMode: boolean, unit: string): string {
  return `${shortDate(date)} · ${fmtAxis(value, moneyMode)}${unit}`;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  }
  const span = max - min;
  const raw = span / Math.max(count - 1, 1);
  const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * pow);
  const step = candidates.find((c) => c >= raw) ?? candidates[candidates.length - 1];
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step * 0.5; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

function fmtAxis(n: number, moneyMode: boolean): string {
  if (moneyMode) {
    if (Math.abs(n) >= 1000) return money(n, 0);
    return money(n, n % 1 === 0 ? 0 : 2);
  }
  return int(n);
}

function deltaLabel(now: number, start: number, moneyMode: boolean): string {
  const d = now - start;
  if (d === 0) return "flat";
  const sign = d > 0 ? "+" : "";
  return moneyMode
    ? `${sign}${money(d, Math.abs(d) >= 1000 ? 0 : 2)}`
    : `${sign}${int(d)}`;
}

/** Collapse many snapshots to one point per UTC day (last value that day). */
export function dailyLast(series: Series[]): Series[] {
  const map = new Map<string, number>();
  for (const s of series) map.set(s.date.slice(0, 10), s.value);
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

export function sparkline(series: Series[], color = "#c9a961"): string {
  const w = 220;
  const h = 40;
  const values = series.map((s) => s.value);
  if (!values.length) return `<svg class="spark" viewBox="0 0 ${w} ${h}"></svg>`;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const d = values
    .map((v, i) => {
      const x = 2 + (i / Math.max(values.length - 1, 1)) * (w - 4);
      const y = h - 2 - ((v - min) / span) * (h - 4);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" />
  </svg>`;
}

export function lineChart(
  series: Series[],
  opts: { color?: string; money?: boolean; unit?: string } = {},
): string {
  const color = opts.color ?? "#e6ece7";
  const moneyMode = !!opts.money;
  const unit = opts.unit ?? "";
  if (!series.length) {
    return `<div class="chart-empty">no data yet</div>`;
  }

  const w = 520;
  const h = 200;
  const padL = 48;
  const padR = 16;
  const padT = 18;
  const padB = 28;
  const values = series.map((s) => s.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  // Zoom to the data range (not forced to zero) so small moves are readable.
  const pad = Math.max((dataMax - dataMin) * 0.12, Math.abs(dataMax) * 0.02, 1);
  const yMin = dataMin - pad;
  const yMax = dataMax + pad;
  const ticks = niceTicks(yMin, yMax, 4);
  const plotMin = ticks[0];
  const plotMax = ticks[ticks.length - 1];
  const span = plotMax - plotMin || 1;

  const xAt = (i: number) =>
    padL + (i / Math.max(series.length - 1, 1)) * (w - padL - padR);
  const yAt = (v: number) => padT + (1 - (v - plotMin) / span) * (h - padT - padB);

  const path = series
    .map((s, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(s.value).toFixed(1)}`)
    .join(" ");

  const grid = ticks
    .map((t) => {
      const y = yAt(t);
      return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="rgba(230,236,231,0.10)" />
        <text class="axis" x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end">${fmtAxis(t, moneyMode)}</text>`;
    })
    .join("");

  const xLabels = series
    .map((s, i) => {
      const show = i === 0 || i === series.length - 1 || i % Math.ceil(series.length / 5) === 0;
      if (!show) return "";
      return `<text class="axis" x="${xAt(i).toFixed(1)}" y="${h - 8}" text-anchor="middle">${shortDate(s.date)}</text>`;
    })
    .join("");

  const start = series[0];
  const end = series[series.length - 1];
  const peak = series.reduce((a, b) => (b.value > a.value ? b : a));
  const lastX = xAt(series.length - 1);
  const lastY = yAt(end.value);

  const plotW = w - padL - padR;
  const step = series.length > 1 ? plotW / (series.length - 1) : plotW;
  const hits = series
    .map((s, i) => {
      const cx = xAt(i);
      const half = series.length > 1 ? step / 2 : plotW / 2;
      let x0 = i === 0 ? padL : cx - half;
      let x1 = i === series.length - 1 ? w - padR : cx + half;
      if (x1 - x0 < 1) {
        x0 = Math.max(padL, cx - step / 2);
        x1 = Math.min(w - padR, x0 + step);
      }
      const tip = escAttr(tipText(s.date, s.value, moneyMode, unit));
      return `<rect class="hit" x="${x0.toFixed(1)}" y="${padT}" width="${(x1 - x0).toFixed(1)}" height="${(h - padT - padB).toFixed(1)}" fill="transparent" data-tip="${tip}" data-cx="${cx.toFixed(1)}" data-cy="${yAt(s.value).toFixed(1)}" data-color="${color}" />`;
    })
    .join("");

  return `
    <div class="chart-meta">
      <span><em>now</em> ${fmtAxis(end.value, moneyMode)}${unit}</span>
      <span><em>start</em> ${fmtAxis(start.value, moneyMode)}${unit}</span>
      <span><em>Δ</em> ${deltaLabel(end.value, start.value, moneyMode)}</span>
      <span><em>peak</em> ${fmtAxis(peak.value, moneyMode)}${unit} <span class="dim">${shortDate(peak.date)}</span></span>
    </div>
    <svg class="chart chart-hover" viewBox="0 0 ${w} ${h}">
      ${grid}
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2" />
      <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3.5" fill="${color}" />
      <text class="point" x="${(lastX - 6).toFixed(1)}" y="${(lastY - 10).toFixed(1)}" text-anchor="end" fill="${color}">${fmtAxis(end.value, moneyMode)}</text>
      ${xLabels}
      ${hits}
      <g class="hover-layer"></g>
    </svg>`;
}

export function bars(
  series: Series[],
  opts: {
    color?: string;
    money?: boolean;
    unit?: string;
    width?: number;
    height?: number;
    labelAll?: boolean;
  } = {},
): string {
  const color = opts.color ?? "#c9a961";
  const moneyMode = opts.money !== false;
  const unit = opts.unit ?? "";
  if (!series.length) {
    return `<div class="chart-empty">no data yet</div>`;
  }

  const w = opts.width ?? 520;
  const h = opts.height ?? 210;
  const labelAll = !!opts.labelAll;
  const padL = 48;
  const padR = 12;
  const padT = 22;
  const padB = 28;
  const values = series.map((s) => s.value);
  const dataMax = Math.max(...values, 0);
  const ticks = niceTicks(0, dataMax, 4);
  const plotMax = ticks[ticks.length - 1] || 1;
  const n = series.length;
  const slot = (w - padL - padR) / n;
  const maxBar = labelAll ? 72 : 22;
  const barW = Math.max(4, Math.min(maxBar, slot * (labelAll ? 0.62 : 0.58)));

  const yAt = (v: number) => padT + (1 - v / plotMax) * (h - padT - padB);

  const grid = ticks
    .map((t) => {
      const y = yAt(t);
      return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="rgba(230,236,231,0.10)" />
        <text class="axis" x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end">${fmtAxis(t, moneyMode)}</text>`;
    })
    .join("");

  // Label every bar when few days; otherwise first/last/peak + every other.
  const peakIdx = values.indexOf(dataMax);
  const labelEvery = n <= 10;
  const marks = series
    .map((r, i) => {
      const x = padL + i * slot + slot / 2;
      const top = yAt(r.value);
      const base = yAt(0);
      const ht = Math.max(base - top, 0);
      const labelBar =
        labelAll || labelEvery || i === 0 || i === n - 1 || i === peakIdx || i % 2 === 0;
      const val =
        labelBar && r.value > 0
          ? `<text class="bar-val" x="${x.toFixed(1)}" y="${(top - 6).toFixed(1)}" text-anchor="middle" fill="${color}">${fmtAxis(r.value, moneyMode)}</text>`
          : "";
      const xLab =
        labelAll || i === 0 || i === n - 1 || i % Math.ceil(n / 6) === 0
          ? `<text class="axis" x="${x.toFixed(1)}" y="${h - 8}" text-anchor="middle">${shortDate(r.date)}</text>`
          : "";
      const tip = escAttr(tipText(r.date, r.value, moneyMode, unit));
      const hit = `<rect class="hit" x="${(padL + i * slot).toFixed(1)}" y="${padT}" width="${slot.toFixed(1)}" height="${(h - padT - padB).toFixed(1)}" fill="transparent" data-tip="${tip}" data-cx="${x.toFixed(1)}" data-cy="${top.toFixed(1)}" data-color="${color}" />`;
      return `<rect x="${(x - barW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${barW}" height="${ht.toFixed(1)}" fill="${color}" opacity="0.9"/>${val}${xLab}${hit}`;
    })
    .join("");

  const end = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : undefined;
  const peak = series[peakIdx];
  const avg =
    values.reduce((a, b) => a + b, 0) / Math.max(values.filter((v) => v > 0).length || values.length, 1);

  return `
    <div class="chart-meta">
      <span><em>latest</em> ${fmtAxis(end.value, moneyMode)}${unit} <span class="dim">${shortDate(end.date)}</span></span>
      ${prev ? `<span><em>prev</em> ${fmtAxis(prev.value, moneyMode)}${unit}</span>` : ""}
      <span><em>peak</em> ${fmtAxis(peak.value, moneyMode)}${unit} <span class="dim">${shortDate(peak.date)}</span></span>
      <span><em>avg</em> ${fmtAxis(avg, moneyMode)}${unit}</span>
    </div>
    <svg class="chart chart-hover" viewBox="0 0 ${w} ${h}">
      ${grid}
      ${marks}
      <g class="hover-layer"></g>
    </svg>`;
}

export type WeekPanelData = {
  color: string;
  money: boolean;
  unit?: string;
  series: Series[];
};

/** A full-width bar chart paginated one week (7 UTC days) at a time. */
export function weekPanel(caption: string, data: WeekPanelData): string {
  const payload = JSON.stringify(data).replace(/</g, "\\u003c");
  return `
    <figure class="chart-wrap week-chart">
      <figcaption>${caption}</figcaption>
      <div class="week-nav">
        <button type="button" class="wk-btn" data-wk="prev">‹ prev</button>
        <span class="wk-range"></span>
        <button type="button" class="wk-btn" data-wk="next">next ›</button>
      </div>
      <div class="wk-body"></div>
      <script type="application/json" class="wk-data">${payload}</script>
    </figure>`;
}

/** Attach prev/next week navigation to every .week-chart rendered by weekPanel. */
export function wireWeekCharts(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(".week-chart").forEach((fig) => {
    const dataEl = fig.querySelector<HTMLScriptElement>(".wk-data");
    const body = fig.querySelector<HTMLElement>(".wk-body");
    const rangeEl = fig.querySelector<HTMLElement>(".wk-range");
    const prevBtn = fig.querySelector<HTMLButtonElement>('[data-wk="prev"]');
    const nextBtn = fig.querySelector<HTMLButtonElement>('[data-wk="next"]');
    if (!dataEl || !body) return;

    let data: WeekPanelData;
    try {
      data = JSON.parse(dataEl.textContent || "{}") as WeekPanelData;
    } catch {
      return;
    }
    const series = (data.series ?? [])
      .filter((d) => d && d.date)
      .sort((a, b) => a.date.localeCompare(b.date));
    const weeks: Series[][] = [];
    for (let end = series.length; end > 0; end -= 7) {
      weeks.unshift(series.slice(Math.max(0, end - 7), end));
    }
    if (!weeks.length) {
      body.innerHTML = `<div class="chart-empty">no data yet</div>`;
      return;
    }

    let idx = weeks.length - 1;
    const draw = () => {
      const wk = weeks[idx] ?? [];
      body.innerHTML = bars(wk, {
        color: data.color,
        money: data.money,
        unit: data.unit,
        width: 1080,
        height: 230,
        labelAll: true,
      });
      wireChartHover(body);
      const first = wk[0]?.date;
      const lastDay = wk[wk.length - 1]?.date;
      if (rangeEl) rangeEl.textContent = first && lastDay ? `${first}  →  ${lastDay}` : "no data";
      if (prevBtn) prevBtn.disabled = idx <= 0;
      if (nextBtn) nextBtn.disabled = idx >= weeks.length - 1;
    };

    prevBtn?.addEventListener("click", () => {
      if (idx > 0) {
        idx -= 1;
        draw();
      }
    });
    nextBtn?.addEventListener("click", () => {
      if (idx < weeks.length - 1) {
        idx += 1;
        draw();
      }
    });
    draw();
  });
}

/** Show a floating value tooltip and hover marker for every .chart-hover SVG. */
export function wireChartHover(root: ParentNode = document): void {
  let tip = document.getElementById("chart-tip") as HTMLDivElement | null;
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "chart-tip";
    tip.className = "chart-tip";
    tip.hidden = true;
    document.body.appendChild(tip);
  }
  tip.hidden = true;

  root.querySelectorAll<SVGSVGElement>(".chart-hover").forEach((svg) => {
    const layer = svg.querySelector<SVGGElement>(".hover-layer");

    const place = (ev: MouseEvent) => {
      const pad = 14;
      const rect = tip!.getBoundingClientRect();
      let x = ev.clientX + pad;
      let y = ev.clientY + pad;
      if (x + rect.width > window.innerWidth - 8) x = ev.clientX - rect.width - pad;
      if (y + rect.height > window.innerHeight - 8) y = ev.clientY - rect.height - pad;
      tip!.style.left = `${x}px`;
      tip!.style.top = `${y}px`;
    };

    svg.querySelectorAll<SVGRectElement>(".hit").forEach((el) => {
      const show = (ev: MouseEvent) => {
        const text = el.getAttribute("data-tip");
        if (!text) return;
        tip!.textContent = text;
        tip!.hidden = false;
        place(ev);
        if (!layer) return;
        const cx = el.getAttribute("data-cx");
        const cy = el.getAttribute("data-cy");
        const color = el.getAttribute("data-color") ?? "#e6ece7";
        if (cx && cy) {
          layer.innerHTML = `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${color}" stroke="#0b0f0d" stroke-width="1.5" />`;
        }
      };
      el.addEventListener("mouseenter", show);
      el.addEventListener("mousemove", place);
    });

    svg.addEventListener("mouseleave", () => {
      tip!.hidden = true;
      if (layer) layer.innerHTML = "";
    });
  });
}
