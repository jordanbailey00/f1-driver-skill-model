// History-API router. Every view module exports mount(root, params, query) and returns a
// cleanup function. Same-origin <a href="/..."> clicks are routed here.
import { hideTip } from "./tooltip.js";

const ROUTES = [
  [/^\/$/, "home", []],
  [/^\/rankings\/?$/, "rankings", []],
  [/^\/driver\/([^/]+)\/?$/, "driver", ["id"]],
  [/^\/compare(?:\/([^/]+)\/([^/]+))?\/?$/, "compare", ["a", "b"]],
  [/^\/timeline\/?$/, "timeline", []],
  [/^\/seasons(?:\/(\d{4}))?\/?$/, "seasons", ["year"]],
  [/^\/network\/?$/, "network", []],
  [/^\/method\/?$/, "method", []],
  [/^\/validation\/?$/, "validation", []],
];

let views = {};
let main = null;
let cleanup = null;
let currentKey = null;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function match(pathname) {
  for (const [re, view, keys] of ROUTES) {
    const m = pathname.match(re);
    if (m) {
      const params = {};
      keys.forEach((k, i) => { if (m[i + 1] != null) params[k] = decodeURIComponent(m[i + 1]); });
      return { view, params };
    }
  }
  return { view: "notfound", params: {} };
}

function saveScroll() {
  try { history.replaceState({ ...(history.state || {}), scroll: window.scrollY }, ""); } catch (e) { /* ignore */ }
}

export function navigate(url, { replace = false, keepScroll = false } = {}) {
  const u = new URL(url, location.href);
  const next = u.pathname + u.search + u.hash;
  if (next === location.pathname + location.search + location.hash) {
    if (!keepScroll) window.scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" });
    return;
  }
  if (!replace) saveScroll();
  history[replace ? "replaceState" : "pushState"]({ scroll: 0 }, "", next);
  render({ scroll: keepScroll ? null : u.hash ? "hash" : 0 });
}

// Update the query string without re-rendering (filters, toggles).
export function setQuery(params) {
  const u = new URL(location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "" || v === false) u.searchParams.delete(k);
    else u.searchParams.set(k, v);
  }
  history.replaceState(history.state, "", u.pathname + u.search + u.hash);
}

function setNav(view) {
  for (const a of document.querySelectorAll("#nav a")) {
    if (a.dataset.view === view) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  const cur = document.querySelector('#nav a[aria-current="page"]');
  if (cur) {
    const nav = document.getElementById("nav");
    if (nav.scrollWidth > nav.clientWidth) {
      nav.scrollTo({ left: cur.offsetLeft - nav.clientWidth / 2 + cur.clientWidth / 2, behavior: "auto" });
    }
  }
}

function render({ scroll = 0 } = {}) {
  const { view, params } = match(location.pathname);
  const key = location.pathname + location.search;
  const sameView = currentKey && currentKey.split("?")[0] === location.pathname;
  const swap = () => {
    hideTip();
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    main.replaceChildren();
    setNav(view === "driver" ? "rankings" : view);
    const mod = views[view] || views.notfound;
    cleanup = mod.mount(main, params, new URLSearchParams(location.search)) || null;
    currentKey = key;
    if (scroll === "hash") {
      document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
    } else if (typeof scroll === "number") {
      window.scrollTo(0, scroll);
    }
  };
  const animate = document.startViewTransition && !reduceMotion.matches && !sameView && currentKey != null &&
    document.visibilityState === "visible";
  if (!animate) { swap(); return; }
  // The cross-fade waits for a rendered frame; if frames are throttled (hidden or embedded
  // views), skip the animation so the new page still appears.
  let ran = false;
  const vt = document.startViewTransition(() => { ran = true; swap(); });
  setTimeout(() => { if (!ran) vt.skipTransition(); }, 250);
}

export function initRouter(viewModules, mainEl) {
  views = viewModules;
  main = mainEl;
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href]");
    if (!a || a.target || a.hasAttribute("download") || a.hasAttribute("data-external")) return;
    if (a.origin !== location.origin) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#")) return;
    e.preventDefault();
    navigate(a.href);
  });
  window.addEventListener("popstate", (e) => render({ scroll: e.state?.scroll ?? 0 }));
  render({ scroll: location.hash ? "hash" : 0 });
}
