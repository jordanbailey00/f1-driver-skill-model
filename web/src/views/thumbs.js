// Small previews of each visualization for the home page's "Explore" cards, drawn from the
// real data. They are decorative (aria-hidden): the card text says where each one goes.
import * as d3 from "d3";
import { DB } from "../lib/data.js";
import { Z90 } from "../lib/format.js";
import { rng } from "../lib/stats.js";

const W = 280, H = 128;
function svg(host) {
  host.replaceChildren();
  return d3.select(host).append("svg").attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet").attr("aria-hidden", "true");
}

function rankings(host) {
  const s = svg(host);
  const top = DB.ranked.slice(0, 7);
  const x = d3.scaleLinear([-0.1, 0.95], [70, W - 18]);
  s.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 12).attr("y2", H - 10).style("stroke", "var(--axis)");
  top.forEach((d, i) => {
    const y = 18 + i * 15.5;
    s.append("text").attr("x", 22).attr("y", y + 4).attr("class", "lbl-mono").style("fill", "var(--ink-2)").style("font-size", "10px").text(d.abbr);
    s.append("line").attr("x1", x(d.rating - Z90 * d.se)).attr("x2", x(d.rating + Z90 * d.se)).attr("y1", y).attr("y2", y)
      .style("stroke", "var(--accent-soft)").attr("stroke-width", 3).attr("stroke-linecap", "round");
    s.append("circle").attr("cx", x(d.rating)).attr("cy", y).attr("r", 4).style("fill", "var(--accent)").style("stroke", "var(--page)").attr("stroke-width", 1.5);
  });
}

function timeline(host) {
  const s = svg(host);
  const x = d3.scaleLinear([1977, 2027], [12, W - 12]);
  const y = d3.scaleLinear([-1.1, 0.75], [H - 10, 10]);
  const rows = DB.ranked.filter((d) => d.n_quali >= 20).sort((a, b) => (a.titles ? 1 : 0) - (b.titles ? 1 : 0));
  for (const d of rows) {
    s.append("line").attr("x1", x(d.first)).attr("x2", x(d.last + 1)).attr("y1", y(d.rating)).attr("y2", y(d.rating))
      .style("stroke", d.titles ? "var(--accent)" : "var(--de-emph)").attr("stroke-width", d.titles ? 2.2 : 1.5).attr("stroke-linecap", "round");
  }
}

function seasons(host) {
  const s = svg(host);
  const season = DB.seasons.get(DB.years[DB.years.length - 1]);
  const teams = season.teams.filter((t) => t.pairs.length).slice(0, 6);
  const x = d3.scaleLinear([-0.9, 0.7], [22, W - 22]);
  teams.forEach((t, i) => {
    const y = 18 + i * 18.5;
    const p = t.pairs[0];
    const va = DB.byId.get(p.a)?.seasonByYear.get(season.y)?.v, vb = DB.byId.get(p.b)?.seasonByYear.get(season.y)?.v;
    if (va == null || vb == null) return;
    s.append("line").attr("x1", x(va)).attr("x2", x(vb)).attr("y1", y).attr("y2", y).style("stroke", "var(--axis)").attr("stroke-width", 2);
    const aWon = p.qa >= p.qb;
    s.append("circle").attr("cx", x(va)).attr("cy", y).attr("r", 4.5).style("fill", aWon ? "var(--accent)" : "var(--de-emph)");
    s.append("circle").attr("cx", x(vb)).attr("cy", y).attr("r", 4.5).style("fill", aWon ? "var(--de-emph)" : "var(--accent)");
  });
}

function compare(host) {
  const s = svg(host);
  const a = DB.byId.get("ayrton-senna") || DB.ranked[0], b = DB.byId.get("max-verstappen") || DB.ranked[1];
  const x = d3.scaleLinear([0.05, 1.0], [10, W - 10]);
  const y = d3.scaleLinear([0, 5.4], [H - 12, 10]);
  for (const [d, c] of [[b, "var(--accent-2)"], [a, "var(--accent)"]]) {
    const pts = d3.range(0.05, 1.0001, 0.01).map((v) => [v, Math.exp(-0.5 * ((v - d.rating) / d.se) ** 2) / (d.se * Math.sqrt(2 * Math.PI))]);
    s.append("path").attr("d", d3.area().x((p) => x(p[0])).y0(y(0)).y1((p) => y(p[1])).curve(d3.curveBasis)(pts))
      .style("fill", c).style("fill-opacity", 0.18);
    s.append("path").attr("d", d3.line().x((p) => x(p[0])).y((p) => y(p[1])).curve(d3.curveBasis)(pts))
      .style("stroke", c).style("fill", "none").attr("stroke-width", 2);
  }
  s.append("line").attr("x1", 10).attr("x2", W - 10).attr("y1", y(0)).attr("y2", y(0)).style("stroke", "var(--axis)");
}

function network(host) {
  const s = svg(host);
  const net = DB.raw.network;
  const r = rng(7);
  const x = d3.scaleLinear([1977, 2026], [14, W - 14]);
  const pos = net.nodes.map((n) => [x((n[2] + n[3]) / 2) + (r() - 0.5) * 6, H / 2 + (r() - 0.5) * (H - 34) * (0.55 + 0.45 * r())]);
  const g = s.append("g");
  for (const l of net.links) {
    if (l[2] + l[3] < 10) continue;
    const p = pos[l[0]], q = pos[l[1]];
    g.append("line").attr("x1", p[0]).attr("y1", p[1]).attr("x2", q[0]).attr("y2", q[1]).style("stroke", "var(--axis)").attr("stroke-width", 0.6);
  }
  net.nodes.forEach((n, i) => {
    const d = DB.byId.get(n[0]);
    s.append("circle").attr("cx", pos[i][0]).attr("cy", pos[i][1]).attr("r", d?.titles ? 2.6 : 1.8)
      .style("fill", !d ? "var(--de-emph)" : d.rating > 0 ? "var(--accent)" : "var(--accent-2)").style("fill-opacity", d ? 0.9 : 0.6);
  });
}

function driver(host) {
  const s = svg(host);
  const d = DB.byId.get("max-verstappen") || DB.ranked[0];
  const S = d.seasons;
  const x = d3.scaleLinear(d3.extent(S, (p) => p.y), [16, W - 16]);
  const y = d3.scaleLinear([d3.min(S, (p) => p.v - Z90 * p.se) - 0.05, d3.max(S, (p) => p.v + Z90 * p.se) + 0.05], [H - 12, 12]);
  s.append("path").attr("d", d3.area().x((p) => x(p.y)).y0((p) => y(p.v - Z90 * p.se)).y1((p) => y(p.v + Z90 * p.se)).curve(d3.curveMonotoneX)(S))
    .style("fill", "var(--accent-2)").style("fill-opacity", 0.14);
  s.append("line").attr("x1", 16).attr("x2", W - 16).attr("y1", y(d.rating)).attr("y2", y(d.rating)).style("stroke", "var(--accent)").attr("stroke-width", 1.5);
  s.append("path").attr("d", d3.line().x((p) => x(p.y)).y((p) => y(p.v)).curve(d3.curveMonotoneX)(S))
    .style("stroke", "var(--accent-2)").style("fill", "none").attr("stroke-width", 2);
  for (const p of S) s.append("circle").attr("cx", x(p.y)).attr("cy", y(p.v)).attr("r", 3).style("fill", "var(--accent-2)").style("stroke", "var(--page)").attr("stroke-width", 1.5);
}

function method(host) {
  const s = svg(host);
  const pts = DB.raw.gap_by_year;
  const x = d3.scaleLinear([1977, 2026], [14, W - 14]);
  const y = d3.scaleLinear([0, d3.max(pts, (p) => p.q3)], [H - 12, 12]);
  s.append("path").attr("d", d3.area().x((p) => x(p.y)).y0((p) => y(p.q1)).y1((p) => y(p.q3)).curve(d3.curveMonotoneX)(pts))
    .style("fill", "var(--accent)").style("fill-opacity", 0.15);
  s.append("path").attr("d", d3.line().x((p) => x(p.y)).y((p) => y(p.med)).curve(d3.curveMonotoneX)(pts))
    .style("stroke", "var(--accent)").style("fill", "none").attr("stroke-width", 2);
  s.append("line").attr("x1", 14).attr("x2", W - 14).attr("y1", y(0)).attr("y2", y(0)).style("stroke", "var(--axis)");
}

function validation(host) {
  const s = svg(host);
  const V = DB.raw.validation.filter((r) => r.kind === "quali" && r.subset === "all pairs" &&
    ["full model", "raw teammate record", "average finish", "points per start", "raw avg gap to teammate", "win rate"].includes(r.method))
    .sort((a, b) => b.accuracy - a.accuracy);
  const x = d3.scaleLinear([0.5, 0.68], [24, W - 24]);
  V.forEach((r, i) => {
    const y = 16 + i * 19;
    const m = r.method === "full model";
    s.append("line").attr("x1", x(0.5)).attr("x2", x(r.accuracy)).attr("y1", y).attr("y2", y).style("stroke", m ? "var(--accent-soft)" : "var(--grid)").attr("stroke-width", 3).attr("stroke-linecap", "round");
    s.append("circle").attr("cx", x(r.accuracy)).attr("cy", y).attr("r", m ? 5 : 4).style("fill", m ? "var(--accent)" : "var(--de-emph)");
  });
}

export const THUMBS = { rankings, timeline, seasons, compare, network, driver, method, validation };
