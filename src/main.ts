import "./style.css";
import type { Snapshot } from "./types";
import { render } from "./render";
import { wireChartHover, wireWeekCharts } from "./charts";

const app = document.querySelector<HTMLDivElement>("#app")!;
let activeTab = "overview";

function wireTabs(root: ParentNode) {
  const tabs = root.querySelectorAll<HTMLButtonElement>(".tab");
  const panels = root.querySelectorAll<HTMLElement>("[data-tab-panel]");
  const show = (name: string) => {
    activeTab = name;
    tabs.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    panels.forEach((p) => {
      p.hidden = p.dataset.tabPanel !== name;
    });
  };
  tabs.forEach((b) => b.addEventListener("click", () => show(b.dataset.tab || "overview")));
  show(activeTab);

  const filter = root.querySelector<HTMLInputElement>("#xfilter");
  const tbody = root.querySelector<HTMLElement>("#xm tbody");
  if (filter && tbody) {
    filter.addEventListener("input", () => {
      const q = filter.value.trim().toLowerCase();
      tbody.querySelectorAll<HTMLTableRowElement>("tr").forEach((tr) => {
        tr.hidden = q !== "" && !(tr.textContent || "").toLowerCase().includes(q);
      });
    });
  }
}

async function load(label = "shuffling the ledger…") {
  app.innerHTML = `<main class="page"><p class="loading">${label}</p></main>`;
  const res = await fetch("/api/snapshot");
  if (!res.ok) throw new Error(`snapshot ${res.status}`);
  const data = (await res.json()) as Snapshot;
  app.innerHTML = `<main class="page">${render(data)}</main>`;
  wireWeekCharts(app);
  wireChartHover(app);
  wireTabs(app);
  document.getElementById("refresh")?.addEventListener("click", () => {
    void load("refreshing…");
  });
}

try {
  await load();
} catch (err) {
  app.innerHTML = `<main class="page">
    <header class="top"><div class="brand">suited <span class="brand-sub">protocol</span></div></header>
    <p class="lede">could not load the snapshot. run <span class="mono">npm run dev</span> so /api/snapshot can read the data dir and suited.club.</p>
    <p class="note">${String(err)}</p>
  </main>`;
}
