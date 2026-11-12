// Page data: output/data.json, written by src/fit.py. Imported as a URL so it is fetched
// (and cached under a content hash) rather than parsed as part of the script bundle.
import dataUrl from "../../../output/data.json?url";

export const DB = {};

export async function loadData() {
  const res = await fetch(dataUrl);
  if (!res.ok) throw new Error("Could not load the ratings (" + res.status + ")");
  const D = await res.json();
  DB.raw = D;
  DB.meta = D.meta;
  DB.drivers = D.drivers;
  DB.byId = new Map(D.drivers.map((d) => [d.id, d]));
  DB.ranked = D.drivers.filter((d) => d.rank != null).sort((a, b) => a.rank - b.rank);
  DB.N = DB.ranked.length;
  DB.others = D.others || {};
  DB.netNames = new Map((D.network?.nodes || []).map((n) => [n[0], n[1]]));

  for (const d of D.drivers) d.seasonByYear = new Map(d.seasons.map((s) => [s.y, s]));

  // teammate records, both directions, oldest pairing first
  DB.mates = new Map();
  DB.pairRec = new Map();
  for (const t of D.teammates) {
    if (!DB.mates.has(t.a)) DB.mates.set(t.a, []);
    DB.mates.get(t.a).push(t);
    DB.pairRec.set(t.a + "|" + t.b, t);
  }
  for (const list of DB.mates.values()) list.sort((p, q) => p.y0 - q.y0 || p.y1 - q.y1);

  // every pairing in the model (pre-1990 ones too), most duels first: the chain finder's graph
  DB.adj = new Map();
  DB.link = new Map();
  const nodes = D.network?.nodes || [];
  for (const [i, j, nq, nr, y0, y1] of D.network?.links || []) {
    const a = nodes[i][0], b = nodes[j][0], l = { n: nq + nr, nq, nr, y0, y1 };
    for (const [u, v] of [[a, b], [b, a]]) {
      if (!DB.adj.has(u)) DB.adj.set(u, []);
      DB.adj.get(u).push(v);
      DB.link.set(u + "|" + v, l);
    }
  }
  for (const [u, list] of DB.adj) list.sort((p, q) => DB.link.get(u + "|" + q).n - DB.link.get(u + "|" + p).n || (p < q ? -1 : 1));

  // ranks on the two components of the rating
  const byPace = DB.ranked.slice().sort((a, b) => b.pace - a.pace);
  byPace.forEach((d, i) => { d.rank_pace = i + 1; });
  const byRace = DB.ranked.slice().sort((a, b) => b.race - a.race);
  byRace.forEach((d, i) => { d.rank_race = i + 1; });

  // seasons
  DB.seasons = new Map((D.season_grid || []).map((s) => [s.y, s]));
  DB.years = [...DB.seasons.keys()].sort((a, b) => a - b);
  DB.champion = new Map();
  for (const d of D.drivers) for (const y of d.title_years || []) DB.champion.set(y, d);
  DB.bestSeasons = [];
  for (const d of DB.ranked) {
    for (const s of d.seasons) {
      if (s.y >= 1990) DB.bestSeasons.push({ d, s });
    }
  }
  DB.bestSeasons.sort((p, q) => q.s.v - p.s.v);
  return DB;
}

export const nameOf = (id) => DB.byId.get(id)?.name ?? DB.others[id] ?? DB.netNames.get(id) ?? id;
export const driver = (id) => DB.byId.get(id);
export const isRanked = (d) => d && d.rank != null;
export const isRising = (d) => d.developing && d.last >= 2026;
export const pair = (a, b) => DB.pairRec.get(a + "|" + b);

// Shortest chain of real teammate pairings between two drivers (breadth-first over every
// pairing in the model, preferring the pairings with the most duels at each step). Used by
// both the head-to-head and the network pages, so they always show the same chain.
export function chainBetween(a, b) {
  if (a === b) return [a];
  if (!DB.adj.has(a) || !DB.adj.has(b)) return null;
  const prev = new Map([[a, null]]);
  let frontier = [a];
  while (frontier.length && !prev.has(b)) {
    const next = [];
    for (const u of frontier) {
      for (const v of DB.adj.get(u) || []) if (!prev.has(v)) { prev.set(v, u); next.push(v); }
    }
    frontier = next;
  }
  if (!prev.has(b)) return null;
  const path = [];
  for (let v = b; v != null; v = prev.get(v)) path.push(v);
  return path.reverse();
}
