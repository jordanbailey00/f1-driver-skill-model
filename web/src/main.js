import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/saira-condensed/600.css";
import "@fontsource/saira-condensed/700.css";
import "@fontsource/saira-condensed/800.css";
import "./styles.css";

import { DB, loadData } from "./lib/data.js";
import { el } from "./lib/dom.js";
import { fmtInt } from "./lib/format.js";
import { initPalette } from "./lib/palette.js";
import { initRouter } from "./lib/router.js";
import { initTheme } from "./lib/theme.js";
import { initTooltip } from "./lib/tooltip.js";

import home from "./views/home.js";
import rankings from "./views/rankings.js";
import driver from "./views/driver.js";
import compare from "./views/compare.js";
import timeline from "./views/timeline.js";
import seasons from "./views/seasons.js";
import network from "./views/network.js";
import method from "./views/method.js";
import validation from "./views/validation.js";
import notfound from "./views/notfound.js";

const VIEWS = { home, rankings, driver, compare, timeline, seasons, network, method, validation, notfound };

// Keep --header-h in step with the real header (it wraps onto two rows on phones).
function trackHeader() {
  const h = document.getElementById("site-header");
  const set = () => document.documentElement.style.setProperty("--header-h", h.offsetHeight + "px");
  new ResizeObserver(set).observe(h);
  set();
}

function footer() {
  const M = DB.meta;
  document.getElementById("foot-data").replaceChildren(
    "Results from ",
    el("a", { href: "https://github.com/f1db/f1db", "data-external": "", rel: "noopener", text: "F1DB" }),
    " (CC BY 4.0), " + M.data_release.replace(/^F1DB /, "release ") + ". " +
    fmtInt(M.n_quali) + " qualifying and " + fmtInt(M.n_race) + " race duels between teammates since 1977.");
}

async function boot() {
  trackHeader();
  initTheme();
  initTooltip();
  const main = document.getElementById("main");
  try {
    await loadData();
  } catch (err) {
    console.error(err);
    main.replaceChildren(el("div", { class: "container boot" },
      el("p", { text: "The ratings didn't load. Check your connection and reload the page." }),
      el("button", { class: "btn btn-ghost", type: "button", onclick: () => location.reload(), text: "Reload" })));
    return;
  }
  footer();
  initPalette();
  initRouter(VIEWS, main);
}

boot();
