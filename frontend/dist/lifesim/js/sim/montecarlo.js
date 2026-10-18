/* ============================================================
 * LifeSim · sim/montecarlo.js
 * 批量模拟（规格书 §36、§12、§33.7）
 *
 * 性能策略（§36.2 / §61）：
 *   · 不保存 100,000 条人生的完整轨迹，只保存：
 *       - 最终指标（Float64Array）
 *       - 每局的"事件位掩码"（Uint32Array，用于尾部事件频率分析）
 *       - 抽样的 200～1000 条完整路径
 *       - 聚合统计量
 *   · 5000 局为一块分片执行，块间让出主线程，UI 才能显示进度
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const C = LS.config;
  const S = LS.stats;
  const { derive } = LS.rng;

  /** 各指标的元信息，UI 与图表共用 */
  const METRICS = {
    wealth: { key: 'wealth', label: '最终财富', unit: '万', better: 'high', lossThreshold: 0, color: 'fate' },
    health: { key: 'health', label: '健康', unit: '', better: 'high', color: 'ok' },
    happiness: { key: 'happiness', label: '幸福', unit: '', better: 'high', color: 'warn' },
    achievement: { key: 'achievement', label: '事业成就', unit: '', better: 'high', color: 'know' },
    relationship: { key: 'relationship', label: '社会关系', unit: '', better: 'high', color: 'gold' },
    lifespan: { key: 'lifespan', label: '寿命', unit: '岁', better: 'high', color: 'ghost' },
  };

  const EVENTS_N = LS.events.EVENTS.length;
  const EV_INDEX = LS.events.INDEX;

  function decodeMask(mask) {
    const out = [];
    for (let i = 0; i < EVENTS_N; i++) if (mask & (1 << i)) out.push(i);
    return out;
  }

  /**
   * 执行一次批量模拟。
   * @returns {Promise<MonteCarloResult>}
   */
  async function runMonteCarlo(params) {
    const {
      character, strategy, worldSeed, sampleSize = 10000,
      lockWorldSeed = false, worldConfig, pathSamples = 300,
      historySampleRatio = 0.06,
      onProgress = null, yieldEvery = 2500,
    } = params;

    const t0 = (global.performance && performance.now) ? performance.now() : Date.now();
    const n = Math.max(2, Math.floor(sampleSize));

    const wealth = new Float64Array(n);
    const health = new Float64Array(n);
    const happiness = new Float64Array(n);
    const achievement = new Float64Array(n);
    const relationship = new Float64Array(n);
    const lifespan = new Float64Array(n);
    const peakWealth = new Float64Array(n);
    const masks = new Uint32Array(n);

    // 历史轨迹抽样：只保留少量完整路径用于"路径云"（§12.5 / §27.2）
    const keepHistory = makeHistorySampler(Math.max(2, Math.min(pathSamples, n)), n);

    // 实时"发现"，让加载过程本身也是统计体验（§38.1）
    const live = { startupFailures: 0, millionaires: 0, bankrupt: 0, crisisDeaths: 0, crises: 0 };

    let done = 0;
    const startedAt = Date.now();

    while (done < n) {
      const chunk = Math.min(yieldEvery, n - done);
      for (let i = 0; i < chunk; i++) {
        const idx = done + i;
        const ws = lockWorldSeed ? worldSeed >>> 0 : derive(worldSeed, 'run' + idx);
        const as = derive(worldSeed, 'agent' + idx);
        const r = LS.life.simulateLight({
          character, strategy, worldSeed: ws, agentSeed: as,
          worldConfig, mode: 'batch',
        });
        wealth[idx] = r.wealth;
        health[idx] = r.health;
        happiness[idx] = r.happiness;
        achievement[idx] = r.achievement;
        relationship[idx] = r.relationship;
        lifespan[idx] = r.lifespan;
        peakWealth[idx] = r.peakWealth;
        masks[idx] = r.eventMask || 0;

        if (r.wealth < 0) live.bankrupt++;
        if (r.wealth >= 1000) live.millionaires++;
        if (r.eventMask & (1 << EV_INDEX.startup)) live.startupFailures++;
        if (r.crisisYears > 0) live.crises++;

        keepHistory.offer(idx, ws, as);
      }
      done += chunk;

      if (onProgress) {
        onProgress({
          done, total: n,
          percent: done / n,
          elapsedMs: Date.now() - startedAt,
          discoveries: { ...live },
        });
      }
      // 让出主线程，浏览器才能刷新进度
      if (done < n) await yieldToUI();
    }

    // ---- 抽样路径：用同样策略重新跑完整记录版 ----
    const paths = [];
    for (const item of keepHistory.items) {
      const run = LS.life.runLife({
        character, strategy, worldSeed: item.ws, agentSeed: item.as,
        worldConfig, mode: 'batch',
      });
      paths.push({
        index: item.idx,
        ages: run.states.map((s) => s.age),
        wealth: run.states.map((s) => s.wealth),
        health: run.states.map((s) => s.health),
        happiness: run.states.map((s) => s.happiness),
        finalWealth: run.result.finalWealth,
        majorEvents: run.events.filter((e) => e.major).length,
      });
    }

    // ---- 聚合统计 ----
    const samples = { wealth, health, happiness, achievement, relationship, lifespan };
    const summary = {};
    for (const k of Object.keys(METRICS)) {
      summary[k] = S.summarize(samples[k], {
        lossThreshold: METRICS[k].lossThreshold,
      });
    }

    const histograms = {};
    for (const k of ['wealth', 'health', 'happiness', 'achievement', 'relationship', 'lifespan']) {
      histograms[k] = S.histogram(samples[k], k === 'wealth' || k === 'lifespan' ? 48 : 30);
    }

    // ---- 尾部风险与尾部事件频率（§12.7 / §27.3） ----
    const sortedWealth = S.sorted(wealth);
    // 全体事件频率，作为尾部画像的对照基线
    const overallCounts = countMasks(masks, n);
    const cut = Math.max(1, Math.floor(n * 0.05));
    const worstIdx = [];
    const bestIdx = [];
    // 用一次 O(n) 扫描找出最差/最好的 5%（阈值法，避免排序索引）
    const worstThr = S.quantileSorted(sortedWealth, 0.05);
    const bestThr = S.quantileSorted(sortedWealth, 0.95);
    for (let i = 0; i < n && (worstIdx.length < cut * 3 || bestIdx.length < cut * 3); i++) {
      if (wealth[i] <= worstThr && worstIdx.length < cut * 3) worstIdx.push(i);
      if (wealth[i] >= bestThr && bestIdx.length < cut * 3) bestIdx.push(i);
    }
    const tail = {
      worst: tailProfile(worstIdx, masks, cut, overallCounts),
      best: tailProfile(bestIdx, masks, cut, overallCounts),
      thresholds: { worst: worstThr, best: bestThr },
    };

    // ---- 相关矩阵（§26.2） ----
    const correlation = S.corrMatrix({
      财富: wealth, 健康: health, 幸福: happiness,
      成就: achievement, 关系: relationship, 寿命: lifespan,
    });

    // ---- 分位数表 ----
    const percentiles = {};
    for (const k of Object.keys(METRICS)) {
      const s = S.sorted(samples[k]);
      percentiles[k] = {
        p05: S.quantileSorted(s, 0.05),
        p25: S.quantileSorted(s, 0.25),
        p50: S.quantileSorted(s, 0.50),
        p75: S.quantileSorted(s, 0.75),
        p95: S.quantileSorted(s, 0.95),
        p99: S.quantileSorted(s, 0.99),
      };
    }

    const t1 = (global.performance && performance.now) ? performance.now() : Date.now();
    return {
      sampleSize: n,
      summary,
      samples,
      histograms,
      percentiles,
      correlation,
      paths,
      tail,
      masks,
      meta: {
        elapsedMs: Math.round(t1 - t0),
        worldSeed, lockWorldSeed,
        strategy: { ...strategy },
        character: { ...character },
        worldLabel: worldConfig ? worldConfig.label : '标准世界',
        metrics: Object.keys(METRICS),
      },
    };
  }

  /** 同步版本（Node 测试与"立即出结果"场景） */
  function runMonteCarloSync(params) {
    const {
      character, strategy, worldSeed, sampleSize = 5000,
      lockWorldSeed = false, worldConfig, pathSamples = 100,
    } = params;
    const n = Math.max(2, Math.floor(sampleSize));
    const wealth = new Float64Array(n);
    const health = new Float64Array(n);
    const happiness = new Float64Array(n);
    const achievement = new Float64Array(n);
    const relationship = new Float64Array(n);
    const lifespan = new Float64Array(n);
    const peakWealth = new Float64Array(n);
    const masks = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      const ws = lockWorldSeed ? worldSeed >>> 0 : derive(worldSeed, 'run' + i);
      const as = derive(worldSeed, 'agent' + i);
      const r = LS.life.simulateLight({
        character, strategy, worldSeed: ws, agentSeed: as, worldConfig, mode: 'batch',
      });
      wealth[i] = r.wealth; health[i] = r.health; happiness[i] = r.happiness;
      achievement[i] = r.achievement; relationship[i] = r.relationship;
      lifespan[i] = r.lifespan; peakWealth[i] = r.peakWealth; masks[i] = r.eventMask || 0;
    }
    const samples = { wealth, health, happiness, achievement, relationship, lifespan };
    const summary = {};
    for (const k of Object.keys(METRICS)) {
      summary[k] = S.summarize(samples[k], { lossThreshold: METRICS[k].lossThreshold });
    }
    const sortedWealth = S.sorted(wealth);
    const cut = Math.max(1, Math.floor(n * 0.05));
    const worstThr = S.quantileSorted(sortedWealth, 0.05);
    const bestThr = S.quantileSorted(sortedWealth, 0.95);
    const wIdx = [];
    const bIdx = [];
    for (let i = 0; i < n; i++) {
      if (wealth[i] <= worstThr && wIdx.length < cut * 3) wIdx.push(i);
      if (wealth[i] >= bestThr && bIdx.length < cut * 3) bIdx.push(i);
    }
    const overallCounts = countMasks(masks, n);
    return {
      sampleSize: n,
      summary,
      samples,
      percentiles: {},
      correlation: S.corrMatrix({
        财富: wealth, 健康: health, 幸福: happiness,
        成就: achievement, 关系: relationship, 寿命: lifespan,
      }),
      histogramWealth: S.histogram(wealth, 48),
      tail: {
        worst: tailProfile(wIdx, masks, cut, overallCounts),
        best: tailProfile(bIdx, masks, cut, overallCounts),
        thresholds: { worst: worstThr, best: bestThr },
      },
      masks,
      meta: { worldSeed, lockWorldSeed },
    };
  }

  /** 统计全体样本里每个事件出现了多少局，作为尾部画像的基线 */
  function countMasks(masks, n) {
    const counts = new Array(EVENTS_N).fill(0);
    for (let i = 0; i < n; i++) {
      const m = masks[i];
      for (let k = 0; k < EVENTS_N; k++) if (m & (1 << k)) counts[k]++;
    }
    return { counts, total: n };
  }

  /* ---------------- 内部工具 ---------------- */

  /**
   * 尾部画像。
   *
   * 关键点：只报"尾部里的绝对频率"是没有信息量的 —— 像"第一次求职"
   * 这种几乎人人都会经历的事件，在尾部也是 100%，看不出任何区别。
   * 所以要同时给出**全体频率**和**提升倍数 lift**：
   *   "最差 5% 中失业经历 71%，而全体只有 32%（2.2 倍）"
   * 这才是"尾部风险可探索"真正要展示的东西（规格书 §27.3）。
   */
  function tailProfile(indices, masks, limit, overallCounts) {
    const use = indices.slice(0, limit);
    const counts = new Array(EVENTS_N).fill(0);
    for (const i of use) {
      const m = masks[i];
      for (let k = 0; k < EVENTS_N; k++) if (m & (1 << k)) counts[k]++;
    }
    const total = use.length || 1;
    const totalRuns = (overallCounts && overallCounts.total) || 1;
    const freq = LS.events.EVENTS.map((ev, k) => {
      const rate = counts[k] / total;
      const overallRate = overallCounts ? overallCounts.counts[k] / totalRuns : 0;
      return {
        id: ev.id, title: ev.title, icon: ev.icon, category: ev.category,
        count: counts[k],
        rate,
        overallRate,
        lift: overallRate > 1e-6 ? rate / overallRate : (rate > 0 ? Infinity : 1),
      };
    }).filter((f) => f.count > 0).sort((a, b) => {
      // 优先展示"尾部显著更常见"的事件
      const la = isFinite(a.lift) ? a.lift : 99;
      const lb = isFinite(b.lift) ? b.lift : 99;
      return lb - la;
    });
    return { indices: use, freq };
  }

  /** 均匀抽样若干条完整轨迹用于路径云 */
  function makeHistorySampler(keep, total) {
    const stride = total / keep;
    const items = [];
    let nextAt = stride / 2;
    return {
      items,
      offer(idx, ws, as) {
        if (items.length >= keep) return;
        if (idx >= nextAt - 0.5) {
          items.push({ idx, ws, as });
          nextAt += stride;
        }
      },
    };
  }

  function yieldToUI() {
    if (typeof setTimeout === 'function') {
      return new Promise((r) => setTimeout(r, 0));
    }
    return Promise.resolve();
  }

  /* ---------------- 策略对比（§14） ---------------- */

  /**
   * 同时跑多个策略，并对每个策略给出摘要。
   * @param {Array<{name, strategy, character?}>} arms
   */
  async function compareStrategies(baseParams, arms, onProgress) {
    const out = [];
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      const res = await runMonteCarlo({
        ...baseParams,
        character: arm.character || baseParams.character,
        strategy: arm.strategy,
        onProgress: onProgress
          ? (p) => onProgress({ armIndex: i, armCount: arms.length, armName: arm.name, ...p })
          : null,
      });
      out.push({ name: arm.name, strategy: arm.strategy, result: res });
    }
    // 两两 Bootstrap（最多取前两个做显著性）
    let test = null;
    if (out.length === 2) {
      const a = out[0].result.samples.wealth;
      const b = out[1].result.samples.wealth;
      const rng = new LS.rng.Rng(derive(baseParams.worldSeed, 'bootstrap'));
      test = S.bootstrapMeanDiff(a, b, 2000, rng);
      test.winRate = (() => {
        let w = 0;
        const nn = Math.min(a.length, b.length);
        for (let i = 0; i < nn; i++) if (a[i] > b[i]) w++;
        return w / nn;
      })();
    }
    return { arms: out, test };
  }

  LS.montecarlo = { METRICS, runMonteCarlo, runMonteCarloSync, compareStrategies, decodeMask };
})(typeof globalThis !== 'undefined' ? globalThis : this);
