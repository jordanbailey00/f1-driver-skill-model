// Command palette: Ctrl/Cmd+K or "/" to jump to any driver or page. Also used as the driver
// picker on the head-to-head and network pages (openPicker).
import { DB } from "./data.js";
import { el } from "./dom.js";
import { norm, pct, yrs } from "./format.js";
import { navigate } from "./router.js";

const PAGES = [
  ["/", "Home", "Overview and top ten"],
  ["/rankings", "Rankings", "Every driver since 1990, rated"],
  ["/timeline", "Timeline", "Every career on one scale"],
  ["/seasons", "Seasons", "Teammate battles, year by year"],
  ["/compare", "Head to head", "Put any two drivers in the same car"],
  ["/network", "Network", "The web of teammates behind the rating"],
  ["/method", "Method", "How the rating is built"],
  ["/validation", "Does it work?", "Tested on seasons it had never seen"],
];

let dlg, input, list, titleEl;
let items = [];
let active = 0;
let mode = "go";
let onPick = null;
let exclude = null;
let lastFocus = null;

export function initPalette() {
  dlg = document.getElementById("palette");
  input = document.getElementById("pal-q");
  list = document.getElementById("pal-list");
  titleEl = document.getElementById("pal-title");
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const kbd = document.getElementById("search-kbd");
  if (kbd) kbd.textContent = mac ? "⌘K" : "Ctrl K";
  document.getElementById("search-btn").addEventListener("click", () => openPalette());
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); dlg.open ? close() : openPalette(); }
    else if (e.key === "/" && !typing && !dlg.open) { e.preventDefault(); openPalette(); }
  });
  input.addEventListener("input", () => { active = 0; renderList(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "PageDown") { e.preventDefault(); move(8); }
    else if (e.key === "PageUp") { e.preventDefault(); move(-8); }
    else if (e.key === "Enter") { e.preventDefault(); choose(items[active]); }
  });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener("close", () => { onPick = null; lastFocus?.focus?.({ preventScroll: true }); });
}

export function openPalette() {
  mode = "go"; onPick = null; exclude = null;
  titleEl.hidden = true;
  input.placeholder = "Search drivers and pages";
  show();
}

// Pick a driver: calls fn(driver) and closes.
export function openPicker(title, fn, { exclude: ex = null } = {}) {
  mode = "pick"; onPick = fn; exclude = ex;
  titleEl.textContent = title;
  titleEl.hidden = false;
  input.placeholder = "Type a driver's name";
  show();
}

function show() {
  lastFocus = document.activeElement;
  input.value = "";
  active = 0;
  renderList();
  dlg.showModal();
  input.focus();
}
function close() { if (dlg.open) dlg.close(); }

function score(d, q) {
  const n = norm(d.name), ln = norm(d.last_name || ""), ab = (d.abbr || "").toLowerCase();
  if (ab === q) return 0;
  if (n.startsWith(q)) return 1;
  if (ln.startsWith(q)) return 2;
  if (n.split(/[\s-]+/).some((w) => w.startsWith(q))) return 3;
  if (n.includes(q)) return 4;
  return -1;
}

function renderList() {
  const q = norm(input.value.trim());
  items = [];
  const pool = DB.drivers.filter((d) => !exclude || d.id !== exclude);
  let drivers;
  if (!q) {
    drivers = DB.ranked.filter((d) => !exclude || d.id !== exclude).slice(0, mode === "go" ? 8 : 12);
  } else {
    drivers = pool.map((d) => [d, score(d, q)]).filter(([, s]) => s >= 0)
      .sort((a, b) => a[1] - b[1] || (a[0].rank ?? 999) - (b[0].rank ?? 999))
      .slice(0, 40).map(([d]) => d);
  }
  const pages = mode === "go" ? PAGES.filter(([, t, s]) => !q || norm(t).includes(q) || norm(s).includes(q)) : [];
  list.replaceChildren();
  const groups = [];
  if (mode === "go" && !q) groups.push(["Pages", pages.map((p) => ({ type: "page", p }))], ["Top drivers", drivers.map((d) => ({ type: "driver", d }))]);
  else groups.push(["Drivers", drivers.map((d) => ({ type: "driver", d }))], ["Pages", pages.map((p) => ({ type: "page", p }))]);
  for (const [label, rows] of groups) {
    if (!rows.length) continue;
    list.append(el("li", { class: "pal-group", role: "presentation", text: label }));
    for (const it of rows) {
      const i = items.length;
      items.push(it);
      const li = it.type === "driver"
        ? el("li", { class: "pal-opt", role: "option", id: "pal-o" + i },
            el("span", { class: "p-pos", text: it.d.rank != null ? "P" + it.d.rank : "–" }),
            el("span", { class: "p-name" }, it.d.name, el("small", { text: yrs(it.d) })),
            el("span", { class: "p-val", text: it.d.rank != null ? pct(it.d.rating) : "not ranked" }))
        : el("li", { class: "pal-opt", role: "option", id: "pal-o" + i },
            el("span", { class: "p-pos", text: "→" }),
            el("span", { class: "p-name" }, it.p[1], el("small", { text: it.p[2] })),
            el("span", { class: "p-val", text: "" }));
      li.addEventListener("pointermove", () => { if (active !== i) { active = i; mark(); } });
      li.addEventListener("click", () => choose(it));
      list.append(li);
    }
  }
  if (!items.length) list.append(el("li", { class: "pal-empty", text: "No driver or page matches “" + input.value.trim() + "”." }));
  mark();
}

function mark() {
  list.querySelectorAll(".pal-opt").forEach((li) => li.setAttribute("aria-selected", String(li.id === "pal-o" + active)));
  const cur = document.getElementById("pal-o" + active);
  if (cur) { input.setAttribute("aria-activedescendant", cur.id); cur.scrollIntoView({ block: "nearest" }); }
  else input.removeAttribute("aria-activedescendant");
}
function move(k) {
  if (!items.length) return;
  active = Math.max(0, Math.min(items.length - 1, active + k));
  mark();
}
function choose(it) {
  if (!it) return;
  const fn = onPick;
  close();
  if (it.type === "page") navigate(it.p[0]);
  else if (mode === "pick" && fn) fn(it.d);
  else navigate("/driver/" + it.d.id);
}
