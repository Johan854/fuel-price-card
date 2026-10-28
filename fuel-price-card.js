{ // bloc isolé : aucune variable ne fuit vers les autres cartes
/*
 * Fuel Price Card (FR)
 * Carte Home Assistant pour comparer les prix des carburants de plusieurs stations : classement du moins cher au
 * plus cher, écart avec la moins chère, tendance sur 7 jours, économie sur un plein. Style verre, thème clair/sombre
 * automatique, éditeur visuel, textes en français.
 */
const CARD_VERSION = "1.1.0";

/* === NUANCE COMMUNE v2 (cartes Johan854) ===
 * Bloc identique dans toutes les cartes. Options : nuance, nuance_perso, intensite.
 * nuance "theme" (par défaut) : suit la variable carte-nuance du thème Home Assistant ;
 * si elle n'existe pas, la carte garde ses couleurs d'origine. Intensité : 0 = neutre, 1 = normal, 2 = très coloré. */
const GV_NUANCES = [["braise", "Braise (rouge)", "#e0524f"], ["ocean", "Océan (bleu)", "#2f8fd8"], ["lagon", "Lagon (turquoise)", "#1fb5a8"], ["foret", "Forêt (vert)", "#3fae5a"], ["lavande", "Lavande (violet)", "#8a63d8"], ["framboise", "Framboise (rose)", "#e05597"], ["ambre", "Ambre (orange)", "#e8902c"], ["ardoise", "Ardoise (neutre)", "#7d8595"]];
const GV_DEFAULTS = { nuance: "theme", intensite: 1 };
const gvAccent = (c) => {
  const p = c && c.nuance_perso;
  if (c && c.nuance === "perso") {
    if (Array.isArray(p) && p.length === 3) return "#" + p.map((v) => Math.max(0, Math.min(255, Math.round(+v || 0))).toString(16).padStart(2, "0")).join("");
    if (typeof p === "string" && /^#?[0-9a-f]{6}$/i.test(p.trim())) return "#" + p.trim().replace("#", "");
  }
  const n = GV_NUANCES.find((x) => x[0] === (c && c.nuance));
  return n ? n[2] : "var(--carte-nuance)";
};
/* Variables posées sur <ha-card> : --g-bg-x (fond dégradé teinté) et --acc-ui-x (couleur d'accent).
 * Sans nuance (thème sans carte-nuance), elles sont invalides : chaque carte retombe alors sur ses couleurs d'origine. */
const gvStyle = (c, dark) => {
  const i = Number(c && c.intensite), ai = Number.isFinite(i) ? Math.max(0, Math.min(2, i)) : 1;
  const m = (pct, base) => `color-mix(in srgb,var(--acc-ui) ${+(pct * ai).toFixed(1)}%,${base})`;
  const bg = dark ? `linear-gradient(160deg,${m(5, "#1b1e32")} 0%,${m(11, "#1f1b2c")} 55%,${m(22, "#1c1620")} 100%)`
    : `linear-gradient(160deg,${m(2, "#f8f9fd")} 0%,${m(5, "#eef1f8")} 55%,${m(11, "#f8f8fa")} 100%)`;
  return `--acc-ui:${gvAccent(c)};--g-bg-x:${bg};--acc-ui-x:color-mix(in srgb,var(--acc-ui) ${dark ? "80%,#fff" : "82%,#000"})`;
};
const GV_FIELDS = [
  { name: "nuance", selector: { select: { mode: "dropdown", options: [{ value: "theme", label: "Selon le thème (couleurs d'origine)" }, ...GV_NUANCES.map((n) => ({ value: n[0], label: n[1] })), { value: "perso", label: "Personnalisée" }] } } },
  { name: "nuance_perso", selector: { color_rgb: {} } },
  { name: "intensite", selector: { number: { min: 0, max: 2, step: 0.1, mode: "slider" } } }];
const GV_LABELS = { nuance: "Nuance de couleur", nuance_perso: "Couleur personnalisée (nuance « Personnalisée »)", intensite: "Intensité de la nuance" };
/* === FIN NUANCE COMMUNE === */

const DEFAULTS = {
  title: "Prix du carburant",
  fuel: "Gazole",
  theme: "auto", nuance: "theme", intensite: 1,
  tank_liters: 40,
  show_tank: true,
  show_trend: true,
  show_summary: true,
  max_rows: 0, // 0 = toutes
  stations: [],
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const price = (st) => {
  if (!st || st.state === "unknown" || st.state === "unavailable" || st.state === "") return null;
  const v = Number(String(st.state).replace(",", "."));
  return isNaN(v) || v <= 0 ? null : v;
};

class FuelPriceCard extends HTMLElement {
  static getConfigElement() { return document.createElement("fuel-price-card-editor"); }
  static getStubConfig(hass) {
    const ids = Object.keys((hass && hass.states) || {}).filter((e) => /^sensor\..*(gazole|sp95|sp98|e10|diesel)/.test(e)).slice(0, 5);
    return { ...DEFAULTS, stations: ids.map((entity) => ({ entity })) };
  }

  constructor() { super(); this.attachShadow({ mode: "open" }); this._sig = ""; this._trend = {}; this._trendAt = 0; this._busy = false; }

  setConfig(config) {
    if (!config) throw new Error("Configuration invalide");
    this._config = { ...DEFAULTS, ...config, stations: (config.stations || []).map((s) => ({ ...s })) };
    this._sig = ""; this._trend = {}; this._trendAt = 0;
    if (this._hass) { this._render(); this._loadTrend(); }
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    const sig = this._config.stations.map((s) => { const x = hass.states[s.entity]; return x ? x.state : "x"; }).join("|") + (this._isDark() ? "d" : "l");
    if (sig !== this._sig) { this._sig = sig; this._render(); }
    if (this._config.show_trend && Date.now() - this._trendAt > 3600000) this._loadTrend();
  }

  getCardSize() { return 2 + Math.ceil(this._config.stations.length * 0.8); }

  _isDark() {
    const t = this._config && this._config.theme;
    if (t === "dark") return true;
    if (t === "light") return false;
    const dm = this._hass && this._hass.themes && this._hass.themes.darkMode;
    return typeof dm === "boolean" ? dm : !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  _lang() { return (this._hass && this._hass.locale && this._hass.locale.language) || "fr"; }
  _nf(n, d = 3) { return new Intl.NumberFormat(this._lang(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(n); }
  _more(id) { if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: id } })); }

  async _loadTrend() {
    const c = this._config, h = this._hass;
    if (this._busy || !c.show_trend || !h || !h.callWS || !c.stations.length) return;
    this._busy = true; this._trendAt = Date.now();
    try {
      const ids = c.stations.map((s) => s.entity).filter(Boolean);
      const r = await h.callWS({ type: "history/history_during_period", start_time: new Date(Date.now() - 7 * 86400000).toISOString(), end_time: new Date().toISOString(), entity_ids: ids, minimal_response: true, no_attributes: true, significant_changes_only: false });
      const out = {};
      for (const id of ids) {
        const arr = ((r && r[id]) || []).map((x) => Number(String(x.s).replace(",", "."))).filter((x) => !isNaN(x) && x > 0);
        if (arr.length) out[id] = arr[0];
      }
      this._trend = out; this._sig = ""; this._render();
    } catch (e) { this._trendAt = Date.now() - 3000000; }
    finally { this._busy = false; }
  }

  _render() {
    const c = this._config, h = this._hass;
    if (!c || !h) return;
    const dark = this._isDark();
    const rows = c.stations.filter((s) => s.entity).map((s, i) => {
      const st = h.states[s.entity];
      return { id: s.entity, name: s.name || (st && st.attributes.friendly_name) || s.entity, p: price(st), idx: i };
    });
    const ok = rows.filter((r) => r.p !== null).sort((a, b) => a.p - b.p || a.idx - b.idx);
    const ko = rows.filter((r) => r.p === null);
    const min = ok.length ? ok[0].p : 0, max = ok.length ? ok[ok.length - 1].p : 0;
    const avg = ok.length ? ok.reduce((t, r) => t + r.p, 0) / ok.length : 0;
    const liters = Number(c.tank_liters) || 0;
    const shown = c.max_rows > 0 ? ok.slice(0, Number(c.max_rows)) : ok;

    const summary = c.show_summary && ok.length ? `<div class="sum glass">
      <div class="best"><ha-icon icon="mdi:gas-station"></ha-icon><div><div class="bl">Le moins cher</div><div class="bn">${esc(ok[0].name)}</div></div><div class="bp">${this._nf(min)}<small>€/L</small></div></div>
      <div class="kp"><span><b>${this._nf(avg)}</b>Moyenne</span><span><b>${this._nf(max - min)}</b>Écart max.</span>${liters ? `<span><b>${this._nf((max - min) * liters, 2)} €</b>Sur un plein de ${liters} L</span>` : ""}</div></div>` : "";

    const list = shown.map((r, i) => {
      const pct = max > min ? 30 + (70 * (r.p - min)) / (max - min) : 30;
      const tone = max > min ? ((r.p - min) / (max - min) < 0.34 ? "ok" : (r.p - min) / (max - min) < 0.67 ? "mid" : "hi") : "ok";
      const delta = i === 0 ? "" : `+${this._nf(r.p - min)} €`;
      const t0 = this._trend[r.id];
      let trend = "";
      if (c.show_trend && t0 !== undefined) {
        const d = r.p - t0;
        trend = Math.abs(d) < 0.0005 ? `<span class="tr flat" title="Stable sur 7 jours"><ha-icon icon="mdi:minus"></ha-icon></span>`
          : `<span class="tr ${d > 0 ? "up" : "down"}" title="${d > 0 ? "+" : ""}${this._nf(d)} € sur 7 jours"><ha-icon icon="${d > 0 ? "mdi:trending-up" : "mdi:trending-down"}"></ha-icon></span>`;
      }
      return `<button class="row ${i === 0 ? "best1" : ""}" data-more="${esc(r.id)}">
        <span class="rk">${i + 1}</span><span class="nm"><span class="nt">${esc(r.name)}</span><span class="bl2"><i class="bar ${tone}"><u style="width:${pct.toFixed(0)}%"></u></i><em class="dl ${i === 0 ? "first" : ""}">${delta || "moins cher"}</em></span></span>
        ${trend || "<span></span>"}<span class="pr"><span>${this._nf(r.p)}<small>€/L</small></span>${liters && c.show_tank ? `<em>${this._nf(r.p * liters, 2)} € <i>le plein</i></em>` : ""}</span></button>`;
    }).join("");
    const off = ko.map((r) => `<button class="row na" data-more="${esc(r.id)}"><span class="rk">–</span><span class="nm"><span class="nt">${esc(r.name)}</span><em class="dl">Indisponible</em></span><span></span><span class="pr"><span>—</span></span></button>`).join("");

    this.shadowRoot.innerHTML = `<style>
      * { box-sizing:border-box; }
      ha-card.dark { --fp-text:#f4f6fb; --fp-muted:#a9afc0; --fp-bg:var(--g-bg-x,linear-gradient(160deg,#1b1e32 0%,#241a2a 55%,#2d1519 100%)); --fp-border:rgba(255,255,255,.14); --fp-shadow:0 .6em 2em rgba(0,0,0,.35);
        --fp-glass:rgba(255,255,255,.07); --fp-glass-b:rgba(255,255,255,.13); --fp-acc:var(--acc-ui-x,#ffc83d); --fp-ok:#3ddc84; --fp-mid:#ffb86b; --fp-hi:#ff5a5f; --fp-track:rgba(255,255,255,.12); }
      ha-card.light { --fp-text:#1c2030; --fp-muted:#5d6477; --fp-bg:var(--g-bg-x,linear-gradient(160deg,#f8f9fd 0%,#eef1f8 55%,#f8eff0 100%)); --fp-border:rgba(20,24,40,.12); --fp-shadow:0 .4em 1.4em rgba(20,24,40,.12);
        --fp-glass:rgba(255,255,255,.7); --fp-glass-b:rgba(20,24,40,.1); --fp-acc:var(--acc-ui-x,#d68a00); --fp-ok:#1a9d55; --fp-mid:#c77a14; --fp-hi:#d32f35; --fp-track:rgba(20,24,40,.1); }
      ha-card { container-type:inline-size; display:flex; flex-direction:column; gap:12px; padding:16px; color:var(--fp-text); border-radius:24px; border:1px solid var(--fp-border); background:var(--fp-bg); box-shadow:var(--fp-shadow); overflow:hidden; }
      ha-icon { --mdc-icon-size:1.2em; flex:none; }
      button { font:inherit; color:inherit; background:none; border:0; padding:0; text-align:left; cursor:pointer; -webkit-tap-highlight-color:transparent; }
      .hd { display:flex; justify-content:space-between; align-items:baseline; } .hd .t { font-weight:700; font-size:1.05em; } .hd .f { font-size:.82em; color:var(--fp-acc); font-weight:700; }
      .glass { background:var(--fp-glass); border:1px solid var(--fp-glass-b); -webkit-backdrop-filter:blur(18px) saturate(140%); backdrop-filter:blur(18px) saturate(140%); }
      .sum { display:flex; flex-direction:column; gap:10px; padding:12px 14px; border-radius:20px; }
      .best { display:flex; align-items:center; gap:.7em; } .best ha-icon { --mdc-icon-size:2em; color:var(--fp-ok); } .best > div:nth-child(2) { flex:1; min-width:0; } .bl { font-size:.75em; color:var(--fp-muted); } .bn { font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .bp { font-size:1.9em; font-weight:750; color:var(--fp-ok); font-variant-numeric:tabular-nums; line-height:1; } .bp small { font-size:.4em; color:var(--fp-muted); margin-left:.2em; font-weight:600; }
      .kp { display:flex; flex-wrap:wrap; gap:6px 18px; } .kp span { display:flex; flex-direction:column; font-size:.72em; color:var(--fp-muted); } .kp b { font-size:1.25em; color:var(--fp-text); font-variant-numeric:tabular-nums; }
      .list { display:flex; flex-direction:column; border-radius:18px; padding:2px 12px; }
      .row { display:grid; grid-template-columns:1.6em minmax(0,1fr) auto auto; align-items:center; gap:.6em; padding:.6em 0; border-top:1px solid var(--fp-glass-b); width:100%; }
      .row:first-child { border-top:0; } .rk { font-size:.78em; color:var(--fp-muted); font-weight:700; text-align:center; } .best1 .rk { color:var(--fp-ok); }
      .nm { display:flex; flex-direction:column; gap:.35em; min-width:0; font-size:.9em; font-weight:600; } .nt { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .bar { display:block; height:.32em; border-radius:.3em; background:var(--fp-track); overflow:hidden; } .bar u { display:block; height:100%; border-radius:inherit; text-decoration:none; background:var(--fp-ok); }
      .bar.mid u { background:var(--fp-mid); } .bar.hi u { background:var(--fp-hi); }
            .pr { display:flex; flex-direction:column; align-items:flex-end; font-weight:750; min-width:5.2em; font-variant-numeric:tabular-nums; } .pr em { font-style:normal; font-weight:600; font-size:.74em; color:var(--fp-text); opacity:.9; white-space:nowrap; } .pr em i { font-style:normal; font-weight:500; color:var(--fp-muted); }
      .bl2 { display:flex; align-items:center; gap:.6em; } .bl2 .bar { flex:1; } .dl { font-style:normal; font-weight:500; font-size:.72em; min-width:4.6em; text-align:right; color:var(--fp-muted); white-space:nowrap; flex:none; } .dl.first { color:var(--fp-ok); } .pr small { font-size:.7em; color:var(--fp-muted); margin-left:.1em; }
      .tr { display:flex; } .tr.up { color:var(--fp-hi); } .tr.down { color:var(--fp-ok); } .tr.flat { color:var(--fp-muted); }
      .row.na { opacity:.5; } .empty { text-align:center; color:var(--fp-muted); padding:1.2em; font-size:.9em; }
      @container (max-width: 300px) { .tr { display:none; } .row { grid-template-columns:1.6em minmax(0,1fr) auto; } }
    </style>
    <ha-card class="${dark ? "dark" : "light"}" style="${gvStyle(this._config, dark)}">
      <div class="hd"><span class="t">${esc(c.title)}</span><span class="f">${esc(c.fuel)}</span></div>
      ${summary}
      ${list || off ? `<div class="list glass">${list}${off}</div>` : `<div class="empty">Ajoute des stations dans l'éditeur.</div>`}
    </ha-card>`;
    this.shadowRoot.querySelectorAll("[data-more]").forEach((el) => el.addEventListener("click", () => this._more(el.dataset.more)));
  }
}

/* ---------- Éditeur visuel ---------- */
const LABELS = { ...GV_LABELS, title: "Titre", fuel: "Carburant (affiché à droite)", theme: "Thème", tank_liters: "Taille du plein (L)", show_trend: "Tendance sur 7 jours", show_tank: "Afficher le prix du plein", show_summary: "Afficher le résumé",
  max_rows: "Nombre de stations affichées (0 = toutes)", entity: "Capteur de prix", name: "Nom de la station (facultatif)" };
const MAIN = [
  { type: "grid", name: "", schema: [{ name: "title", selector: { text: {} } }, { name: "fuel", selector: { text: {} } }] },
  { type: "grid", name: "", schema: [
    { name: "theme", selector: { select: { mode: "dropdown", options: [{ value: "auto", label: "Automatique" }, { value: "light", label: "Clair" }, { value: "dark", label: "Sombre" }] } } }, ...GV_FIELDS,
    { name: "tank_liters", selector: { number: { min: 0, max: 200, mode: "box" } } } ] },
  { type: "grid", name: "", schema: [{ name: "show_summary", selector: { boolean: {} } }, { name: "show_trend", selector: { boolean: {} } }, { name: "show_tank", selector: { boolean: {} } }] },
  { name: "max_rows", selector: { number: { min: 0, max: 50, mode: "box" } } },
];
const ST = [{ name: "entity", selector: { entity: { domain: "sensor" } } }, { name: "name", selector: { text: {} } }];

class FuelPriceCardEditor extends HTMLElement {
  setConfig(config) {
    const next = { ...DEFAULTS, ...config, stations: (config.stations || []).map((s) => ({ ...s })) };
    const same = this._config && this._built && next.stations.length === this._config.stations.length;
    this._config = next;
    if (!same) return this._build();
    this._forms.forEach((f) => { f.el.data = f.get(this._config); });
  }
  set hass(h) { this._hass = h; (this._forms || []).forEach((f) => (f.el.hass = h)); }
  _emit() { this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true })); }
  _form(schema, get, set, parent) {
    const el = document.createElement("ha-form");
    el.hass = this._hass; el.data = get(this._config); el.schema = schema; el.computeLabel = (s) => LABELS[s.name] || s.name;
    el.addEventListener("value-changed", (ev) => { ev.stopPropagation(); set(this._config, ev.detail.value); this._emit(); });
    this._forms.push({ el, get }); parent.appendChild(el);
  }
  _build() {
    this._built = true; this._forms = []; this.innerHTML = "";
    const st = document.createElement("style");
    st.textContent = `.bx{border:1px solid var(--divider-color);border-radius:12px;padding:10px;margin:10px 0}.h{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-weight:600}
      button{cursor:pointer;border:1px solid var(--divider-color);background:var(--secondary-background-color);color:var(--primary-text-color);border-radius:8px;padding:6px 10px}.add{width:100%;margin:4px 0}`;
    this.appendChild(st);
    this._form(MAIN, (c) => c, (c, v) => { const keep = c.stations; Object.assign(c, v); c.stations = keep; }, this);
    const t = document.createElement("h3"); t.textContent = "Stations"; this.appendChild(t);
    this._config.stations.forEach((s, i) => {
      const box = document.createElement("div"); box.className = "bx";
      box.innerHTML = `<div class="h"><span>Station ${i + 1}</span><span><button data-a="up" data-i="${i}">↑</button> <button data-a="down" data-i="${i}">↓</button> <button data-a="del" data-i="${i}">✕</button></span></div>`;
      this._form(ST, (c) => c.stations[i], (c, v) => { c.stations[i] = { ...v }; }, box); this.appendChild(box);
    });
    const add = document.createElement("button"); add.className = "add"; add.textContent = "+ Ajouter une station"; add.dataset.a = "add"; this.appendChild(add);
    this.querySelectorAll("button[data-a]").forEach((b) => b.addEventListener("click", () => this._click(b)));
  }
  _click(b) {
    const d = b.dataset, arr = this._config.stations, i = Number(d.i);
    if (d.a === "add") arr.push({ entity: "" });
    else if (d.a === "del") arr.splice(i, 1);
    else { const j = i + (d.a === "up" ? -1 : 1); if (j >= 0 && j < arr.length) [arr[i], arr[j]] = [arr[j], arr[i]]; }
    this._emit(); this._build();
  }
}

customElements.define("fuel-price-card", FuelPriceCard);
customElements.define("fuel-price-card-editor", FuelPriceCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({ type: "fuel-price-card", name: "Fuel Price Card (FR)", description: "Comparateur de prix de carburant : classement, écart, tendance 7 jours, économie sur un plein.", preview: true });
console.info(`%c FUEL-PRICE-CARD %c v${CARD_VERSION} `, "color:#fff;background:#d68a00;font-weight:700;border-radius:3px 0 0 3px;padding:2px 4px", "color:#d68a00;background:#fff;font-weight:700;border-radius:0 3px 3px 0;padding:2px 4px");
}
