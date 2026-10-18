/* ============================================================
 * LifeSim · sim/world.js
 * 宏观世界：经济四状态马尔可夫链 + 市场共同因子（规格书 §22.2、§43）
 *
 * 世界经济是所有人生共享的随机源，因此它同时改变：
 *   失业概率 / 薪资增长 / 创业成功率 / 投资收益 / 订单到达率
 * 这正是"随机变量之间为什么会相关"的可教学来源（§43.3）。
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const C = LS.config;
  const { clamp } = LS.util;

  /**
   * 按"温度"重整马尔可夫矩阵：
   *   P_eff[i][j] ∝ P[i][j]^(1/T)
   * T > 1 让链更"混"（状态更容易变），T < 1 让链更"黏"。
   * 这样 economicVolatility 就是一个连续可调的旋钮，而不需要维护多套矩阵。
   */
  function temperMatrix(P, T) {
    const n = P.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const row = new Array(n);
      let s = 0;
      for (let j = 0; j < n; j++) {
        const v = Math.pow(Math.max(P[i][j], 1e-9), 1 / T);
        row[j] = v;
        s += v;
      }
      for (let j = 0; j < n; j++) row[j] /= s;
      out.push(row);
    }
    return out;
  }

  class World {
    constructor(rng, worldConfig) {
      this.cfg = worldConfig || C.makeWorldConfig('standard');
      this.rng = rng;
      const vol = clamp(this.cfg.economicVolatility, 0.35, 2.4);
      this.volatility = vol;
      this.chain = new LS.markov.Chain(
        C.ECONOMY_STATES,
        temperMatrix(C.ECONOMY_P, vol)
      );
      // 从平稳分布出发，避免每局都从"正常"开始造成人为偏差
      const st = this.chain.stationary();
      this.state = this.rng.categorical(st);
      this.history = [];       // [{age, state, label}]
      /** 本年度市场共同冲击（所有人共享），后续用于制造指标间的相关性 */
      this.commonShock = 0;
      this.crisisYears = 0;
      this.boomYears = 0;
      this.startAge = null;
    }

    get stateName() {
      return C.ECONOMY_STATES[this.state];
    }

    get effect() {
      return C.ECONOMY_EFFECT[this.stateName];
    }

    /** 推进一年 */
    step(age) {
      const prev = this.state;
      this.state = this.chain.next(this.state, this.rng);
      this.commonShock = this.rng.normal01();
      const name = this.stateName;
      if (name === '危机') this.crisisYears++;
      if (name === '繁荣') this.boomYears++;
      if (this.startAge === null) this.startAge = age;
      this.history.push({ age, state: this.state, label: name, prev });
      return this.state;
    }

    /** 就业市场乘数（laborStability 越高越容易就业） */
    get jobFindMult() {
      return this.effect.jobFind * clamp(this.cfg.laborStability, 0.4, 1.8);
    }

    get salaryMult() {
      return this.effect.salary;
    }

    get startupMult() {
      return this.effect.startup;
    }

    get orderMult() {
      return this.effect.order;
    }

    get stressMult() {
      return this.effect.stress;
    }

    /** 当年的投资收益率参数（已叠加经济状态与市场波动率） */
    investParams(baseMu, baseSigma) {
      const e = this.effect;
      return {
        mu: baseMu + e.investMu,
        sigma: Math.max(0.004, baseSigma * e.investSigma *
          clamp(this.cfg.marketVolatility, 0.3, 2.2)),
      };
    }

    /** 世界历史摘要：各状态停留年数，用于结果页的"世界背景带"与事后分析 */
    summary() {
      const counts = {};
      for (const s of C.ECONOMY_STATES) counts[s] = 0;
      for (const h of this.history) counts[h.label]++;
      const total = this.history.length || 1;
      return {
        counts,
        share: Object.fromEntries(
          Object.entries(counts).map(([k, v]) => [k, v / total])
        ),
        crisisYears: this.crisisYears,
        boomYears: this.boomYears,
        history: this.history,
      };
    }
  }

  LS.world = { World, temperMatrix };
})(typeof globalThis !== 'undefined' ? globalThis : this);
