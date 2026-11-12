import * as d3 from "d3";
import { DB, isRising, nameOf } from "../lib/data.js";
import { el, icon, nextLink, setTitle } from "../lib/dom.js";
import { Z90, fmtInt, lastName, pct, pctTick, plural, ratio, secs, sgn, span, titleText, yrs } from "../lib/format.js";
import { bottomAxis, hGrid, leftAxis, makeSvg, observeWidth, tapToGo, yearTicks } from "../lib/chart.js";
import { navigate } from "../lib/router.js";
import { openPicker } from "../lib/palette.js";
import { hideTip, showTip } from "../lib/tooltip.js";

// Beeswarm placement: each dot takes the smallest vertical offset that clears the dots
// already placed (sorted by x).
export function dodge(xs, r) {
  const order = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const placed = [];
  const ys = new Array(xs.length).fill(0);
  const d2 = (2 * r) ** 2;
  for (const [x, i] of order) {
    const near = placed.filter((p) => Math.abs(p[0] - x) < 2 * r);
    let y = 0;
    for (let k = 0; k < 400; k++) {
      const cand = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (r * 0.5);
      if (near.every((p) => (p[0] - x) ** 2 + (p[1] - cand) ** 2 >= d2)) { y = cand; break; }
    }
    ys[i] = y;
    placed.push([x, y]);
  }
  return ys;
}

function notFound(root, id) {
  setTitle("Driver not found");
  root.append(el("div", { class: "container view" },
    el("header", { class: "view-head" },
      el("p", { class: "eyebrow", text: "Driver" }),
      el("h1", { text: "No such driver" }),
      el("p", { class: "lede" }, "There's no ranked driver with the id “" + id + "”. ", el("a", { href: "/rankings", text: "Browse the rankings" }), " or press / to search."))));
  return null;
}

function seasonChart(host, d) {
  return observeWidth(host, (w) => {
    const narrow = w < 560;
    const h = narrow ? 230 : 280;
    const m = { t: 16, r: 14, b: 50, l: 48 };
    const S = d.seasons;
    const x = d3.scaleLinear([d3.min(S, (s) => s.y) - 0.5, d3.max(S, (s) => s.y) + 0.5], [m.l, w - m.r]);
    const lo = d3.min(S, (s) => s.v - Z90 * s.se), hi = d3.max(S, (s) => s.v + Z90 * s.se);
    const y = d3.scaleLinear([Math.min(lo, -0.25, d.rating - 0.1), Math.max(hi, 0.25, d.rating + 0.1)], [h - m.b, m.t]).nice();
    const svg = makeSvg(host, w, h, "Season-by-season level for " + d.name);
    const yt = y.ticks(5);
    hGrid(svg, y, yt, m.l, w - m.r);
    leftAxis(svg, y, yt, (v) => (Math.abs(v) < 1e-9 ? "avg" : pctTick(v, 1)), m.l);
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).style("stroke", "var(--axis)");
    bottomAxis(svg, x, yearTicks(x, w - m.l - m.r, 48).filter((t) => t >= x.domain()[0] && t <= x.domain()[1]), d3.format("d"), h - m.b);

    // team stints under the axis
    const stints = [];
    for (const s of S) {
      const team = (s.teams || []).slice(-1)[0] || "";
      const last = stints[stints.length - 1];
      if (last && last.team === team && s.y === last.b + 1) last.b = s.y;
      else stints.push({ team, a: s.y, b: s.y });
    }
    const sg = svg.append("g").attr("transform", `translate(0,${h - m.b + 26})`);
    stints.forEach((st, i) => {
      const x0 = x(st.a - 0.5) + 1, x1 = x(st.b + 0.5) - 1;
      sg.append("rect").attr("x", x0).attr("y", 0).attr("width", Math.max(2, x1 - x0)).attr("height", 18).attr("rx", 4)
        .style("fill", i % 2 ? "var(--surface-2)" : "var(--grid)");
      if (x1 - x0 > st.team.length * 6.2 + 8) {
        sg.append("text").attr("x", (x0 + x1) / 2).attr("y", 13).attr("text-anchor", "middle").attr("class", "lbl-2").style("font-size", "11px").text(st.team);
      }
    });

    const runs = [];
    let cur = [];
    for (const s of S) { if (cur.length && s.y !== cur[cur.length - 1].y + 1) { runs.push(cur); cur = []; } cur.push(s); }
    if (cur.length) runs.push(cur);
    const area = d3.area().x((s) => x(s.y)).y0((s) => y(s.v - Z90 * s.se)).y1((s) => y(s.v + Z90 * s.se)).curve(d3.curveMonotoneX);
    const line = d3.line().x((s) => x(s.y)).y((s) => y(s.v)).curve(d3.curveMonotoneX);
    for (const r of runs) {
      if (r.length > 1) {
        svg.append("path").attr("d", area(r)).style("fill", "var(--accent-2)").style("fill-opacity", 0.13);
        svg.append("path").attr("d", line(r)).style("fill", "none").style("stroke", "var(--accent-2)").attr("stroke-width", 2);
      } else {
        svg.append("line").attr("x1", x(r[0].y)).attr("x2", x(r[0].y)).attr("y1", y(r[0].v - Z90 * r[0].se)).attr("y2", y(r[0].v + Z90 * r[0].se))
          .style("stroke", "var(--accent-2-soft)").attr("stroke-width", 3).attr("stroke-linecap", "round");
      }
    }
    if (d.connected) {
      svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(d.rating)).attr("y2", y(d.rating))
        .style("stroke", "var(--accent)").attr("stroke-width", 1.5).attr("stroke-dasharray", "5 4");
      // label the career line where the season line is furthest from it (left or right end)
      const first = S[0], last = S[S.length - 1];
      const left = Math.abs(first.v - d.rating) >= Math.abs(last.v - d.rating);
      const above = (left ? first.v : last.v) <= d.rating;
      svg.append("text").attr("x", left ? m.l + 6 : w - m.r).attr("y", y(d.rating) + (above ? -7 : 15)).attr("text-anchor", left ? "start" : "end")
        .attr("class", "lbl halo").style("fill", "var(--accent-ink)").text("career " + pct(d.rating));
    }
    const titles = new Set(d.title_years || []);
    svg.append("g").selectAll("circle.ring").data(S.filter((s) => titles.has(s.y))).join("circle")
      .attr("cx", (s) => x(s.y)).attr("cy", (s) => y(s.v)).attr("r", 8.5).style("fill", "none").style("stroke", "var(--accent)").attr("stroke-width", 2);
    const dots = svg.append("g").selectAll("circle.dot").data(S).join("circle")
      .attr("cx", (s) => x(s.y)).attr("cy", (s) => y(s.v)).attr("r", 4.5)
      .style("fill", "var(--accent-2)").style("stroke", "var(--surface)").attr("stroke-width", 2);
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).style("stroke", "var(--axis)").attr("visibility", "hidden");
    svg.append("rect").attr("x", m.l).attr("y", 0).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("class", "hit").style("cursor", "crosshair")
      .on("pointermove", (e) => {
        const [px] = d3.pointer(e);
        const yr = x.invert(px);
        const s = S.reduce((a, b) => (Math.abs(b.y - yr) < Math.abs(a.y - yr) ? b : a));
        cross.attr("x1", x(s.y)).attr("x2", x(s.y)).attr("visibility", "visible");
        dots.attr("r", (q) => (q === s ? 6 : 4.5));
        showTip(e, String(s.y) + (titles.has(s.y) ? " · world champion" : ""), [
          { v: pct(s.v), k: "level delivered", key: "var(--accent-2)" },
          { v: pct(s.v - Z90 * s.se) + " to " + pct(s.v + Z90 * s.se), k: "90% range" }], { sub: (s.teams || []).join(", ") });
      })
      .on("pointerleave", () => { cross.attr("visibility", "hidden"); dots.attr("r", 4.5); hideTip(); });
  });
}

function swarm(host, d) {
  return observeWidth(host, (w) => {
    const pool = DB.ranked;
    const h = w < 560 ? 150 : 170;
    const m = { l: 10, r: 10, t: 22, b: 26 };
    const x = d3.scaleLinear(d3.extent(pool, (p) => p.rating), [m.l + 6, w - m.r - 6]).nice();
    const r = w < 560 ? 3.4 : 4.2;
    const ys = dodge(pool.map((p) => x(p.rating)), r);
    const cy = m.t + (h - m.t - m.b) / 2;
    const svg = makeSvg(host, w, h, "Where " + d.name + " ranks among all " + DB.N + " drivers");
    bottomAxis(svg, x, x.ticks(w < 560 ? 4 : 7), (v) => (Math.abs(v) < 1e-9 ? "avg" : pctTick(v, 1)), h - m.b);
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t - 8).attr("y2", h - m.b).style("stroke", "var(--axis)").attr("stroke-dasharray", "2 3");
    const g = svg.append("g");
    pool.forEach((p, i) => {
      const me = p.id === d.id;
      if (me) return;
      g.append("circle").attr("cx", x(p.rating)).attr("cy", cy + ys[i]).attr("r", r)
        .style("fill", p.titles ? "var(--accent)" : "var(--de-emph)").style("fill-opacity", p.titles ? 0.85 : 0.9)
        .style("cursor", "pointer")
        .on("pointermove", (e) => showTip(e, p.name, [{ v: pct(p.rating), k: "P" + p.rank }], { sub: yrs(p) }))
        .on("pointerleave", hideTip)
        .on("click", (e) => tapToGo(e, p.id, "/driver/" + p.id, () => showTip(e, p.name, [{ v: pct(p.rating), k: "P" + p.rank }], { hint: "Tap again to open" })));
    });
    const i = pool.findIndex((p) => p.id === d.id);
    if (i >= 0) {
      const px = x(d.rating), py = cy + ys[i];
      svg.append("circle").attr("cx", px).attr("cy", py).attr("r", r + 3).style("fill", "var(--accent-2)").style("stroke", "var(--surface)").attr("stroke-width", 2);
      const anchor = px > w - 90 ? "end" : px < 90 ? "start" : "middle";
      svg.append("text").attr("x", px).attr("y", m.t - 8).attr("text-anchor", anchor).attr("class", "lbl-b halo").text(lastName(d) + " · P" + d.rank);
      svg.append("line").attr("x1", px).attr("x2", px).attr("y1", m.t - 4).attr("y2", py - r - 3).style("stroke", "var(--accent-2)");
    }
  });
}

function matesTable(d) {
  const list = DB.mates.get(d.id) || [];
  const body = el("tbody");
  for (const t of list) {
    const o = DB.byId.get(t.b);
    const nameCell = o ? el("a", { href: "/driver/" + o.id, text: o.name }) : el("span", {}, nameOf(t.b), el("span", { class: "muted", text: " · before 1990" }));
    const nq = t.qw + t.ql;
    const gap = t.adj;
    const bar = el("span", { class: "div-bar", "aria-hidden": "true" });
    if (gap != null) {
      const c = Math.max(-1, Math.min(1, gap / 1.0));
      const wpx = Math.max(2, Math.abs(c) * 48);
      bar.append(el("i", { style: { left: c >= 0 ? "50%" : `calc(50% - ${wpx}px)`, width: wpx + "px", background: gap >= 0 ? "var(--accent)" : "var(--accent-2)" } }));
    }
    body.append(el("tr", {},
      el("td", {}, nameCell),
      el("td", { class: "n c-yr", text: span(t.y0, t.y1) }),
      el("td", { class: "n" }, el("span", { class: "split" },
        el("span", { class: "split-bar", "aria-hidden": "true" }, el("i", { style: { width: nq ? (100 * t.qw) / nq + "%" : "0" } })),
        t.qw + "–" + t.ql)),
      el("td", { class: "n", text: t.rw + "–" + t.rl }),
      el("td", { class: "n" }, el("span", { class: "split" }, bar, gap == null ? "–" : pct(gap)))));
  }
  return el("div", { class: "table-scroll" }, el("table", { class: "mates" },
    el("thead", {}, el("tr", {},
      el("th", { text: "Teammate" }), el("th", { class: "n c-yr", text: "Years" }), el("th", { class: "n", text: "Qualifying" }),
      el("th", { class: "n", text: "Races" }), el("th", { class: "n", text: "Median gap" }))),
    body));
}

function nearList(d) {
  if (d.rank == null) return null;
  const i = d.rank - 1;
  const from = Math.max(0, Math.min(i - 4, DB.N - 9));
  const rows = DB.ranked.slice(from, from + 9);
  return el("div", { class: "near" }, rows.map((p) => {
    const kids = [el("span", { class: "p", text: "P" + p.rank }), el("span", { text: p.name }), el("span", { class: "v", text: pct(p.rating) })];
    return p.id === d.id
      ? el("div", { class: "me", "aria-current": "true" }, ...kids)
      : el("a", { href: "/compare/" + d.id + "/" + p.id, "aria-label": "Compare with " + p.name + ", P" + p.rank + ", " + pct(p.rating) }, ...kids);
  }));
}

export default {
  mount(root, params) {
    const d = DB.byId.get(params.id);
    if (!d) return notFound(root, params.id);
    setTitle(d.name);
    const ranked = d.rank != null;
    const prev = ranked && d.rank > 1 ? DB.ranked[d.rank - 2] : null;
    const next = ranked && d.rank < DB.N ? DB.ranked[d.rank] : null;
    const lo = d.rating - Z90 * d.se, hi = d.rating + Z90 * d.se;
    const better = ranked ? Math.round((100 * (DB.N - d.rank)) / (DB.N - 1)) : null;
    const meta = [yrs(d), plural(d.starts, "start"), plural(d.wins, "win"), plural(d.poles, "pole"), titleText(d)].filter(Boolean).join(" · ");

    const notes = [];
    if (!d.connected) notes.push(["Not on the shared scale. ", "Only ever teammates with one driver who was also only ever teammates with them, so this number is relative to that pair alone and is left out of the ranking."]);
    if (isRising(d)) notes.push(["Early career. ", "This includes the improvement rookies usually make over their first 50 or so starts, so it is partly a projection."]);
    else if (d.developing && d.connected) notes.push(["Short career. ", "Fewer than 60 starts, so much of this rating rests on the rookie learning-curve adjustment."]);
    if (d.rank_alt != null && ranked && Math.abs(d.rank_alt - d.rank) >= 5) notes.push(["Sensitive to the era scale. ", "If a 1% gap in the 1980s counted the same as 1% today, " + lastName(d) + " would rank P" + d.rank_alt + " instead of P" + d.rank + "."]);
    if (d.n_quali < 20) notes.push(["Small sample. ", "Only " + plural(d.n_quali, "qualifying duel") + ", so the range is wide and the estimate is pulled toward average."]);

    const presets = ["ayrton-senna", "michael-schumacher", "max-verstappen", "lewis-hamilton", "fernando-alonso"]
      .filter((id) => id !== d.id && DB.byId.has(id)).slice(0, 3);
    const rival = next || prev;
    const seasonHost = el("div", { class: "chart" });
    const swarmHost = el("div", { class: "chart center" });

    const view = el("div", { class: "container view" },
      el("nav", { class: "crumbs", "aria-label": "Breadcrumb" },
        el("span", {}, el("a", { href: "/rankings", text: "Rankings" }), " / ", el("span", { text: d.name })),
        ranked ? el("span", { class: "prevnext" },
          prev ? el("a", { href: "/driver/" + prev.id, "aria-label": "Previous: " + prev.name }, icon("arrowLeft"), "P" + prev.rank + " " + lastName(prev)) : null,
          next ? el("a", { href: "/driver/" + next.id, "aria-label": "Next: " + next.name }, "P" + next.rank + " " + lastName(next), icon("arrowRight")) : null) : null),
      el("header", { class: "d-hero" },
        el("div", {},
          el("p", { class: "eyebrow" }, ranked ? "P" + d.rank + " of " + DB.N : "Not ranked", d.abbr ? el("span", { text: d.abbr }) : null, d.nat ? el("span", { text: d.nat }) : null),
          el("h1", { text: d.name }),
          el("p", { class: "d-meta", text: meta })),
        el("div", { class: "d-fig" },
          el("div", { class: "d-big " + (d.rating >= 0 ? "up" : "down"), text: pct(d.rating) }),
          el("p", {}, "≈ " + secs(d.rating) + " a lap " + (d.rating >= 0 ? "faster" : "slower") + " than an average F1 driver of 1990–2026 in the same car."),
          ranked ? el("div", { class: "pctile" }, "Ahead of " + better + "% of the " + DB.N + " ranked drivers",
            el("div", { class: "pctile-bar" }, el("i", { style: { width: better + "%" } }))) : null)),
      el("div", { class: "tiles" },
        tile("Equal-car ratio", ratio(d.rating), "lap time ÷ average driver's"),
        tile("90% range", sgn(lo) + " to " + sgn(hi), "rating, % per lap"),
        tile("One-lap pace", pct(d.pace), ranked ? "P" + d.rank_pace + " in qualifying" : "qualifying"),
        tile("Race-day adjustment", pct(d.race), ranked ? "P" + d.rank_race + " on race day" : "on race day"),
        tile("Duels", fmtInt(d.n_quali), "qualifying · " + fmtInt(d.n_race) + " race"),
        tile("Without era scale", d.rank_alt != null ? "P" + d.rank_alt : "–", "if a % then were a % now")),
      notes.length ? el("div", { class: "notes-row" }, notes.map(([b, t]) => el("p", { class: "note" }, el("strong", { text: b }), t))) : null,
      el("section", { class: "card" },
        el("div", { class: "card-head-row" },
          el("div", { class: "card-head" },
            el("h2", { text: "Season by season" }),
            el("p", { text: "The level " + lastName(d) + " delivered each season, rookie and age effects included, against the career rating." })),
          el("div", { class: "legend" },
            el("span", { class: "k" }, el("i", { class: "line", style: { background: "var(--accent-2)" } }), "Season level, 90% band"),
            el("span", { class: "k" }, el("i", { class: "line", style: { background: "var(--accent)" } }), "Career rating"),
            d.titles ? el("span", { class: "k" }, el("i", { class: "ring" }), "Title year") : null)),
        seasonHost),
      !ranked ? null : el("div", { class: "grid-2 stretch" },
        el("section", { class: "card" },
          el("div", { class: "card-head" },
            el("h2", { text: "Where " + lastName(d) + " ranks" }),
            el("p", { text: "Every ranked driver by rating. Champions in blue. Click a dot to open that driver." })),
          swarmHost),
        el("section", { class: "card" },
          el("div", { class: "card-head" },
            el("h2", { text: "Closest in rating" }),
            el("p", { text: "Neighbours in the ranking are often within each other's range. Click one to put them head to head." })),
          nearList(d))),
      el("section", { class: "card" },
        el("div", { class: "card-head" },
          el("h2", { text: "Against every teammate" }),
          el("p", { text: "Head-to-head wins and losses, qualifying and race. Median gap is the typical qualifying gap in today's terms: positive (blue) means " + lastName(d) + " was faster." })),
        matesTable(d),
        el("p", { class: "caption", text: "Race duels count only results both drivers controlled: mechanical failures and collisions are left out." })),
      el("section", { class: "card" },
        el("div", { class: "card-head" },
          el("h2", { text: "Put " + lastName(d) + " head to head" }),
          el("p", { text: "Pick any driver from any era to see the expected gap in identical cars and the teammate chain that links them." })),
        el("div", { class: "presets" },
          presets.map((id) => el("a", { href: "/compare/" + d.id + "/" + id, text: "vs " + DB.byId.get(id).name })),
          el("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => openPicker("Compare " + d.name + " with", (o) => navigate("/compare/" + d.id + "/" + o.id), { exclude: d.id }) },
            icon("search"), "Pick a driver"))),
      nextLink(rival ? "/compare/" + d.id + "/" + rival.id : "/compare", "Next · Head to head",
        rival ? lastName(d) + " vs " + lastName(rival) : "Head to head", "Neighbours in the ranking, in identical cars."));
    root.append(view);
    const charts = [seasonChart(seasonHost, d), ...(ranked ? [swarm(swarmHost, d)] : [])];
    return () => charts.forEach((c) => c.stop());
  },
};

function tile(k, v, s) {
  return el("div", { class: "tile" }, el("span", { class: "k", text: k }), el("span", { class: "v", text: v }), s ? el("span", { class: "s", text: s }) : null);
}
