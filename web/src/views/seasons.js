import * as d3 from "d3";
import { DB } from "../lib/data.js";
import { el, icon, nextLink, setTitle } from "../lib/dom.js";
import { Z90, lastName, pct, pctTick } from "../lib/format.js";
import { bottomAxis, makeSvg, observeWidth, tapToGo, vGrid } from "../lib/chart.js";
import { navigate, setQuery } from "../lib/router.js";
import { hideTip, showTip } from "../lib/tooltip.js";


const code = (d) => d.abbr || lastName(d).slice(0, 3).toUpperCase();

// One season: each team's starters with their season level and the main pair's record.
function teamRows(season) {
  return season.teams.map((t) => {
    const ds = t.drivers.map(([id, n]) => ({ d: DB.byId.get(id), n })).filter((x) => x.d);
    const p = t.pairs.slice().sort((a, b) => (b.qa + b.qb + b.ra + b.rb) - (a.qa + a.qb + a.ra + a.rb))[0] || null;
    for (const x of ds) x.s = x.d.seasonByYear.get(season.y);
    return { t, ds, p };
  });
}

function h2h(p, aWins, bWins) {
  if (!p) return null;
  const A = DB.byId.get(p.a), B = DB.byId.get(p.b);
  if (!A || !B) return null;
  const wa = p[aWins], wb = p[bWins];
  if (wa + wb === 0) return null;
  return wa >= wb ? { lead: A, w: wa, l: wb } : { lead: B, w: wb, l: wa };
}

export default {
  mount(root, params, query) {
    const years = DB.years;
    let year = params.year ? +params.year : years[years.length - 1];
    if (!DB.seasons.has(year)) year = years.reduce((a, b) => (Math.abs(b - year) < Math.abs(a - year) ? b : a));
    setTitle(year + " season");
    const season = DB.seasons.get(year);
    const rowsAll = teamRows(season);
    const mode = { v: query.get("view") === "drivers" ? "drivers" : "teams" };
    const champ = DB.champion.get(year);
    const go = (y) => navigate("/seasons/" + y + (mode.v === "drivers" ? "?view=drivers" : ""), { keepScroll: true });

    // season-wide facts
    const drivers = rowsAll.flatMap((r) => r.ds).filter((x) => x.s && x.d.connected);
    const uniq = [...new Map(drivers.map((x) => [x.d.id, x])).values()].sort((a, b) => b.s.v - a.s.v);
    const best = uniq[0];
    const battles = rowsAll.filter((r) => r.p && r.p.qa + r.p.qb >= 8).map((r) => ({ r, share: Math.max(r.p.qa, r.p.qb) / (r.p.qa + r.p.qb) }));
    const closest = battles.slice().sort((a, b) => a.share - b.share || Math.abs(a.r.p.adj ?? 0) - Math.abs(b.r.p.adj ?? 0))[0];
    const lopsided = battles.slice().sort((a, b) => b.share - a.share || Math.abs(b.r.p.adj ?? 0) - Math.abs(a.r.p.adj ?? 0))[0];
    const battleText = (b) => {
      if (!b) return "–";
      const A = DB.byId.get(b.r.p.a), B = DB.byId.get(b.r.p.b);
      return [el("a", { href: "/driver/" + A.id, text: lastName(A) }), " " + b.r.p.qa + "–" + b.r.p.qb + " ", el("a", { href: "/driver/" + B.id, text: lastName(B) })];
    };
    const champRank = champ ? uniq.findIndex((x) => x.d.id === champ.id) + 1 : 0;

    const rail = el("div", { class: "years", role: "list" },
      years.map((y) => el("a", { href: "/seasons/" + y, role: "listitem", "aria-current": y === year ? "page" : null, text: String(y),
        onclick: (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); go(y); } })));
    const i = years.indexOf(year);
    const modeSeg = el("div", { class: "seg", role: "group", "aria-label": "Show" });
    const host = el("div", { class: "chart" });
    const legend = el("div", { class: "legend" });

    const view = el("div", { class: "container view" },
      el("header", { class: "view-head" },
        el("p", { class: "eyebrow", text: "Year by year" }),
        el("h1", { text: "The " + year + " season" }),
        el("p", { class: "lede", text: "Every team's line-up on the same equal-car scale. Teammates had identical cars, so the gap inside each row is the drivers; the spread between rows is not the cars, it's who each team hired." })),
      el("div", { class: "year-rail" },
        el("button", { type: "button", class: "icon-btn", "aria-label": "Previous season", disabled: i <= 0 ? true : null, onclick: () => i > 0 && go(years[i - 1]) }, icon("arrowLeft")),
        rail,
        el("button", { type: "button", class: "icon-btn", "aria-label": "Next season", disabled: i >= years.length - 1 ? true : null, onclick: () => i < years.length - 1 && go(years[i + 1]) }, icon("arrowRight"))),
      el("div", { class: "season-sum tiles" },
        tile("World champion", champ ? [el("a", { href: "/driver/" + champ.id, text: champ.name })] : ["–"],
          champ && champRank ? "P" + champRank + " of " + uniq.length + " on this scale" : ""),
        tile("Best level this season", best ? [el("a", { href: "/driver/" + best.d.id, text: best.d.name })] : ["–"], best ? pct(best.s.v) + " · " + (best.s.teams || []).join(", ") : ""),
        tile("Closest qualifying battle", battleText(closest), closest ? closest.r.t.name : ""),
        tile("Most one-sided", battleText(lopsided), lopsided ? lopsided.r.t.name : "")),
      el("section", { class: "card" },
        el("div", { class: "card-head-row" },
          el("div", { class: "card-head" },
            el("h2", { text: mode.v === "teams" ? "Teammate battles" : "Every driver" }),
            el("p", { text: "Season level: what each driver delivered in " + year + ", rookie and age effects included, as % per lap against an average driver." })),
          modeSeg),
        legend,
        host,
        el("p", { class: "caption", text: "Use ← and → to step through the seasons. Click a driver to open their page. Records count qualifying sessions and races both drivers finished on merit." })),
      el("section", { class: "card" },
        el("div", { class: "card-head" },
          el("h2", { text: "Best single seasons since 1990" }),
          el("p", { text: "Each driver's best season, ranked: the level they delivered that year, on the same scale. Click one to open that year." })),
        el("div", { class: "best grid-2", style: { gap: "2px 24px" } },
          bestPerDriver().slice(0, 12).map((b, k) => el("a", { href: "/seasons/" + b.s.y, "aria-current": b.s.y === year ? "true" : null },
            el("span", { class: "p", text: String(k + 1) }),
            el("span", { class: "t" }, b.d.name, el("small", { text: b.s.y + " · " + (b.s.teams || []).join(", ") })),
            el("span", { class: "v", text: pct(b.s.v) }))))),
      nextLink("/compare", "Next · Any two drivers", "Head to head", "Put drivers from different eras in identical cars."));
    root.append(view);
    requestAnimationFrame(() => {
      const cur = rail.querySelector('[aria-current="page"]');
      if (cur) rail.scrollLeft = cur.offsetLeft - rail.clientWidth / 2 + cur.clientWidth / 2;
    });

    // x range fitted to this season (never narrower than -0.6..+0.6), in steps of 0.2
    const vs = uniq.flatMap((x) => [x.s.v - Z90 * x.s.se, x.s.v + Z90 * x.s.se]);
    const dom = [Math.min(-0.6, Math.floor((d3.min(vs) ?? -0.6) * 5) / 5), Math.max(0.6, Math.ceil((d3.max(vs) ?? 0.6) * 5) / 5)];

    function renderSeg() {
      modeSeg.replaceChildren(...[["teams", "By team"], ["drivers", "All drivers"]].map(([k, label]) =>
        el("button", { type: "button", "aria-pressed": String(mode.v === k), text: label, onclick: () => {
          mode.v = k; renderSeg(); setQuery({ view: k === "drivers" ? "drivers" : null }); chart.redraw();
          view.querySelector(".card-head h2").textContent = k === "teams" ? "Teammate battles" : "Every driver";
        } })));
      legend.replaceChildren(...(mode.v === "teams"
        ? [el("span", { class: "k" }, el("i", { class: "dot", style: { background: "var(--accent)" } }), "Won the qualifying head-to-head"),
          el("span", { class: "k" }, el("i", { class: "dot", style: { background: "var(--de-emph)" } }), "Lost it"),
          el("span", { class: "k" }, el("i", { class: "ring" }), "World champion")]
        : [el("span", { class: "k" }, el("i", { class: "dot", style: { background: "var(--accent)" } }), "Season level"),
          el("span", { class: "k" }, el("i", { class: "bar", style: { background: "var(--accent-soft)" } }), "90% range"),
          el("span", { class: "k" }, el("i", { class: "ring" }), "World champion")]));
    }

    const tipFor = (e, x, team, rec, touch) => showTip(e, x.d.name, [
      { v: pct(x.s.v), k: year + " level" },
      { v: pct(x.s.v - Z90 * x.s.se) + " to " + pct(x.s.v + Z90 * x.s.se), k: "90% range" },
      ...(rec ? [{ v: rec, k: "vs teammate" }] : []),
      { v: pct(x.d.rating), k: "career rating · P" + (x.d.rank ?? "–") }], { sub: team + " · " + x.n + " starts", hint: touch ? "Tap again to open" : null });

    const chart = observeWidth(host, (w) => {
      const narrow = w < 640;
      if (mode.v === "drivers") return drawDrivers(w, narrow);
      const rows = rowsAll;
      const rowH = narrow ? 52 : 40;
      const m = { t: 30, r: narrow ? 14 : 178, b: 30, l: narrow ? 14 : 150 };
      const h = m.t + m.b + rows.length * rowH;
      const pad = narrow ? 34 : 78;
      const x = d3.scaleLinear(dom, [m.l + pad, w - m.r - pad]);
      const svg = makeSvg(host, w, h, "Teammate battles in " + year);
      vGrid(svg, x, x.ticks(narrow ? 4 : 8), m.t - 6, h - m.b);
      svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t - 6).attr("y2", h - m.b).style("stroke", "var(--axis)");
      bottomAxis(svg, x, x.ticks(narrow ? 4 : 8), (v) => (Math.abs(v) < 1e-9 ? "avg" : pctTick(v, 1)), h - m.b);
      if (!narrow) {
        svg.append("text").attr("x", 0).attr("y", 14).attr("class", "lbl-m").text("Team");
        svg.append("text").attr("x", w - m.r + 14).attr("y", 14).attr("class", "lbl-m").text("Qualifying");
        svg.append("text").attr("x", w - 76).attr("y", 14).attr("class", "lbl-m").text("Races");
      }
      svg.append("text").attr("x", x(0)).attr("y", 14).attr("text-anchor", "middle").attr("class", "lbl-m").text(narrow ? "season level" : "Season level, % per lap vs average");
      rows.forEach((r, k) => {
        const g = svg.append("g").attr("transform", `translate(0,${m.t + k * rowH})`);
        if (k % 2 === 0) g.append("rect").attr("x", 0).attr("y", 0).attr("width", w).attr("height", rowH).style("fill", "var(--hover)").attr("rx", 6);
        const cy = narrow ? 34 : rowH / 2;
        const q = h2h(r.p, "qa", "qb"), rc = h2h(r.p, "ra", "rb");
        if (narrow) {
          g.append("text").attr("x", 6).attr("y", 15).attr("class", "lbl").text(r.t.name);
          if (q) g.append("text").attr("x", w - 6).attr("y", 15).attr("text-anchor", "end").attr("class", "lbl-2 lbl-mono").text("Q " + code(q.lead) + " " + q.w + "–" + q.l);
        } else {
          g.append("text").attr("x", 0).attr("y", cy + 4).attr("class", "lbl").text(r.t.name.length > 20 ? r.t.name.slice(0, 19) + "…" : r.t.name);
          if (q) g.append("text").attr("x", w - m.r + 14).attr("y", cy + 4).attr("class", "lbl-2 lbl-mono").text(code(q.lead) + " " + q.w + "–" + q.l);
          if (rc) g.append("text").attr("x", w - 76).attr("y", cy + 4).attr("class", "lbl-2 lbl-mono").text(code(rc.lead) + " " + rc.w + "–" + rc.l);
        }
        const ds = r.ds.filter((x) => x.s && x.d.connected);
        if (r.ds.some((x) => x.s && !x.d.connected)) {
          g.append("text").attr("x", x(0) + 8).attr("y", cy + 4).attr("class", "lbl-m").text("not on the shared scale");
        }
        if (!ds.length) return;
        const main = r.p ? ds.filter((x) => x.d.id === r.p.a || x.d.id === r.p.b) : ds.slice(0, 2);
        if (main.length === 2) {
          g.append("line").attr("x1", x(main[0].s.v)).attr("x2", x(main[1].s.v)).attr("y1", cy).attr("y2", cy)
            .style("stroke", "var(--axis)").attr("stroke-width", 3).attr("stroke-linecap", "round");
        }
        const winner = q ? q.lead.id : null;
        const sorted = ds.slice().sort((a, b) => a.s.v - b.s.v);
        // labels: the main pair outside the dumbbell, anyone else (stand-ins, mid-season
        // swaps) above or below their dot, skipped if there's no room (the tooltip has them)
        const boxes = [];
        const fits = (b) => !boxes.some((o) => !(b.x1 < o.x0 || b.x0 > o.x1 || b.y1 < o.y0 || b.y0 > o.y1));
        const label = (txt, lx, ly, anchor, cls, force) => {
          const wl = txt.length * 7.2;
          const x0 = anchor === "end" ? lx - wl : anchor === "middle" ? lx - wl / 2 : lx;
          const b = { x0: x0 - 2, x1: x0 + wl + 2, y0: ly - 10, y1: ly + 2 };
          if (!force && (!fits(b) || b.x0 < (narrow ? 0 : m.l - 4) || b.x1 > w - m.r + (narrow ? 0 : 6))) return false;
          boxes.push(b);
          texts.push([txt, lx, ly, anchor, cls]);
          return true;
        };
        const texts = [];
        const mainSorted = sorted.filter((x0) => main.includes(x0));
        for (const x0 of sorted) boxes.push({ x0: x(x0.s.v) - 6, x1: x(x0.s.v) + 6, y0: cy - 6, y1: cy + 6 });
        mainSorted.forEach((x0, j) => {
          const cx = x(x0.s.v);
          const txt = narrow ? code(x0.d) : lastName(x0.d);
          if (mainSorted.length === 1 || j === mainSorted.length - 1) label(txt, cx + 11, cy + 4, "start", "lbl-b", true);
          else label(txt, cx - 11, cy + 4, "end", "lbl-b", true);
        });
        for (const x0 of sorted.filter((s) => !main.includes(s))) {
          const cx = x(x0.s.v), txt = code(x0.d);
          label(txt, cx, cy - 10, "middle", "lbl-2") || label(txt, cx, cy + 19, "middle", "lbl-2");
        }
        sorted.forEach((x0) => {
          const isMain = main.includes(x0);
          const cx = x(x0.s.v);
          const rec = r.p && isMain ? (() => {
            const mine = x0.d.id === r.p.a;
            return "quali " + (mine ? r.p.qa : r.p.qb) + "–" + (mine ? r.p.qb : r.p.qa) + " · race " + (mine ? r.p.ra : r.p.rb) + "–" + (mine ? r.p.rb : r.p.ra);
          })() : null;
          if (champ && champ.id === x0.d.id) g.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 10).style("fill", "none").style("stroke", "var(--accent)").attr("stroke-width", 2);
          g.append("circle").attr("cx", cx).attr("cy", cy).attr("r", isMain ? 6 : 4.5)
            .style("fill", winner ? (winner === x0.d.id ? "var(--accent)" : "var(--de-emph)") : "var(--ink-2)")
            .style("stroke", "var(--surface)").attr("stroke-width", 2);
          g.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 14).attr("class", "hit")
            .on("pointermove", (e) => tipFor(e, x0, r.t.name, rec))
            .on("pointerleave", hideTip)
            .on("click", (e) => tapToGo(e, x0.d.id + year, "/driver/" + x0.d.id, () => tipFor(e, x0, r.t.name, rec, true)));
        });
        // labels last, so their halo sits over any dot they touch
        for (const [txt, lx, ly, anchor, cls] of texts) {
          g.append("text").attr("x", lx).attr("y", ly).attr("text-anchor", anchor).attr("class", cls + " lbl-mono halo")
            .attr("pointer-events", "none").style("font-size", "11.5px").text(txt);
        }
      });
    });

    function drawDrivers(w, narrow) {
      const list = uniq;
      const rowH = 24;
      const m = { t: 24, r: 64, b: 30, l: narrow ? 120 : 240 };
      const h = m.t + m.b + list.length * rowH;
      const x = d3.scaleLinear(dom, [m.l + 10, w - m.r]);
      const svg = makeSvg(host, w, h, "Every driver's level in " + year);
      vGrid(svg, x, x.ticks(narrow ? 4 : 8), m.t - 6, h - m.b);
      svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t - 6).attr("y2", h - m.b).style("stroke", "var(--axis)");
      bottomAxis(svg, x, x.ticks(narrow ? 4 : 8), (v) => (Math.abs(v) < 1e-9 ? "avg" : pctTick(v, 1)), h - m.b);
      list.forEach((r, k) => {
        const cy = m.t + k * rowH + rowH / 2;
        const team = (r.s.teams || []).join(", ");
        svg.append("text").attr("x", 0).attr("y", cy + 4).attr("class", "lbl-m lbl-mono").text(String(k + 1));
        svg.append("text").attr("x", 26).attr("y", cy + 4).attr("class", "lbl").text(narrow ? lastName(r.d) : r.d.name);
        if (!narrow) svg.append("text").attr("x", m.l - 8).attr("y", cy + 4).attr("text-anchor", "end").attr("class", "lbl-m").text(team.length > 16 ? team.slice(0, 15) + "…" : team);
        svg.append("line").attr("x1", x(r.s.v - Z90 * r.s.se)).attr("x2", x(r.s.v + Z90 * r.s.se)).attr("y1", cy).attr("y2", cy)
          .style("stroke", "var(--accent-soft)").attr("stroke-width", 3).attr("stroke-linecap", "round");
        if (champ && champ.id === r.d.id) svg.append("circle").attr("cx", x(r.s.v)).attr("cy", cy).attr("r", 8.5).style("fill", "none").style("stroke", "var(--accent)").attr("stroke-width", 2);
        svg.append("circle").attr("cx", x(r.s.v)).attr("cy", cy).attr("r", 4.5).style("fill", "var(--accent)").style("stroke", "var(--surface)").attr("stroke-width", 2);
        svg.append("text").attr("x", w - 2).attr("y", cy + 4).attr("text-anchor", "end").attr("class", "lbl-2 lbl-mono").text(pct(r.s.v));
        svg.append("rect").attr("x", 0).attr("y", cy - rowH / 2).attr("width", w).attr("height", rowH).attr("class", "hit")
          .on("pointermove", (e) => tipFor(e, r, team, null))
          .on("pointerleave", hideTip)
          .on("click", (e) => tapToGo(e, r.d.id + year, "/driver/" + r.d.id, () => tipFor(e, r, team, null, true)));
      });
    }

    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.getElementById("palette").open) return;
      if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); go(years[i - 1]); }
      if (e.key === "ArrowRight" && i < years.length - 1) { e.preventDefault(); go(years[i + 1]); }
    };
    document.addEventListener("keydown", onKey);
    renderSeg();
    chart.redraw();
    return () => { chart.stop(); document.removeEventListener("keydown", onKey); };
  },
};

function bestPerDriver() {
  const seen = new Set();
  return DB.bestSeasons.filter((b) => b.d.connected && !seen.has(b.d.id) && seen.add(b.d.id));
}

function tile(k, v, s) {
  return el("div", { class: "tile" }, el("span", { class: "k", text: k }), el("span", { class: "v" }, ...v), s ? el("span", { class: "s", text: s }) : null);
}
