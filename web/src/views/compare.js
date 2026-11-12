import * as d3 from "d3";
import { DB, chainBetween, nameOf, pair } from "../lib/data.js";
import { el, icon, nextLink, setTitle } from "../lib/dom.js";
import { Z90, lastName, pct, pctTick, prob, ratio, secs, span, yrs } from "../lib/format.js";
import { bottomAxis, hGrid, leftAxis, makeSvg, observeWidth, yearTicks } from "../lib/chart.js";
import { navigate } from "../lib/router.js";
import { openPicker } from "../lib/palette.js";
import { ncdf, npdf, tcdf4 } from "../lib/stats.js";
import { hideTip, showTip } from "../lib/tooltip.js";

const PRESETS = [
  ["ayrton-senna", "alain-prost"],
  ["michael-schumacher", "lewis-hamilton"],
  ["lewis-hamilton", "max-verstappen"],
  ["fernando-alonso", "lewis-hamilton"],
  ["mika-hakkinen", "michael-schumacher"],
  ["charles-leclerc", "lando-norris"],
  ["sebastian-vettel", "kimi-raikkonen"],
];
const COL = { a: "var(--accent)", b: "var(--accent-2)" };

function pickBtn(d, side, other) {
  return el("button", {
    type: "button", class: "pick-btn", "aria-label": (side === "a" ? "First" : "Second") + " driver: " + d.name + ". Change",
    onclick: () => openPicker(side === "a" ? "First driver" : "Second driver", (p) => {
      navigate(side === "a" ? "/compare/" + p.id + "/" + other.id : "/compare/" + other.id + "/" + p.id);
    }, { exclude: other.id }),
  },
  el("span", { class: "sw", style: { background: COL[side] } }),
  el("span", { class: "nm", text: d.name }),
  el("span", { class: "sub", text: d.rank != null ? "P" + d.rank : "–" }),
  icon("chevronDown", "ico chev"));
}

function probRow(label, pa, A, B) {
  return el("div", { class: "prob" },
    el("div", { class: "pk" },
      el("span", {}, el("b", { text: prob(pa) }), " " + lastName(A)),
      el("span", { text: label }),
      el("span", {}, lastName(B) + " ", el("b", { text: prob(1 - pa) }))),
    el("div", { class: "prob-bar", role: "img", "aria-label": label + ": " + A.name + " " + prob(pa) + ", " + B.name + " " + prob(1 - pa) },
      el("i", { class: "a", style: { width: (100 * pa).toFixed(1) + "%" } }),
      el("i", { class: "b", style: { width: (100 * (1 - pa)).toFixed(1) + "%" } })));
}

function densityChart(host, A, B) {
  return observeWidth(host, (w) => {
    const h = 210, m = { t: 26, r: 14, b: 28, l: 14 };
    const lo = Math.min(A.rating - 3.2 * A.se, B.rating - 3.2 * B.se), hi = Math.max(A.rating + 3.2 * A.se, B.rating + 3.2 * B.se);
    const x = d3.scaleLinear([lo, hi], [m.l, w - m.r]).nice();
    const peak = Math.max(npdf(0) / A.se, npdf(0) / B.se);
    const y = d3.scaleLinear([0, peak * 1.08], [h - m.b, m.t]);
    const svg = makeSvg(host, w, h, "How sure the ratings are: " + A.name + " " + pct(A.rating) + " and " + B.name + " " + pct(B.rating));
    bottomAxis(svg, x, x.ticks(w < 500 ? 4 : 7), (v) => (Math.abs(v) < 1e-9 ? "avg" : pctTick(v, 1)), h - m.b);
    const xs = d3.range(x.domain()[0], x.domain()[1] + 1e-9, (x.domain()[1] - x.domain()[0]) / 160);
    for (const [d, c] of [[B, COL.b], [A, COL.a]]) {
      const pts = xs.map((v) => [v, npdf((v - d.rating) / d.se) / d.se]);
      svg.append("path").attr("d", d3.area().x((p) => x(p[0])).y0(y(0)).y1((p) => y(p[1]))(pts)).style("fill", c).style("fill-opacity", 0.16);
      svg.append("path").attr("d", d3.line().x((p) => x(p[0])).y((p) => y(p[1]))(pts)).style("fill", "none").style("stroke", c).attr("stroke-width", 2);
      svg.append("line").attr("x1", x(d.rating)).attr("x2", x(d.rating)).attr("y1", y(0)).attr("y2", y(npdf(0) / d.se)).style("stroke", c).attr("stroke-width", 1.5).attr("stroke-dasharray", "3 3");
      const lx = x(d.rating);
      svg.append("text").attr("x", lx).attr("y", y(npdf(0) / d.se) - 8).attr("text-anchor", lx < 60 ? "start" : lx > w - 60 ? "end" : "middle")
        .attr("class", "lbl-b halo").text(lastName(d) + " " + pct(d.rating));
    }
    svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", w - m.l - m.r).attr("height", h - m.t - m.b).attr("class", "hit").style("cursor", "default")
      .on("pointermove", (e) => {
        const v = x.invert(d3.pointer(e)[0]);
        showTip(e, "Rating " + pct(v), [
          { v: prob(1 - ncdf((v - A.rating) / A.se)), k: "chance " + lastName(A) + " is above", key: COL.a },
          { v: prob(1 - ncdf((v - B.rating) / B.se)), k: "chance " + lastName(B) + " is above", key: COL.b }]);
      })
      .on("pointerleave", hideTip);
  });
}

function careerChart(host, A, B, modeRef) {
  return observeWidth(host, (w) => {
    const byCareer = modeRef.mode === "career";
    const h = w < 560 ? 250 : 300, m = { t: 18, r: w < 560 ? 64 : 92, b: 34, l: 48 };
    const series = [[A, COL.a], [B, COL.b]].map(([d, c]) => ({
      d, c, pts: d.seasons.map((s, i) => ({ x: byCareer ? i + 1 : s.y, s })),
    }));
    const all = series.flatMap((s) => s.pts);
    const x = d3.scaleLinear(d3.extent(all, (p) => p.x), [m.l, w - m.r]);
    if (x.domain()[0] === x.domain()[1]) x.domain([x.domain()[0] - 1, x.domain()[1] + 1]);
    const y = d3.scaleLinear([Math.min(-0.2, d3.min(all, (p) => p.s.v)), Math.max(0.2, d3.max(all, (p) => p.s.v))], [h - m.b, m.t]).nice();
    const svg = makeSvg(host, w, h, "Season-by-season level of " + A.name + " and " + B.name);
    const yt = y.ticks(5);
    hGrid(svg, y, yt, m.l, w - m.r);
    leftAxis(svg, y, yt, (v) => pctTick(v, 1), m.l);
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).style("stroke", "var(--axis)");
    const ticks = byCareer ? x.ticks(Math.min(10, Math.floor((w - m.l - m.r) / 40))).filter(Number.isInteger) : yearTicks(x, w - m.l - m.r, 48);
    bottomAxis(svg, x, ticks.filter((t) => t >= x.domain()[0] && t <= x.domain()[1]), byCareer ? (v) => "S" + v : d3.format("d"), h - m.b);
    if (byCareer) svg.append("text").attr("x", w - m.r).attr("y", h - 4).attr("text-anchor", "end").attr("class", "lbl-m").text("season of career");
    const placed = [];
    for (const s of series) {
      const runs = [];
      let cur = [];
      for (const p of s.pts) {
        if (cur.length && !byCareer && p.x !== cur[cur.length - 1].x + 1) { runs.push(cur); cur = []; }
        cur.push(p);
      }
      if (cur.length) runs.push(cur);
      for (const r of runs) {
        svg.append("path").attr("d", d3.line().x((p) => x(p.x)).y((p) => y(p.s.v)).curve(d3.curveMonotoneX)(r))
          .style("fill", "none").style("stroke", s.c).attr("stroke-width", 2.2);
      }
      svg.append("g").selectAll("circle").data(s.pts).join("circle").attr("cx", (p) => x(p.x)).attr("cy", (p) => y(p.s.v)).attr("r", 3.5)
        .style("fill", s.c).style("stroke", "var(--surface)").attr("stroke-width", 1.5);
      svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(s.d.rating)).attr("y2", y(s.d.rating))
        .style("stroke", s.c).attr("stroke-width", 1).attr("stroke-dasharray", "4 4").style("opacity", 0.7);
      const last = s.pts[s.pts.length - 1];
      let ly = y(last.s.v) + 4;
      for (const p of placed) if (Math.abs(p - ly) < 15) ly = p + (ly >= p ? 15 : -15);
      placed.push(ly);
      const lx = w - m.r + 8;
      svg.append("line").attr("x1", x(last.x) + 4).attr("x2", lx - 3).attr("y1", y(last.s.v)).attr("y2", ly - 4)
        .style("stroke", s.c).attr("stroke-width", 1).style("opacity", 0.5);
      svg.append("text").attr("x", lx).attr("y", ly).attr("class", "lbl-b").style("fill", s.c === COL.a ? "var(--accent-ink)" : "var(--accent-2-ink)").text(lastName(s.d));
    }
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).style("stroke", "var(--axis)").attr("visibility", "hidden");
    svg.append("rect").attr("x", m.l).attr("y", 0).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("class", "hit").style("cursor", "crosshair")
      .on("pointermove", (e) => {
        const xv = Math.round(x.invert(d3.pointer(e)[0]));
        cross.attr("x1", x(xv)).attr("x2", x(xv)).attr("visibility", "visible");
        const rows = [];
        for (const s of series) {
          const p = s.pts.find((q) => q.x === xv);
          if (p) rows.push({ v: pct(p.s.v), k: lastName(s.d) + (byCareer ? " · " + p.s.y : "") + " · " + (p.s.teams || []).join(", "), key: s.c });
        }
        if (!rows.length) { hideTip(); return; }
        showTip(e, byCareer ? "Season " + xv + " of career" : String(xv), rows);
      })
      .on("pointerleave", () => { cross.attr("visibility", "hidden"); hideTip(); });
  });
}

function chainView(A, B) {
  const path = chainBetween(A.id, B.id);
  if (!path) return [el("p", { class: "muted", text: "These two drivers aren't connected through teammates." })];
  const box = el("div", { class: "chain" });
  path.forEach((id, i) => {
    const d = DB.byId.get(id);
    const end = i === 0 ? " end-a" : i === path.length - 1 ? " end-b" : "";
    const sub = d && d.rank != null ? pct(d.rating) + " · P" + d.rank : d ? "not ranked" : "raced before 1990";
    box.append(d
      ? el("a", { class: "c-node" + end, href: "/driver/" + id }, el("span", { class: "n1", text: d.name }), el("span", { class: "n2", text: sub }))
      : el("div", { class: "c-node" + end }, el("span", { class: "n1", text: nameOf(id) }), el("span", { class: "n2", text: sub })));
    if (i < path.length - 1) {
      const t = pair(id, path[i + 1]);
      const who = d ? lastName(d) : nameOf(id).split(" ").slice(-1)[0];
      const l = DB.link.get(id + "|" + path[i + 1]);
      box.append(t
        ? el("div", { class: "c-link" },
          el("span", { class: "yrs", text: span(t.y0, t.y1) }),
          el("span", { class: "bar" }),
          el("span", { text: "quali " + t.qw + "–" + t.ql + " · race " + t.rw + "–" + t.rl }),
          el("span", { text: t.adj == null ? "" : who + " " + pct(t.adj) }))
        : el("div", { class: "c-link" },
          el("span", { class: "yrs", text: l ? span(l.y0, l.y1) : "" }),
          el("span", { class: "bar" }),
          el("span", { text: l ? l.n + " duels" : "" })));
    }
  });
  return [box, el("p", { class: "caption", text: (path.length - 1) + " link" + (path.length > 2 ? "s" : "") + ". Records read from the left-hand driver's side; gaps are median qualifying gaps in today's terms. The model uses every path at once, so no single link decides it." })];
}

function sharedTeams(A, B, t) {
  const out = new Set();
  for (let y = t.y0; y <= t.y1; y++) {
    const a = A.seasonByYear.get(y)?.teams || [], b = B.seasonByYear.get(y)?.teams || [];
    for (const team of a) if (b.includes(team)) out.add(team);
  }
  return [...out];
}

export default {
  mount(root, params) {
    let A = DB.byId.get(params.a), B = DB.byId.get(params.b);
    const bad = (params.a && !A) || (params.b && !B);
    A = A || DB.byId.get("ayrton-senna") || DB.ranked[0];
    B = B || DB.byId.get("max-verstappen") || DB.ranked[1];
    if (A.id === B.id) B = DB.ranked.find((d) => d.id !== A.id);
    setTitle(lastName(A) + " vs " + lastName(B));
    const M = DB.meta;
    const diff = A.rating - B.rating;
    const fast = diff >= 0 ? A : B, slow = diff >= 0 ? B : A;
    const dd = Math.abs(diff);
    const pQualiA = tcdf4((A.pace - B.pace) / M.quali_scale);
    const pRaceA = ncdf(diff / M.race_scale);
    const sure = ncdf(dd / Math.sqrt(A.se ** 2 + B.se ** 2));
    const t = pair(A.id, B.id);
    const mode = { mode: A.first > B.last || B.first > A.last ? "career" : "year" };
    const cls = (d) => (d === A ? "a" : "b");

    const pqFast = fast === A ? pQualiA : 1 - pQualiA, prFast = fast === A ? pRaceA : 1 - pRaceA;
    const verdict = dd < 0.005
      ? el("p", { class: "verdict" }, "In identical cars, ", el("strong", { class: "a", text: A.name }), " and ", el("strong", { class: "b", text: B.name }), " would be dead level.")
      : el("p", { class: "verdict" },
        "In identical cars, ", el("strong", { class: cls(fast), text: fast.name }), " would be about ",
        el("strong", { text: dd.toFixed(2) + "% a lap" }), " (" + secs(dd) + ") quicker than ", el("strong", { class: cls(slow), text: slow.name }), ". ",
        pqFast >= 0.5
          ? "Enough to out-qualify " + lastName(slow) + " in about " + prob(pqFast) + " of sessions and finish ahead in " + prob(prFast) + " of races they both finish."
          : lastName(slow) + " would still out-qualify " + lastName(fast) + " " + prob(1 - pqFast) + " of the time, but " + lastName(fast) +
            " makes it up on race day and finishes ahead in " + prob(prFast) + " of races they both finish.",
        " Confidence the order is right: " + prob(sure) + ".");

    const densHost = el("div", { class: "chart" });
    const careerHost = el("div", { class: "chart" });
    const modeSeg = el("div", { class: "seg", role: "group", "aria-label": "Line up careers by" });
    let career = null;
    const renderSeg = () => modeSeg.replaceChildren(...[["year", "Calendar year"], ["career", "Season of career"]].map(([k, label]) =>
      el("button", { type: "button", "aria-pressed": String(mode.mode === k), text: label, onclick: () => { mode.mode = k; renderSeg(); career?.redraw(); } })));
    renderSeg();

    const side = (d, s) => el("div", { class: "side " + s },
      el("span", { class: "k", text: d.rank != null ? "P" + d.rank + " of " + DB.N + " · " + yrs(d) : "Not ranked · " + yrs(d) }),
      el("a", { class: "nm", href: "/driver/" + d.id, text: d.name }),
      el("span", { class: "v", text: pct(d.rating) }),
      el("span", { class: "k", text: "ratio " + ratio(d.rating) + " · pace " + pct(d.pace) + " · race day " + pct(d.race) }));

    const view = el("div", { class: "container view" },
      el("header", { class: "view-head" },
        el("p", { class: "eyebrow", text: "Head to head" }),
        el("h1", { text: "Put any two drivers in the same car" }),
        el("p", { class: "lede", text: "Pick two drivers from any era. The verdict comes from their ratings; the chain at the bottom shows the real teammate pairings that connect them." })),
      bad ? el("p", { class: "note", text: "One of the drivers in that link isn't in the data, so a default pairing is shown." }) : null,
      el("section", { class: "card" },
        el("div", { class: "cmp-pick" },
          pickBtn(A, "a", B),
          el("span", { class: "vs" },
            el("a", { class: "icon-btn", href: "/compare/" + B.id + "/" + A.id, "aria-label": "Swap drivers", title: "Swap" }, icon("swap"))),
          pickBtn(B, "b", A)),
        el("div", { class: "presets" }, "Try:",
          PRESETS.filter(([a, b]) => DB.byId.has(a) && DB.byId.has(b) && !(a === A.id && b === B.id))
            .slice(0, 6).map(([a, b]) => el("a", { href: "/compare/" + a + "/" + b, text: lastName(DB.byId.get(a)) + " vs " + lastName(DB.byId.get(b)) })))),
      el("section", { class: "card", "aria-live": "polite" },
        verdict,
        el("div", { class: "duel" }, side(A, "a"), side(B, "b")),
        el("div", { class: "probs" },
          probRow("out-qualifies the other", pQualiA, A, B),
          probRow("finishes ahead, both running", pRaceA, A, B)),
        !A.connected || !B.connected ? el("p", { class: "note", text: "One of these drivers isn't connected to the shared scale, so this comparison doesn't mean much." }) : null),
      t ? el("section", { class: "card" },
        el("div", { class: "card-head" },
          el("h2", { text: "They were teammates" }),
          el("p", { text: sharedTeams(A, B, t).join(", ") + (sharedTeams(A, B, t).length ? ", " : "") + span(t.y0, t.y1) + ". The real record, no model needed:" })),
        el("div", { class: "tiles", style: { gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" } },
          el("div", { class: "tile" }, el("span", { class: "k", text: "Qualifying" }), el("span", { class: "v", text: t.qw + "–" + t.ql }), el("span", { class: "s", text: lastName(A) + " first" })),
          el("div", { class: "tile" }, el("span", { class: "k", text: "Races" }), el("span", { class: "v", text: t.rw + "–" + t.rl }), el("span", { class: "s", text: "driver-controlled finishes" })),
          el("div", { class: "tile" }, el("span", { class: "k", text: "Median gap" }), el("span", { class: "v", text: t.adj == null ? "–" : pct(t.adj) }), el("span", { class: "s", text: "today's terms, + = " + lastName(A) + " faster" })))) : null,
      el("div", { class: "grid-2" },
        el("section", { class: "card" },
          el("div", { class: "card-head" },
            el("h2", { text: "How sure are we?" }),
            el("p", { text: "Each curve is a rating's uncertainty. The more they overlap, the less certain the order. Order confidence: " + prob(sure) + "." })),
          densHost),
        el("section", { class: "card" },
          el("div", { class: "card-head-row" },
            el("div", { class: "card-head" },
              el("h2", { text: "Careers side by side" }),
              el("p", { text: "Level delivered each season. Dashed lines are the career ratings." })),
            modeSeg),
          careerHost)),
      el("section", { class: "card" },
        el("div", { class: "card-head" },
          el("h2", { text: "The teammate chain" }),
          el("p", { text: "The shortest path of real teammate pairings from " + A.name + " to " + B.name + "." })),
        ...chainView(A, B)),
      nextLink("/network", "Next · The teammate web", "Network", "See every pairing at once: the web that puts all drivers on one scale."));
    root.append(view);
    const dens = densityChart(densHost, A, B);
    career = careerChart(careerHost, A, B, mode);
    return () => { dens.stop(); career.stop(); };
  },
};
