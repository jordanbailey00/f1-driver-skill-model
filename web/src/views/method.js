import * as d3 from "d3";
import { DB } from "../lib/data.js";
import { el, nextLink, setTitle } from "../lib/dom.js";
import { fmtInt, pct, pctTick } from "../lib/format.js";
import { bottomAxis, hGrid, leftAxis, makeSvg, observeWidth, yearTicks } from "../lib/chart.js";
import { hideTip, showTip } from "../lib/tooltip.js";

// Line chart with an optional band, a reference line and a crosshair tooltip.
export function lineChart(host, pts, o) {
  return observeWidth(host, (w) => {
    const h = o.height || 220, m = { t: 14, r: 16, b: 28, l: 48 };
    const x = d3.scaleLinear(d3.extent(pts, (p) => p.x), [m.l, w - m.r]);
    const y = d3.scaleLinear(o.yDom, [h - m.b, m.t]).nice();
    const svg = makeSvg(host, w, h, o.label);
    const yt = y.ticks(5);
    hGrid(svg, y, yt, m.l, w - m.r);
    leftAxis(svg, y, yt, o.yFmt, m.l);
    const xt = o.years ? yearTicks(x, w - m.l - m.r, 50) : x.ticks(Math.max(3, Math.floor((w - m.l - m.r) / 60)));
    bottomAxis(svg, x, xt.filter((t) => t >= x.domain()[0] && t <= x.domain()[1]), o.xFmt, h - m.b);
    if (o.base != null) svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(o.base)).attr("y2", y(o.base)).style("stroke", "var(--axis)");
    if (o.band) {
      svg.append("path").attr("d", d3.area().x((p) => x(p.x)).y0((p) => y(p.lo)).y1((p) => y(p.hi)).curve(d3.curveMonotoneX)(pts))
        .style("fill", "var(--accent)").style("fill-opacity", 0.14);
    }
    svg.append("path").attr("d", d3.line().x((p) => x(p.x)).y((p) => y(p.v)).curve(d3.curveMonotoneX)(pts))
      .style("fill", "none").style("stroke", "var(--accent)").attr("stroke-width", 2.2).attr("stroke-linejoin", "round");
    for (const a of o.notes || []) {
      const p = pts.reduce((q, r) => (Math.abs(r.x - a.x) < Math.abs(q.x - a.x) ? r : q));
      svg.append("circle").attr("cx", x(p.x)).attr("cy", y(p.v)).attr("r", 3.5).style("fill", "var(--accent)").style("stroke", "var(--surface)").attr("stroke-width", 1.5);
      svg.append("text").attr("x", x(p.x) + (a.dx ?? 8)).attr("y", y(p.v) + (a.dy ?? -8)).attr("text-anchor", a.anchor || "start").attr("class", "lbl-2 halo").text(a.text(p));
    }
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).style("stroke", "var(--axis)").attr("visibility", "hidden");
    const dot = svg.append("circle").attr("r", 5).style("fill", "var(--accent)").style("stroke", "var(--surface)").attr("stroke-width", 2).attr("visibility", "hidden");
    svg.append("rect").attr("x", m.l).attr("y", 0).attr("width", w - m.l - m.r).attr("height", h - m.b).attr("class", "hit").style("cursor", "crosshair")
      .on("pointermove", (e) => {
        const xv = x.invert(d3.pointer(e)[0]);
        const p = pts.reduce((a, b) => (Math.abs(b.x - xv) < Math.abs(a.x - xv) ? b : a));
        cross.attr("x1", x(p.x)).attr("x2", x(p.x)).attr("visibility", "visible");
        dot.attr("cx", x(p.x)).attr("cy", y(p.v)).attr("visibility", "visible");
        showTip(e, o.tipTitle(p), o.tipRows(p));
      })
      .on("pointerleave", () => { cross.attr("visibility", "hidden"); dot.attr("visibility", "hidden"); hideTip(); });
  });
}

const STEPS = [
  ["Same car, same weekend", "For every race since 1977, each pair of teammates is compared on their best qualifying lap from the deepest session both set a time in (Q3 if both reached it). A 1:30.000 against a teammate's 1:30.270 is a 0.30% gap. Refuelling-era Q3 laps (2006–09) and race-fuel sessions (2003–05) are swapped for the low-fuel session where one exists. Gaps over 4% are dropped as car trouble."],
  ["Chain the gaps", "If A beat B by 0.2% and B beat C by 0.3%, A should be about 0.5% quicker than C. Solving all the duels at once puts every driver on one scale. Drivers with little data are pulled toward average until the evidence says otherwise."],
  ["Correct for learning, ageing and era", "Rookies improve over roughly their first 50 starts, and drivers lose pace after about 30. Both curves are learned from the data, so beating a 40-year-old champion isn't worth the same as beating that champion at their peak. Gaps were also about 2.3 times as large in the mid-1980s, so each era's gaps are rescaled to today's spread."],
  ["Add race day", "Who finished ahead, counting only results the drivers controlled. Engine failures, gearbox failures and collisions are left out; spins, crashes and driver penalties count against the driver. This adds a small racecraft term on top of one-lap pace."],
  ["One number per driver", "The rating is a driver's career-average level with age and inexperience taken out, relative to the average race starter of 1990–2026. Ranges are 90% intervals."],
];

const LIMITS = [
  ["Team orders and number-one status", "A contracted number two who gave up track position, or got the older parts, looks slower than they really were. The data can't see it."],
  ["Small samples", "A driver with a handful of races is pulled hard toward average and carries a wide range. The rankings hide drivers with fewer than 20 qualifying duels by default."],
  ["The era scale is an assumption", "It assumes gaps shrank because cars and preparation got more consistent, not because drivers got more alike. Treating a 1990 percent as a 2020 percent predicts worse, but would lift Senna, Prost and the 1980s drivers further."],
  ["The ageing curve is an average", "Some drivers fade early and some, like Alonso, barely fade. The curve also sets how much credit a young driver gets for beating an older champion, so Russell's and Leclerc's ratings depend on how much Hamilton and Vettel had faded."],
  ["Islands in the network", "Jules Bianchi and Max Chilton were only ever teammates with each other, so they can be compared with one another but not with anyone else. They are left out of the ranking."],
  ["Young drivers are projections", "A rookie's rating includes the usual improvement still to come. Hollow dots in the rankings mark drivers active in 2026 with fewer than 60 starts."],
];

export default {
  mount(root) {
    setTitle("Method");
    const M = DB.meta;
    const gaps = DB.raw.gap_by_year;
    const hosts = { gap: el("div", { class: "chart" }), era: el("div", { class: "chart" }), exp: el("div", { class: "chart" }), age: el("div", { class: "chart" }) };
    const g85 = gaps.find((p) => p.y === 1985), g26 = gaps[gaps.length - 1];
    const lam85 = DB.raw.era_scale.find((p) => p.y === 1985);
    const fig = (title, text, host, cap) => el("figure", { class: "card", style: { margin: 0 } },
      el("div", { class: "card-head" }, el("h2", { text: title }), el("p", { text })), host, cap ? el("figcaption", { class: "caption", text: cap }) : null);

    const view = el("div", { class: "container view" },
      el("header", { class: "view-head" },
        el("p", { class: "eyebrow", text: "How it's built" }),
        el("h1", { text: "From one lap-time gap to one scale" }),
        el("p", { class: "lede", text: "The car is the problem with every career statistic, so the rating only uses comparisons where the car is the same. Here is how " + fmtInt(M.n_quali) + " qualifying duels and " + fmtInt(M.n_race) + " race duels become one number per driver." })),
      el("div", { class: "grid-2", style: { gap: "28px 40px" } },
        el("div", { class: "steps" }, STEPS.map(([t, p]) => el("div", { class: "step" }, el("h3", { text: t }), el("p", { text: p })))),
        el("div", { style: { display: "grid", gap: "14px", alignContent: "start", minWidth: "0" } },
          el("div", { class: "formula", "aria-label": "Formula" },
            "gap(A,B) = 100 × ln(lapB / lapA)\n" +
            "         ≈ skill(A) − skill(B) + noise\n" +
            "skill    = prime + learning(starts)\n" +
            "           + ageing(age) + form(season)\n" +
            "rating   = career-average skill,\n" +
            "           rookie and age effects out\n" +
            "ratio    = exp(−rating / 100)\n" +
            "         ≈ 1 − rating / 100"),
          el("p", { class: "caption", text: "Qualifying gaps use a heavy-tailed (Student-t) error, so a lap ruined by a red flag or a mechanical problem can't swing a rating. Race results enter through a probit model of who finished ahead. Season form follows an AR(1) process. Prior widths were tuned by Laplace-approximated evidence; ranges come from the same approximation." }),
          el("p", { class: "caption" }, "The full model is in ",
            el("a", { href: "https://github.com/jordanbailey00/f1-driver-skill-model/blob/main/src/model.py", "data-external": "", rel: "noopener", text: "src/model.py" }),
            " on GitHub."))),
      el("div", { class: "grid-2" },
        fig("Teammate gaps have shrunk", "Median qualifying gap between teammates each season, raw. The band covers the middle half of all gaps.", hosts.gap,
          g85 && g26 ? "From " + g85.med.toFixed(2) + "% in 1985 to " + g26.med.toFixed(2) + "% in " + g26.y + ": cars and preparation got more consistent." : null),
        fig("The era scale", "How large a typical gap was compared with 2014–26. The model measures each era's gaps in units of that era's spread.", hosts.era,
          lam85 ? "A 1% gap in 1985 counts as about " + (1 / lam85.v).toFixed(2) + "% today." : null),
        fig("Rookie learning curve", "Pace against the same driver once fully experienced, by career starts.", hosts.exp, "Learned from the data, flat after 80 starts."),
        fig("Ageing curve", "Pace against the same driver at 30 or younger.", hosts.age, "Flat up to 30 by assumption; the decline after that is learned.")),
      el("section", { class: "card" },
        el("div", { class: "card-head" }, el("h2", { text: "What the rating can't see" })),
        el("div", { class: "limits" }, LIMITS.map(([t, p]) => el("div", {}, el("h3", { text: t }), el("p", { text: p }))))),
      nextLink("/validation", "Next · Proof", "Does it work?", "The rating against the career numbers, on 31 seasons it had never seen."));
    root.append(view);

    const pf = (v) => pctTick(v, 1);
    const charts = [
      lineChart(hosts.gap, gaps.map((p) => ({ x: p.y, v: p.med, lo: p.q1, hi: p.q3, n: p.n })), {
        yDom: [0, d3.max(gaps, (p) => p.q3)], base: 0, band: true, years: true, yFmt: (v) => v.toFixed(1) + "%", xFmt: d3.format("d"),
        label: "Median teammate qualifying gap by season", tipTitle: (p) => String(p.x),
        tipRows: (p) => [{ v: p.v.toFixed(2) + "%", k: "median gap", key: "var(--accent)" }, { v: p.lo.toFixed(2) + "–" + p.hi.toFixed(2) + "%", k: "middle half" }, { v: fmtInt(p.n), k: "duels" }],
      }),
      lineChart(hosts.era, DB.raw.era_scale.map((p) => ({ x: p.y, v: p.v })), {
        yDom: [0, Math.max(2.6, d3.max(DB.raw.era_scale, (p) => p.v))], base: 1, years: true, yFmt: (v) => v.toFixed(1) + "×", xFmt: d3.format("d"),
        label: "Era scale by season", tipTitle: (p) => String(p.x), tipRows: (p) => [{ v: p.v.toFixed(2) + "×", k: "gap size vs 2014–26", key: "var(--accent)" }],
      }),
      lineChart(hosts.exp, DB.raw.exp_curve.map((p) => ({ x: p.x, v: p.v })), {
        yDom: [Math.min(-0.5, d3.min(DB.raw.exp_curve, (p) => p.v)), 0.1], base: 0, yFmt: pf, xFmt: d3.format("d"),
        label: "Rookie learning curve", tipTitle: (p) => p.x + " career starts", tipRows: (p) => [{ v: pct(p.v), k: "vs fully experienced", key: "var(--accent)" }],
        notes: [{ x: 0, text: (p) => "debut " + pct(p.v, 2), dx: 8, dy: 4 }],
      }),
      lineChart(hosts.age, DB.raw.age_curve.filter((p) => p.x >= 20).map((p) => ({ x: p.x, v: p.v })), {
        yDom: [Math.min(-0.6, d3.min(DB.raw.age_curve, (p) => p.v)), 0.1], base: 0, yFmt: pf, xFmt: d3.format("d"),
        label: "Ageing curve", tipTitle: (p) => "Age " + p.x, tipRows: (p) => [{ v: pct(p.v), k: "vs age 30", key: "var(--accent)" }],
        notes: [{ x: 40, text: (p) => "40: " + pct(p.v, 2), dx: -8, dy: -10, anchor: "end" }],
      }),
    ];
    return () => charts.forEach((c) => c.stop());
  },
};
