import * as d3 from "d3";
import { DB } from "../lib/data.js";
import { el, nextLink, setTitle } from "../lib/dom.js";
import { fmtInt } from "../lib/format.js";
import { bottomAxis, hGrid, leftAxis, makeSvg, observeWidth, vGrid } from "../lib/chart.js";
import { hideTip, showTip } from "../lib/tooltip.js";

const LABEL = {
  "full model": "Equal-car rating",
  "raw teammate record": "Career record vs teammates",
  "raw avg gap to teammate": "Average gap to teammates",
  "average finish": "Average finishing position",
  "points per start": "Points per start",
  "win rate": "Win rate",
};
const VARIANTS = {
  "full model": "Full model",
  "no era scale": "No era scale",
  "era scatter only (a % is a %)": "A 1990 % equals a 2020 %",
  "no age/experience curves": "No learning or ageing curves",
  "no season form": "No season-to-season form",
};
const KINDS = [["quali", "Qualifying duels"], ["season quali H2H", "Season head-to-heads"], ["race", "Race duels"]];
const PERIODS = [[1996, 2000], [2001, 2005], [2006, 2010], [2011, 2015], [2016, 2020], [2021, 2026]];
const pc = (v, d = 0) => (100 * v).toFixed(d) + "%";

export default {
  mount(root, _params, query) {
    setTitle("Does it work?");
    const V = DB.raw.validation;
    const get = (kind, subset, method) => V.find((r) => r.kind === kind && r.subset === subset && r.method === method);
    const bases = Object.keys(LABEL).filter((k) => k !== "full model");
    const mAll = get("quali", "all pairs", "full model"), mNew = get("quali", "new pairings", "full model");
    const bNew = bases.map((b) => get("quali", "new pairings", b).accuracy);
    const bAll = bases.map((b) => get("quali", "all pairs", b).accuracy);
    const sNew = get("season quali H2H", "new pairings", "full model");
    const state = { kind: KINDS.some((k) => k[0] === query.get("kind")) ? query.get("kind") : "quali" };

    const seg = el("div", { class: "seg", role: "group", "aria-label": "Outcome to predict" });
    const dotHost = el("div", { class: "chart" });
    const dotCap = el("p", { class: "caption" });
    const calHost = el("div", { class: "chart" });
    const perHost = el("div", { class: "chart" });

    const view = el("div", { class: "container view" },
      el("header", { class: "view-head" },
        el("p", { class: "eyebrow", text: "Does it work?" }),
        el("h1", { text: "Tested on seasons it had never seen" }),
        el("p", { class: "lede" },
          "For every season from 1996 to 2026, the model was refitted using only earlier races and asked who would win each teammate duel. The career numbers people usually quote got the same question. ",
          el("strong", { text: "The rating picked the faster qualifier " + pc(mAll.accuracy) + " of the time; the career numbers managed " + pc(Math.min(...bAll)) + "–" + pc(Math.max(...bAll)) + "." }))),
      el("div", { class: "grid-3" },
        stat(pc(mAll.accuracy), "of " + fmtInt(mAll.n) + " qualifying duels called right", "Best career number: " + pc(Math.max(...bAll))),
        stat(pc(mNew.accuracy), "between drivers who had never been teammates", "The real test of the chaining. Career numbers: " + pc(Math.min(...bNew)) + "–" + pc(Math.max(...bNew))),
        stat(pc(sNew.accuracy), "of new pairings' season-long qualifying battles", fmtInt(sNew.n) + " team-seasons with 6+ duels")),
      el("section", { class: "card" },
        el("div", { class: "card-head-row" },
          el("div", { class: "card-head" },
            el("h2", { text: "Right more often than any career number" }),
            el("p", { text: "Share of teammate duels each method called right, 1996–2026. 50% is a coin flip: teammates are close, so even a perfect rating would fall well short of 100%." })),
          seg),
        el("div", { class: "legend" },
          el("span", { class: "k" }, el("i", { class: "dot", style: { background: "var(--accent)" } }), "All teammate pairs"),
          el("span", { class: "k" }, el("i", { class: "dot", style: { background: "var(--accent-2)" } }), "Never-before teammates")),
        dotHost, dotCap),
      el("div", { class: "grid-2" },
        el("section", { class: "card" },
          el("div", { class: "card-head" },
            el("h2", { text: "Honest probabilities" }),
            el("p", { text: "When the model gives the favourite a 70% chance, how often does the favourite win? Dots on the diagonal mean the probabilities can be taken at face value. Bigger dots hold more duels." })),
          el("div", { class: "legend" },
            el("span", { class: "k" }, el("i", { class: "dot", style: { background: "var(--accent)" } }), "Qualifying"),
            el("span", { class: "k" }, el("i", { class: "dot", style: { background: "var(--accent-2)" } }), "Races")),
          calHost,
          el("p", { class: "caption", text: calNote() })),
        el("section", { class: "card" },
          el("div", { class: "card-head" },
            el("h2", { text: "In every era" }),
            el("p", { text: "Qualifying duels called right, by five-year block, against the best of the career numbers in that block." })),
          el("div", { class: "legend" },
            el("span", { class: "k" }, el("i", { class: "line", style: { background: "var(--accent)" } }), "Equal-car rating"),
            el("span", { class: "k" }, el("i", { class: "line", style: { background: "var(--accent-2)" } }), "Best career number")),
          perHost,
          el("p", { class: "caption", text: perNote() }))),
      el("section", { class: "card" },
        el("div", { class: "card-head" },
          el("h2", { text: "The numbers" }),
          el("p", { text: "Accuracy on each test. Career numbers were given their best possible calibration on the test set itself, which flatters them." })),
        el("div", { class: "table-scroll" }, accuracyTable(get, bases)),
        el("div", { class: "card-head", style: { marginTop: "12px" } },
          el("h2", { style: { fontSize: "1.2rem" }, text: "Why each piece of the model is there" }),
          el("p", { text: "The same test, with one piece of the model taken out. Log-loss scores the probabilities, not just the pick: lower is better, and the best in each column is in bold." })),
        el("div", { class: "table-scroll" }, variantTable(get)),
        el("p", { class: "caption", text: variantNote(get) })),
      nextLink("/rankings", "Back to the start", "Rankings", "Now that you know how it's built: every driver, rated."));
    root.append(view);

    function renderSeg() {
      seg.replaceChildren(...KINDS.map(([k, label]) => el("button", { type: "button", "aria-pressed": String(state.kind === k), text: label,
        onclick: () => { state.kind = k; renderSeg(); dots.redraw(); } })));
      const capN = get(state.kind, "all pairs", "full model").n, capNew = get(state.kind, "new pairings", "full model").n;
      dotCap.textContent = (state.kind === "quali" ? "Each qualifying session between teammates, " : state.kind === "race"
        ? "Each race where both teammates' results were down to them, " : "Who won more qualifying duels over a season (pairs with 6+ duels), ") +
        "1996–2026: " + fmtInt(capN) + " predictions, " + fmtInt(capNew) + " between never-before teammates.";
    }

    const dots = observeWidth(dotHost, (w) => {
      const rows = Object.keys(LABEL).map((k) => ({ k, label: LABEL[k], all: get(state.kind, "all pairs", k), nw: get(state.kind, "new pairings", k) }))
        .sort((a, b) => b.all.accuracy - a.all.accuracy);
      const narrow = w < 560;
      const rowH = narrow ? 50 : 40, m = { t: 6, r: 50, b: 30, l: narrow ? 10 : 200 };
      const h = m.t + m.b + rows.length * rowH;
      const x = d3.scaleLinear([0.5, 0.7], [m.l, w - m.r]);
      const svg = makeSvg(dotHost, w, h, "Prediction accuracy by method");
      vGrid(svg, x, x.ticks(4), m.t, h - m.b);
      bottomAxis(svg, x, x.ticks(4), (v) => Math.round(v * 100) + "%", h - m.b);
      rows.forEach((r, i) => {
        const yy = m.t + i * rowH + (narrow ? 34 : rowH / 2);
        const isModel = r.k === "full model";
        if (isModel) svg.append("rect").attr("x", 0).attr("y", m.t + i * rowH + 2).attr("width", w).attr("height", rowH - 4).attr("rx", 6).style("fill", "var(--accent-wash)");
        if (narrow) svg.append("text").attr("x", m.l).attr("y", yy - 15).attr("class", isModel ? "lbl-b" : "lbl-2").text(r.label);
        else svg.append("text").attr("x", m.l - 14).attr("y", yy + 4).attr("text-anchor", "end").attr("class", isModel ? "lbl-b" : "lbl-2").text(r.label);
        svg.append("line").attr("x1", x(Math.min(r.all.accuracy, r.nw.accuracy))).attr("x2", x(Math.max(r.all.accuracy, r.nw.accuracy)))
          .attr("y1", yy).attr("y2", yy).style("stroke", "var(--axis)").attr("stroke-width", 2);
        for (const [rec, col, nm] of [[r.nw, "var(--accent-2)", "Never-before teammates"], [r.all, "var(--accent)", "All teammate pairs"]]) {
          const c = svg.append("circle").attr("cx", x(rec.accuracy)).attr("cy", yy).attr("r", 6).style("fill", col).style("stroke", "var(--surface)").attr("stroke-width", 2);
          svg.append("circle").attr("cx", x(rec.accuracy)).attr("cy", yy).attr("r", 14).attr("class", "hit").style("cursor", "default")
            .on("pointermove", (e) => { c.attr("r", 7.5); showTip(e, r.label, [{ v: pc(rec.accuracy, 1), k: nm, key: col }, { v: fmtInt(rec.n), k: "predictions" }]); })
            .on("pointerleave", () => { c.attr("r", 6); hideTip(); });
        }
        svg.append("text").attr("x", x(Math.max(r.all.accuracy, r.nw.accuracy)) + 12).attr("y", yy + 4).attr("class", isModel ? "lbl-b lbl-mono" : "lbl-2 lbl-mono")
          .text(pc(r.all.accuracy, 1));
      });
    });

    const cal = observeWidth(calHost, (w) => {
      const pts = DB.raw.validation_detail.calibration.filter((c) => c.n >= 20);
      const h = Math.min(320, Math.max(240, w * 0.7)), m = { t: 12, r: 14, b: 40, l: 48 };
      const x = d3.scaleLinear([0.5, 1], [m.l, w - m.r]), y = d3.scaleLinear([0.5, 1], [h - m.b, m.t]);
      const r = d3.scaleSqrt([0, d3.max(pts, (p) => p.n)], [0, 11]);
      const svg = makeSvg(calHost, w, h, "Calibration: predicted against observed win rate");
      const t = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
      hGrid(svg, y, t, m.l, w - m.r);
      vGrid(svg, x, t, m.t, h - m.b);
      leftAxis(svg, y, t, (v) => pc(v), m.l);
      bottomAxis(svg, x, t, (v) => pc(v), h - m.b);
      svg.append("text").attr("x", (m.l + w - m.r) / 2).attr("y", h - 4).attr("text-anchor", "middle").attr("class", "lbl-m").text("Model's chance for the favourite");
      svg.append("text").attr("transform", `translate(12,${(m.t + h - m.b) / 2}) rotate(-90)`).attr("text-anchor", "middle").attr("class", "lbl-m").text("How often it won");
      svg.append("line").attr("x1", x(0.5)).attr("y1", y(0.5)).attr("x2", x(1)).attr("y2", y(1)).style("stroke", "var(--ink-2)").attr("stroke-dasharray", "4 4");
      svg.append("text").attr("x", x(0.93)).attr("y", y(0.93) - 8).attr("text-anchor", "end").attr("class", "lbl-m").text("perfect");
      for (const [kind, col, nm] of [["race", "var(--accent-2)", "Races"], ["quali", "var(--accent)", "Qualifying"]]) {
        const s = pts.filter((p) => p.kind === kind);
        svg.append("path").attr("d", d3.line().x((p) => x(p.p)).y((p) => y(p.obs))(s)).style("fill", "none").style("stroke", col).attr("stroke-width", 1.5).style("opacity", 0.6);
        svg.append("g").selectAll("circle").data(s).join("circle").attr("cx", (p) => x(p.p)).attr("cy", (p) => y(p.obs)).attr("r", (p) => Math.max(3.5, r(p.n)))
          .style("fill", col).style("fill-opacity", 0.85).style("stroke", "var(--surface)").attr("stroke-width", 1.5)
          .on("pointermove", (e, p) => showTip(e, nm + ": favourites given " + pc(p.lo) + "–" + pc(p.hi), [
            { v: pc(p.p, 1), k: "average chance given", key: col }, { v: pc(p.obs, 1), k: "actually won" }, { v: fmtInt(p.n), k: "duels" }]))
          .on("pointerleave", hideTip);
      }
    });

    const per = observeWidth(perHost, (w) => {
      const rows = DB.raw.validation_detail.by_year.filter((r) => r.kind === "quali");
      const agg = PERIODS.map(([a, b]) => {
        const sel = rows.filter((r) => r.y >= a && r.y <= b);
        const acc = (meth) => { const s = sel.filter((r) => r.method === meth); const n = d3.sum(s, (r) => r.n); return { acc: d3.sum(s, (r) => r.acc * r.n) / n, n }; };
        const model = acc("full model");
        const bs = bases.map((bm) => ({ bm, ...acc(bm) })).sort((p, q) => q.acc - p.acc);
        return { a, b, label: a + "–" + String(b).slice(-2), model, best: bs[0] };
      });
      const h = 260, m = { t: 14, r: 16, b: 30, l: 48 };
      const x = d3.scalePoint(agg.map((p) => p.label), [m.l + 20, w - m.r - 20]);
      const y = d3.scaleLinear([0.5, 0.75], [h - m.b, m.t]);
      const svg = makeSvg(perHost, w, h, "Accuracy by five-year block");
      const yt = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75];
      hGrid(svg, y, yt, m.l, w - m.r);
      leftAxis(svg, y, yt, (v) => pc(v), m.l);
      svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickSizeOuter(0))
        .call((g) => g.selectAll("text").text((t) => (w < 480 ? t.slice(2) : t)));
      for (const [key, col] of [["best", "var(--accent-2)"], ["model", "var(--accent)"]]) {
        svg.append("path").attr("d", d3.line().x((p) => x(p.label)).y((p) => y(p[key].acc))(agg)).style("fill", "none").style("stroke", col).attr("stroke-width", 2.2);
        svg.append("g").selectAll("circle").data(agg).join("circle").attr("cx", (p) => x(p.label)).attr("cy", (p) => y(p[key].acc)).attr("r", 4.5)
          .style("fill", col).style("stroke", "var(--surface)").attr("stroke-width", 2);
      }
      svg.append("g").selectAll("rect").data(agg).join("rect").attr("x", (p) => x(p.label) - x.step() / 2).attr("y", m.t).attr("width", x.step()).attr("height", h - m.t - m.b).attr("class", "hit").style("cursor", "default")
        .on("pointermove", (e, p) => showTip(e, p.label, [
          { v: pc(p.model.acc, 1), k: "equal-car rating", key: "var(--accent)" },
          { v: pc(p.best.acc, 1), k: (LABEL[p.best.bm] || p.best.bm).toLowerCase() + " (best career number)", key: "var(--accent-2)" },
          { v: fmtInt(p.model.n), k: "duels" }]))
        .on("pointerleave", hideTip);
    });

    renderSeg();
    dots.redraw();
    return () => { dots.stop(); cal.stop(); per.stop(); };
  },
};

function calNote() {
  const b = DB.raw.validation_detail.calibration.find((c) => c.kind === "quali" && c.lo === 0.8);
  return "Close to the diagonal up to about 70%. Above that the model is a little overconfident" +
    (b ? ": qualifying favourites given " + pc(b.p) + " won " + pc(b.obs) + " of the time." : ".");
}

function perNote() {
  const rows = DB.raw.validation_detail.by_year.filter((r) => r.kind === "quali" && r.method === "full model");
  const ns = PERIODS.map(([a, b]) => d3.sum(rows.filter((r) => r.y >= a && r.y <= b), (r) => r.n));
  return "Each block holds " + fmtInt(d3.min(ns)) + "–" + fmtInt(d3.max(ns)) + " duels, so a couple of points either way is noise.";
}

const VCOLS = [["quali", "all pairs", "Quali, all"], ["quali", "new pairings", "Quali, new"], ["race", "all pairs", "Race, all"], ["race", "new pairings", "Race, new"]];

function variantNote(get) {
  const lost = VCOLS.filter(([kind, sub]) => {
    const full = get(kind, sub, "full model").log_loss;
    return Object.keys(VARIANTS).some((k) => k !== "full model" && get(kind, sub, k).log_loss < full);
  });
  if (!lost.length) return "Taking out any piece made every test worse.";
  return "The full model is best on " + (VCOLS.length - lost.length) + " of " + VCOLS.length + " tests. " + lost.map(([kind, sub, t]) => {
    const best = Object.keys(VARIANTS).filter((k) => k !== "full model").sort((a, b) => get(kind, sub, a).log_loss - get(kind, sub, b).log_loss)[0];
    return "On " + t.toLowerCase() + ", “" + VARIANTS[best].toLowerCase() + "” edges it";
  }).join("; ") + ", but loses on the rest, so every piece stays.";
}

function stat(big, what, sub) {
  return el("div", { class: "card", style: { gap: "4px" } },
    el("div", { class: "d-big up", style: { fontSize: "3.4rem" }, text: big }),
    el("p", { style: { fontWeight: "600" }, text: what }),
    el("p", { class: "caption", text: sub }));
}

function accuracyTable(get, bases) {
  const cols = [["quali", "all pairs", "Quali duels"], ["quali", "new pairings", "Quali, new pairings"], ["season quali H2H", "new pairings", "Season H2H, new pairings"], ["race", "all pairs", "Race duels"]];
  return el("table", { class: "val" },
    el("thead", {}, el("tr", {}, el("th", { text: "Method" }), cols.map(([, , t]) => el("th", { text: t })))),
    el("tbody", {}, ["full model", ...bases].map((k) => el("tr", { class: k === "full model" ? "model" : null },
      el("td", { text: LABEL[k] }), cols.map(([kind, sub]) => el("td", { text: pc(get(kind, sub, k).accuracy, 1) }))))));
}

function variantTable(get) {
  const best = VCOLS.map(([kind, sub]) => Math.min(...Object.keys(VARIANTS).map((k) => get(kind, sub, k).log_loss)));
  return el("table", { class: "val" },
    el("thead", {}, el("tr", {}, el("th", { text: "Model" }), VCOLS.map(([, , t]) => el("th", { text: t })))),
    el("tbody", {}, Object.entries(VARIANTS).map(([k, label]) => el("tr", { class: k === "full model" ? "model" : null },
      el("td", { text: label }), VCOLS.map(([kind, sub], j) => {
        const r = get(kind, sub, k);
        return el("td", { style: r.log_loss === best[j] ? { fontWeight: "700", color: "var(--ink)" } : null, text: r.log_loss.toFixed(4) });
      })))));
}
