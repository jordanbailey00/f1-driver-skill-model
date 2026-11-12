import * as d3 from "d3";
import { DB, isRising } from "../lib/data.js";
import { el, icon, nextLink, setTitle } from "../lib/dom.js";
import { MINUS, Z90, fmtInt, norm, pct, ratio, secs, secsSigned, sgn, span } from "../lib/format.js";
import { navigate, setQuery } from "../lib/router.js";
import { hideTip, showTip } from "../lib/tooltip.js";

export const ERAS = [["all", "All eras", 0, 9999], ["1990s", "1990s", 1990, 1999], ["2000s", "2000s", 2000, 2009],
  ["2010s", "2010s", 2010, 2019], ["2020s", "2020s", 2020, 2026]];
const METRICS = {
  rating: { label: "Rating", col: "Rating", v: (d) => d.rating, se: (d) => d.se, rank: (d) => d.rank, dom: [-1.5, 1.0], step: 0.5,
    blurb: "Overall: one-lap pace plus the race-day adjustment." },
  pace: { label: "One-lap pace", col: "Pace", v: (d) => d.pace, se: (d) => d.pace_se, rank: (d) => d.rank_pace, dom: [-1.5, 1.0], step: 0.5,
    blurb: "Qualifying speed alone: who'd be quicker over one lap in the same car." },
  race: { label: "Race day", col: "Race day", v: (d) => d.race, se: (d) => d.race_se, rank: (d) => d.rank_race, dom: [-0.2, 0.2], step: 0.1,
    blurb: "How much better (or worse) a driver races than their qualifying pace suggests. Small, and uncertain for most drivers." },
};

export function eraVisible(d, era) {
  const e = ERAS.find((x) => x[0] === era) || ERAS[0];
  return !(d.last < e[2] || d.first > e[3]);
}

export default {
  mount(root, _params, query) {
    setTitle("Rankings");
    const state = {
      era: ERAS.some((e) => e[0] === query.get("era")) ? query.get("era") : "all",
      min: [1, 20, 50, 100].includes(+query.get("min")) ? +query.get("min") : 20,
      champs: query.get("champs") === "1",
      q: query.get("q") || "",
      metric: METRICS[query.get("by")] ? query.get("by") : "rating",
    };
    const M = () => METRICS[state.metric];

    const search = el("input", { class: "input", type: "search", placeholder: "Find a driver", value: state.q, "aria-label": "Find a driver", autocomplete: "off" });
    const eraSeg = el("div", { class: "seg", role: "group", "aria-label": "Raced in" });
    const metricSeg = el("div", { class: "seg", role: "group", "aria-label": "Rate by" });
    const minSel = el("select", { class: "input", "aria-label": "Minimum qualifying duels" },
      [[1, "Any number of duels"], [20, "20+ qualifying duels"], [50, "50+ qualifying duels"], [100, "100+ qualifying duels"]]
        .map(([v, t]) => el("option", { value: String(v), text: t, selected: v === state.min })));
    const champ = el("input", { type: "checkbox", checked: state.champs });
    const count = el("span", { class: "count", "aria-live": "polite" });
    const blurb = el("p", { class: "caption" });
    const plotHead = el("th", { class: "c-plot", scope: "col" }, el("span", { class: "sr-only", text: "Value with 90% range" }));
    const valHead = el("th", { class: "c-num", scope: "col" });
    const tbody = el("tbody");
    const table = el("table", { class: "rank", "aria-label": "Driver ranking" },
      el("thead", {}, el("tr", {},
        el("th", { class: "c-pos", scope: "col", text: "Pos" }),
        el("th", { class: "c-drv", scope: "col", text: "Driver" }),
        el("th", { class: "c-yrs", scope: "col", text: "Seasons" }),
        valHead,
        el("th", { class: "c-num c-sec", scope: "col", text: "Per lap" }),
        el("th", { class: "c-num c-ratio", scope: "col", text: "Ratio" }),
        plotHead)),
      tbody);

    const view = el("div", { class: "container view" },
      el("header", { class: "view-head" },
        el("p", { class: "eyebrow", text: "The ratio" }),
        el("h1", { text: "Driver rankings" }),
        el("p", { class: "lede" },
          "How much quicker each driver would be than an average F1 driver of 1990–2026 ",
          el("strong", { text: "if both drove the identical car" }),
          ", as a share of lap time. +0.50% is about " + secs(0.5) + " on a 90-second lap. The equal-car ratio is the same number as a ratio of lap times: 0.9950 means needing 99.50% of the average driver's time.")),
      el("section", { class: "card table-card" },
        el("div", { class: "toolbar" },
          el("label", { class: "search-field" }, icon("search"), search),
          metricSeg, eraSeg,
          minSel,
          el("label", { class: "check" }, champ, "Champions only"),
          count),
        el("div", { class: "legend" },
          el("span", { class: "k" }, el("i", { class: "dot", style: { background: "var(--accent)" } }), "Estimate"),
          el("span", { class: "k" }, el("i", { class: "bar", style: { background: "var(--accent-soft)" } }), "90% range"),
          el("span", { class: "k" }, el("i", { class: "ring" }), "Early career (includes expected improvement)"),
          el("span", { class: "k" }, el("span", { class: "star", text: "WC" }), "World titles"),
          blurb),
        table),
      nextLink("/timeline", "Next · Across eras", "Career timeline", "Every career drawn at its rating, so drivers decades apart sit on the same scale."));
    root.append(view);

    function visible(d) {
      if (d.rank == null) return false;
      if (!eraVisible(d, state.era)) return false;
      if (state.champs && !d.titles) return false;
      if (state.q) return norm(d.name).includes(norm(state.q)) || (d.abbr || "").toLowerCase() === norm(state.q);
      return d.n_quali >= state.min;
    }

    function syncUrl() {
      setQuery({ era: state.era === "all" ? null : state.era, min: state.min === 20 ? null : state.min,
        champs: state.champs ? "1" : null, q: state.q || null, by: state.metric === "rating" ? null : state.metric });
    }

    function renderSegs() {
      eraSeg.replaceChildren(...ERAS.map(([k, label]) => el("button", { type: "button", "aria-pressed": String(state.era === k), text: label,
        onclick: () => { state.era = k; renderSegs(); renderRows(); syncUrl(); } })));
      metricSeg.replaceChildren(...Object.entries(METRICS).map(([k, m]) => el("button", { type: "button", "aria-pressed": String(state.metric === k), text: m.label,
        onclick: () => { state.metric = k; renderSegs(); renderRows(); syncUrl(); } })));
      valHead.textContent = M().col;
      blurb.textContent = M().blurb;
      table.classList.toggle("metric-race", state.metric === "race");
    }

    function renderRows() {
      const m = M();
      const rows = DB.ranked.filter(visible).sort((a, b) => m.v(b) - m.v(a));
      count.textContent = fmtInt(rows.length) + " of " + fmtInt(DB.N) + " drivers";
      const cs = getComputedStyle(plotHead);
      const w = Math.max(60, Math.floor(plotHead.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));
      const x = d3.scaleLinear(m.dom, [6, w - 6]).clamp(true);
      plotHead.querySelector("svg")?.remove();
      const hs = d3.select(plotHead).append("svg").attr("width", w).attr("height", 16).attr("aria-hidden", "true").style("display", "block");
      // "avg" first, then whole numbers, then halves; skip any tick too close to one already drawn
      const all = d3.range(m.dom[0], m.dom[1] + 1e-9, m.step).map((t) => Math.round(t * 100) / 100);
      const order = all.slice().sort((a, b) => (Math.abs(a) < 1e-9 ? -1 : 0) - (Math.abs(b) < 1e-9 ? -1 : 0) || (Number.isInteger(b / (m.step * 2)) - Number.isInteger(a / (m.step * 2))));
      const shown = [];
      for (const t of order) if (shown.every((u) => Math.abs(x(u) - x(t)) >= 34)) shown.push(t);
      for (const t of shown) {
        const edge = x(t) < 14 ? "start" : x(t) > w - 14 ? "end" : "middle";
        hs.append("text").attr("x", x(t)).attr("y", 11).attr("text-anchor", edge)
          .text(Math.abs(t) < 1e-9 ? "avg" : (t > 0 ? "+" : MINUS) + Math.abs(t));
      }
      if (!rows.length) {
        tbody.replaceChildren(el("tr", { class: "empty-row" }, el("td", { colspan: "7", text: "No drivers match. Clear the search or loosen the filters." })));
        return;
      }
      const frag = document.createDocumentFragment();
      for (const d of rows) {
        const v = m.v(d), se = m.se(d), lo = v - Z90 * se, hi = v + Z90 * se;
        const href = "/driver/" + d.id;
        const tr = el("tr", { tabindex: "0", "aria-label": d.name + ", " + pct(v) });
        tr.addEventListener("click", (e) => { if (!e.target.closest("a")) navigate(href); });
        tr.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); navigate(href); } });
        const plot = el("td", { class: "c-plot" });
        tr.append(
          el("td", { class: "c-pos", text: String(m.rank(d)) }),
          el("td", { class: "c-drv" }, el("span", { class: "drv" },
            el("span", { class: "code", text: d.abbr || "" }),
            el("a", { href, tabindex: "-1" }, el("span", { class: "nm-full", text: d.name }),
              el("span", { class: "nm-short", text: (d.first_name ? d.first_name[0] + ". " : "") + (d.last_name || d.name) })),
            d.titles ? el("span", { class: "wc", title: d.titles + "× world champion", text: d.titles + "× WC" }) : null)),
          el("td", { class: "c-yrs", text: span(d.first, d.last) }),
          el("td", { class: "c-num", text: sgn(v) }),
          el("td", { class: "c-num dim c-sec", text: secsSigned(v) }),
          el("td", { class: "c-num dim c-ratio", text: state.metric === "race" ? "–" : ratio(v) }),
          plot);
        const svg = d3.select(plot).append("svg").attr("width", w).attr("height", 22).attr("aria-hidden", "true").style("display", "block");
        svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", 22).style("stroke", "var(--axis)");
        svg.append("line").attr("x1", x(lo)).attr("x2", x(hi)).attr("y1", 11).attr("y2", 11)
          .style("stroke", "var(--accent-soft)").attr("stroke-width", 3).attr("stroke-linecap", "round");
        const rising = isRising(d);
        svg.append("circle").attr("cx", x(v)).attr("cy", 11).attr("r", 4.8)
          .style("fill", rising ? "var(--surface)" : "var(--accent)").style("stroke", rising ? "var(--accent)" : "var(--surface)").attr("stroke-width", 2);
        plot.addEventListener("pointermove", (e) => showTip(e, d.name, [
          { v: pct(v), k: m.label.toLowerCase() + " · P" + m.rank(d) },
          { v: pct(lo) + " to " + pct(hi), k: "90% range" },
          ...(state.metric !== "race" ? [{ v: ratio(v), k: "equal-car ratio" }] : []),
          { v: fmtInt(d.n_quali), k: "qualifying duels" }], { hint: rising ? "Early career: includes the improvement rookies usually make" : null }));
        plot.addEventListener("pointerleave", hideTip);
        frag.append(tr);
      }
      tbody.replaceChildren(frag);
    }

    let t = 0;
    search.addEventListener("input", () => {
      state.q = search.value.trim();
      clearTimeout(t);
      t = setTimeout(syncUrl, 300);
      renderRows();
    });
    minSel.addEventListener("change", () => { state.min = +minSel.value; renderRows(); syncUrl(); });
    champ.addEventListener("change", () => { state.champs = champ.checked; renderRows(); syncUrl(); });

    renderSegs();
    renderRows();
    let lastW = plotHead.clientWidth, raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { if (plotHead.clientWidth !== lastW) { lastW = plotHead.clientWidth; renderRows(); } });
    });
    ro.observe(table);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); clearTimeout(t); };
  },
};
