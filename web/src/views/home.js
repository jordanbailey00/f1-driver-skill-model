import { DB, pair } from "../lib/data.js";
import { el, icon, setTitle } from "../lib/dom.js";
import { fmtInt, lastName, pct, secs, span } from "../lib/format.js";
import { THUMBS } from "./thumbs.js";

const EXPLORE = [
  ["/rankings", "rankings", "The ratio", "Rankings", "All drivers since 1990 on one equal-car scale, with how sure we are."],
  ["/timeline", "timeline", "Across eras", "Timeline", "Every career drawn at its rating, from 1977 to 2026."],
  ["/seasons", "seasons", "Year by year", "Seasons", "Every team's teammate battle in every season since 1990."],
  ["/compare", "compare", "Any two drivers", "Head to head", "Put Senna and Verstappen in the same car and see who wins."],
  ["/network", "network", "The teammate web", "Network", "The pairings that link every driver into one scale."],
  ["/driver/max-verstappen", "driver", "Driver pages", "Profiles", "Season-by-season form and the record against every teammate."],
  ["/method", "method", "How it's built", "Method", "Same-car gaps, chained, with learning, ageing and era corrections."],
  ["/validation", "validation", "Proof", "Does it work?", "Tested on 31 seasons of duels it had never seen."],
];

function tower() {
  const top = DB.ranked.slice(0, 10);
  const max = top[0].rating;
  return el("div", { class: "tower", role: "group", "aria-label": "Top ten drivers" },
    el("div", { class: "tower-head" },
      el("span", { class: "eyebrow", text: "Top ten, all eras" }),
      el("span", { class: "eyebrow", text: "vs average" })),
    top.map((d) => el("a", { class: "tw-row", href: "/driver/" + d.id },
      el("span", { class: "tw-pos", text: String(d.rank) }),
      el("span", { class: "tw-code", text: d.abbr || lastName(d).slice(0, 3).toUpperCase() }),
      el("span", { class: "tw-name", text: d.name }),
      el("span", { class: "tw-gap", text: pct(d.rating) }),
      el("span", { class: "tw-bar", style: { width: Math.max(4, (100 * d.rating) / max) + "%" } }))),
    el("p", { class: "tower-foot", text: "Per-lap advantage over an average F1 driver of 1990–2026 in the identical car." }));
}

function chainExample() {
  const s = DB.byId.get("michael-schumacher"), r = DB.byId.get("nico-rosberg"), h = DB.byId.get("lewis-hamilton");
  const p1 = s && r && pair(r.id, s.id), p2 = r && h && pair(h.id, r.id);
  if (!p1 || !p2) {
    return el("p", {}, "If A beat B by 0.2% and B beat C by 0.3%, A should be about 0.5% quicker than C. Solve every duel at once and every driver lands on one scale.");
  }
  return el("p", {},
    "Rosberg out-qualified Schumacher " + p1.qw + "–" + p1.ql + " in " + span(p1.y0, p1.y1) + ". Hamilton beat Rosberg " +
    p2.qw + "–" + p2.ql + " in " + span(p2.y0, p2.y1) + ". Hamilton and Schumacher never shared a garage, but the chain links them. " +
    "The model links every driver this way, through all " + fmtInt(DB.raw.network.links.length) + " pairings at once.");
}

export default {
  mount(root) {
    setTitle(null);
    const M = DB.meta;
    const pairs = DB.raw.network.links.length;
    const view = el("div", { class: "container view" },
      el("section", { class: "hero" },
        el("div", {},
          el("p", { class: "eyebrow" }, el("span", { class: "dot" }), "Formula 1 · every driver since 1990"),
          el("h1", {}, "Who's fastest in ", el("em", { text: "the same car?" })),
          el("p", { class: "lede" },
            "Points, wins and titles mostly measure the car. This rating uses only the moments the car can't matter: ",
            el("strong", { text: "teammates, same car, same weekend" }),
            ". Those gaps are chained through shared teammates, so every driver since 1990 lands on one scale, from Senna to Antonelli."),
          el("div", { class: "hero-cta" },
            el("a", { class: "btn btn-primary", href: "/rankings" }, "See the rankings", icon("arrowRight")),
            el("a", { class: "btn btn-ghost", href: "/compare" }, "Compare two drivers"))),
        tower()),
      el("dl", { class: "facts" },
        el("div", {}, el("dt", { text: "Drivers ranked" }), el("dd", { text: fmtInt(DB.N) })),
        el("div", {}, el("dt", { text: "Qualifying duels" }), el("dd", { text: fmtInt(M.n_quali) })),
        el("div", {}, el("dt", { text: "Race duels" }), el("dd", { text: fmtInt(M.n_race) })),
        el("div", {}, el("dt", { text: "Teammate pairings" }), el("dd", { text: fmtInt(pairs) }))),
      el("section", { class: "idea", "aria-label": "How it works" },
        el("div", { class: "card" },
          el("span", { class: "num", text: "1" }),
          el("h3", { text: "Same car, same weekend" }),
          el("p", { text: "Teammates drive identical machinery, so the gap between them is the driver. Every qualifying lap and every race result between teammates since 1977 is a data point. A 1:30.000 against a 1:30.270 is a 0.30% gap." })),
        el("div", { class: "card" },
          el("span", { class: "num", text: "2" }),
          el("h3", { text: "Chain the gaps" }),
          chainExample()),
        el("div", { class: "card" },
          el("span", { class: "num", text: "3" }),
          el("h3", { text: "One scale, every era" }),
          el("p", { text: "Rookies improve, veterans fade and gaps were bigger in the 1980s. All three are learned from the data and taken out, leaving one number per driver: how much faster than average they'd be in the same car." }))),
      el("section", { class: "card-head", style: { marginTop: "8px" } },
        el("h2", { class: "h2", text: "Explore the data" }),
        el("p", { text: "Eight views. Start anywhere: every chart links through to the drivers in it, and each page leads on to the next." })),
      el("div", { class: "explore" },
        EXPLORE.map(([href, thumb, k, t, d]) => {
          const th = el("div", { class: "x-thumb" });
          THUMBS[thumb]?.(th);
          return el("a", { class: "xcard", href },
            th,
            el("div", { class: "x-body" },
              el("span", { class: "x-k", text: k }),
              el("span", { class: "x-t" }, t, icon("arrowRight", "ico x-arrow")),
              el("span", { class: "x-d", text: d })));
        })),
      el("p", { class: "caption" },
        "The rating: +0.50% means about " + secs(0.5) + " a lap quicker than an average driver of 1990–2026 in the identical car, on a 90-second lap. " +
        "Data through the " + M.data_through + "."));
    root.append(view);
    return null;
  },
};
