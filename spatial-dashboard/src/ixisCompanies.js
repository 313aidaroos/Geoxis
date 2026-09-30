// Other Ixis companies (2026-09-29, Geoxis Lead / Grok). The ONE place the list lives:
// edit a URL here and every Geoxis footer updates. Geoxis itself is intentionally left out.
// Renders plain links into any element with a `data-ixis-companies` attribute.
export const IXIS_COMPANIES = [
  { name: "Apixis", url: "https://www.apixis.dev" },
  { name: "Apixis Wallet", url: "https://apixis-wallet.vercel.app" },
  { name: "Socixis", url: "https://socixis.dev" },
  { name: "Renoxis", url: "https://renoxis.dev" },
  { name: "Rawixis", url: "https://rawixis.vercel.app" },
  { name: "Contraxis", url: "https://contraxis-dev.vercel.app" },
  { name: "Lyrixis", url: "https://lyrixis.vercel.app" },
  { name: "Halaxis", url: "https://halaxis.vercel.app" },
  { name: "Recovra", url: "https://recovra-three.vercel.app" },
  { name: "Deduxis", url: "https://deduxis.vercel.app" },
  { name: "Wattixis", url: "https://wattixis.vercel.app" },
];

export function renderIxisCompanies(root = document) {
  root.querySelectorAll("[data-ixis-companies]").forEach((el) => {
    el.replaceChildren(
      ...IXIS_COMPANIES.map(({ name, url }) => {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = name;
        // Same muted link style as the sidebar nav (Login / Support / Admin); py-1 keeps taps easy on mobile.
        a.className = "inline-block py-1 text-slate-400 hover:text-emerald-300";
        return a;
      }),
    );
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => renderIxisCompanies());
} else {
  renderIxisCompanies();
}
