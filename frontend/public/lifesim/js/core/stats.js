/* ============================================================
 * LifeSim · core/stats.js
 * 描述统计与统计推断（规格书 §48、§12）
 *   均值 / 中位数 / 方差 / 标准差 / 分位数
 *   经验分布与百分位（运气指数的定义 F(X)）
 *   直方图 / 核密度
 *   协方差 / 相关系数
 *   VaR / CVaR（尾部风险）
 *   比例置信区间（Wilson）
 *   Bootstrap 均值差置信区间
 *   一元线性回归
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});

  /* ---------------- 基础 ---------------- */

  function mean(a) {
    if (!a.length) return NaN;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i];
    return s / a.length;
  }

  /** 总体方差（模拟数据是"全部样本"，用 n；需要无偏时传 sample=true） */
  function variance(a, sample = false) {
    const n = a.length;
    if (n < 2) return 0;
    const m = mean(a);
    let s = 0;
    for (let i = 0; i < n; i++) {
      const d = a[i] - m;
      s += d * d;
    }
    return s / (sample ? n - 1 : n);
  }

  const std = (a, sample = false) => Math.sqrt(variance(a, sample));

  /** 升序副本（返回 Float64Array，便于后续 O(log n) 查询） */
  function sorted(a) {
    return Float64Array.from(a).sort();
  }
  const sortNumAscending = sorted;

  /** 分位数：入参必须**已升序**。线性插值，等价 numpy 默认的 linear 方法 */
  function quantileSorted(s, q) {
    const n = s.length;
    if (!n) return NaN;
    if (n === 1) return s[0];
    const pos = (n - 1) * Math.min(Math.max(q, 0), 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return s[lo];
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }

  /** 分位数：入参可以是任意顺序（内部排序）。已排序时请直接用 quantileSorted */
  function quantile(a, q) {
    if (!a.length) return NaN;
    return quantileSorted(sorted(a), q);
  }

  const median = (a) => quantile(a, 0.5);

  /**
   * 经验分布函数 F(x)：小于等于 x 的比例。
   * 运气的定义就是 Luck = F(X_actual)（规格书 §12.3）
   */
  function ecdf(sortedArr, x) {
    const n = sortedArr.length;
    if (!n) return NaN;
    // 二分找最后一个 <= x 的位置
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sortedArr[mid] <= x) lo = mid + 1;
      else hi = mid;
    }
    return lo / n;
  }

  /** 一次结果在样本中的百分位（0..1）。入参可以是任意顺序 */
  const percentileOf = (arr, x, presorted = null) =>
    ecdf(presorted || sorted(arr), x);

  /* ---------------- 直方图 ---------------- */

  /**
   * 等宽直方图。
   * 返回 {bins, edges, binWidth, max, density}
   */
  function histogram(arr, binCount = 40, lo = null, hi = null) {
    const n = arr.length;
    if (!n) return { bins: [], edges: [], binWidth: 0, max: 0 };
    let min = lo;
    let max = hi;
    if (min === null || max === null) {
      let a = Infinity;
      let b = -Infinity;
      for (let i = 0; i < n; i++) {
        if (arr[i] < a) a = arr[i];
        if (arr[i] > b) b = arr[i];
      }
      if (min === null) min = a;
      if (max === null) max = b;
    }
    if (max === min) max = min + 1;
    const w = (max - min) / binCount;
    const bins = new Float64Array(binCount);
    for (let i = 0; i < n; i++) {
      const v = arr[i];
      if (v < min || v > max) continue;
      let k = Math.floor((v - min) / w);
      if (k >= binCount) k = binCount - 1;
      if (k < 0) k = 0;
      bins[k]++;
    }
    // 概率密度 = 频数 / (n * 宽度)
    const density = new Float64Array(binCount);
    for (let i = 0; i < binCount; i++) density[i] = bins[i] / (n * w);
    const edges = new Float64Array(binCount + 1);
    for (let i = 0; i <= binCount; i++) edges[i] = min + i * w;
    let mx = 0;
    for (let i = 0; i < binCount; i++) if (bins[i] > mx) mx = bins[i];
    return { bins, density, edges, binWidth: w, max: mx, lo: min, hi: max };
  }

  /** 高斯核密度估计（区间概率用） */
  function kde(arr, x, bandwidth) {
    const n = arr.length;
    if (!n) return 0;
    let h = bandwidth;
    if (!h) {
      const s = std(arr);
      h = 1.06 * s * Math.pow(n, -0.2) || 1;
    }
    let s = 0;
    const inv = 1 / (h * Math.sqrt(2 * Math.PI));
    for (let i = 0; i < n; i++) {
      const z = (x - arr[i]) / h;
      if (z > -6 && z < 6) s += Math.exp(-0.5 * z * z) * inv;
    }
    return s / n;
  }

  /* ---------------- 分布汇总（对应规格书 DistributionSummary） ---------------- */

  function summarize(arr, opts = {}) {
    const n = arr.length;
    if (!n) return null;
    // 注意：入参可能是未排序的 Float64Array（蒙特卡洛样本就是），
    // 所以这里必须复制并排序，不能让"是否已排序"成为调用方的隐式约定。
    const s = sorted(arr);
    const m = mean(s);
    const v = variance(s);
    const q05 = quantileSorted(s, 0.05);
    const q25 = quantileSorted(s, 0.25);
    const q75 = quantileSorted(s, 0.75);
    const q95 = quantileSorted(s, 0.95);
    const lossThreshold = opts.lossThreshold != null ? opts.lossThreshold : 0;
    let lossCount = 0;
    for (let i = 0; i < n; i++) if (s[i] < lossThreshold) lossCount++;
    // VaR95：5% 分位（下行阈值）
    const var95 = q05;
    // CVaR95：最差 5% 的平均（期望损失）
    const cut = Math.max(1, Math.floor(n * 0.05));
    let csum = 0;
    for (let i = 0; i < cut; i++) csum += s[i];
    const cvar95 = csum / cut;
    const stderr = Math.sqrt(v / n);
    return {
      n,
      mean: m,
      median: quantileSorted(s, 0.5),
      variance: v,
      std: Math.sqrt(v),
      min: s[0],
      max: s[n - 1],
      q05, q25, q75, q95,
      var95,
      cvar95,
      probabilityOfLoss: lossCount / n,
      lossThreshold,
      stderr,
      meanCI: [m - 1.96 * stderr, m + 1.96 * stderr],
    };
  }

  /* ---------------- 相关 ---------------- */

  function covariance(a, b, sample = false) {
    const n = Math.min(a.length, b.length);
    if (n < 2) return 0;
    const ma = mean(a);
    const mb = mean(b);
    let s = 0;
    for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
    return s / (sample ? n - 1 : n);
  }

  /** Pearson 相关系数 */
  function correlation(a, b) {
    const sa = std(a);
    const sb = std(b);
    if (sa === 0 || sb === 0) return 0;
    return covariance(a, b) / (sa * sb);
  }

  /** Spearman 秩相关（对非线性单调关系更稳健） */
  function spearman(a, b) {
    const rank = (arr) => {
      const idx = Array.from(arr.keys()).sort((i, j) => arr[i] - arr[j]);
      const r = new Float64Array(arr.length);
      let i = 0;
      while (i < idx.length) {
        let j = i;
        while (j + 1 < idx.length && arr[idx[j + 1]] === arr[idx[i]]) j++;
        const avg = (i + j) / 2 + 1;
        for (let k = i; k <= j; k++) r[idx[k]] = avg;
        i = j + 1;
      }
      return r;
    };
    return correlation(rank(a), rank(b));
  }

  function corrMatrix(series) {
    const keys = Object.keys(series);
    const m = keys.map(() => keys.map(() => 0));
    for (let i = 0; i < keys.length; i++) {
      for (let j = i; j < keys.length; j++) {
        const c = i === j ? 1 : correlation(series[keys[i]], series[keys[j]]);
        m[i][j] = c;
        m[j][i] = c;
      }
    }
    return { keys, matrix: m };
  }

  /* ---------------- 区间估计 ---------------- */

  /** 比例的 Wilson 置信区间（比正态近似更稳，小样本 / 极端比例都可用） */
  function wilsonInterval(successes, n, z = 1.96) {
    if (n === 0) return [0, 1];
    const p = successes / n;
    const z2 = z * z;
    const denom = 1 + z2 / n;
    const center = (p + z2 / (2 * n)) / denom;
    const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
    return [Math.max(0, center - half), Math.min(1, center + half)];
  }

  /** 均值的正态近似置信区间 */
  function meanInterval(arr, z = 1.96) {
    const n = arr.length;
    if (n < 2) return [NaN, NaN];
    const m = mean(arr);
    const se = std(arr, true) / Math.sqrt(n);
    return [m - z * se, m + z * se];
  }

  /**
   * Bootstrap：两样本均值差的置信区间。
   * 用于"策略 A 真的比 B 好吗"这类问题（规格书 §48.3）。
   */
  function bootstrapMeanDiff(a, b, iterations = 2000, rngOrFn = null, z = 1.96) {
    // 允许传入 Rng 实例或普通函数，方便在浏览器和测试里复用
    const rnd =
      typeof rngOrFn === 'function'
        ? rngOrFn
        : rngOrFn && typeof rngOrFn.next === 'function'
          ? () => rngOrFn.next()
          : Math.random;
    const na = a.length;
    const nb = b.length;
    if (na < 2 || nb < 2) return { diff: NaN, ci: [NaN, NaN], pBetter: NaN };
    const diffs = new Float64Array(iterations);
    let better = 0;
    for (let it = 0; it < iterations; it++) {
      let sa = 0;
      for (let i = 0; i < na; i++) sa += a[Math.floor(rnd() * na)];
      sa /= na;
      let sb = 0;
      for (let i = 0; i < nb; i++) sb += b[Math.floor(rnd() * nb)];
      sb /= nb;
      const d = sa - sb;
      diffs[it] = d;
      if (d > 0) better++;
    }
    const s = sorted(diffs);
    return {
      diff: mean(a) - mean(b),
      ci: [quantileSorted(s, 0.025), quantileSorted(s, 0.975)],
      pBetter: better / iterations,
    };
  }

  /* ---------------- 回归 ---------------- */

  /**
   * 一元 / 多元最小二乘。
   * X: 二维数组（每行一个样本，每列一个自变量，需已含常数项或由本函数补）
   * y: 一维数组
   */
  function ols(X, y) {
    const n = X.length;
    const p = X[0].length;
    // 正规方程 (X'X) b = X'y，用高斯消元解
    const A = Array.from({ length: p }, () => new Float64Array(p + 1));
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        let s = 0;
        for (let k = 0; k < n; k++) s += X[k][i] * X[k][j];
        A[i][j] = s;
      }
      let s = 0;
      for (let k = 0; k < n; k++) s += X[k][i] * y[k];
      A[i][p] = s;
    }
    // 带部分主元的高斯消元
    for (let col = 0; col < p; col++) {
      let piv = col;
      for (let r = col + 1; r < p; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      if (piv !== col) [A[col], A[piv]] = [A[piv], A[col]];
      const d = A[col][col];
      if (Math.abs(d) < 1e-12) continue;
      for (let j = col; j <= p; j++) A[col][j] /= d;
      for (let r = 0; r < p; r++) {
        if (r === col) continue;
        const f = A[r][col];
        if (f === 0) continue;
        for (let j = col; j <= p; j++) A[r][j] -= f * A[col][j];
      }
    }
    const beta = Array.from({ length: p }, (_, i) => A[i][p]);
    // R²
    const my = mean(y);
    let ssTot = 0;
    let ssRes = 0;
    for (let k = 0; k < n; k++) {
      let pred = 0;
      for (let j = 0; j < p; j++) pred += X[k][j] * beta[j];
      ssRes += (y[k] - pred) ** 2;
      ssTot += (y[k] - my) ** 2;
    }
    return { beta, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot, n, p };
  }

  /* ---------------- 导出 ---------------- */

  LS.stats = {
    mean, variance, std, sorted, sortNumAscending, quantile, quantileSorted,
    median, ecdf, percentileOf, histogram, kde, summarize,
    covariance, correlation, spearman, corrMatrix,
    wilsonInterval, meanInterval, bootstrapMeanDiff, ols,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
