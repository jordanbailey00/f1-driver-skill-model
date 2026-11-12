"""Same-car skill model: chains teammate lap-time ratios into one scale.

Every observation compares two drivers in the same car on the same weekend, so
the car cancels out. A driver's rating is then carried to drivers they never
raced alongside through the network of shared teammates (A beat B by 0.2 %, B beat C by
0.3 %, so A is about 0.5 % quicker than C), solved for all drivers at once.

  qualifying   y = 100 * ln(t_b / t_a)
               y ~ StudentT(nu, lambda(year) * eta, lambda(year) * kappa_format * S0)
  race         P(a finishes ahead of b) = Phi((eta + r_a - r_b) / s_era)

with the same-car pace difference

  eta = skill_a - skill_b
  skill_d(season) = theta_d                 driver's long-run prime pace
                  + E(prior starts)         rookie learning curve, 0 after 80 starts
                  + A(age)                  ageing curve, 0 up to age 30
                  + u_{d,season}            that season's form, shrunk to 0

and r_d a race-day adjustment (racecraft), shrunk to 0. The published rating is
theta + r + the driver's average season form: career level with rookie and age
effects removed (see fit.career_ratings).

Two assumptions make eras comparable:

* Prime is flat. A driver aged <= 30 with 80+ starts is assumed to hold their
  level, which pins the learning and ageing curves (otherwise "everyone
  improves 1 % a year" and "each generation is 1 % slower" fit equally well).
* Era scale. Teammate gaps in % were ~2.3x larger in the mid-1980s than since
  2007, and so was the random scatter of those gaps. lambda(year) is the
  size of that era's scatter relative to today's, so a 0.75 % gap in 1988 and
  a 0.30 % gap in 2018 can be the same skill difference. The scatter is
  measured from the data, so lambda is pinned by it. Ratings are reported in
  2014-26 units: % of lap time in a current car.
"""
import numpy as np
import pandas as pd
import scipy.sparse as sp
from scipy import optimize, special, stats

NU = 4.0
S0 = 0.4   # qualifying scatter in skill units; fixes what one unit of skill means
EXP_KNOTS = np.array([0.0, 10.0, 25.0, 50.0, 80.0])          # value at 80+ starts fixed to 0
EXP_FREE = [0, 1, 2, 3]
AGE_KNOTS = np.array([30.0, 33.0, 36.0, 39.0, 42.0])         # 0 up to 30, flat beyond 42
AGE_FREE = [1, 2, 3, 4]
YEAR_KNOTS = np.array([1977.0, 1984.0, 1991.0, 1998.0, 2005.0, 2012.0, 2019.0, 2026.0])
YEAR_FREE = list(range(len(YEAR_KNOTS)))
MODERN = np.arange(2014, 2027)   # ratings are reported in this era's % of lap time
# Formats whose extra scatter is about the format, not the era.
SPECIAL_FORMATS = ["2003-05 single lap (low fuel)", "2005 single lap (race fuel)"]


def hat_basis(x, knots, free):
    """Piecewise-linear interpolation weights onto knots; returns the `free` knot columns."""
    x = np.clip(np.asarray(x, float), knots[0], knots[-1])
    idx = np.clip(np.searchsorted(knots, x, side="right") - 1, 0, len(knots) - 2)
    t = (x - knots[idx]) / (knots[idx + 1] - knots[idx])
    B = np.zeros((len(x), len(knots)))
    B[np.arange(len(x)), idx] = 1 - t
    B[np.arange(len(x)), idx + 1] += t
    return B[:, free]


class Data:
    """Index drivers and driver-seasons and build sparse designs for the comparisons."""

    def __init__(self, quali, race, exp_knots=EXP_KNOTS, age_knots=AGE_KNOTS):
        self.exp_knots, self.age_knots = np.asarray(exp_knots, float), np.asarray(age_knots, float)
        self.exp_free = list(range(len(self.exp_knots) - 1))    # flat after the last knot
        self.age_free = list(range(1, len(self.age_knots)))     # flat before the first knot
        self.quali = quali.reset_index(drop=True)
        self.race = race.reset_index(drop=True)
        q, r = self.quali, self.race
        self.drivers = sorted(set(q.a) | set(q.b) | set(r.a) | set(r.b))
        self.d_idx = {d: i for i, d in enumerate(self.drivers)}
        seasons = set(zip(q.a, q.year)) | set(zip(q.b, q.year)) | set(zip(r.a, r.year)) | set(zip(r.b, r.year))
        self.seasons = sorted(seasons)
        self.s_idx = {s: i for i, s in enumerate(self.seasons)}
        self.r_eras = sorted(r.era.unique())
        D, S = len(self.drivers), len(self.seasons)
        self.nE, self.nA = len(self.exp_free), len(self.age_free)
        self.nL, self.nK = len(YEAR_FREE), len(SPECIAL_FORMATS)
        self.off_theta, self.off_u, self.off_r = 0, D, D + S
        self.off_e = D + S + D
        self.off_g = self.off_e + self.nE
        self.P = self.off_g + self.nA
        self.Xq = self.design(q, racecraft=False)
        self.Xr = self.design(r, racecraft=True)
        self.Bl = hat_basis(q.year.values, YEAR_KNOTS, YEAR_FREE)
        self.q_special = np.array([SPECIAL_FORMATS.index(x) if x in SPECIAL_FORMATS else -1 for x in q.regime])
        self.r_era = np.array([self.r_eras.index(x) for x in r.era])
        self.yq, self.wq = q.gap.values.astype(float), q.weight.values.astype(float)
        self.yr, self.wr = r.outcome.values.astype(float), r.weight.values.astype(float)

    def exp_basis(self, n):
        return hat_basis(n, self.exp_knots, self.exp_free)

    def age_basis(self, a):
        return hat_basis(a, self.age_knots, self.age_free)

    def design(self, df, racecraft):
        n = len(df)
        rows, cols, vals = [], [], []

        def add(col, v):
            rows.append(np.arange(n))
            cols.append(np.asarray(col))
            vals.append(np.broadcast_to(np.asarray(v, float), (n,)))
        ia, ib = df.a.map(self.d_idx).values, df.b.map(self.d_idx).values
        add(self.off_theta + ia, 1.0)
        add(self.off_theta + ib, -1.0)
        add(self.off_u + np.array([self.s_idx[k] for k in zip(df.a, df.year)]), 1.0)
        add(self.off_u + np.array([self.s_idx[k] for k in zip(df.b, df.year)]), -1.0)
        if racecraft:
            add(self.off_r + ia, 1.0)
            add(self.off_r + ib, -1.0)
        Be = self.exp_basis(df.exp_a) - self.exp_basis(df.exp_b)
        Ba = self.age_basis(df.age_a) - self.age_basis(df.age_b)
        for k in range(self.nE):
            add(np.full(n, self.off_e + k), Be[:, k])
        for k in range(self.nA):
            add(np.full(n, self.off_g + k), Ba[:, k])
        return sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))),
                             shape=(n, self.P))


def form_precision(seasons, off, tau, rho):
    """AR(1) prior on each driver's season form: u_t = rho^gap u_prev + noise, sd tau."""
    rows, cols, vals = [], [], []

    def put(i, j, v):
        rows.append(i)
        cols.append(j)
        vals.append(v)
    prev = None
    for k, (drv, yr) in enumerate(seasons):   # sorted by driver, then year
        i = off + k
        if prev is None or prev[0] != drv:
            put(i, i, 1 / tau ** 2)
        else:
            a = rho ** (yr - prev[1])
            v = tau ** 2 * (1 - a ** 2)
            put(i, i, 1 / v)
            put(i - 1, i - 1, a ** 2 / v)
            put(i, i - 1, -a / v)
            put(i - 1, i, -a / v)
        prev = (drv, yr)
    return rows, cols, vals


class Model:
    def __init__(self, data, tau_theta=0.35, tau_u=0.15, rho=0.0, tau_r=0.06, tau_curve=1.0,
                 sigma_scale=0.3, era_signal=True, tau_age=None):
        self.d = d = data
        self.era_signal = era_signal   # False: eras differ in scatter only, a % is a %
        diag = np.zeros(d.P)
        diag[d.off_theta:d.off_u] = 1 / tau_theta ** 2
        diag[d.off_r:d.off_e] = 1 / tau_r ** 2
        diag[d.off_e:] = 1 / tau_curve ** 2
        if tau_age is not None:          # e.g. ~0 switches the ageing curve off
            diag[d.off_g:] = 1 / tau_age ** 2
        keep = diag > 0
        rows, cols, vals = form_precision(d.seasons, d.off_u, tau_u, rho)
        rows += list(np.flatnonzero(keep))
        cols += list(np.flatnonzero(keep))
        vals += list(diag[keep])
        self.Q = sp.csr_matrix((vals, (rows, cols)), shape=(d.P, d.P))
        self.rho = rho
        self.sigma_scale = sigma_scale
        self.hyper = dict(tau_theta=tau_theta, tau_u=tau_u, rho=rho, tau_r=tau_r, tau_curve=tau_curve,
                          sigma_scale=sigma_scale)
        self.nr = len(d.r_eras)

    # x = [beta (P), log lambda knots (nL), log kappa (nK), log s_race (nr)]
    def unpack(self, x):
        d = self.d
        i = d.P
        beta = x[:i]
        l = x[i:i + d.nL]; i += d.nL
        kappa = np.exp(x[i:i + d.nK]); i += d.nK
        sr = np.exp(x[i:i + self.nr])
        return beta, l, S0, kappa, sr

    def scale_penalty(self, l):
        """Random-walk prior on log lambda between year knots, plus a weak level prior."""
        steps = np.diff(l)
        k = 1 / self.sigma_scale ** 2
        g = l / 4.0
        g[:-1] -= steps * k
        g[1:] += steps * k
        return 0.5 * k * np.sum(steps ** 2) + np.sum(l ** 2) / 8.0, g

    def objective(self, x):
        d = self.d
        beta, l, s0, kappa, sr = self.unpack(x)
        # qualifying: Student-t, location and scale both stretched by the era scale
        lam = np.exp(d.Bl @ l)
        kap = np.where(d.q_special >= 0, kappa[np.maximum(d.q_special, 0)], 1.0)
        s = s0 * lam * kap
        sig = lam if self.era_signal else np.ones_like(lam)
        mu = sig * (d.Xq @ beta)
        res = d.yq - mu
        z2 = res ** 2 / (NU * s ** 2)
        nll_q = d.wq * (0.5 * (NU + 1) * np.log1p(z2) + np.log(s))
        dres = d.wq * (NU + 1) * res / (NU * s ** 2 + res ** 2)    # -dnll/dmu
        dlogs = d.wq * (1 - (NU + 1) * z2 / (1 + z2))              # dnll/dlog s
        # race: probit on who finished ahead
        eta_r = d.Xr @ beta
        sr_i = sr[d.r_era]
        z = eta_r / sr_i
        sign = 2 * d.yr - 1
        lp = special.log_ndtr(sign * z)
        dz = -d.wr * sign * np.exp(stats.norm.logpdf(z) - lp)    # dnll/dz
        f_l, g_l_prior = self.scale_penalty(l)
        Qb = self.Q @ beta
        f = nll_q.sum() - np.sum(d.wr * lp) + 0.5 * beta @ Qb + f_l
        g_beta = -(d.Xq.T @ (dres * sig)) + d.Xr.T @ (dz / sr_i) + Qb
        g_l = d.Bl.T @ ((-dres * mu if self.era_signal else 0) + dlogs) + g_l_prior
        g_k = np.bincount(d.q_special[d.q_special >= 0], weights=dlogs[d.q_special >= 0], minlength=d.nK)
        g_sr = np.bincount(d.r_era, weights=-dz * z, minlength=self.nr)
        return f, np.concatenate([g_beta, g_l, g_k, g_sr])

    def x0(self):
        d = self.d
        return np.concatenate([np.zeros(d.P), np.zeros(d.nL), np.zeros(d.nK),
                               np.full(self.nr, np.log(0.5))])

    def fit(self, x0=None, maxiter=20000):
        res = optimize.minimize(self.objective, self.x0() if x0 is None else x0, jac=True,
                                method="L-BFGS-B",
                                options=dict(maxiter=maxiter, maxcor=50, ftol=1e-13, gtol=1e-7))
        self.x, self.opt = res.x, res
        self.beta, self.l, self.s0, self.kappa, self.sr = self.unpack(res.x)
        self.__dict__.pop("_cov", None)
        return self

    def hessian(self):
        """Expected-information Hessian of the linear parameters at the optimum."""
        d = self.d
        kap = np.where(d.q_special >= 0, self.kappa[np.maximum(d.q_special, 0)], 1.0)
        info_q = d.wq * (NU + 1) / ((NU + 3) * (self.s0 * kap) ** 2)   # lambda cancels
        if not self.era_signal:
            info_q = info_q / np.exp(d.Bl @ self.l) ** 2
        sr_i = self.sr[d.r_era]
        z = (d.Xr @ self.beta) / sr_i
        cdf = np.clip(stats.norm.cdf(z), 1e-12, 1 - 1e-12)
        info_r = d.wr * stats.norm.pdf(z) ** 2 / (cdf * (1 - cdf)) / sr_i ** 2
        return (d.Xq.T @ sp.diags(info_q) @ d.Xq + d.Xr.T @ sp.diags(info_r) @ d.Xr + self.Q).toarray()

    def covariance(self):
        if "_cov" not in self.__dict__:
            self._cov = np.linalg.inv(self.hessian())
        return self._cov

    def log_evidence(self):
        """Laplace approximation to the marginal likelihood (used to tune the priors)."""
        f, _ = self.objective(self.x)
        _, logdet_h = np.linalg.slogdet(self.hessian())
        _, logdet_q = np.linalg.slogdet(self.Q.toarray())
        return -f + 0.5 * logdet_q - 0.5 * logdet_h

    # --- curves and ratings ---------------------------------------------------
    def lam(self, years):
        return np.exp(hat_basis(years, YEAR_KNOTS, YEAR_FREE) @ self.l)

    def unit(self):
        """% of a 2014-26 lap time per unit of skill: converts skill units to reported %."""
        return float(np.mean(self.lam(MODERN))) if self.era_signal else 1.0

    def exp_curve(self, n):
        d = self.d
        return d.exp_basis(n) @ self.beta[d.off_e:d.off_e + d.nE]

    def age_curve(self, a):
        d = self.d
        return d.age_basis(a) @ self.beta[d.off_g:d.off_g + d.nA]

    def driver_table(self):
        d = self.d
        D = len(d.drivers)
        cov = self.covariance()
        it, ir = np.arange(D) + d.off_theta, np.arange(D) + d.off_r
        th, rc = self.beta[it], self.beta[ir]
        var_o = cov[it, it] + cov[ir, ir] + 2 * cov[it, ir]
        k = self.unit()
        return pd.DataFrame(dict(driverId=d.drivers, pace=k * th, racecraft=k * rc, overall=k * (th + rc),
                                 pace_se=k * np.sqrt(cov[it, it]), racecraft_se=k * np.sqrt(cov[ir, ir]),
                                 overall_se=k * np.sqrt(var_o)))

    def season_table(self, entries):
        """Rating actually delivered each season: prime + curves at that season + form."""
        d = self.d
        cov = self.covariance()
        e = entries[entries.driverId.isin(d.d_idx)].copy()
        e = e[[(dr, y) in d.s_idx for dr, y in zip(e.driverId, e.year)]]
        Be = d.exp_basis(e.prior_starts)
        Ba = d.age_basis(e.age)
        cols = [f"e{k}" for k in range(d.nE)] + [f"g{k}" for k in range(d.nA)]
        e[cols] = np.hstack([Be, Ba])
        g = e.groupby(["driverId", "year"])[cols].mean().reset_index()
        V = np.zeros((len(g), d.P))
        rows = np.arange(len(g))
        di = g.driverId.map(d.d_idx).values
        V[rows, d.off_theta + di] = 1
        V[rows, d.off_r + di] = 1
        V[rows, d.off_u + np.array([d.s_idx[k] for k in zip(g.driverId, g.year)])] = 1
        V[:, d.off_e:d.off_e + d.nE] = g[cols[:d.nE]].values
        V[:, d.off_g:d.off_g + d.nA] = g[cols[d.nE:]].values
        k = self.unit()
        g["rating"] = k * (V @ self.beta)
        g["rating_se"] = k * np.sqrt(np.einsum("ij,jk,ik->i", V, cov, V))
        g["form"] = k * self.beta[d.off_u + np.array([d.s_idx[s] for s in zip(g.driverId, g.year)])]
        g["curve"] = k * (V[:, d.off_e:] @ self.beta[d.off_e:])
        return g[["driverId", "year", "rating", "rating_se", "form", "curve"]]

    # --- prediction -----------------------------------------------------------
    def predict_eta(self, df, kind):
        """Same-car pace difference for pairs; unseen drivers/seasons count as 0."""
        d = self.d
        D = len(d.drivers)
        th = dict(zip(d.drivers, self.beta[d.off_theta:d.off_theta + D]))
        rc = dict(zip(d.drivers, self.beta[d.off_r:d.off_r + D]))
        u = {s: self.beta[d.off_u + i] for s, i in d.s_idx.items()}
        last = {}
        for (drv, yr), i in d.s_idx.items():   # latest fitted season per driver
            if drv not in last or yr > last[drv][0]:
                last[drv] = (yr, self.beta[d.off_u + i])

        def form(drv, yr):
            if (drv, yr) in u:
                return u[(drv, yr)]
            if drv in last and last[drv][0] < yr:   # carry form forward, decaying
                return self.rho ** (yr - last[drv][0]) * last[drv][1]
            return 0.0
        eta = (df.a.map(th).fillna(0).values - df.b.map(th).fillna(0).values
               + np.array([form(x, y) - form(z, y) for x, z, y in zip(df.a, df.b, df.year)])
               + self.exp_curve(df.exp_a) - self.exp_curve(df.exp_b)
               + self.age_curve(df.age_a) - self.age_curve(df.age_b))
        if kind == "race":
            eta = eta + df.a.map(rc).fillna(0).values - df.b.map(rc).fillna(0).values
        return eta

    def prob_quali(self, df):
        """P(driver a out-qualifies b)."""
        kap = np.array([self.kappa[SPECIAL_FORMATS.index(x)] if x in SPECIAL_FORMATS else 1.0
                        for x in df.regime])
        scale = self.s0 * kap * (1.0 if self.era_signal else self.lam(df.year.values))
        return stats.t.cdf(self.predict_eta(df, "quali") / scale, NU)

    def prob_race(self, df):
        """P(driver a finishes ahead of b), for an era seen in training."""
        sr = dict(zip(self.d.r_eras, self.sr))
        s = df.era.map(sr).fillna(self.sr[-1]).values
        return stats.norm.cdf(self.predict_eta(df, "race") / s)
