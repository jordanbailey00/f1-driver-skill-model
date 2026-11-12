#!/usr/bin/env python3
"""Fit the final model on every comparison and export ratings for the page.

Usage: python -I src/fit.py <processed dir> <output dir>

Writes ratings.csv, season_ratings.csv, teammates.csv and data.json (the
page's data) into the output dir.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import networkx as nx
import numpy as np
import pandas as pd

from model import AGE_KNOTS, EXP_KNOTS, Data, Model, hat_basis, AGE_FREE, EXP_FREE
from validate import TUNED

LAP = 90.0          # reference lap (s) for "seconds per lap" readouts
DEVELOPING = 60     # fewer prior starts than this at the last race: still on the learning curve


def career_ratings(m, comps):
    """Career level: prime pace (theta) + racecraft + information-weighted mean season form."""
    d = m.d
    cov = m.covariance()
    k = m.unit()
    w = comps.groupby(["driverId", "year"]).n.sum()
    rows = []
    for drv, i in d.d_idx.items():
        v = np.zeros(d.P)
        v[d.off_theta + i] = 1
        v_pace = v.copy()
        ss = [(s, j) for s, j in d.s_idx.items() if s[0] == drv]
        tot = sum(w.get(s, 0) for s, _ in ss) or 1.0
        for s, j in ss:
            v_pace[d.off_u + j] = w.get(s, 0) / tot
        v_all = v_pace.copy()
        v_all[d.off_r + i] = 1
        rows.append(dict(driverId=drv,
                         rating=k * v_all @ m.beta, rating_se=k * np.sqrt(v_all @ cov @ v_all),
                         pace=k * v_pace @ m.beta, pace_se=k * np.sqrt(v_pace @ cov @ v_pace),
                         racecraft=k * m.beta[d.off_r + i], racecraft_se=k * np.sqrt(cov[d.off_r + i, d.off_r + i])))
    return pd.DataFrame(rows)


def teammate_records(qp, rp, lam_unit):
    """Head-to-head record for every pair of teammates, both directions."""
    q = qp[~qp.dropped_outlier & (qp.source == "qualifying")].copy()
    q["adj_gap"] = q.gap / q.year.map(lam_unit)
    r = rp[rp.outcome.notna() & (rp.source == "race")]
    recs = {}

    def rec(a, b):
        key = (a, b)
        if key not in recs:
            recs[key] = dict(a=a, b=b, q_w=0, q_l=0, r_w=0, r_l=0, gaps=[], adj=[], years=set())
        return recs[key]
    for row in q.itertuples():
        for x, y, g, ag in ((row.a, row.b, row.gap, row.adj_gap), (row.b, row.a, -row.gap, -row.adj_gap)):
            e = rec(x, y)
            e["q_w" if g > 0 else "q_l"] += g != 0
            e["gaps"].append(g)
            e["adj"].append(ag)
            e["years"].add(row.year)
    for row in r.itertuples():
        for x, y, o in ((row.a, row.b, row.outcome), (row.b, row.a, 1 - row.outcome)):
            e = rec(x, y)
            e["r_w" if o == 1 else "r_l"] += 1
            e["years"].add(row.year)
    out = []
    for e in recs.values():
        yrs = sorted(e["years"])
        out.append(dict(a=e["a"], b=e["b"], q_w=int(e["q_w"]), q_l=int(e["q_l"]), r_w=int(e["r_w"]),
                        r_l=int(e["r_l"]),
                        gap=float(np.median(e["gaps"])) if e["gaps"] else np.nan,
                        adj_gap=float(np.median(e["adj"])) if e["adj"] else np.nan,
                        first=yrs[0], last=yrs[-1], years=",".join(map(str, yrs))))
    return pd.DataFrame(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("processed_dir")
    ap.add_argument("out_dir")
    ap.add_argument("--release", default="F1DB v2026.20.0", help="data release name shown on the page")
    ap.add_argument("--through", default="2026 São Paulo GP", help="last race in the data")
    a = ap.parse_args()
    P, O = a.processed_dir, a.out_dir
    os.makedirs(O, exist_ok=True)
    qp = pd.read_csv(os.path.join(P, "quali_pairs.csv"))
    rp = pd.read_csv(os.path.join(P, "race_pairs.csv"))
    ent = pd.read_csv(os.path.join(P, "entries.csv"))
    drivers = pd.read_csv(os.path.join(P, "drivers.csv")).set_index("id")
    cons = pd.read_csv(os.path.join(P, "constructors.csv")).set_index("id").name
    countries = pd.read_csv(os.path.join(P, "countries.csv")).set_index("id")
    q, r = qp[~qp.dropped_outlier], rp[rp.outcome.notna()]

    data = Data(q, r)
    m = Model(data, **TUNED).fit()
    alt = Model(data, **dict(TUNED, era_signal=False)).fit()   # sensitivity: a % is a %
    k = m.unit()
    print("fit:", m.opt.message, "| unit", round(k, 3))

    comps = pd.concat([pd.DataFrame({"driverId": q.a, "year": q.year, "n": q.weight}),
                       pd.DataFrame({"driverId": q.b, "year": q.year, "n": q.weight}),
                       pd.DataFrame({"driverId": r.a, "year": r.year, "n": r.weight}),
                       pd.DataFrame({"driverId": r.b, "year": r.year, "n": r.weight})])
    car = career_ratings(m, comps)
    car_alt = career_ratings(alt, comps).set_index("driverId")
    seas = m.season_table(ent)

    # Zero = the average driver on the grid 1990-2026 (weighted by starts).
    st = ent[ent.started & (ent.year >= 1990)].groupby("driverId").size()
    def centre(df):
        x = df.set_index("driverId").rating
        return float(np.average(x.reindex(st.index).dropna(), weights=st.reindex(x.index).dropna().reindex(x.reindex(st.index).dropna().index)))
    off, off_alt = centre(car), centre(car_alt.reset_index())
    car["rating"] -= off
    car["pace"] -= off
    seas["rating"] -= off
    car["rating_alt"] = car.driverId.map(car_alt.rating) - off_alt

    # Graph connectivity: drivers outside the main teammate network can't be placed on it.
    G = nx.Graph()
    G.add_edges_from(zip(q.a, q.b))
    G.add_edges_from(zip(r.a, r.b))
    main_comp = max(nx.connected_components(G), key=len)

    # Per-driver facts.
    started = ent[ent.started]
    first = started.groupby("driverId").year.min()
    last = started.groupby("driverId").year.max()
    last_exp = ent.sort_values("date").groupby("driverId").prior_starts.last()
    n_q = pd.concat([q.a, q.b]).value_counts()
    n_r = pd.concat([r.a, r.b]).value_counts()
    teams = (ent.assign(team=ent.constructorId.map(cons))
             .groupby(["driverId", "year"]).team.agg(lambda s: list(dict.fromkeys(s))))
    title_years = pd.read_csv(os.path.join(P, "titles.csv")).groupby("driverId").year.apply(list)

    car = car.join(drivers, on="driverId")
    car["ranked"] = car.ranked.fillna(False).astype(bool)
    car["connected"] = car.driverId.isin(main_comp)
    car["n_quali"] = car.driverId.map(n_q).fillna(0).astype(int)
    car["n_race"] = car.driverId.map(n_r).fillna(0).astype(int)
    car["first"] = car.driverId.map(first)
    car["last"] = car.driverId.map(last)
    car["developing"] = car.driverId.map(last_exp).fillna(0) < DEVELOPING
    car["nationality"] = car.nationalityCountryId.map(countries.demonym)
    car["country_code"] = car.nationalityCountryId.map(countries.alpha3Code)
    car = car.sort_values("rating", ascending=False)
    rk = car[car.ranked & car.connected]
    car["rank"] = car.driverId.map(dict(zip(rk.driverId, range(1, len(rk) + 1))))
    rk_alt = rk.sort_values("rating_alt", ascending=False)
    car["rank_alt"] = car.driverId.map(dict(zip(rk_alt.driverId, range(1, len(rk_alt) + 1))))

    lam_unit = {y: float(m.lam([y])[0] / k) for y in range(1977, 2027)}
    tm = teammate_records(qp, rp, lam_unit)
    # model-expected same-car gap (career level, pace only) for each pairing
    pace = car.set_index("driverId").pace
    tm["model_gap"] = tm.a.map(pace) - tm.b.map(pace)

    car.to_csv(os.path.join(O, "ratings.csv"), index=False)
    seas.to_csv(os.path.join(O, "season_ratings.csv"), index=False)
    tm.to_csv(os.path.join(O, "teammates.csv"), index=False)

    # ---- page data -------------------------------------------------------------
    show = car[car.ranked]
    keep = set(show.driverId)
    def r3(x):
        return None if pd.isna(x) else round(float(x), 3)
    out_drivers = []
    for row in show.itertuples():
        s = seas[seas.driverId == row.driverId].sort_values("year")
        out_drivers.append(dict(
            id=row.driverId, name=row.name, first_name=row.firstName, last_name=row.lastName,
            abbr=row.abbreviation, nat=row.nationality, cc=row.country_code,
            rank=None if pd.isna(row.rank) else int(row.rank),
            rank_alt=None if pd.isna(row.rank_alt) else int(row.rank_alt),
            rating=r3(row.rating), se=r3(row.rating_se), pace=r3(row.pace), pace_se=r3(row.pace_se),
            race=r3(row.racecraft), race_se=r3(row.racecraft_se), rating_alt=r3(row.rating_alt),
            first=int(row.first), last=int(row.last), connected=bool(row.connected),
            developing=bool(row.developing), n_quali=int(row.n_quali), n_race=int(row.n_race),
            starts=int(row.totalRaceStarts), wins=int(row.totalRaceWins), podiums=int(row.totalPodiums),
            poles=int(row.totalPolePositions), titles=int(row.totalChampionshipWins),
            title_years=title_years.get(row.driverId, []),
            seasons=[dict(y=int(x.year), v=r3(x.rating), se=r3(x.rating_se),
                          teams=teams.get((row.driverId, x.year), [])) for x in s.itertuples()],
        ))
    names = drivers.name.to_dict()
    out_tm = [dict(a=x.a, b=x.b, qw=x.q_w, ql=x.q_l, rw=x.r_w, rl=x.r_l, gap=r3(x.gap), adj=r3(x.adj_gap),
                   exp=r3(x.model_gap), y0=int(x.first), y1=int(x.last), yrs=x.years)
              for x in tm.itertuples() if x.a in keep or x.b in keep]
    extra = sorted({t["a"] for t in out_tm} | {t["b"] for t in out_tm} - keep)
    years = np.arange(1977, 2027)
    val = pd.read_csv(os.path.join(O, "validation", "validation_summary.csv"))
    payload = dict(
        meta=dict(data_release=f"{a.release} (through the {a.through})", data_through=a.through, lap_seconds=LAP,
                  hyper=m.hyper, unit=round(k, 4), centre_offset=round(off, 4),
                  n_quali=int(len(q)), n_race=int(len(r)), n_drivers_model=len(data.drivers),
                  n_ranked=int(car["rank"].notna().sum()),
                  # same-car spread today, in rating %: P(out-qualify) = T_nu(d / quali_scale),
                  # P(finish ahead, both running) = Phi(d / race_scale)
                  nu=4, quali_scale=round(m.s0 * k, 4), race_scale=round(float(m.sr[-1]) * k, 4)),
        drivers=out_drivers,
        others={d: names.get(d, d) for d in extra},
        teammates=out_tm,
        era_scale=[dict(y=int(y), v=round(float(m.lam([y])[0] / k), 3)) for y in years],
        exp_curve=[dict(x=int(n), v=r3(k * m.exp_curve([n])[0])) for n in range(0, 101, 5)],
        age_curve=[dict(x=float(a_), v=r3(k * m.age_curve([a_])[0])) for a_ in np.arange(18, 46.5, 0.5)],
        validation=val.astype(object).where(val.notna(), None).to_dict("records"),
    )
    with open(os.path.join(O, "data.json"), "w") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    pd.set_option("display.width", 220)
    cols = ["rank", "name", "rating", "rating_se", "pace", "racecraft", "rating_alt", "rank_alt",
            "first", "last", "n_quali", "developing"]
    print(car[car.ranked].head(40)[cols].round(3).to_string(index=False))
    print("unconnected ranked drivers:", list(car[car.ranked & ~car.connected].name))
    print("data.json size:", os.path.getsize(os.path.join(O, "data.json")) // 1024, "KB")


if __name__ == "__main__":
    main()
