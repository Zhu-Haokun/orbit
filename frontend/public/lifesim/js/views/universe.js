/* ============================================================
 * LifeSim · views/universe.js
 * 平行宇宙 / 批量模拟（规格书 §12、§26、§27、§33）
 *
 * 这一页承担了软件最核心的科学叙事：
 *   "一次人生是随机的，一万次人生才有结构。"
 * 因此先给分布，再给尾部，最后给相关结构。
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const V = LS.views;
  const { h, mount } = LS.dom;
  const U = LS.util;
  const C = LS.config;
  const MC = LS.montecarlo;

  const SIZES = [
    { value: 1000, label: '1,000' },
    { value: 10000, label: '10,000' },
    { value: 100000, label: '100,000' },
  ];

  let running = false;

  function renderUniverse(route) {
    const st = LS.store.state;
    const query = (route && route.query) || {};

    if (!st.character || !st.strategy) {
      return V.render({ title: '平行宇宙', sub: '' }, [
        V.head({ kicker: '第 4 步 / 共 5 步', title: '平行宇宙' }),
        V.needRun({
          icon: '🌌',
          title: '还没有可以重演的人生设定',
          desc: '批量模拟需要一个角色和一套策略。先生成一条人生，或者直接在设计页点「重演 10,000 次」。',
        }),
      ]);
    }

    let sampleSize = query.size ? parseInt(query.size, 10) : 10000;
    if (SIZES.every((s) => s.value !== sampleSize)) sampleSize = 10000;
    let lockWorldSeed = query.lock === '1';
    let pathSamples = st.settings.pathSamples || 300;
    let result = (LS.views.mcCache && LS.views.mcCache.key === V.result.strategyKey(st.strategy))
      ? LS.views.mcCache.result : null;

    const elHead = h('div');
    const elBody = h('div');
    const elProgressHost = h('div');

    /* ============================================================
     * 控制区（规格书 §12.1）
     * ========================================================== */
    function controlCard() {
      return LS.ui.card({
        title: '模拟设置',
        sub: '样本量越大，尾部结论越可靠（误差按 1/√n 缩小）',
        body: [
          h('div.row.between.wrap', { style: { gap: 'var(--s-4)' } }, [
            h('div.col.gap-3', [
              h('div.row.gap-2.wrap', [
                h('span', { style: { fontSize: 'var(--f-xs)', color: 'var(--t-3)', minWidth: '54px' } }, '样本量'),
                LS.ui.segmented(SIZES, sampleSize, (v) => {
                  if (running) { LS.audio.play('nope'); return; }
                  sampleSize = v; rebuild();
                }),
              ]),
              h('div.row.gap-2.wrap', [
                h('span', { style: { fontSize: 'var(--f-xs)', color: 'var(--t-3)', minWidth: '54px' } }, '路径样本'),
                LS.ui.segmented([200, 300, 600, 1000].map((v) => ({ value: v, label: String(v) })),
                  pathSamples, (v) => {
                    if (running) { LS.audio.play('nope'); return; }
                    pathSamples = v; rebuild();
                  }),
              ]),
            ]),
            h('div.col.gap-3', { style: { minWidth: '260px' } }, [
              LS.ui.switchRow({
                name: '锁定世界种子',
                desc: '所有平行人生共享同一条经济曲线，差异全部来自随机人生事件',
                checked: lockWorldSeed,
                onChange: (v) => {
                  if (running) { LS.audio.play('nope'); return; }
                  lockWorldSeed = v; rebuild();
                },
              }),
            ]),
          ]),
          h('div', { style: { height: 'var(--s-4)' } }),
          h('div.row.gap-3.wrap', [
            LS.ui.button(result ? '重新运行模拟' : '运行模拟（' + U.int(sampleSize) + ' 次）', {
              variant: 'primary', size: 'lg', id: 'run-mc',
              onClick: () => run(),
            }),
            result && result.sampleSize < 100000
              ? LS.ui.button('扩展到 100,000 次', {
                variant: 'ghost',
                onClick: () => { sampleSize = 100000; rebuild(); run(); },
              })
              : null,
            LS.ui.button('对比两个未来', {
              variant: 'ghost',
              onClick: () => LS.router.go('/compare', lockWorldSeed ? { seed: String(st.lastSeed || 0), lock: '1' } : {}),
            }),
            LS.ui.button('回到设计页调策略', {
              variant: 'ghost',
              onClick: () => LS.router.go('/create'),
            }),
          ].filter(Boolean)),
          h('div', { style: { height: 'var(--s-3)' } }),
          h('div.row.gap-2.wrap', [
            LS.ui.chip('策略 · ' + LS.character.describeStrategy(st.strategy), 'fate'),
            LS.ui.chip('世界 · ' + (C.WORLD_PRESETS[st.worldPreset] || {}).label, 'know'),
            LS.ui.chip(lockWorldSeed ? '命运已锁定' : '命运自由', lockWorldSeed ? 'gold' : 'ghost'),
          ]),
          elProgressHost,
        ],
      });
    }

    /* ============================================================
     * 运行
     * ========================================================== */
    async function run() {
      if (running) return;
      running = true;
      LS.audio.play('click');
      const prog = LS.ui.simulationProgress();
      mount(elProgressHost, [h('div', { style: { marginTop: 'var(--s-4)' } }, prog.el)]);
      LS.shell.setStatus('正在生成平行人生……', 'ok');

      const btn = document.getElementById('run-mc');
      if (btn) { btn.disabled = true; btn.textContent = '运行中……'; }

      const worldSeed = st.lastSeed != null ? st.lastSeed : 20240101;
      try {
        result = await MC.runMonteCarlo({
          character: st.character,
          strategy: st.strategy,
          worldSeed,
          lockWorldSeed,
          sampleSize,
          pathSamples,
          worldConfig: C.makeWorldConfig(st.worldPreset || 'standard', st.worldOverrides || {}),
          onProgress: (p) => prog.update(p),
        });
        LS.views.mcCache = { key: V.result.strategyKey(st.strategy), result };
        LS.store.noteSimulation(result.sampleSize);
        LS.store.saveNow();
        LS.audio.play('done');
        LS.shell.setStatus(`已完成 ${U.int(result.sampleSize)} 次模拟 · 用时 ${(result.meta.elapsedMs / 1000).toFixed(1)}s`, 'ok');
        LS.meta.evaluateAndToast({ kind: 'batch', mc: result, state: LS.store.state });
        mount(elProgressHost, []);
        rebuild();
      } catch (e) {
        console.error(e);
        mount(elProgressHost, [LS.ui.notice('模拟过程中出现错误：' + e.message + '。已保留上一次结果。', 'bad')]);
      } finally {
        running = false;
      }
    }

    /* ============================================================
     * 结果区
     * ========================================================== */
    function rebuild() {
      mount(elHead, [controlCard()]);
      mount(elBody, result ? resultSections(result) : [emptyResult()]);
      LS.shell.refreshBadges();
    }

    function emptyResult() {
      return h('div.card.roomy', [
        LS.ui.emptyState({
          icon: '🌌',
          title: '还没有平行宇宙的数据',
          desc: '点上面的「运行模拟」按钮。10,000 次模拟大约需要 1.5 秒，你会得到一条完整的财富分布、最差 5% 人群的画像，以及各维度之间的相关结构。',
          action: LS.ui.button('开始模拟', {
            variant: 'primary', size: 'lg',
            onClick: () => run(),
          }),
        }),
      ]);
    }

    function resultSections(res) {
      const sm = res.summary;
      const pct = res.percentiles;
      const cur = LS.store.currentLife();

      /* ---- 结论指标 ---- */
      const hero = h('div.card.roomy', [
        h('div.row.between.wrap', { style: { gap: 'var(--s-4)' } }, [
          h('div', [
            h('div.eyebrow', '模拟完成'),
            h('h2.h2', { style: { marginTop: '4px' } },
              `${U.int(res.sampleSize)} 条人生，关于同一套选择的真相`),
            h('div.lead', { style: { marginTop: '8px', maxWidth: '76ch' } }, narrative(res)),
          ]),
          h('div.col.gap-1', { style: { alignItems: 'flex-end' } }, [
            LS.ui.chip('用时 ' + (res.meta.elapsedMs / 1000).toFixed(1) + ' 秒', 'ok'),
            LS.ui.chip((res.meta.elapsedMs / res.sampleSize * 1000).toFixed(2) + ' ms / 条', 'ghost'),
          ]),
        ]),
        h('div', { style: { height: 'var(--s-5)' } }),
        h('div.grid.g-4', [
          LS.ui.metric({
            label: '财富 · 平均', value: U.money(sm.wealth.mean), size: 'lg', tone: 'fate',
            note: '±' + U.money(sm.wealth.stderr) + '（标准误）',
          }),
          LS.ui.metric({
            label: '财富 · 中位数', value: U.money(sm.wealth.median), size: 'lg',
            note: '一半人比这个数高',
          }),
          LS.ui.metric({
            label: '财富 · P95', value: U.money(pct.wealth.p95), size: 'lg', tone: 'gold',
            note: '只有 5% 的人生超过它',
          }),
          LS.ui.metric({
            label: '财富 · P05', value: U.money(pct.wealth.p05), size: 'lg',
            tone: pct.wealth.p05 < 0 ? 'bad' : 'warn',
            note: '最差 5% 的门槛',
          }),
        ]),
        h('div', { style: { height: 'var(--s-4)' } }),
        h('div.grid.g-6', [
          miniMetric('健康', U.fixed(sm.health.mean, 1), '±' + U.fixed(sm.health.std, 1)),
          miniMetric('幸福', U.fixed(sm.happiness.mean, 1), '±' + U.fixed(sm.happiness.std, 1)),
          miniMetric('成就', U.fixed(sm.achievement.mean, 1), '±' + U.fixed(sm.achievement.std, 1)),
          miniMetric('关系', U.fixed(sm.relationship.mean, 1), '±' + U.fixed(sm.relationship.std, 1)),
          miniMetric('寿命', U.fixed(sm.lifespan.mean, 1) + ' 岁', '中位 ' + U.fixed(sm.lifespan.median, 0)),
          miniMetric('破产概率', U.pct(sm.wealth.probabilityOfLoss, 2), '财富 < 0 的比例',
            sm.wealth.probabilityOfLoss > 0.05 ? 'bad' : sm.wealth.probabilityOfLoss > 0.01 ? 'warn' : 'ok'),
        ]),
      ]);

      /* ---- 分布直方图 ---- */
      const hist = LS.ui.chartCard({
        title: '最终财富分布',
        sub: '对数横轴（否则 99% 的样本会挤在一根柱子里）· 金色竖线是最高频区间 · 点柱查看样本量',
        minHeight: 340,
        actions: [
          LS.ui.button('为什么会右偏？', {
            variant: 'ghost', size: 'sm',
            onClick: () => LS.knowledge.explain('lognormal'),
          }),
        ],
        onMount: (host) => {
          LS.charts.create('histogram', host, {
            data: Array.from(res.samples.wealth),
            scale: 'log',
            bins: 54,
            focus: { from: sm.wealth.min, to: pct.wealth.p05, label: '最差 5%', color: LS.charts.theme().bad },
            markers: [
              { value: sm.wealth.mean, label: '均值 ' + U.money(sm.wealth.mean), color: LS.charts.theme().fate, labelY: 40 },
              { value: sm.wealth.median, label: '中位 ' + U.money(sm.wealth.median), color: LS.charts.theme().teal, labelY: 58 },
            ],
            me: cur && cur.strategy && V.result.strategyKey(cur.strategy) === V.result.strategyKey(st.strategy)
              ? cur.result.finalWealth : null,
          });
        },
      });

      /* ---- 路径云 ---- */
      const cloud = LS.ui.chartCard({
        title: '平行人生路径云',
        sub: `随机抽取 ${res.paths.length} 条完整轨迹 · 深色扇形是 P05–P95 分位带`,
        minHeight: 340,
        onMount: (host) => {
          LS.charts.create('pathcloud', host, {
            paths: pathItems(res),
            band: buildBand(res),
            scale: 'linear',
          });
        },
      });

      /* ---- 尾部画像 ---- */
      const tailCard = tailSections(res);

      /* ---- 相关矩阵 + 散点 ---- */
      const corr = LS.ui.chartCard({
        title: '维度相关矩阵',
        sub: 'Pearson 相关系数 · 相关不等于因果',
        minHeight: 360,
        actions: [
          LS.ui.button('相关的陷阱', {
            variant: 'ghost', size: 'sm',
            onClick: () => LS.knowledge.explain('correlation'),
          }),
        ],
        onMount: (host) => {
          LS.charts.create('corrmatrix', host, {
            labels: res.correlation.keys,
            matrix: res.correlation.matrix,
          });
        },
      });

      const scatter = LS.ui.chartCard({
        title: '财富 × 幸福',
        sub: '每个点是一条人生 · 虚线是线性回归',
        minHeight: 360,
        onMount: (host) => {
          const n = res.sampleSize;
          const step = Math.max(1, Math.floor(n / 900));
          const pts = [];
          for (let i = 0; i < n; i += step) {
            pts.push({ x: res.samples.wealth[i], y: res.samples.happiness[i], r: 2.6, alpha: 0.4 });
          }
          // 回归
          const ols = LS.stats.ols(
            Array.from({ length: n }, (_, i) => [1, res.samples.wealth[i]]),
            res.samples.happiness,
          );
          if (cur) {
            pts.push({
              x: cur.result.finalWealth, y: cur.result.happiness, r: 6,
              color: LS.charts.theme().gold, highlight: true, label: '你这一生',
            });
          }
          LS.charts.create('scatter', host, {
            points: pts,
            xLabel: '最终财富（万）',
            yLabel: '幸福',
            xFmt: (v) => U.money(v),
            yFmt: (v) => U.fixed(v, 0),
            regression: ols && isFinite(ols.beta[1]) ? { slope: ols.beta[1], intercept: ols.beta[0] } : null,
            regressionLabel: ols ? `r² = ${U.fixed(ols.r2, 3)}` : '',
          });
        },
      });

      /* ---- 风险卡（VaR / CVaR） ---- */
      const risk = riskCard(res);

      /* ---- 分位数表 ---- */
      const table = LS.ui.card({
        title: '完整分位数表',
        sub: '每个维度的 P05 / P25 / 中位 / P75 / P95',
        body: [LS.ui.table(
          ['指标', 'P05', 'P25', '中位数', 'P75', 'P95', '平均'],
          Object.keys(MC.METRICS).map((k) => {
            const fmt = k === 'wealth' ? U.money : ((v) => U.fixed(v, 1));
            return [
              MC.METRICS[k].label,
              fmt(pct[k].p05), fmt(pct[k].p25), fmt(pct[k].p50),
              fmt(pct[k].p75), fmt(pct[k].p95), fmt(sm[k].mean),
            ];
          }),
          { align: ['left', 'right', 'right', 'right', 'right', 'right', 'right'] },
        )],
      });

      /* ---- 样本浏览器 ---- */
      const browser = sampleBrowser(res);

      /* ---- 知识 ---- */
      const knowledge = LS.ui.card({
        title: '这一页涉及的统计概念',
        sub: '看不懂的术语都在这里',
        body: h('div.grid.g-3', ['monte_carlo', 'law_of_large_numbers', 'lognormal', 'heavy_tail', 'var_cvar', 'sampling']
          .map((id) => LS.knowledge.card(id, { compact: true }))),
      });

      return [
        hero,
        gap(),
        hist,
        gap(),
        h('div.split-63', [cloud, tailCard]),
        gap(),
        risk,
        gap(),
        h('div.split-63', [corr, scatter]),
        gap(),
        table,
        gap(),
        browser,
        gap(),
        knowledge,
      ];
    }

    /* ---------- 路径数据 ---------- */
    function pathItems(res) {
      const items = res.paths.map((p, i) => ({
        id: 'p' + i,
        kind: 'sample',
        points: p.ages.map((a, k) => ({ age: a, wealth: p.wealth[k] })),
        label: '样本 #' + p.index,
      }));
      const sorted = items.slice().sort((a, b) => {
        const la = a.points[a.points.length - 1], lb = b.points[b.points.length - 1];
        return (la ? la.wealth : 0) - (lb ? lb.wealth : 0);
      });
      if (sorted.length) {
        const best = sorted[sorted.length - 1];
        const worst = sorted[0];
        items.push({ ...best, kind: 'best', label: '最幸运', points: best.points });
        items.push({ ...worst, kind: 'worst', label: '最糟糕', points: worst.points });
        const mid = sorted[Math.floor(sorted.length / 2)];
        items.push({ ...mid, kind: 'median', label: '中位人生', points: mid.points });
      }
      // 叠加"你自己"的那条（如果策略一致）
      const cur = LS.store.currentLife();
      if (cur && cur.strategy && V.result.strategyKey(cur.strategy) === V.result.strategyKey(LS.store.state.strategy)) {
        items.push({
          id: 'mine', kind: 'mine', label: '你的一生',
          points: (cur.states || []).map((s) => ({ age: s.age, wealth: s.wealth })),
        });
      }
      return items;
    }

    /** 由样本构造 P05/P25/P50/P75/P95 分位带 */
    function buildBand(res) {
      const paths = res.paths;
      if (!paths.length) return [];
      const byAge = new Map();
      for (const p of paths) {
        for (let k = 0; k < p.ages.length; k++) {
          const a = p.ages[k];
          if (!byAge.has(a)) byAge.set(a, []);
          byAge.get(a).push(p.wealth[k]);
        }
      }
      const out = [];
      for (const [age, arr] of Array.from(byAge.entries()).sort((x, y) => x[0] - y[0])) {
        const s = LS.stats.sorted(arr);
        out.push({
          age,
          p05: LS.stats.quantileSorted(s, 0.05),
          p25: LS.stats.quantileSorted(s, 0.25),
          p50: LS.stats.quantileSorted(s, 0.50),
          p75: LS.stats.quantileSorted(s, 0.75),
          p95: LS.stats.quantileSorted(s, 0.95),
        });
      }
      return out;
    }

    /* ---------- 尾部画像（规格书 §27.3） ---------- */
    function tailSections(res) {
      const worst = res.tail.worst, best = res.tail.best;
      const worstTop = worst.freq.filter((f) => f.overallRate < 0.995).slice(0, 6);
      const bestTop = best.freq.filter((f) => f.overallRate < 0.995).slice(0, 6);

      const worstTotal = res.summary.wealth.p05;
      const bestTotal = res.summary.wealth.p95;

      function rows(list, tone) {
        if (!list.length) {
          return LS.ui.notice('这一侧没有出现显著高于全体的事件 —— 说明这个维度的极端结果更多由随机冲击造成，而不是某个特定事件。', 'know');
        }
        return h('div.tail-list', list.map((f) => h('div.tail-row', [
          h('span', f.icon + ' ' + f.title),
          h('div.tail-bars', [
            LS.ui.progressBar(f.rate, { tone, thin: true }),
          ]),
          h('span.tr-val', U.pct(f.rate, 1)),
          h('span.tr-lift' + (f.lift > 1.5 ? '.hot' : ''), (isFinite(f.lift) ? f.lift.toFixed(2) : '∞') + '×'),
        ])));
      }

      return LS.ui.card({
        title: '尾部画像 · 谁在这两端',
        sub: '倍数 = 该事件在尾部出现的比例 ÷ 在全体出现的比例',
        body: [
          LS.ui.notice([
            h('b', '为什么看"倍数"而不是"比例"？'),
            h('br'),
            '因为「第一次求职」几乎人人都会经历，它在最差 5% 里也是接近 100%，这个数字没有任何区分度。倍数才能告诉你"这件事把人生推向了这一端"。',
          ], 'know'),
          h('div', { style: { height: 'var(--s-4)' } }),
          h('div.tail-head', [
            h('div.tail-cell.bad', [
              h('div.tc-label', '最差 5% 的人生'),
              h('div.tc-val', '财富 ≤ ' + U.money(worstTotal)),
            ]),
            h('div.tail-cell.ok', [
              h('div.tc-label', '最好 5% 的人生'),
              h('div.tc-val', '财富 ≥ ' + U.money(bestTotal)),
            ]),
          ]),
          h('div', { style: { height: 'var(--s-4)' } }),
          h('div.grid.g-2', [
            h('div', [h('div.card-title', { style: { fontSize: '14px', marginBottom: '8px' } }, '最差 5% 中显著更常见的事'), rows(worstTop, 'bad')]),
            h('div', [h('div.card-title', { style: { fontSize: '14px', marginBottom: '8px' } }, '最好 5% 中显著更常见的事'), rows(bestTop, 'ok')]),
          ]),
          h('div', { style: { height: 'var(--s-3)' } }),
          h('div.row.gap-2.wrap', [
            LS.ui.button('为什么会这样？', {
              variant: 'ghost', size: 'sm',
              onClick: () => LS.knowledge.explain('selection_bias'),
            }),
            LS.ui.button('什么是厚尾', {
              variant: 'ghost', size: 'sm',
              onClick: () => LS.knowledge.explain('heavy_tail'),
            }),
          ]),
        ],
      });
    }

    /* ---------- 风险卡 ---------- */
    function riskCard(res) {
      const sm = res.summary.wealth;
      return LS.ui.card({
        title: '风险指标 · 只看最坏情况',
        sub: 'VaR 回答"最差从哪里开始"，CVaR 回答"真掉进去会有多惨"',
        actions: [
          LS.ui.button('VaR 与 CVaR 的区别', {
            variant: 'ghost', size: 'sm',
            onClick: () => LS.knowledge.explain('var_cvar'),
          }),
        ],
        body: [
          h('div.grid.g-4', [
            riskCell('VaR 95%（5% 分位）', U.money(sm.var95), '95% 的人生比它更好', sm.var95 < 0 ? 'bad' : 'warn'),
            riskCell('CVaR 95%（尾部均值）', U.money(sm.cvar95), '最差 5% 人生的平均值', 'bad'),
            riskCell('亏损概率', U.pct(sm.probabilityOfLoss, 2), '最终净资产 < 0', sm.probabilityOfLoss > 0.05 ? 'bad' : 'warn'),
            riskCell('最差单一样本', U.money(sm.min), '整个模拟中的最低值', 'ghost'),
          ]),
          h('div', { style: { height: 'var(--s-4)' } }),
          LS.ui.notice([
            'VaR 与 CVaR 的关系：CVaR 一定不优于 VaR（更差或相等），因为它是尾部的平均。',
            h('br'),
            '如果只有 1,000 个样本，最差 5% 只有 50 个人，CVaR 的估计会很不稳定 —— 这正是需要 100,000 次模拟的原因。',
          ], 'warn'),
        ],
      });
    }

    function riskCell(label, value, note, tone) {
      return h('div.risk-cell' + (tone === 'bad' ? '.bad' : tone === 'ok' ? '.ok' : ''), [
        h('div.rc-label', label),
        h('div.rc-val', value),
        h('div', { style: { fontSize: 'var(--f-xxs)', color: 'var(--t-4)', marginTop: '2px' } }, note),
      ]);
    }

    /* ---------- 样本浏览器 ---------- */
    function sampleBrowser(res) {
      const paths = res.paths.slice().sort((a, b) => b.finalWealth - a.finalWealth);
      const sample = paths.length > 24
        ? [...paths.slice(0, 8), ...paths.slice(Math.floor(paths.length / 2) - 4, Math.floor(paths.length / 2) + 4), ...paths.slice(-8)]
        : paths;
      const max = Math.max(...sample.map((p) => Math.abs(p.finalWealth)), 1);

      return LS.ui.card({
        title: '样本浏览器',
        sub: '看看具体的人生长什么样 · 点击任意一行查看完整轨迹',
        body: [
          LS.ui.notice('单个样本永远不能代表总体。这里把它们列出来，正是为了让你看到"同样的策略可以走出多不一样的人生"。', 'know'),
          h('div', { style: { height: 'var(--s-3)' } }),
          h('div.sample-browser', sample.map((p) => h('div.sample-row' + (p.finalWealth >= res.summary.wealth.p95 ? '.gold' : ''), {
            onclick: () => openSample(p, res),
          }, [
            h('span.sr-idx', '#' + p.index),
            h('div', { style: { minWidth: '92px' } }, [
              h('div', { style: { fontSize: '13px', fontWeight: '650' } }, U.money(p.finalWealth)),
              h('div', { style: { fontSize: 'var(--f-xxs)', color: 'var(--t-4)' } },
                p.ages.length + ' 年 · 重大事件 ' + p.majorEvents),
            ]),
            h('div.sr-bar', h('i', { style: { width: (Math.abs(p.finalWealth) / max * 100) + '%' } })),
            h('span.sr-val', V.wealthTone(p.finalWealth) === 'bad' ? '负债' : '正常'),
          ]))),
        ],
      });
    }

    function openSample(p, res) {
      const m = LS.ui.modal({
        title: '样本 #' + p.index + ' 的完整轨迹',
        sub: '最终财富 ' + U.money(p.finalWealth) + ' · 共经历 ' + p.majorEvents + ' 个重大事件',
        size: 'lg',
        body: [
          h('div', { id: 'sample-chart', style: { height: '300px' } }),
          h('div', { style: { height: 'var(--s-3)' } }),
          LS.ui.notice('这条人生与你用的是**完全相同的策略**。它和你的差异，全部来自随机事件 —— 这就是"运气"在模型里的样子。', 'know'),
        ],
        onClose: () => { /* 图表随 DOM 一起移除 */ },
      });
      const host = document.getElementById('sample-chart');
      if (host) {
        LS.charts.create('timeseries', host, {
          ages: p.ages,
          series: [
            { key: 'wealth', label: '财富', color: LS.charts.theme().fate, values: p.wealth, fill: true },
            { key: 'health', label: '健康', color: LS.charts.theme().ok, values: p.health, axis: 'right' },
            { key: 'happiness', label: '幸福', color: LS.charts.theme().warn, values: p.happiness, axis: 'right' },
          ],
          rightFixed: [0, 100],
        });
      }
      return m;
    }

    /* ---------- 文案 ---------- */
    function narrative(res) {
      const sm = res.summary.wealth;
      const gap = sm.mean - sm.median;
      const parts = [];
      parts.push(`平均最终财富 ${U.money(sm.mean)}，中位数 ${U.money(sm.median)}。`);
      if (gap > sm.median * 0.5) {
        parts.push(`平均值比中位数高 ${U.pct(gap / Math.max(1, sm.mean), 0)} —— 这是典型的右偏分布：少数极高收益把均值抬了上去。`);
      }
      if (sm.probabilityOfLoss > 0.01) {
        parts.push(`有 ${U.pct(sm.probabilityOfLoss, 2)} 的人生以负债收场，最差的 5% 平均只有 ${U.money(sm.cvar95)}。`);
      } else {
        parts.push('这次模拟中没有出现负债结局 —— 注意，未观察到不代表真实概率为 0。');
      }
      parts.push(`财富的标准差是 ${U.money(sm.std)}，说明"同样一套策略"的结果差距有多大。`);
      return parts.join('');
    }

    function miniMetric(label, value, note, tone) {
      return h('div.metric.sm', [
        h('div.m-label', label),
        h('div.m-value' + (tone ? '.v-' + tone : ''), value),
        h('div.m-note', note),
      ]);
    }

    function gap() { return h('div', { style: { height: 'var(--s-5)' } }); }

    /* ---------- 启动 ---------- */
    const page = V.render({
      title: '平行宇宙',
      sub: '第 4 步 / 共 5 步',
      fate: { seed: st.lastSeed || 20240101, locked: lockWorldSeed },
    }, [
      V.head({
        kicker: '第 4 步 / 共 5 步',
        title: '把同一套选择，重演成千上万次',
        sub: '单次人生只能看到一条路径；只有重演足够多次，才能真正看到"分布"——概率的形状本身。',
        tight: true,
        actions: [
          LS.ui.button('回到设计页', { variant: 'ghost', size: 'sm', onClick: () => LS.router.go('/create') }),
          LS.ui.button('策略对照', { variant: 'ghost', size: 'sm', onClick: () => LS.router.go('/compare') }),
        ],
      }),
      elHead,
      h('div', { style: { height: 'var(--s-5)' } }),
      elBody,
    ]);

    rebuild();

    // 如果是从设计页带着"直接跑"意图进来的，自动开跑
    if (query.auto === '1' && !result) setTimeout(run, 220);

    LS.views._cleanup = () => { running = false; };
    return page;
  }

  LS.router.register('/universe', renderUniverse);
  LS.views.universe = { render: renderUniverse };
})(typeof globalThis !== 'undefined' ? globalThis : this);
