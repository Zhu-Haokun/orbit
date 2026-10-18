/* ============================================================
 * LifeSim · core/rng.js
 * 可复现随机数（规格书 §35）
 *   · 同一 seed 必然得到同一序列
 *   · 支持派生独立随机流：world / agent / event
 *   · 纯函数式，无全局状态，便于批量模拟
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const { hashSeed } = LS.util;

  /**
   * mulberry32：32 位状态、周期 2^32、分布质量足够做教学模拟，
   * 而且在 JS 里非常快（一次调用不到 10ns）。
   */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 随机流对象：除了 [0,1) 还提供常用派生方法 */
  class Rng {
    constructor(seed) {
      this.seed = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;
      this._next = mulberry32(this.seed);
      this._spare = null; // Box-Muller 缓存
    }

    /** [0,1) */
    next() {
      return this._next();
    }

    /** [lo,hi) */
    uniform(lo = 0, hi = 1) {
      return lo + (hi - lo) * this._next();
    }

    /** [lo,hi] 整数 */
    int(lo, hi) {
      return Math.floor(this.uniform(lo, hi + 1 - 1e-12));
    }

    /** 以概率 p 返回 true */
    chance(p) {
      return this._next() < p;
    }

    /** 标准正态（Box-Muller，带缓存） */
    normal01() {
      if (this._spare !== null) {
        const v = this._spare;
        this._spare = null;
        return v;
      }
      let u = 0;
      let v = 0;
      let s = 0;
      do {
        u = this._next() * 2 - 1;
        v = this._next() * 2 - 1;
        s = u * u + v * v;
      } while (s >= 1 || s === 0);
      const mul = Math.sqrt((-2 * Math.log(s)) / s);
      this._spare = v * mul;
      return u * mul;
    }

    /** 指数分布 */
    exponential(lambda = 1) {
      let u = this._next();
      if (u <= 0) u = Number.EPSILON;
      return -Math.log(u) / lambda;
    }

    /** Gamma(shape, scale=1)，Marsaglia-Tsang 方法 */
    gamma(shape, scale = 1) {
      if (shape < 1) {
        // Boost: Gamma(a) = Gamma(a+1) * U^(1/a)
        const u = Math.max(this._next(), Number.EPSILON);
        return this.gamma(shape + 1, scale) * Math.pow(u, 1 / shape);
      }
      const d = shape - 1 / 3;
      const c = 1 / Math.sqrt(9 * d);
      for (;;) {
        const x = this.normal01();
        const v = 1 + c * x;
        if (v <= 0) continue;
        const v3 = v * v * v;
        const u = this._next();
        if (u < 1 - 0.0331 * x * x * x * x) return d * v3 * scale;
        if (Math.log(u) < 0.5 * x * x + d * (1 - v3 + Math.log(v3))) return d * v3 * scale;
      }
    }

    /** 从数组里等概率取一个 */
    pick(arr) {
      return arr[Math.min(arr.length - 1, Math.floor(this._next() * arr.length))];
    }

    /** 加权抽样 */
    weighted(items, weights) {
      let total = 0;
      for (const w of weights) total += w;
      let target = this._next() * total;
      for (let i = 0; i < items.length; i++) {
        target -= weights[i];
        if (target <= 0) return items[i];
      }
      return items[items.length - 1];
    }

    /** 洗牌（Fisher-Yates，返回新数组） */
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(this._next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    /** 按给定概率向量抽样下标 */
    categorical(probs) {
      let target = this._next();
      for (let i = 0; i < probs.length; i++) {
        target -= probs[i];
        if (target <= 0) return i;
      }
      return probs.length - 1;
    }
  }

  /**
   * 派生随机流。同一个 (seed, salt) 永远得到同一个子流，
   * 这样"世界随机"和"个体决策随机"可以分开锁定。
   */
  function derive(seed, salt) {
    return (hashSeed(String(salt) + '#' + (seed >>> 0))) >>> 0;
  }

  /** 生成一个看起来随机的 6 位命运种子 */
  function randomSeed() {
    return Math.floor(Math.random() * 900000) + 100000;
  }

  LS.rng = { Rng, mulberry32, derive, randomSeed };
})(typeof globalThis !== 'undefined' ? globalThis : this);
