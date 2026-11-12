#!/usr/bin/env python3
"""Build same-car teammate comparisons from the F1DB CSV release.

Every comparison is between two drivers who drove for the same constructor in
the same race weekend, so the car cancels out. Three kinds are produced:

  quali_pairs.csv  lap-time ratio in the deepest qualifying session both
                   drivers set a time in (plus sprint qualifying and
                   pre-qualifying at reduced weight)
  race_pairs.csv   who finished ahead in the race (and sprint), counting only
                   results the drivers controlled: mechanical failures,
                   collisions and other non-driver retirements are dropped,
                   while solo crashes, spins and driver infringements count as
                   a loss for the driver who made them
  entries.csv      one row per driver per race with age and prior starts

Usage: python -I src/build_dataset.py <f1db csv dir> <output dir>
"""
import argparse
import os

import numpy as np
import pandas as pd

FIRST_YEAR = 1977    # Riccardo Patrese's debut: the earliest of any 1990+ driver
RANK_FROM = 1990     # only drivers who started a race from this year are ranked
MAX_QUALI_GAP = 4.0  # % gap beyond which a quali comparison is a car problem, not pace

NOT_STARTED = {"DNQ", "DNPQ", "DNS", "DNP", "EX"}

# Retirements and disqualifications that were the driver's own doing.
DRIVER_FAULT = {
    "Accident", "Spun off", "Spin", "Accident damage", "Accident on formation lap",
    "Ignored red light", "Ignored black flag", "Ignored blue flags", "Ignored yellow flags",
    "Overtaking on formation lap", "Illegal start", "Reversed in pits",
    "Failed to serve stop-go penalty", "Rejoined track illegally",
    "Received outside assistance", "Push start", "Push start in pits",
    "Caused collision with Trulli", "Misled stewards", "Incorrect starting procedure",
    "Incorrect grid formation", "Missed weight check",
}
# Blame can't be read from the data, so these are left out rather than guessed.
COLLISION = {"Collision", "Collision damage", "Puncture damage", "Fatal collision"}


def reason_kind(reason):
    if not isinstance(reason, str) or not reason:
        return "none"
    if reason in DRIVER_FAULT:
        return "driver"
    if reason in COLLISION:
        return "collision"
    return "car_or_other"   # mechanical, team, illness, technical DSQ, ...


def load(csv_dir, name, **kw):
    return pd.read_csv(os.path.join(csv_dir, f"f1db-{name}.csv"), low_memory=False, **kw)


def quali_regime(year, rnd):
    if year < 1990:
        return "1977-89 two sessions"
    if year <= 1995:
        return "1990-95 two sessions"
    if year <= 2002:
        return "1996-02 one hour"
    if year <= 2004 or (year == 2005 and rnd <= 6):
        return "2003-05 single lap (low fuel)"
    if year == 2005:
        return "2005 single lap (race fuel)"
    if year <= 2009:
        return "2006-09 knockout Q1/Q2"
    if year <= 2013:
        return "2010-13 knockout"
    if year <= 2021:
        return "2014-21 knockout"
    return "2022-26 knockout"


def race_era(year):
    if year < 1990:
        return "1977-89"
    if year < 2000:
        return "1990-99"
    if year < 2010:
        return "2000-09"
    if year < 2020:
        return "2010-19"
    return "2020-26"


def build_entries(csv_dir):
    races = load(csv_dir, "races")[["id", "year", "round", "date", "officialName", "grandPrixId"]]
    races = races.rename(columns={"id": "raceId"})
    races["date"] = pd.to_datetime(races["date"])
    rr = load(csv_dir, "races-race-results")
    rr = rr[~rr["sharedCar"].astype(str).str.lower().eq("true")]
    rr["started"] = ~rr["positionText"].astype(str).isin(NOT_STARTED)
    rr = rr.merge(races[["raceId", "date"]], on="raceId")

    # Prior race starts over the whole 1950+ history (experience on entry).
    starts = (rr[rr["started"]].groupby(["driverId", "raceId", "date"]).size()
              .reset_index()[["driverId", "raceId", "date"]].sort_values(["driverId", "date", "raceId"]))
    starts["prior_starts"] = starts.groupby("driverId").cumcount()

    drivers = load(csv_dir, "drivers")
    dob = pd.to_datetime(drivers.set_index("id")["dateOfBirth"])
    return races, rr, starts, drivers, dob


def prior_starts_lookup(starts):
    """prior starts before a race for any (driver, date), started or not."""
    by_driver = {d: g["date"].values for d, g in starts.groupby("driverId")}

    def lookup(driver, date):
        arr = by_driver.get(driver)
        if arr is None:
            return 0
        return int(np.searchsorted(arr, np.datetime64(date), side="left"))
    return lookup


def pair_rows(df, key_cols):
    """All within-group driver pairs (a < b by position order) for each team-race."""
    out = []
    for _, g in df.groupby(key_cols, sort=False):
        if len(g) < 2:
            continue
        recs = g.to_dict("records")
        for i in range(len(recs)):
            for j in range(i + 1, len(recs)):
                out.append((recs[i], recs[j]))
    return out


def main_quali_time(row_main, row_q1, year, rnd):
    """Comparable single-number quali time for pre-knockout formats."""
    if (2003 <= year <= 2004) or (year == 2005 and rnd <= 6):
        return row_q1  # low-fuel session; the second session ran on race fuel
    return row_main


def build_quali_pairs(csv_dir, races):
    cols = ["raceId", "year", "round", "driverId", "constructorId", "timeMillis",
            "q1Millis", "q2Millis", "q3Millis", "positionDisplayOrder"]
    q = load(csv_dir, "races-qualifying-results")[cols]
    q = q[q["year"] >= FIRST_YEAR]
    q1s = load(csv_dir, "races-qualifying-1-results")[["raceId", "driverId", "timeMillis"]]
    q1s = q1s.rename(columns={"timeMillis": "sess1Millis"})
    q = q.merge(q1s, on=["raceId", "driverId"], how="left")

    rows = []
    for a, b in pair_rows(q, ["raceId", "constructorId"]):
        year, rnd = int(a["year"]), int(a["round"])
        regime = quali_regime(year, rnd)
        ta = tb = None
        session = None
        if year >= 2006:
            order = ["q3Millis", "q2Millis", "q1Millis"] if year >= 2010 else ["q2Millis", "q1Millis"]
            for col in order:  # deepest session both drivers set a time in
                if pd.notna(a[col]) and pd.notna(b[col]):
                    ta, tb, session = a[col], b[col], col[:2].upper()
                    break
        else:
            if (2003 <= year <= 2004) or (year == 2005 and rnd <= 6):
                if pd.notna(a["sess1Millis"]) and pd.notna(b["sess1Millis"]):
                    ta, tb, session = a["sess1Millis"], b["sess1Millis"], "low-fuel session"
                elif pd.notna(a["timeMillis"]) and pd.notna(b["timeMillis"]):
                    ta, tb, session = a["timeMillis"], b["timeMillis"], "race-fuel session"
                    regime = "2005 single lap (race fuel)"
            elif pd.notna(a["timeMillis"]) and pd.notna(b["timeMillis"]):
                ta, tb, session = a["timeMillis"], b["timeMillis"], "best time"
        if ta is None:
            continue
        rows.append(dict(raceId=a["raceId"], year=year, round=rnd, team=a["constructorId"],
                         a=a["driverId"], b=b["driverId"], ta=ta, tb=tb, session=session,
                         regime=regime, source="qualifying", weight=1.0))

    # Sprint qualifying / shootout (2023+): a second, independent low-fuel session.
    sq = load(csv_dir, "races-sprint-qualifying-results")[cols]
    for a, b in pair_rows(sq, ["raceId", "constructorId"]):
        for col in ["q3Millis", "q2Millis", "q1Millis"]:
            if pd.notna(a[col]) and pd.notna(b[col]):
                rows.append(dict(raceId=a["raceId"], year=int(a["year"]), round=int(a["round"]),
                                 team=a["constructorId"], a=a["driverId"], b=b["driverId"],
                                 ta=a[col], tb=b[col], session="S" + col[:2].upper(),
                                 regime="2022-26 knockout", source="sprint qualifying", weight=0.5))
                break

    # Pre-qualifying (1977-92): the only running some backmarker teammates shared.
    pq = load(csv_dir, "races-pre-qualifying-results")[cols]
    pq = pq[pq["year"] >= FIRST_YEAR]
    for a, b in pair_rows(pq, ["raceId", "constructorId"]):
        if pd.notna(a["timeMillis"]) and pd.notna(b["timeMillis"]):
            year, rnd = int(a["year"]), int(a["round"])
            rows.append(dict(raceId=a["raceId"], year=year, round=rnd, team=a["constructorId"],
                             a=a["driverId"], b=b["driverId"], ta=a["timeMillis"], tb=b["timeMillis"],
                             session="pre-qualifying", regime=quali_regime(year, rnd),
                             source="pre-qualifying", weight=0.5))

    qp = pd.DataFrame(rows)
    # gap > 0 means driver a was faster; % of lap time, log-ratio form.
    qp["gap"] = 100.0 * np.log(qp["tb"].astype(float) / qp["ta"].astype(float))
    qp["dropped_outlier"] = qp["gap"].abs() > MAX_QUALI_GAP
    return qp


def race_outcome(a, b):
    """1 if a beat b, 0 if b beat a, None if the result says nothing about the drivers."""
    ka, kb = a["kind"], b["kind"]
    ca, cb = pd.notna(a["positionNumber"]), pd.notna(b["positionNumber"])
    if ca and cb:
        a_ahead = a["positionNumber"] < b["positionNumber"]
        loser_kind = kb if a_ahead else ka
        if loser_kind in ("car_or_other", "collision"):
            return None, "loser had a car problem or collision"
        return (1 if a_ahead else 0), "both classified"
    if ca and not cb:
        return (1, "teammate driver error") if kb == "driver" else (None, "teammate out, not their fault")
    if cb and not ca:
        return (0, "driver error") if ka == "driver" else (None, "out, not their fault")
    return None, "both unclassified"


def build_race_pairs(rr, table_name):
    rr = rr[(rr["year"] >= FIRST_YEAR) & rr["started"]].copy()
    rr["kind"] = rr["reasonRetired"].map(reason_kind)
    rows = []
    for a, b in pair_rows(rr, ["raceId", "constructorId"]):
        out, why = race_outcome(a, b)
        rows.append(dict(raceId=a["raceId"], year=int(a["year"]), round=int(a["round"]),
                         team=a["constructorId"], a=a["driverId"], b=b["driverId"],
                         pos_a=a["positionText"], pos_b=b["positionText"],
                         reason_a=a["reasonRetired"], reason_b=b["reasonRetired"],
                         outcome=out, why=why, era=race_era(int(a["year"])), source=table_name,
                         weight=1.0 if table_name == "race" else 1.0 / 3.0))
    return pd.DataFrame(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_dir")
    ap.add_argument("out_dir")
    args = ap.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)

    races, rr, starts, drivers, dob = build_entries(args.csv_dir)
    lookup = prior_starts_lookup(starts)

    # Entries: every driver-race in the window, with experience and age on the day.
    ent = rr[rr["year"] >= FIRST_YEAR][["raceId", "year", "round", "driverId", "constructorId",
                                        "positionText", "positionNumber", "points", "started",
                                        "gridPositionNumber", "reasonRetired", "date"]].copy()
    ent["prior_starts"] = [lookup(d, t) for d, t in zip(ent["driverId"], ent["date"])]
    ent["age"] = (ent["date"] - ent["driverId"].map(dob)).dt.days / 365.25
    ent.to_csv(os.path.join(args.out_dir, "entries.csv"), index=False)

    qp = build_quali_pairs(args.csv_dir, races)
    sr = load(args.csv_dir, "races-sprint-race-results")
    sr = sr[~sr["sharedCar"].astype(str).str.lower().eq("true")]
    sr["started"] = ~sr["positionText"].astype(str).isin(NOT_STARTED)
    rp = pd.concat([build_race_pairs(rr, "race"), build_race_pairs(sr, "sprint")], ignore_index=True)

    # Attach experience/age on the day to both sides of every comparison.
    race_date = races.set_index("raceId")["date"]
    for df in (qp, rp):
        dates = df["raceId"].map(race_date)
        for side in ("a", "b"):
            df[f"exp_{side}"] = [lookup(d, t) for d, t in zip(df[side], dates)]
            df[f"age_{side}"] = (dates - df[side].map(dob)).dt.days / 365.25
    qp.to_csv(os.path.join(args.out_dir, "quali_pairs.csv"), index=False)
    rp.to_csv(os.path.join(args.out_dir, "race_pairs.csv"), index=False)

    ranked = sorted(set(ent.loc[ent["started"] & (ent["year"] >= RANK_FROM), "driverId"]))
    dcols = ["id", "name", "firstName", "lastName", "abbreviation", "nationalityCountryId",
             "dateOfBirth", "totalChampionshipWins", "totalRaceStarts", "totalRaceWins",
             "totalPodiums", "totalPolePositions", "totalPoints"]
    dd = drivers[drivers["id"].isin(set(ent["driverId"]))][dcols].copy()
    dd["ranked"] = dd["id"].isin(ranked)
    dd.to_csv(os.path.join(args.out_dir, "drivers.csv"), index=False)

    st = load(args.csv_dir, "seasons-driver-standings")
    st[st["championshipWon"].astype(str).str.lower() == "true"][["driverId", "year"]].to_csv(
        os.path.join(args.out_dir, "titles.csv"), index=False)
    load(args.csv_dir, "constructors")[["id", "name"]].to_csv(
        os.path.join(args.out_dir, "constructors.csv"), index=False)
    load(args.csv_dir, "countries")[["id", "name", "demonym", "alpha3Code"]].to_csv(
        os.path.join(args.out_dir, "countries.csv"), index=False)
    races.to_csv(os.path.join(args.out_dir, "races.csv"), index=False)

    used_q = qp[~qp["dropped_outlier"]]
    used_r = rp[rp["outcome"].notna()]
    print(f"entries: {len(ent)}  ranked drivers: {len(ranked)}  all drivers in window: {len(dd)}")
    print(f"quali comparisons: {len(qp)} ({len(used_q)} used, {qp['dropped_outlier'].sum()} >{MAX_QUALI_GAP}% dropped)")
    print(f"race comparisons:  {len(rp)} ({len(used_r)} with a driver-controlled result)")
    print(rp.groupby(["source", "why"]).size().to_string())


if __name__ == "__main__":
    main()
