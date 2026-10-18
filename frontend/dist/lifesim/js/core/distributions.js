/* ============================================================
 * LifeSim · core/distributions.js
 * 概率分布库（规格书 §52.1 必须项 + §25 分布模型建议）
 *   Uniform / Bernoulli / Binomial / Geometric / Poisson
 *   Normal / LogNormal / Exponential / Beta
 *
 * 每个分布统一提供：
 *   sample(rng, params)  —— 抽样
 *   pdf(x, params)       —— 密度 / 概率质量
 *   cdf(x, params)       —— 累积分布
 *   mean(params) / variance(params) / support
 *
 * 所有实现都不依赖第三方库。
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});

  /* ------------------------------------------------------------
   * 特殊函数
   * ---------------------------------------------------------- */

  /** Lanczos 近似的 log Γ(x)，x > 0 */
  const LANCZOS = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  function logGamma(x) {
    if (x < 0.5) {
      // 反射公式
      return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
    }
    x -= 1;
    let a = 0.99999999999980993;
    const t = x + 7.5;
    for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i] / (x + i + 1);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }

  /**
   * 误差函数 erf(x)。
   *   |x| ≤ 2 用小 x 的泰勒级数（收敛极快，且 erf(0) 严格为 0）
   *   |x| > 2 用 Abramowitz-Stegun 7.1.26（绝对误差 < 1.5e-7，此时 CDF 已接近饱和）
   * 分段可保证显示数值不会出现 1e-9 这种"脏零"。
   */
  function erf(x) {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    if (ax === 0) return 0;

    if (ax <= 2) {
      // erf(x) = 2/√π · Σ (-1)^n x^(2n+1) / (n! (2n+1))
      const x2 = ax * ax;
      let term = ax;          // x^(2n+1) / n!
      let s = ax;             // 累积和（已含 n=0 项）
      for (let n = 1; n <= 28; n++) {
        term *= -x2 / n;
        const add = term / (2 * n + 1);
        s += add;
        if (Math.abs(add) < 1e-18) break;
      }
      return (sign * 2 * s) / Math.sqrt(Math.PI);
    }

    const t = 1 / (1 + 0.3275911 * ax);
    const y =
      1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
        0.254829592) *
        t *
        Math.exp(-ax * ax);
    return sign * y;
  }

  const normalCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  const normalPdf = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

  /** 正则化不完全 Beta 函数 I_x(a,b)，用连分式（Numerical Recipes betacf） */
  function betaContinuedFraction(a, b, x) {
    const MAXIT = 200;
    const EPS = 3e-12;
    const FPMIN = 1e-300;
    const qab = a + b;
    const qap = a + 1;
    const qam = a - 1;
    let c = 1;
    let d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  function incompleteBeta(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(
      logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
    );
    if (x < (a + 1) / (a + b + 2)) {
      return (bt * betaContinuedFraction(a, b, x)) / a;
    }
    return 1 - (bt * betaContinuedFraction(b, a, 1 - x)) / b;
  }

  /**
   * 分布的分位数（CDF 的数值反解，二分法）。
   *
   * 为什么放在 core 而不是视图里：Beta 分位数要用来算"可信区间"，
   * 这是统计推断的职责，不是界面渲染的职责。视图只负责画出来。
   *
   * @param {object} dist  distributions.js 里的分布对象（需要 cdf）
   * @param {object} params 分布参数
   * @param {number} q 目标累积概率 (0,1)
   * @param {number[]} [lo0,hi0] 可选搜索区间
   * @returns {number}
   */
  function quantileOf(dist, params, q, lo0, hi0) {
    if (!dist || typeof dist.cdf !== 'function') return NaN;
    if (!(q > 0)) return lo0 != null ? lo0 : -Infinity;
    if (!(q < 1)) return hi0 != null ? hi0 : Infinity;
    let lo = lo0 != null ? lo0 : -10;
    let hi = hi0 != null ? hi0 : 10;
    // 连续分布用 90 次二分：区间宽度收敛到 (hi-lo)/2^90，远超双精度需要
    for (let i = 0; i < 90; i++) {
      const mid = (lo + hi) / 2;
      const c = dist.cdf(mid, params);
      if (!isFinite(c)) return mid;
      if (c < q) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /** Beta(a,b) 的分位数（可信区间用），区间固定在 [0,1] */
  const betaQuantile = (a, b, q) => quantileOf(beta, { a, b }, q, 1e-9, 1 - 1e-9);

  /* ------------------------------------------------------------
   * 分布实现
   * ---------------------------------------------------------- */

  /** 均匀分布 U(a,b) */
  const uniform = {
    key: 'uniform',
    label: 'Uniform 均匀分布',
    latex: 'X \\sim U(a,b)',
    params: { a: 0, b: 1 },
    sample: (rng, p = uniform.params) => rng.uniform(p.a, p.b),
    pdf: (x, p = uniform.params) =>
      x < p.a || x > p.b ? 0 : 1 / (p.b - p.a),
    cdf: (x, p = uniform.params) =>
      x <= p.a ? 0 : x >= p.b ? 1 : (x - p.a) / (p.b - p.a),
    mean: (p = uniform.params) => (p.a + p.b) / 2,
    variance: (p = uniform.params) => ((p.b - p.a) ** 2) / 12,
    support: (p = uniform.params) => [p.a, p.b],
  };

  /** 伯努利分布 Bern(p)：单次成功 / 失败 */
  const bernoulli = {
    key: 'bernoulli',
    label: 'Bernoulli 伯努利分布',
    latex: 'X \\sim \\mathrm{Bern}(p)',
    params: { p: 0.5 },
    sample: (rng, p = bernoulli.params) => (rng.next() < p.p ? 1 : 0),
    pdf: (x, p = bernoulli.params) =>
      x === 1 ? p.p : x === 0 ? 1 - p.p : 0,
    cdf: (x, p = bernoulli.params) => (x < 0 ? 0 : x < 1 ? 1 - p.p : 1),
    mean: (p = bernoulli.params) => p.p,
    variance: (p = bernoulli.params) => p.p * (1 - p.p),
    support: () => [0, 1],
  };

  /** 二项分布 Bin(n,p)：n 次独立试验的成功次数 */
  const binomial = {
    key: 'binomial',
    label: 'Binomial 二项分布',
    latex: 'X \\sim B(n,p)',
    params: { n: 10, p: 0.5 },
    sample(rng, p = binomial.params) {
      let k = 0;
      for (let i = 0; i < p.n; i++) if (rng.next() < p.p) k++;
      return k;
    },
    pdf(x, p = binomial.params) {
      if (x < 0 || x > p.n || x !== Math.round(x)) return 0;
      if (p.p === 0) return x === 0 ? 1 : 0;
      if (p.p === 1) return x === p.n ? 1 : 0;
      const lg =
        logGamma(p.n + 1) - logGamma(x + 1) - logGamma(p.n - x + 1) +
        x * Math.log(p.p) + (p.n - x) * Math.log(1 - p.p);
      return Math.exp(lg);
    },
    cdf(x, p = binomial.params) {
      if (x < 0) return 0;
      if (x >= p.n) return 1;
      let s = 0;
      for (let k = 0; k <= Math.floor(x); k++) s += binomial.pdf(k, p);
      return Math.min(1, s);
    },
    mean: (p = binomial.params) => p.n * p.p,
    variance: (p = binomial.params) => p.n * p.p * (1 - p.p),
    support: (p = binomial.params) => [0, p.n],
  };

  /** 几何分布 Geom(p)：第一次成功前失败的次数 / 第几次才成功 */
  const geometric = {
    key: 'geometric',
    label: 'Geometric 几何分布',
    latex: 'P(X=k)=(1-p)^{k-1}p',
    params: { p: 0.3 },
    /** 返回"第几次才成功"（从 1 开始） */
    sample(rng, p = geometric.params) {
      const pp = Math.min(Math.max(p.p, 1e-9), 1);
      return Math.floor(Math.log(1 - rng.next()) / Math.log(1 - pp)) + 1;
    },
    pdf(k, p = geometric.params) {
      if (k < 1 || k !== Math.round(k)) return 0;
      return Math.pow(1 - p.p, k - 1) * p.p;
    },
    cdf: (k, p = geometric.params) => (k < 1 ? 0 : 1 - Math.pow(1 - p.p, Math.floor(k))),
    mean: (p = geometric.params) => 1 / p.p,
    variance: (p = geometric.params) => (1 - p.p) / (p.p * p.p),
    support: () => [1, Infinity],
  };

  /** 泊松分布 Poisson(λ)：单位时间内的到达次数 */
  const poisson = {
    key: 'poisson',
    label: 'Poisson 泊松分布',
    latex: 'N \\sim \\mathrm{Pois}(\\lambda)',
    params: { lambda: 4 },
    sample(rng, p = poisson.params) {
      const lam = p.lambda;
      if (lam < 30) {
        // Knuth
        const L = Math.exp(-lam);
        let k = 0;
        let prod = 1;
        do {
          k++;
          prod *= rng.next();
        } while (prod > L);
        return k - 1;
      }
      // 大 λ：用正态近似 + 小扰动（教学场景足够）
      return Math.max(0, Math.round(lam + Math.sqrt(lam) * rng.normal01()));
    },
    pdf(k, p = poisson.params) {
      if (k < 0 || k !== Math.round(k)) return 0;
      return Math.exp(-p.lambda + k * Math.log(p.lambda) - logGamma(k + 1));
    },
    cdf(k, p = poisson.params) {
      if (k < 0) return 0;
      let s = 0;
      for (let i = 0; i <= Math.floor(k); i++) s += poisson.pdf(i, p);
      return Math.min(1, s);
    },
    mean: (p = poisson.params) => p.lambda,
    variance: (p = poisson.params) => p.lambda,
    support: () => [0, Infinity],
  };

  /** 正态分布 N(μ,σ²) */
  const normal = {
    key: 'normal',
    label: 'Normal 正态分布',
    latex: 'X \\sim N(\\mu,\\sigma^2)',
    params: { mu: 0, sigma: 1 },
    sample: (rng, p = normal.params) => p.mu + p.sigma * rng.normal01(),
    pdf: (x, p = normal.params) => normalPdf((x - p.mu) / p.sigma) / p.sigma,
    cdf: (x, p = normal.params) => normalCdf((x - p.mu) / p.sigma),
    mean: (p = normal.params) => p.mu,
    variance: (p = normal.params) => p.sigma * p.sigma,
    support: () => [-Infinity, Infinity],
  };

  /** 对数正态分布 LogN(μ,σ²)：收入 / 财富的经典模型（右偏、非负） */
  const lognormal = {
    key: 'lognormal',
    label: 'LogNormal 对数正态分布',
    latex: 'X \\sim \\mathrm{LogN}(\\mu,\\sigma^2)',
    params: { mu: 0, sigma: 0.5 },
    sample: (rng, p = lognormal.params) => Math.exp(p.mu + p.sigma * rng.normal01()),
    pdf(x, p = lognormal.params) {
      if (x <= 0) return 0;
      const z = (Math.log(x) - p.mu) / p.sigma;
      return normalPdf(z) / (x * p.sigma);
    },
    cdf: (x, p = lognormal.params) =>
      x <= 0 ? 0 : normalCdf((Math.log(x) - p.mu) / p.sigma),
    mean: (p = lognormal.params) => Math.exp(p.mu + (p.sigma * p.sigma) / 2),
    variance: (p = lognormal.params) => {
      const s2 = p.sigma * p.sigma;
      return (Math.exp(s2) - 1) * Math.exp(2 * p.mu + s2);
    },
    support: () => [0, Infinity],
  };

  /** 指数分布 Exp(λ)：等待下一次机会的时间间隔 */
  const exponential = {
    key: 'exponential',
    label: 'Exponential 指数分布',
    latex: 'T \\sim \\mathrm{Exp}(\\lambda)',
    params: { lambda: 1 },
    sample: (rng, p = exponential.params) => rng.exponential(p.lambda),
    pdf: (x, p = exponential.params) => (x < 0 ? 0 : p.lambda * Math.exp(-p.lambda * x)),
    cdf: (x, p = exponential.params) => (x < 0 ? 0 : 1 - Math.exp(-p.lambda * x)),
    mean: (p = exponential.params) => 1 / p.lambda,
    variance: (p = exponential.params) => 1 / (p.lambda * p.lambda),
    support: () => [0, Infinity],
  };

  /** Beta 分布 Be(α,β)：未知成功概率的先验 / 后验 */
  const beta = {
    key: 'beta',
    label: 'Beta 分布',
    latex: 'p \\sim \\mathrm{Beta}(\\alpha,\\beta)',
    params: { a: 2, b: 5 },
    sample(rng, p = beta.params) {
      const x = rng.gamma(p.a);
      const y = rng.gamma(p.b);
      return x + y === 0 ? 0.5 : x / (x + y);
    },
    pdf(x, p = beta.params) {
      if (x <= 0 || x >= 1) return 0;
      const lg =
        logGamma(p.a + p.b) - logGamma(p.a) - logGamma(p.b) +
        (p.a - 1) * Math.log(x) + (p.b - 1) * Math.log(1 - x);
      return Math.exp(lg);
    },
    cdf: (x, p = beta.params) => incompleteBeta(p.a, p.b, x),
    mean: (p = beta.params) => p.a / (p.a + p.b),
    variance: (p = beta.params) =>
      (p.a * p.b) / ((p.a + p.b) ** 2 * (p.a + p.b + 1)),
    support: () => [0, 1],
  };

  const ALL = {
    uniform, bernoulli, binomial, geometric, poisson,
    normal, lognormal, exponential, beta,
  };

  /**
   * 在 [lo,hi] 上生成 pdf 曲线点，用于画图。
   * 对离散分布自动按整数点采样。
   */
  function pdfCurve(key, params, lo, hi, n = 160) {
    const d = ALL[key];
    const pts = [];
    if (['bernoulli', 'binomial', 'geometric', 'poisson'].includes(key)) {
      const kLo = Math.max(Math.ceil(lo), d.support(params)[0]);
      const kHi = Math.min(Math.floor(hi), d.support(params)[1] === Infinity ? 1000 : d.support(params)[1]);
      for (let k = kLo; k <= kHi; k++) pts.push({ x: k, y: d.pdf(k, params) });
    } else {
      for (let i = 0; i < n; i++) {
        const x = lo + ((hi - lo) * i) / (n - 1);
        pts.push({ x, y: d.pdf(x, params) });
      }
    }
    return pts;
  }

  LS.distributions = {
    ...ALL,
    ALL,
    list: () => Object.values(ALL),
    byKey: (k) => ALL[k],
    logGamma,
    erf,
    normalCdf,
    normalPdf,
    incompleteBeta,
    quantileOf,
    betaQuantile,
    pdfCurve,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
