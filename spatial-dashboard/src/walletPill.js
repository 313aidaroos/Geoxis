// Apixis Wallet balance pill (2026-09-27, Grok Bot). Header of every Geoxis screen.
// Reads GET /api/wallet/balance (the Wallet key stays on the server). Refetches on focus / visibility /
// pageshow, so the number updates on return from Apixis Wallet. Signed out or not linked → "Log in with Apixis ID".
// 2026-09-29 (Grok, Geoxis Lead): + "Your agent is in the Apixis world" link (the user's own world agent).
import { getToken } from "./authClient.js";

const BUY = "https://apixis-wallet.vercel.app/buy?product=geoxis&return_url=" + encodeURIComponent("https://spatial-dashboard-xi.vercel.app/");

function build() {
  const wrap = document.createElement("span");
  wrap.className = "inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1 whitespace-nowrap text-[12px]";
  const pill = document.createElement("a");
  pill.href = BUY;
  pill.title = "Your Apixis Wallet balance · Buy Ixis";
  pill.className = "hidden rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-300 hover:bg-emerald-500/20";
  pill.textContent = "✦ — Ixis";
  const link = document.createElement("a");
  link.className = "text-slate-400 underline hover:text-emerald-300";
  link.textContent = "Log in with Apixis ID";
  const agent = document.createElement("a");
  agent.href = "https://www.apixis.dev/enter?from=geoxis";
  agent.className = "hidden text-slate-400 underline hover:text-emerald-300";
  agent.title = "Your own agent in the Apixis world (Cixy is your guide there)";
  agent.textContent = "Your agent is in the Apixis world ↗";
  wrap.append(pill, agent, link);
  return { wrap, pill, link, agent };
}

function mount(wrap) {
  const sidebar = document.querySelector("#sidebar > div");
  if (sidebar) {
    const row = document.createElement("div");
    row.className = "px-5 py-1.5 flex items-center justify-end border-b border-line";
    row.append(wrap);
    sidebar.after(row);
    return true;
  }
  const back = document.querySelector('main > a[href="/"]');
  if (back) {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-3";
    back.replaceWith(row);
    row.append(back, wrap);
    return true;
  }
  return false;
}

const ui = build();
let busy = false;
function show(el, on) { el.classList.toggle("hidden", !on); }

async function load() {
  ui.link.href = "/auth/apixis/start?next=" + encodeURIComponent(location.pathname + location.search);
  const token = getToken();
  if (!token) { show(ui.pill, false); show(ui.agent, false); show(ui.link, true); return; }
  if (busy) return;
  busy = true;
  try {
    const res = await fetch("/api/wallet/balance", { cache: "no-store", headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
    const d = (await res.json().catch(() => ({}))) || {};
    const amount = typeof d.available === "number" && Number.isFinite(d.available) ? d.available : null;
    ui.pill.textContent = `✦ ${amount === null ? "—" : amount.toLocaleString()} Ixis`;
    if (d.buy) ui.pill.href = d.buy;
    show(ui.pill, res.status !== 401);
    show(ui.link, res.status === 401 || d.linked === false);
    if (d.agent?.enterUrl) ui.agent.href = d.agent.enterUrl;
    ui.agent.textContent = d.agent?.ready ? "Your agent is in the Apixis world ↗" : "Enter the Apixis world ↗";
    show(ui.agent, res.status !== 401 && Boolean(d.agent));
  } catch {
    /* Wallet unreachable: keep "—" */
  } finally {
    busy = false;
  }
}

function start() {
  if (!mount(ui.wrap)) return;
  load();
  window.addEventListener("focus", load);
  window.addEventListener("pageshow", load);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(); });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
