/* ============================================================
 * LifeSim · core/markov.js
 * 马尔可夫链（规格书 §18、§43）
 *   用于：世界经济四状态转移、职业状态转移
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});

  class Chain {
    /**
     * @param {string[]} states 状态名称
     * @param {number[][]} P 转移矩阵，P[i][j] = P(下一步 j | 当前 i)
     */
    constructor(states, P) {
      this.states = states.slice();
      this.P = P.map((row) => row.slice());
      this.n = states.length;
      this._cum = this.P.map((row) => {
        const c = new Float64Array(row.length);
        let acc = 0;
        for (let j = 0; j < row.length; j++) { acc += row[j]; c[j] = acc; }
        return c;
      });
    }

    rowSums() {
      return this.P.map((r) => r.reduce((a, b) => a + b, 0));
    }

    /** 是否每行都归一化（容差 1e-9） */
    rowsSumToOne(tol = 1e-9) {
      return this.rowSums().every((s) => Math.abs(s - 1) < tol);
    }

    /** 从状态 i 出发，抽样下一个状态（返回下标） */
    next(i, rng) {
      const c = this._cum[i];
      const u = rng.next();
      for (let j = 0; j < c.length; j++) if (u < c[j]) return j;
      return c.length - 1;
    }

    /** 给定当前状态，返回下一步的概率分布（用于 UI 展示） */
    distributionFrom(i) {
      return this.P[i].slice();
    }

    /** 从状态 i 出发走 k 步后的分布 */
    step(i, k) {
      let v = new Float64Array(this.n);
      v[i] = 1;
      for (let s = 0; s < k; s++) {
        const nv = new Float64Array(this.n);
        for (let a = 0; a < this.n; a++) {
          if (v[a] === 0) continue;
          for (let b = 0; b < this.n; b++) nv[b] += v[a] * this.P[a][b];
        }
        v = nv;
      }
      return Array.from(v);
    }

    /**
     * 平稳分布 π：解 πP = π。
     * 用幂迭代（对本项目的链收敛很快），避免实现完整的线性方程求解。
     */
    stationary(maxIter = 5000, tol = 1e-12) {
      let v = new Float64Array(this.n).fill(1 / this.n);
      for (let it = 0; it < maxIter; it++) {
        const nv = new Float64Array(this.n);
        for (let a = 0; a < this.n; a++) {
          if (v[a] === 0) continue;
          const row = this.P[a];
          for (let b = 0; b < this.n; b++) nv[b] += v[a] * row[b];
        }
        let delta = 0;
        for (let i = 0; i < this.n; i++) delta = Math.max(delta, Math.abs(nv[i] - v[i]));
        v = nv;
        if (delta < tol) break;
      }
      const s = Array.from(v).reduce((a, b) => a + b, 0);
      return Array.from(v, (x) => x / (s || 1));
    }

    /** 平均首次返回时间（平稳分布的倒数） */
    meanReturnTimes() {
      return this.stationary().map((p) => (p > 1e-12 ? 1 / p : Infinity));
    }
  }

  /**
   * 由"倾向权重"构造转移矩阵：
   * 每一行先按权重分配，再按 stayBias 把一部分概率留给"保持原状态"。
   * 这样调整参数时矩阵始终合法，不用手工维护 16 个数。
   */
  function buildMatrix(n, weightFn, stayBias = 0) {
    const P = [];
    for (let i = 0; i < n; i++) {
      const w = [];
      for (let j = 0; j < n; j++) w.push(j === i ? 0 : Math.max(0, weightFn(i, j)));
      const total = w.reduce((a, b) => a + b, 0) || 1;
      const row = w.map((x) => (x / total) * (1 - stayBias));
      row[i] = stayBias;
      P.push(row);
    }
    return P;
  }

  LS.markov = { Chain, buildMatrix };
})(typeof globalThis !== 'undefined' ? globalThis : this);
