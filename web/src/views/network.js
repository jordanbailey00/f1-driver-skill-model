import * as d3 from "d3";
import { DB, chainBetween } from "../lib/data.js";
import { el, icon, nextLink, setTitle } from "../lib/dom.js";
import { fmtInt, lastName, pct, plural, span } from "../lib/format.js";
import { isTouch, ratingColor } from "../lib/chart.js";
import { setQuery } from "../lib/router.js";
import { openPicker } from "../lib/palette.js";
import { rng } from "../lib/stats.js";
import { onThemeChange } from "../lib/theme.js";
import { hideTip, showTip } from "../lib/tooltip.js";

// Force layout, computed once: x is pulled to the middle of each career (time runs left to
// right), links pull teammates together, charge and collision spread each era out.
let LAYOUT = null;
function layout() {
  if (LAYOUT) return LAYOUT;
  const net = DB.raw.network;
  const nodes = net.nodes.map(([id, name, y0, y1], i) => ({ i, id, name, y0, y1, mid: (y0 + y1) / 2, d: DB.byId.get(id) || null, n: 0, nb: [] }));
  const links = net.links.map(([a, b, nq, nr, y0, y1]) => ({ source: a, target: b, a, b, nq, nr, n: nq + nr, y0, y1 }));
  for (const l of links) {
    nodes[l.a].n += l.n; nodes[l.b].n += l.n;
    nodes[l.a].nb.push(l); nodes[l.b].nb.push(l);
  }
  const X = d3.scaleLinear([1977, 2026], [0, 1500]);
  const r = rng(11);
  for (const n of nodes) { n.x = X(n.mid) + (r() - 0.5) * 20; n.y = (r() - 0.5) * 260; }
  const sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).distance(26).strength((l) => Math.min(0.9, 0.12 + l.n / 70)))
    .force("charge", d3.forceManyBody().strength(-70).distanceMax(320))
    .force("x", d3.forceX((n) => X(n.mid)).strength(0.4))
    .force("y", d3.forceY(0).strength(0.02))
    .force("collide", d3.forceCollide((n) => radius(n) + 3))
    .stop();
  for (let k = 0; k < 360; k++) sim.tick();
  for (const n of nodes) { n.bx = n.x; n.by = n.y; }
  LAYOUT = { nodes, links, byId: new Map(nodes.map((n) => [n.id, n])) };
  return LAYOUT;
}
const radius = (n) => 2.6 + Math.sqrt(n.n) / 4;

export default {
  mount(root, _params, query) {
    setTitle("Teammate network");
    const L = layout();
    const state = { sel: L.byId.has(query.get("focus")) ? query.get("focus") : null, to: L.byId.has(query.get("to")) ? query.get("to") : null, hover: null };
    const wrap = el("div", { class: "net-wrap" });
    const side = el("aside", { class: "card net-card", "aria-live": "polite" });
    const legend = el("div", { class: "net-legend-row" });
    const nRanked = L.nodes.filter((n) => n.d && n.d.connected).length;

    const view = el("div", { class: "container view" },
      el("header", { class: "view-head" },
        el("p", { class: "eyebrow", text: "The teammate web" }),
        el("h1", { text: "How every driver connects" }),
        el("p", { class: "lede" },
          "Each dot is a driver, each line a pair of teammates. Time runs left to right. ",
          el("strong", { text: "Every comparison in the rating travels along these lines" }),
          ": a driver can only be measured against someone else through a chain of shared garages.")),
      el("div", { class: "net-layout" },
        el("div", { style: { display: "grid", gap: "10px", minWidth: "0" } },
          wrap,
          legend,
          el("p", { class: "net-hint", text: isTouch() ? "Drag to pan, pinch to zoom, tap a driver to see their teammates." : "Scroll or pinch to zoom, drag to pan. Hover a driver to see their teammates; click to select." })),
        side),
      nextLink("/method", "Next · How it's built", "Method", "From a single lap-time gap to one scale across fifty years."));
    root.append(view);

    const tools = el("div", { class: "net-tools" },
      el("button", { type: "button", class: "icon-btn", "aria-label": "Find a driver", title: "Find a driver", onclick: () => openPicker("Find in the network", (d) => select(d.id, true)) }, icon("search")),
      el("button", { type: "button", class: "icon-btn", "aria-label": "Zoom in", title: "Zoom in", onclick: () => zoomBy(1.6) }, icon("plus")),
      el("button", { type: "button", class: "icon-btn", "aria-label": "Zoom out", title: "Zoom out", onclick: () => zoomBy(1 / 1.6) }, icon("minus")),
      el("button", { type: "button", class: "icon-btn", "aria-label": "Reset view", title: "Reset view", onclick: () => resetZoom() }, icon("reset")));
    wrap.append(tools);

    const svg = d3.select(wrap).append("svg").attr("role", "img")
      .attr("aria-label", "Network of " + L.nodes.length + " drivers linked by " + L.links.length + " teammate pairings, 1977 to 2026");
    const gLinks = svg.append("g");
    const gNodes = svg.append("g");
    const gLabels = svg.append("g").attr("pointer-events", "none");
    const linkSel = gLinks.selectAll("line").data(L.links).join("line").attr("stroke-linecap", "round");
    const nodeSel = gNodes.selectAll("circle").data(L.nodes).join("circle").attr("r", radius);

    let W = 0, H = 0, base = null, T = d3.zoomIdentity, qt = null, color = ratingColor(0.8), F = null;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const zoom = d3.zoom().scaleExtent([0.6, 10]).on("zoom", (e) => { T = e.transform; position(); });
    svg.call(zoom).on("dblclick.zoom", null);

    function fit() {
      W = wrap.clientWidth; H = wrap.clientHeight;
      svg.attr("viewBox", `0 0 ${W} ${H}`);
      const portrait = W < H * 0.9;
      const xs = L.nodes.map((n) => n.bx), ys = L.nodes.map((n) => n.by);
      const [x0, x1] = d3.extent(xs), [y0, y1] = d3.extent(ys);
      const pad = 28;
      // time axis fills its side; the other axis is stretched to fill too, up to 2.4x
      const along = portrait ? H : W, across = portrait ? W : H;
      const sa = (along - 2 * pad) / (x1 - x0);
      const sc = Math.min((across - 2 * pad) / (y1 - y0), sa * 2.4);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      base = portrait
        ? (n) => [W / 2 + sc * (n.by - cy), H / 2 + sa * (n.bx - cx)]
        : (n) => [W / 2 + sa * (n.bx - cx), H / 2 + sc * (n.by - cy)];
      for (const n of L.nodes) [n.px, n.py] = base(n);
    }

    function position() {
      for (const n of L.nodes) [n.sx, n.sy] = T.apply([n.px, n.py]);
      nodeSel.attr("cx", (n) => n.sx).attr("cy", (n) => n.sy);
      linkSel.attr("x1", (l) => L.nodes[l.a].sx).attr("y1", (l) => L.nodes[l.a].sy).attr("x2", (l) => L.nodes[l.b].sx).attr("y2", (l) => L.nodes[l.b].sy);
      qt = d3.quadtree(L.nodes, (n) => n.sx, (n) => n.sy);
      labels();
    }

    function focusSet() {
      const path = state.sel && state.to ? chainBetween(state.sel, state.to) : null;
      const pathSet = new Set(path || []);
      const pathLinks = new Set();
      if (path) for (let k = 0; k < path.length - 1; k++) pathLinks.add([L.byId.get(path[k]).i, L.byId.get(path[k + 1]).i].sort((p, q) => p - q).join("|"));
      const f = state.hover || state.sel;
      const nbs = new Set();
      if (f && !path) { const n = L.byId.get(f); nbs.add(f); for (const l of n.nb) nbs.add(L.nodes[l.a === n.i ? l.b : l.a].id); }
      return { path, pathSet, pathLinks, nbs, f };
    }

    function paint() {
      F = focusSet();
      const { path, pathSet, pathLinks, nbs, f } = F;
      const dim = (id) => (path ? !pathSet.has(id) : f ? !nbs.has(id) : false);
      nodeSel
        .style("fill", (n) => (n.d ? (n.d.connected ? color(n.d.rating) : "var(--surface)") : "var(--surface)"))
        .style("stroke", (n) => (pathSet.has(n.id) || n.id === state.sel ? "var(--accent-2)" : n.d ? (n.d.connected ? "var(--surface)" : "var(--muted)") : "var(--de-emph)"))
        .attr("stroke-width", (n) => (pathSet.has(n.id) || n.id === state.sel ? 3 : n.d && n.d.connected ? 1 : 1.4))
        .style("opacity", (n) => (dim(n.id) ? 0.16 : 1));
      linkSel
        .style("stroke", (l) => (pathLinks.has(l.a + "|" + l.b) ? "var(--accent-2)" : "var(--axis)"))
        .attr("stroke-width", (l) => (pathLinks.has(l.a + "|" + l.b) ? 3.2 : 0.5 + Math.sqrt(l.n) / 6))
        .style("opacity", (l) => {
          if (path) return pathLinks.has(l.a + "|" + l.b) ? 1 : 0.06;
          if (f) { const n = L.byId.get(f); return l.a === n.i || l.b === n.i ? 1 : 0.06; }
          return 0.75;
        });
      gNodes.selectAll("circle").filter((n) => pathSet.has(n.id) || n.id === state.sel || nbs.has(n.id)).raise();
      labels();
    }

    function labels() {
      if (!F) F = focusSet();
      const { path, pathSet, nbs, f } = F;
      const k = T.k;
      const pri = (n) => (pathSet.has(n.id) ? 0 : n.id === f ? 0 : nbs.has(n.id) ? 1 : n.d && (n.d.titles || !n.d.connected) ? 2 : n.d && n.d.rank && n.d.rank <= 25 ? 3 : n.d ? 4 : 5);
      const maxPri = path || f ? 1 : k >= 3 ? 5 : k >= 1.8 ? 4 : 2;
      const cand = L.nodes.filter((n) => pri(n) <= maxPri && n.sx > -20 && n.sx < W + 20 && n.sy > -20 && n.sy < H + 20)
        .sort((a, b) => pri(a) - pri(b) || (b.n - a.n));
      const placed = [];
      const out = [];
      for (const n of cand) {
        const txt = n.d ? lastName(n.d) : n.name.split(" ").slice(-1)[0];
        const w = txt.length * 6.4 + 4, r = radius(n);
        const x0 = n.sx + r + 3, y0 = n.sy - 7;
        const box = { x0, x1: x0 + w, y0, y1: y0 + 13 };
        if (box.x1 > W - 4) { box.x0 = n.sx - r - 3 - w; box.x1 = n.sx - r - 3; }
        if (placed.some((b) => !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1)) && pri(n) > 0) continue;
        placed.push(box);
        out.push({ n, txt, x: box.x0, y: n.sy + 4, strong: pri(n) <= 1 });
      }
      gLabels.selectAll("text").data(out, (o) => o.n.id).join("text")
        .attr("x", (o) => o.x).attr("y", (o) => o.y).attr("class", (o) => (o.strong ? "lbl-b halo" : "lbl-2 halo")).text((o) => o.txt);
    }

    function nearest(e) {
      const [px, py] = d3.pointer(e, svg.node());
      return qt?.find(px, py, isTouch() ? 22 : 14) || null;
    }
    function tipFor(e, n) {
      const d = n.d;
      showTip(e, n.name, [
        ...(d ? [{ v: d.connected && d.rank ? pct(d.rating) : "–", k: d.connected && d.rank ? "rating · P" + d.rank : "not on the shared scale" }] : [{ v: "–", k: "raced only before 1990" }]),
        { v: plural(n.nb.length, "teammate"), k: "linked" },
        { v: fmtInt(n.n), k: "duels with them" }], { sub: span(n.y0, n.y1) });
    }

    svg.on("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      const n = nearest(e);
      const id = n ? n.id : null;
      if (id !== state.hover) { state.hover = id; paint(); }
      if (n) tipFor(e, n); else hideTip();
      svg.style("cursor", n ? "pointer" : null);
    });
    svg.on("pointerleave", () => { state.hover = null; hideTip(); paint(); });
    svg.on("click", (e) => {
      if (e.defaultPrevented) return;
      const n = nearest(e);
      if (n) { select(n.id, false); if (isTouch()) tipFor(e, n); }
      else if (state.sel) { state.sel = null; state.to = null; sync(); paint(); renderSide(); hideTip(); }
    });

    function sync() { setQuery({ focus: state.sel, to: state.sel ? state.to : null }); }
    function select(id, zoomTo) {
      if (state.sel !== id) state.to = null;
      state.sel = id;
      state.hover = null;
      sync(); paint(); renderSide();
      if (zoomTo) focusOn([id]);
    }
    function focusOn(ids) {
      const ns = ids.map((id) => L.byId.get(id)).filter(Boolean);
      if (!ns.length) return;
      const [x0, x1] = d3.extent(ns, (n) => n.px), [y0, y1] = d3.extent(ns, (n) => n.py);
      const k = Math.min(4, 0.8 * Math.min(W / Math.max(60, x1 - x0), H / Math.max(60, y1 - y0)));
      const t = d3.zoomIdentity.translate(W / 2 - k * (x0 + x1) / 2, H / 2 - k * (y0 + y1) / 2).scale(k);
      (reduce ? svg : svg.transition().duration(650)).call(zoom.transform, t);
    }
    function zoomBy(f) { (reduce ? svg : svg.transition().duration(250)).call(zoom.scaleBy, f); }
    function resetZoom() { (reduce ? svg : svg.transition().duration(450)).call(zoom.transform, d3.zoomIdentity); }

    function renderLegend() {
      const stops = color.stops(9);
      legend.replaceChildren(
        el("span", { class: "scale" },
          el("span", { class: "grad", role: "img", "aria-label": "Colour scale: red is slower than average, grey average, blue faster", style: { background: "linear-gradient(90deg," + stops.join(",") + ")" } }),
          el("span", { class: "ticks" }, el("span", { text: "−0.8%" }), el("span", { text: "rating" }), el("span", { text: "+0.8%" }))),
        el("span", { class: "legend" },
          el("span", { class: "k" }, el("i", { class: "dot", style: { background: "var(--surface)", border: "1.5px solid var(--de-emph)" } }), "Raced only before 1990"),
          el("span", { class: "k" }, el("i", { class: "dot", style: { background: "var(--surface)", border: "1.5px solid var(--muted)" } }), "Not on the shared scale")),
        el("span", { class: "muted", text: "Dot size: number of teammate duels" }));
    }

    function renderSide() {
      const n = state.sel ? L.byId.get(state.sel) : null;
      if (!n) {
        side.replaceChildren(
          el("div", { class: "card-head" },
            el("h2", { text: "Read the web" }),
            el("p", { text: fmtInt(L.nodes.length) + " drivers and " + fmtInt(L.links.length) + " teammate pairings since 1977. " + fmtInt(nRanked) + " of the drivers started a race from 1990 on and are rated; the hollow dots raced only before 1990 but still carry the chain back." })),
          el("p", { class: "ink-2", style: { fontSize: "14px" }, text: "Long careers are the bridges: a driver with many teammates ties eras together. Thicker lines mean more head-to-head duels." }),
          el("p", { class: "ink-2", style: { fontSize: "14px" }, text: "Only Jules Bianchi and Max Chilton sit apart: they were only ever teammates with each other, so they can't be placed on the shared scale." }),
          el("div", { class: "presets" }, "Try:",
            ["ayrton-senna", "fernando-alonso", "max-verstappen"].filter((id) => L.byId.has(id)).map((id) =>
              el("a", { href: "/network?focus=" + id, onclick: (e) => { e.preventDefault(); select(id, true); }, text: DB.byId.get(id)?.name || id }))));
        return;
      }
      const d = n.d;
      const mates = n.nb.map((l) => ({ l, m: L.nodes[l.a === n.i ? l.b : l.a] })).sort((p, q) => p.l.y0 - q.l.y0);
      const path = state.to ? chainBetween(n.id, state.to) : null;
      side.replaceChildren(
        el("div", {},
          el("p", { class: "eyebrow", text: d ? (d.connected && d.rank ? "P" + d.rank + " · " + pct(d.rating) : "Not on the shared scale") : "Raced before 1990" }),
          el("div", { class: "nm", text: n.name }),
          el("p", { class: "ink-2", style: { fontSize: "14px", marginTop: "6px" }, text: span(n.y0, n.y1) + " · " + plural(mates.length, "teammate") + " · " + fmtInt(n.n) + " duels" })),
        el("div", { class: "presets" },
          d ? el("a", { href: "/driver/" + d.id }, "Open profile") : null,
          el("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => openPicker("Chain from " + n.name + " to", (o) => {
            state.to = o.id; sync(); paint(); renderSide(); focusOn(chainBetween(n.id, o.id) || [n.id, o.id]);
          }, { exclude: n.id }) }, icon("link"), state.to ? "Chain to someone else" : "Find chain to…"),
          el("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => { state.sel = null; state.to = null; sync(); paint(); renderSide(); } }, icon("close"), "Clear")),
        path ? el("div", { class: "card-head" },
          el("h2", { style: { fontSize: "1.15rem" }, text: (path.length - 1) + "-link chain to " + lastName(L.byId.get(state.to).d || { name: L.byId.get(state.to).name }) }),
          el("ol", { style: { margin: "4px 0 0", paddingLeft: "1.2rem", display: "grid", gap: "4px", fontSize: "14px" } },
            path.map((id, k) => {
              const p = L.byId.get(id);
              const nxt = k < path.length - 1 ? L.byId.get(path[k + 1]) : null;
              const l = nxt ? p.nb.find((x) => (x.a === p.i ? x.b : x.a) === nxt.i) : null;
              return el("li", {}, p.d ? el("a", { href: "/driver/" + p.id, text: p.name }) : p.name,
                l ? el("span", { class: "muted", text: " · teammates " + span(l.y0, l.y1) + " with " + (nxt.d ? lastName(nxt.d) : nxt.name.split(" ").slice(-1)[0]) }) : null);
            })),
          el("a", { href: "/compare/" + state.sel + "/" + state.to, text: "Compare them head to head →", style: { fontSize: "14px" } })) : null,
        el("div", { class: "card-head" },
          el("h2", { style: { fontSize: "1.15rem" }, text: "Teammates" }),
          el("div", { class: "chips" }, mates.map(({ l, m }) => el("a", {
            href: "/network?focus=" + m.id, title: span(l.y0, l.y1) + " · " + l.n + " duels",
            onclick: (e) => { e.preventDefault(); select(m.id, true); }, text: (m.d ? lastName(m.d) : m.name.split(" ").slice(-1)[0]) + " ’" + String(l.y0).slice(-2),
          })))));
    }

    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (wrap.clientWidth === W && wrap.clientHeight === H) return;
        fit(); svg.call(zoom.transform, d3.zoomIdentity); T = d3.zoomIdentity; position(); paint();
      });
    });
    ro.observe(wrap);
    fit(); position(); renderLegend(); paint(); renderSide();
    if (state.sel) requestAnimationFrame(() => focusOn(state.to ? chainBetween(state.sel, state.to) || [state.sel] : [state.sel]));
    const offTheme = onThemeChange(() => { color = ratingColor(0.8); renderLegend(); paint(); });
    return () => { ro.disconnect(); cancelAnimationFrame(raf); offTheme(); svg.on(".zoom", null); hideTip(); };
  },
};
