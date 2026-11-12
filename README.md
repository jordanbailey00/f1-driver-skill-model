# Equal Machinery: an F1 driver skill rating

Every Formula 1 driver who started a race from 1990 onwards (204 of them), rated on one
scale using only comparisons where the car can't matter: two teammates, same car, same
weekend. Those same-car gaps are chained through shared teammates, so drivers who never
raced each other can still be compared.

**Website: <https://f1-equal-machinery.vercel.app>**: rankings, driver pages, head to
heads, a career timeline, season-by-season teammate battles, the teammate network, the
method and the validation, all interactive.

## The ratio

**Rating** = how much quicker per lap a driver is than an average F1 driver of
1990–2026 when both drive the identical car, as a % of lap time in today's terms.

**Equal-car ratio** = the same number as a lap-time ratio:

    equal-car ratio = driver's lap time ÷ average driver's lap time (same car)
                    = exp(−rating / 100) ≈ 1 − rating / 100

So Schumacher's +0.70% is a ratio of 0.9930: he needs 99.30% of the average driver's lap
time, about 0.63 s on a 90-second lap.

### How it's built

1. **Same-car gaps.** For every race since 1977, each pair of teammates is compared on
   the best qualifying lap in the deepest session both set a time in:
   `gap = 100 × ln(lap_B / lap_A)`. Race-fuel sessions are swapped for the low-fuel
   session where one exists (Q2 instead of Q3 in 2006–09, the first session in
   2003–05). Sprint qualifying (2023+) and pre-qualifying count at half weight. Gaps
   over 4% are dropped as car trouble.
2. **Race duels.** Who finished ahead, counting only results the drivers controlled.
   Mechanical failures and collisions are left out. Solo crashes, spins and driver
   penalties count as a loss for the driver who made them. Sprints count at a third.
3. **One model for everything.** Each gap is modelled as `skill_A − skill_B + noise`
   with a heavy-tailed (Student-t) error, and race duels as a probit on the same skill
   difference plus a small racecraft term. A driver's skill in a season is

       prime level + learning curve(career starts) + ageing curve(age) + season form

   The learning curve is flat after 80 starts and the ageing curve is flat up to age 30.
   Pinning the curves over a driver's prime is what lets the chain cross eras without
   drifting. Season form follows an AR(1) process.
4. **Era scale.** Teammate gaps in % were about 2.3× larger in the mid-1980s than
   since 2007, and so was the race-to-race scatter of those gaps. Each era's gaps are
   measured in units of that era's scatter and converted to 2014–26 terms, so a 0.70%
   gap in 1985 counts like a 0.30% gap today.
5. **The rating** is a driver's career-average level with rookie and age effects
   removed (prime + average season form + racecraft), centred so 0 is the average race
   starter of 1990–2026. Prior widths were tuned by Laplace-approximated evidence. Ranges
   are 90% intervals from the Laplace approximation.

Full details are in `src/model.py`.

## Does it work?

For each season from 1996 to 2026 the model was refitted on earlier races only and
asked who would win each teammate duel in that season. The career numbers people usually
quote were given the same task (and the best possible calibration). "New pairings" are
teammates who had never been paired before, the real test of the chaining.

| Method | Quali duels | Quali duels, new pairings | Season quali H2H, new pairings | Race duels |
|---|---|---|---|---|
| **Equal-car rating** | **65.3%** | **62.6%** | **62.5%** | **62.4%** |
| Career record vs teammates (unadjusted) | 60.3% | 57.1% | 56.6% | 59.4% |
| Average gap to teammates (unadjusted) | 59.6% | 56.9% | 56.2% | 58.1% |
| Average finishing position | 59.5% | 58.7% | 56.4% | 60.2% |
| Points per start | 59.1% | 57.5% | 57.2% | 59.6% |
| Win rate | 56.5% | 54.9% | 54.7% | 57.2% |

The same test was used to choose the model. Removing the era scale, the learning/ageing
curves or season form all predicted worse (`output/validation/`), and so did treating a
1990 percent as equal to a 2020 percent. The prior widths were tuned on all seasons, so
the test is slightly flattering to the model.

## Top 20

Drivers with 20+ qualifying duels (the page's default view).

| # | Driver | Seasons | Rating | Per 90 s lap | Equal-car ratio |
|---|---|---|---|---|---|
| 1 | Michael Schumacher | 1991–2012 | +0.70% | 0.63 s | 0.9930 |
| 2 | Ayrton Senna | 1984–1994 | +0.65% | 0.59 s | 0.9935 |
| 3 | Alain Prost | 1980–1993 | +0.44% | 0.40 s | 0.9956 |
| 4 | Fernando Alonso | 2001–2026 | +0.42% | 0.38 s | 0.9958 |
| 5 | Max Verstappen | 2015–2026 | +0.41% | 0.37 s | 0.9959 |
| 6 | Heinz-Harald Frentzen | 1994–2003 | +0.33% | 0.30 s | 0.9967 |
| 7 | Nigel Mansell | 1980–1995 | +0.30% | 0.27 s | 0.9970 |
| 8 | Oliver Bearman* | 2024–2026 | +0.29% | 0.26 s | 0.9971 |
| 9 | Eddie Irvine | 1993–2002 | +0.28% | 0.25 s | 0.9972 |
| 10 | Lewis Hamilton | 2007–2026 | +0.27% | 0.24 s | 0.9973 |
| 11 | Nelson Piquet | 1978–1991 | +0.24% | 0.21 s | 0.9976 |
| 12 | Mika Häkkinen | 1991–2001 | +0.21% | 0.19 s | 0.9979 |
| 13 | Gerhard Berger | 1984–1997 | +0.20% | 0.18 s | 0.9980 |
| 14 | Rubens Barrichello | 1993–2011 | +0.19% | 0.17 s | 0.9981 |
| 15 | Kimi Räikkönen | 2001–2021 | +0.17% | 0.16 s | 0.9983 |
| 16 | Damon Hill | 1992–1999 | +0.17% | 0.15 s | 0.9983 |
| 17 | Jenson Button | 2000–2017 | +0.15% | 0.14 s | 0.9985 |
| 18 | Nico Rosberg | 2006–2016 | +0.15% | 0.14 s | 0.9985 |
| 19 | Jean Alesi | 1989–2001 | +0.15% | 0.13 s | 0.9985 |
| 20 | Jarno Trulli | 1997–2011 | +0.14% | 0.13 s | 0.9986 |

\* Early career: the rating includes the improvement rookies usually make, so it is a
projection with a wide range (±0.23).

Neighbouring ranks are often within each other's 90% ranges. The full table, with
intervals, pace/racecraft split and teammate records, is in `output/ratings.csv` and on
the page.

## Limits

- **Team orders and number-one status** are invisible to the data; a number two who
  gave up places or got older parts looks slower than they were.
- **The era scale is an assumption**: gaps shrank because cars and preparation got more
  consistent, not because drivers became more alike. Without it, 1980s and early-90s
  drivers rate higher still (Senna first, Piquet fifth, Verstappen tenth).
- **The ageing curve is an average.** It decides how much credit a young driver gets for
  beating an older champion (Russell vs Hamilton, Leclerc vs Vettel), and late careers
  that fade more or less than average move a rating.
- **Small samples** are shrunk toward average and carry wide ranges. Drivers with one or
  two races (e.g. Lotterer, Apicella) are hidden by the page's default filter.
- **Bianchi and Chilton** were only ever teammates with each other, so they can't be
  placed on the shared scale and are left unranked.
- **2026** is included through round 20 (São Paulo).

## Reproduce

```bash
uv venv .venv --python 3.12 && uv pip install --python .venv/bin/python -r requirements.txt
```

```bash
mkdir -p data/raw/f1db-v2026.20.0/csv && curl -L -o data/raw/f1db-v2026.20.0/f1db-csv.zip https://github.com/f1db/f1db/releases/download/v2026.20.0/f1db-csv.zip && unzip -o data/raw/f1db-v2026.20.0/f1db-csv.zip -d data/raw/f1db-v2026.20.0/csv
```

```bash
.venv/bin/python -I src/build_dataset.py data/raw/f1db-v2026.20.0/csv data/processed
```

```bash
.venv/bin/python -I src/validate.py data/processed output/validation
```

```bash
.venv/bin/python -I src/fit.py data/processed output
```

`validate.py` refits the model ~150 times and takes about 3 minutes; `fit.py` reads its
predictions for the website, so run it first. To update after a new race, download the
newer F1DB release into its own folder, rerun the chain on it, and pass the release name
and last race to `fit.py` (`--release "F1DB v2026.21.0" --through "2026 Las Vegas GP"`).
Then commit and push: every push to `main` redeploys the website.

## The website

`web/` is a static Vite + D3 site that reads `output/data.json` (written by `fit.py`).
Every page has its own URL, so any driver, pairing or season can be linked directly.

| Page | What it shows |
|---|---|
| Rankings | Every driver with their 90% range; by overall rating, one-lap pace or race day |
| Driver pages | Season-by-season level, record against every teammate, nearest rivals |
| Head to head | Expected gap in identical cars, odds, both careers, the teammate chain |
| Timeline | Every career on one scale, as career ratings or season by season |
| Seasons | Every team's teammate battle, 1990–2026, and the best single seasons |
| Network | All 722 teammate pairings since 1977 as one zoomable web |
| Method | How the rating is built, with the gap, era, learning and ageing curves |
| Does it work? | Accuracy against career numbers, calibration, accuracy by era |

Run it locally (Node 22+):

```bash
cd web && npm install && npm run dev
```

Deploys are automatic. This repo is connected to the Vercel project `f1-equal-machinery`
(root directory `web`), so every push to `main` builds and publishes the site, and pushes to
other branches get preview links. To check a production build locally first:

```bash
cd web && npm run build && npm run preview
```

`web/tools/shots.mjs` screenshots every page at desktop and phone sizes in both themes
and reports page errors and overflow; `web/tools/share-image.mjs` redraws the link-preview
image (`web/public/og.png`) from the current data. Both use Playwright's Chromium and the
running dev server.

## Files

| Path | What it is |
|---|---|
| `src/build_dataset.py` | F1DB CSVs → same-car qualifying and race comparisons |
| `src/model.py` | The rating model (likelihood, priors, curves, era scale) |
| `src/validate.py` | Season-by-season prediction test against career stats |
| `src/fit.py` | Final fit; writes `output/*.csv` and the website data |
| `web/` | The website (Vite + D3) |
| `output/ratings.csv` | Every driver: rating, range, pace, racecraft, rank |
| `output/season_ratings.csv` | Each driver's delivered level, season by season |
| `output/teammates.csv` | Head-to-head record for every teammate pairing |

Data: [F1DB](https://github.com/f1db/f1db) release v2026.20.0.
