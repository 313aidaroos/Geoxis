// Small Cixy button. Opens step-by-step help for this page. Plain words only.

function fillSteps(list, steps) {
  list.replaceChildren();
  steps.forEach((text, index) => {
    const item = document.createElement("li");
    item.className = "flex gap-2";
    const n = document.createElement("span");
    n.className = "text-emerald-300 shrink-0";
    n.textContent = `${index + 1}.`;
    const body = document.createElement("span");
    body.textContent = text;
    item.append(n, body);
    list.append(item);
  });
}

export function mountPageHelp({ title, steps }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "fixed bottom-4 right-4 z-50 h-8 px-3 inline-flex items-center gap-1.5 rounded-full bg-surface-1 border border-line-strong text-[12px] text-slate-200 shadow-lg shadow-black/40 hover:bg-surface-2 focus-ring";
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-controls", "cixyPageHelp");
  const dot = document.createElement("span");
  dot.className = "w-1.5 h-1.5 rounded-full bg-emerald-400";
  dot.setAttribute("aria-hidden", "true");
  btn.append(dot, document.createTextNode("Cixy"));

  const panel = document.createElement("section");
  panel.id = "cixyPageHelp";
  panel.className = "hidden fixed bottom-14 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-lg bg-surface-1 border border-line shadow-2xl shadow-black/50";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", title);

  const head = document.createElement("div");
  head.className = "px-4 py-3 border-b border-line flex items-center gap-2";
  const heading = document.createElement("div");
  heading.className = "text-[14px] font-medium text-slate-100";
  heading.textContent = title;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "ml-auto p-1 text-slate-500 hover:text-slate-200 focus-ring rounded";
  close.setAttribute("aria-label", "Close help");
  close.textContent = "✕";
  head.append(heading, close);

  const list = document.createElement("ol");
  list.className = "px-4 py-3 space-y-2 text-[13px] text-slate-300";
  fillSteps(list, steps);
  panel.append(head, list);

  function setOpen(open) {
    panel.classList.toggle("hidden", !open);
    btn.setAttribute("aria-expanded", String(open));
  }
  btn.addEventListener("click", () => setOpen(panel.classList.contains("hidden")));
  close.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
  document.body.append(panel, btn);
}
