#!/usr/bin/env python3
"""Time-forward test: does the rating predict teammate battles it has never seen?

For every season S from 1996 on, the model is fitted only on races before S and
asked who will win each same-car comparison in S. The same question is put to
the "individual levers" people usually quote (points, wins, average finish,
raw teammate record), computed from the same pre-S races. The hardest and most
telling cases are new pairings: two drivers who had never been teammates, where
a rating can only be right if chaining through other teammates works.

Usage: python -I src/validate.py <processed dir> <out dir>
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import pandas as pd
from scipy import optimize

from model import Data, Model

TUNED = dict(tau_theta=0.3, tau_u=0.2, rho=0.8, tau_r=0.06)
VARIANTS = {
    "full model": dict(TUNED),
    "no era scale": dict(TUNED, sigma_scale=1e-3),
    "era scatter only (a % is a %)": dict(TUNED, era_signal=False),
    "no age/experience curves": dict(TUNED, tau_curve=1e-3),
    "no season form": dict(TUNED, tau_u=1e-3, rho=0.0),
}


def baseline_scores(entries, quali, before):
    """Car-blind career numbers per driver from races before `before`."""
    e = entries[(entries.year < before) & entries.started].copy()
    maxpts = e.groupby("raceId").points.transform("max").replace(0, np.nan)
    e["pts_share"] = (e.points.fillna(0) / maxpts).fillna(0)
    e["win"] = e.positionNumber.eq(1)
    g = e.groupby("driverId")
    out = pd.DataFrame({
        "points per start": g.pts_share.mean(),
        "win rate": g.win.mean(),
        "average finish": -e.dropna(subset=["positionNumber"]).groupby("driverId").positionNumber.mean(),
    })
    q = quali[quali.year < before]
    both = pd.concat([pd.DataFrame({"d": q.a, "gap": q.gap}), pd.DataFrame({"d": q.b, "gap": -q.gap})])
    out["raw teammate record"] = both.groupby("d").gap.apply(lambda x: np.mean(np.sign(x)))
    out["raw avg gap to teammate"] = both.groupby("d").gap.mean()
    return out


def fit_logit_scale(delta, y):
    """Best single logistic slope for a baseline (fitted on the test set: flatters baselines)."""
    def nll(k):
        p = np.clip(1 / (1 + np.exp(-k * delta)), 1e-9, 1 - 1e-9)
        return -np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))
    k = optimize.minimize_scalar(nll, bounds=(0, 1e4), method="bounded").x
    return 1 / (1 + np.exp(-k * delta))


def run(proc, out_dir, first=1996, last=2026):
    qp = pd.read_csv(os.path.join(proc, "quali_pairs.csv"))
    rp = pd.read_csv(os.path.join(proc, "race_pairs.csv"))
    ent = pd.read_csv(os.path.join(proc, "entries.csv"))
    qp = qp[~qp.dropped_outlier]
    rp = rp[rp.outcome.notna()]
    preds = []
    for S in range(first, last + 1):
        qtr, rtr = qp[qp.year < S], rp[rp.year < S]
        data = Data(qtr, rtr)
        known = set(data.drivers)
        past_pairs = set(map(frozenset, zip(qtr.a, qtr.b))) | set(map(frozenset, zip(rtr.a, rtr.b)))
        qte = qp[(qp.year == S) & qp.a.isin(known) & qp.b.isin(known) & (qp.source == "qualifying")].copy()
        rte = rp[(rp.year == S) & rp.a.isin(known) & rp.b.isin(known) & (rp.source == "race")].copy()
        base = baseline_scores(ent, qp, S)
        for kind, te in (("quali", qte), ("race", rte)):
            te["kind"] = kind
            te["y"] = (te.gap > 0).astype(float) if kind == "quali" else te.outcome.astype(float)
            te["new_pair"] = [frozenset(p) not in past_pairs for p in zip(te.a, te.b)]
            for col in base.columns:
                te["B:" + col] = te.a.map(base[col]).values - te.b.map(base[col]).values
        for name, kw in VARIANTS.items():
            m = Model(data, **kw).fit()
            qte["M:" + name] = m.prob_quali(qte)
            rte["M:" + name] = m.prob_race(rte)
        preds.append(qte)
        preds.append(rte)
        print(f"season {S}: {len(qte)} quali, {len(rte)} race test comparisons", flush=True)
    P = pd.concat(preds, ignore_index=True)
    P = P[P.y.notna() & ~((P.kind == "quali") & (P.gap == 0))]
    P.to_csv(os.path.join(out_dir, "validation_predictions.csv"), index=False)
    return summarise(P, out_dir)


def summarise(P, out_dir):
    rows = []
    methods = [c for c in P.columns if c.startswith("M:") or c.startswith("B:")]
    for kind in ("quali", "race"):
        for subset, mask in (("all pairs", np.ones(len(P), bool)), ("new pairings", P.new_pair.values)):
            sel = P[(P.kind == kind) & mask]
            for meth in methods:
                v = sel[meth].values
                ok = ~np.isnan(v)
                y = sel.y.values[ok]
                v = v[ok]
                if meth.startswith("B:"):
                    acc = np.mean(np.where(v == 0, 0.5, (v > 0) == (y == 1)))
                    p = fit_logit_scale(v, y)
                else:
                    acc = np.mean(np.where(v == 0.5, 0.5, (v > 0.5) == (y == 1)))
                    p = v
                p = np.clip(p, 1e-6, 1 - 1e-6)
                ll = -np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))
                rows.append(dict(kind=kind, subset=subset, method=meth[2:],
                                 type="model" if meth.startswith("M:") else "baseline",
                                 n=int(ok.sum()), accuracy=acc, log_loss=ll))
    # Season-long head-to-heads: who wins the most qualifying duels over a season.
    season = []
    q = P[P.kind == "quali"]
    for (yr, team, a, b), g in q.groupby(["year", "team", "a", "b"]):
        if len(g) < 6:
            continue
        rec = dict(year=yr, a=a, b=b, new_pair=bool(g.new_pair.iloc[0]), y=float(g.y.mean() > 0.5),
                   tie=g.y.mean() == 0.5)
        for meth in methods:
            rec[meth] = g[meth].mean()
        season.append(rec)
    S = pd.DataFrame(season)
    S = S[~S.tie]
    for subset, mask in (("all pairs", np.ones(len(S), bool)), ("new pairings", S.new_pair.values)):
        sel = S[mask]
        for meth in methods:
            v = sel[meth].values
            ok = ~np.isnan(v)
            thr = 0.5 if meth.startswith("M:") else 0.0
            acc = np.mean(np.where(v[ok] == thr, 0.5, (v[ok] > thr) == (sel.y.values[ok] == 1)))
            rows.append(dict(kind="season quali H2H", subset=subset, method=meth[2:],
                             type="model" if meth.startswith("M:") else "baseline",
                             n=int(ok.sum()), accuracy=acc, log_loss=np.nan))
    R = pd.DataFrame(rows)
    R.to_csv(os.path.join(out_dir, "validation_summary.csv"), index=False)
    with open(os.path.join(out_dir, "validation_summary.json"), "w") as f:
        json.dump(R.to_dict("records"), f, indent=1)
    pd.set_option("display.width", 200)
    print(R.pivot_table(index=["type", "method"], columns=["kind", "subset"], values="accuracy").round(3).to_string())
    print(R[R.type == "model"].pivot_table(index="method", columns=["kind", "subset"], values="log_loss").round(4).to_string())
    return R


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("processed_dir")
    ap.add_argument("out_dir")
    ap.add_argument("--first", type=int, default=1996)
    a = ap.parse_args()
    os.makedirs(a.out_dir, exist_ok=True)
    run(a.processed_dir, a.out_dir, first=a.first)
