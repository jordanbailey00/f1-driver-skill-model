import * as d3 from "d3";
import { DB } from "../lib/data.js";
import { el, icon, nextLink, setTitle } from "../lib/dom.js";
import { MINUS, fmtInt, lastName, norm, pct, sgn, yrs } from "../lib/format.js";
import { bottomAxis, hGrid, leftAxis, makeSvg, observeWidth, tapToGo, yearTicks } from "../lib/chart.js";
import { setQuery } from "../lib/router.js";
import { hideTip, showTip } from "../lib/tooltip.js";
import { ERAS, eraVisible } from "./rankings.js";

function runsOf(d) {
  const out = [];
  let a = null, b = null;
  for (const s of d.seasons) {
    if (a == null) { a = b = s.y; continue; }
    if (s.y === b + 1) b = s.y; else { out.push([a, b]); a = b = s.y; }
  }
  if (a != null) out.push([a, b]);
  return out;
}

export default {
  mount(root, _params, query) {
    setTitle("Career timeline");
    const state = {
      era: ERAS.some((e) => e[0] === query.get("era")) ? query.get("era") : "all",
      min: [1, 20, 50, 100].includes(+query.get("min")) ? +query.get("min") : 20,
      champs: query.get("champs") === "1",
      mode: query.get("mode") === "seasons" ? "seasons" : "career",
      q: query.get("q") || "",
    };
    const eraSeg = el("div", { class: "seg", role: "group", "aria-label": "Raced in" });
    const modeSeg = el("div", { class: "seg", role: "group", "aria-label": "Show" });
    const minSel = el("select", { class: "input", "aria-label": "Minimum qualifying duels" },
      [[1, "Any number of duels"], [20, "20+ qualifying duels"], [50, "50+ qualifying duels"], [100, "100+ qualifying duels"]]
        .map(([v, t]) => el("option", { value: String(v), text: t, selected: v === state.min })));
    const champ = el("input", { type: "checkbox", checked: state.champs });
    const search = el("input", { class: "input", type: "search", placeholder: "Highlight a driver", value: state.q, "aria-label": "Highlight a driver", autocomplete: "off" });
    const count = el("span", { class: "count", "aria-live": "polite" });
    const host = el("div", { class: "chart" });
    const caption = el("p", { class: "caption" });

    const view = el("div", { class: "container view" },
      el("header", { class: "view-head" },
        el("p", { class: "eyebrow", text: "Across eras" }),
        el("h1", { text: "Every career on one scale" }),
        el("p", { class: "lede" },
          "Each line spans the seasons a driver raced, drawn at their career rating. ",
          el("strong", { text: "Drivers from 1991 and 2024 sit on the same scale" }),
          " because thousands of overlapping teammate pairings link them. Switch to season by season to see each career's shape.")),
      el("section", { class: "card" },
        el("div", { class: "toolbar" },
          modeSeg, eraSeg, minSel,
          el("label", { class: "check" }, champ, "Champions only"),
          el("label", { class: "search-field" }, icon("search"), search),
          count),
        el("div", { class: "legend" },
          el("span", { class: "k" }, el("i", { class: "line", style: { background: "var(--accent)" } }), "World champion"),
          el("span", { class: "k" }, el("i", { class: "line", style: { background: "var(--de-emph)" } }), "Other drivers"),
          el("span", { class: "k" }, el("i", { class: "line", style: { background: "var(--accent-2)", height: "3px" } }), "Highlighted")),
        host,
        caption),
      nextLink("/seasons", "Next · Year by year", "Seasons", "Pick a year and see every team's teammate battle on the same scale."));
    root.append(view);

    const visible = (d) => d.rank != null && eraVisible(d, state.era) && (!state.champs || d.titles) && d.n_quali >= state.min;
    const highlighted = (d) => state.q && (norm(d.name).includes(norm(state.q)) || (d.abbr || "").toLowerCase() === norm(state.q));

    function sync() {
      setQuery({ era: state.era === "all" ? null : state.era, min: state.min === 20 ? null : state.min,
        champs: state.champs ? "1" : null, mode: state.mode === "career" ? null : state.mode, q: state.q || null });
    }
    function renderSegs() {
      eraSeg.replaceChildren(...ERAS.map(([k, label]) => el("button", { type: "button", "aria-pressed": String(state.era === k), text: label,
        onclick: () => { state.era = k; renderSegs(); chart.redraw(); sync(); } })));
      modeSeg.replaceChildren(...[["career", "Career rating"], ["seasons", "Season by season"]].map(([k, label]) => el("button", { type: "button", "aria-pressed": String(state.mode === k), text: label,
        onclick: () => { state.mode = k; renderSegs(); chart.redraw(); sync(); } })));
      caption.textContent = state.mode === "career"
        ? "Lines sit at each driver's career rating. Hover for the driver, click to open their page. Careers that began before 1990 are drawn in full: the data goes back to 1977."
        : "Each dot is the level a driver delivered in one season, rookie and age effects included. Hover a line for the driver, click to open their page.";
    }

    const chart = observeWidth(host, (w) => {
      const narrow = w < 640;
      const rows = DB.ranked.filter(visible);
      count.textContent = fmtInt(rows.length) + " drivers";
      const hl = rows.filter(highlighted);
      const career = state.mode === "career";
      const h = narrow ? 500 : 640;
      const m = { t: 16, r: narrow ? 72 : 132, b: 30, l: 48 };
      const x = d3.scaleLinear([1977, 2027], [m.l, w - m.r]);
      const vals = career ? rows.map((d) => d.rating) : rows.flatMap((d) => d.seasons.map((s) => s.v));
      const y = d3.scaleLinear([Math.min(-1.0, d3.min(vals) ?? -1), Math.max(0.7, d3.max(vals) ?? 0.7)], [h - m.b, m.t]).nice();
      const svg = makeSvg(host, w, h, career ? "Career spans of drivers plotted at their ratings, 1977 to 2026" : "Season-by-season levels of every driver, 1977 to 2026");
      const yt = y.ticks(8);
      hGrid(svg, y, yt, m.l, w - m.r);
      leftAxis(svg, y, yt, (v) => (Math.abs(v) < 1e-9 ? "avg" : (v > 0 ? "+" : MINUS) + Math.abs(v).toFixed(1) + "%"), m.l);
      bottomAxis(svg, x, yearTicks(x, w - m.l - m.r, 56), d3.format("d"), h - m.b);
      svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).style("stroke", "var(--axis)");
      svg.append("text").attr("x", w - m.r + 6).attr("y", y(0) + 4).attr("class", "lbl-m").text("average");
      svg.append("line").attr("x1", x(1990)).attr("x2", x(1990)).attr("y1", m.t).attr("y2", h - m.b).style("stroke", "var(--axis)").attr("stroke-dasharray", "3 4");
      svg.append("text").attr("x", x(1990) + 6).attr("y", h - m.b - 8).attr("class", "lbl-m").text(narrow ? "1990" : "1990: the ranking starts here");
      const color = (d) => (highlighted(d) ? "var(--accent-2)" : d.titles ? "var(--accent)" : "var(--de-emph)");
      const order = (d) => (highlighted(d) ? 2 : d.titles ? 1 : 0);
      const g = svg.append("g");
      const hover = svg.append("g").attr("pointer-events", "none");
      let target = null;

      if (career) {
        const segs = [];
        for (const d of rows) for (const [a, b] of runsOf(d)) segs.push({ d, a, b });
        segs.sort((p, q) => order(p.d) - order(q.d));
        g.selectAll("line").data(segs).join("line")
          .attr("x1", (s) => x(s.a) + 1).attr("x2", (s) => x(s.b + 1) - 1)
          .attr("y1", (s) => y(s.d.rating)).attr("y2", (s) => y(s.d.rating))
          .style("stroke", (s) => color(s.d)).attr("stroke-width", (s) => (highlighted(s.d) ? 4 : s.d.titles ? 2.6 : 2))
          .attr("stroke-linecap", "round");
        // labels: highlighted first, then the best rated and champions, skipping collisions
        const placed = [];
        const champs = rows.filter((d) => d.titles).sort((a, b) => b.titles - a.titles || b.rating - a.rating);
        const cands = [...hl, ...champs.slice(0, narrow ? 10 : 99), ...rows.slice(0, narrow ? 6 : 24)];
        const seen = new Set();
        const lab = svg.append("g");
        for (const d of cands) {
          if (seen.has(d.id)) continue;
          seen.add(d.id);
          const rr = runsOf(d);
          const endX = x(rr[rr.length - 1][1] + 1) + 6;
          const txt = narrow ? lastName(d) : lastName(d) + " " + sgn(d.rating);
          const wEst = txt.length * 6.3;
          const x0 = Math.min(endX, w - wEst - 2);
          let spot = null;
          for (const dy of [0, -9, 9, -16, 16]) {
            const yy = y(d.rating) + 4 + dy;
            const box = { x0, x1: x0 + wEst, y0: yy - 10, y1: yy + 2 };
            if (!placed.some((b) => !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1))) { spot = { box, yy }; break; }
          }
          if (!spot && !highlighted(d)) continue;
          if (!spot) spot = { box: { x0, x1: x0 + wEst, y0: y(d.rating) - 6, y1: y(d.rating) + 6 }, yy: y(d.rating) + 4 };
          placed.push(spot.box);
          lab.append("text").attr("x", x0).attr("y", spot.yy)
            .attr("class", highlighted(d) ? "lbl-b halo" : d.titles ? "lbl halo" : "lbl-2 halo").text(txt);
        }
        const hlLine = hover.append("line").style("stroke", "var(--ink)").attr("stroke-width", 4).attr("stroke-linecap", "round").attr("visibility", "hidden");
        svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", w - m.l - m.r).attr("height", h - m.t - m.b).attr("class", "hit")
          .on("pointermove", (e) => {
            const [px, py] = d3.pointer(e);
            const yr = x.invert(px);
            let best = null, bd = 10;
            for (const s of segs) {
              if (yr < s.a - 0.3 || yr > s.b + 1.3) continue;
              const dist = Math.abs(y(s.d.rating) - py);
              if (dist < bd) { bd = dist; best = s; }
            }
            target = best?.d || null;
            if (!best) { hlLine.attr("visibility", "hidden"); hideTip(); return; }
            hlLine.attr("x1", x(best.a) + 1).attr("x2", x(best.b + 1) - 1).attr("y1", y(best.d.rating)).attr("y2", y(best.d.rating)).attr("visibility", "visible");
            tipFor(e, best.d);
          })
          .on("pointerleave", () => { target = null; hlLine.attr("visibility", "hidden"); hideTip(); })
          .on("click", (e) => { if (target) { const d = target; tapToGo(e, d.id, "/driver/" + d.id, () => tipFor(e, d, true)); } });
      } else {
        const pts = [];
        const line = d3.line().x((s) => x(s.y + 0.5)).y((s) => y(s.v)).curve(d3.curveMonotoneX);
        const sorted = rows.slice().sort((p, q) => order(p) - order(q));
        for (const d of sorted) {
          let cur = [];
          const flush = () => {
            if (cur.length > 1) g.append("path").attr("d", line(cur)).style("fill", "none").style("stroke", color(d))
              .attr("stroke-width", highlighted(d) ? 3 : d.titles ? 1.8 : 1.2).style("opacity", highlighted(d) ? 1 : d.titles ? 0.75 : 0.55);
            cur = [];
          };
          for (const s of d.seasons) {
            if (cur.length && s.y !== cur[cur.length - 1].y + 1) flush();
            cur.push(s);
            pts.push({ d, s, px: x(s.y + 0.5), py: y(s.v) });
          }
          flush();
          if (highlighted(d) || d.titles) {
            g.append("g").selectAll("circle").data(d.seasons).join("circle").attr("cx", (s) => x(s.y + 0.5)).attr("cy", (s) => y(s.v))
              .attr("r", highlighted(d) ? 3.2 : 2).style("fill", color(d));
          }
        }
        for (const d of hl) {
          const s = d.seasons[d.seasons.length - 1];
          svg.append("text").attr("x", x(s.y + 0.5) + 7).attr("y", y(s.v) + 4).attr("class", "lbl-b halo").text(lastName(d));
        }
        const delaunay = d3.Delaunay.from(pts, (p) => p.px, (p) => p.py);
        const hoverPath = hover.append("path").style("fill", "none").style("stroke", "var(--ink)").attr("stroke-width", 2.6).attr("visibility", "hidden");
        const hoverDot = hover.append("circle").attr("r", 4.5).style("fill", "var(--ink)").style("stroke", "var(--surface)").attr("stroke-width", 2).attr("visibility", "hidden");
        svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", w - m.l - m.r).attr("height", h - m.t - m.b).attr("class", "hit")
          .on("pointermove", (e) => {
            const [px, py] = d3.pointer(e);
            const i = delaunay.find(px, py);
            const p = pts[i];
            if (!p || Math.hypot(p.px - px, p.py - py) > 28) { target = null; hoverPath.attr("visibility", "hidden"); hoverDot.attr("visibility", "hidden"); hideTip(); return; }
            target = p.d;
            hoverPath.attr("d", line(p.d.seasons)).attr("visibility", "visible");
            hoverDot.attr("cx", p.px).attr("cy", p.py).attr("visibility", "visible");
            showTip(e, p.d.name, [
              { v: pct(p.s.v), k: p.s.y + " level · " + (p.s.teams || []).join(", ") },
              { v: pct(p.d.rating), k: "career rating · P" + p.d.rank }], { sub: yrs(p.d) });
          })
          .on("pointerleave", () => { target = null; hoverPath.attr("visibility", "hidden"); hoverDot.attr("visibility", "hidden"); hideTip(); })
          .on("click", (e) => { if (target) { const d = target; tapToGo(e, d.id, "/driver/" + d.id, () => tipFor(e, d, true)); } });
      }
    });

    function tipFor(e, d, touch = false) {
      showTip(e, d.name, [
        { v: pct(d.rating), k: "rating · P" + d.rank, key: d.titles ? "var(--accent)" : "var(--de-emph)" },
        { v: yrs(d), k: fmtInt(d.starts) + " starts" },
        ...(d.titles ? [{ v: d.titles + "×", k: "world champion" }] : [])], { hint: touch ? "Tap again to open" : "Click to open" });
    }

    let t = 0;
    search.addEventListener("input", () => { state.q = search.value.trim(); clearTimeout(t); t = setTimeout(sync, 300); chart.redraw(); });
    minSel.addEventListener("change", () => { state.min = +minSel.value; chart.redraw(); sync(); });
    champ.addEventListener("change", () => { state.champs = champ.checked; chart.redraw(); sync(); });
    renderSegs();
    chart.redraw();
    return () => { chart.stop(); clearTimeout(t); };
  },
};
