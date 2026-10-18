/* ============================================================
 * LifeSim · views/compare.js
 * 策略对照（规格书 §14、§48）
 *
 * 科学设计的关键：**锁定世界种子**。
 * 不锁种子时，两组的差异里混着"运气"；锁种子后，差异才主要来自选择。
 * 这一页必须让用户理解这一点，否则对照实验就是自欺欺人。
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const V = LS.views;
  const { h, mount } = LS.dom;
  const U = LS.util;
  const C = LS.config;
  const MC = LS.montecarlo;

  const COLORS = ['#a78bfa', '#2dd4bf', '#f5c860'];

  let running = false;

  function renderCompare(route) {
    const st = LS.store.state;
    const query = (route && route.query) || {};

    if (!st.character || !st.strategy) {
      return V.render({ title: '策略对照', sub: '' }, [
        V.head({ kicker: '第 5 步 / 共 5 步', title: '策略对照' }),
        V.needRun({
          icon: '⚖️',
          title: '还没有可以对照的策略',
          desc: '对照实验需要先有一套基准策略。先生成一条人生，或者直接在设计页调好滑块再回来。',
        }),
      ]);
    }

    const presetKeys = Object.keys(C.STRATEGY_PRESETS);
    const baseKey = presetKeys.find((k) => keyOf(C.STRATEGY_PRESETS[k].values) === keyOf(st.strategy)) || 'balanced';

    let arms = [
      { name: '方案 A', preset: baseKey, strategy: { ...st.strategy } },
      {
        name: '方案 B',
        preset: presetKeys.find((k) => k !== baseKey) || 'steady',
        strategy: LS.character.strategyFromPreset(presetKeys.find((k) => k !== baseKey) || 'steady'),
      },
    ];
    let lockWorldSeed = query.lock === '1';
    let sampleSize = query.size ? parseInt(query.size, 10) : 5000;
    let worldSeed = query.seed != null ? parseInt(query.seed, 10) : (st.lastSeed || 20240101);
    // 回到本页时优先展示上一次的对照结果（同一组方案才复用）
    const cacheKey = cacheKeyFor(arms.map((a) => a.strategy));
    let result = (LS.views.compareCache && LS.views.compareCache.key === cacheKey)
      ? LS.views.compareCache.result : null;

    const elHead = h('div');
    const elBody = h('div');
    const elProgress = h('div');

    /* ============================================================
     * 设置
     * ========================================================== */
    function setupCard() {
      return LS.ui.card({
        title: '对照实验设置',
        sub: '只改变你想验证的那一个变量，其余全部保持一致',
        body: [
          h('div', { style: { marginBottom: 'var(--s-4)' } },
            LS.ui.notice([
              h('b', '锁定命运种子是这一页最重要的一步。'),
              h('br'),
              '两种方案使用完全相同的世界随机事件序列，差异就只可能来自你的策略选择。不锁种子的话，两种方案的差异里混着运气，样本量再大也说明不了问题。',
            ], lockWorldSeed ? 'ok' : 'warn')),

          h('div.compare-arms', arms.map((arm, i) => armCard(arm, i))),

          h('div', { style: { height: 'var(--s-4)' } }),

          h('div.grid.g-3', [
            lockBox(),
            sizeBox(),
            seedBox(),
          ]),

          h('div', { style: { height: 'var(--s-4)' } }),
          h('div.row.gap-3.wrap', [
            LS.ui.button('对比两个未来', {
              variant: 'primary', size: 'lg', id: 'run-compare',
              onClick: () => run(),
            }),
            LS.ui.button('把 A 换成当前策略', {
              variant: 'ghost',
              onClick: () => { arms[0].strategy = { ...st.strategy }; arms[0].preset = baseKey; rebuild(); },
            }),
            LS.ui.button('交换 A / B', {
              variant: 'ghost',
              onClick: () => { arms = [arms[1], arms[0]]; rebuild(); },
            }),
          ]),
          elProgress,
        ],
      });
    }

    function armCard(arm, i) {
      const rp = LS.character.riskProfile(arm.strategy);
      const riskChip = h('span', LS.ui.chip('风险 ' + rp.label, rp.tone));
      return h('div.arm-card' + (i === 0 ? '.a' : '.b'), [
        h('div.arm-head', [
          h('span.arm-dot', { style: { background: COLORS[i] } }),
          h('span.arm-name', arm.name),
          riskChip,
        ]),
        h('div.row.gap-2.wrap', { style: { margin: 'var(--s-3) 0' } },
          presetKeys.map((k) => h('button.preset-chip' + (arm.preset === k ? '.on' : ''), {
            type: 'button',
            title: C.STRATEGY_PRESETS[k].desc,
            onclick: () => {
              arm.preset = k;
              arm.strategy = LS.character.strategyFromPreset(k);
              rebuild();
            },
          }, [h('span', C.STRATEGY_PRESETS[k].icon), h('span', C.STRATEGY_PRESETS[k].label)]))),
        h('div', { style: { fontSize: 'var(--f-xs)', color: 'var(--t-3)', marginBottom: 'var(--s-2)' } },
          LS.character.describeStrategy(arm.strategy)),
        h('div.slider-stack.compact', C.STRATEGY_DIMS.slice(0, 3).map((d) =>
          LS.ui.slider({
            name: d.label, icon: d.icon, left: d.left, right: d.right,
            value: arm.strategy[d.key],
            onChange: (v) => {
              arm.strategy[d.key] = v;
              arm.preset = null;
              const rp2 = LS.character.riskProfile(arm.strategy);
              mount(riskChip, [LS.ui.chip('风险 ' + rp2.label, rp2.tone)]);
            },
          }))),
      ]);
    }

    function lockBox() {
      return h('div.mini-box', [
        h('div.mb-title', '🔒 随机性控制'),
        LS.ui.switchRow({
          name: '锁定世界种子',
          checked: lockWorldSeed,
          onChange: (v) => { lockWorldSeed = v; rebuild(); },
        }),
        h('div.mb-note', lockWorldSeed
          ? '开启：两组共享同一经济曲线，差异来自策略'
          : '关闭：两组各自随机，差异混合了运气'),
      ]);
    }

    function sizeBox() {
      return h('div.mini-box', [
        h('div.mb-title', '📊 每组样本量'),
        LS.ui.segmented(
          [1000, 5000, 20000, 50000].map((v) => ({ value: v, label: U.int(v) })),
          sampleSize, (v) => { sampleSize = v; rebuild(); },
        ),
        h('div.mb-note', `每组 ${U.int(sampleSize)} 条，共 ${U.int(sampleSize * 2)} 条人生`),
      ]);
    }

    function seedBox() {
      return h('div.mini-box', [
        h('div.mb-title', '🎲 命运种子'),
        h('div.seed-row', [
          h('input.input', {
            type: 'number', value: String(worldSeed), id: 'cmp-seed',
            oninput: (e) => { worldSeed = Math.max(1, parseInt(e.target.value, 10) || 1); },
          }),
          LS.ui.button('🎲', {
            variant: 'ghost',
            onClick: () => {
              worldSeed = (Math.floor(Math.random() * 899999) + 100000) >>> 0;
              const el = document.getElementById('cmp-seed');
              if (el) el.value = String(worldSeed);
            },
          }),
        ]),
        h('div.mb-note', '换一个种子再跑一次，看结论是否稳定 —— 这叫稳健性检验'),
      ]);
    }

    /* ============================================================
     * 运行
     * ========================================================== */
    async function run() {
      if (running) return;
      running = true;
      LS.audio.play('click');

      const total = sampleSize * 2;
      const prog = LS.ui.simulationProgress();
      mount(elProgress, [h('div', { style: { marginTop: 'var(--s-4)' } }, prog.el)]);
      const btn = document.getElementById('run-compare');
      if (btn) { btn.disabled = true; btn.textContent = '对比中……'; }
      LS.shell.setStatus('正在对比两种策略……', 'ok');

      try {
        const params = {
          character: st.character,
          worldSeed,
          lockWorldSeed,
          sampleSize,
          pathSamples: 120,
          worldConfig: C.makeWorldConfig(st.worldPreset || 'standard', st.worldOverrides || {}),
        };
        const out = await MC.compareStrategies(params, arms.map((a) => ({ name: a.name, strategy: a.strategy })),
          (p) => prog.update({
            done: (p.armIndex * sampleSize) + p.done,
            total,
            percent: ((p.armIndex * sampleSize) + p.done) / total,
            elapsedMs: p.elapsedMs,
            discoveries: p.discoveries,
          }));
        result = out;
        result.lockWorldSeed = lockWorldSeed;
        result.worldSeed = worldSeed;
        LS.views.compareCache = { key: cacheKey, result };
        LS.store.state.stats.compareRuns = (LS.store.state.stats.compareRuns || 0) + 1;
        LS.store.noteSimulation(total);
        LS.store.saveNow();
        LS.audio.play('done');
        LS.shell.setStatus('对照完成', 'ok');
        LS.meta.evaluateAndToast({ kind: 'compare', compare: result, state: LS.store.state });
        mount(elProgress, []);
        rebuild();
      } catch (e) {
        console.error(e);
        mount(elProgress, [LS.ui.notice('对照过程中出现错误：' + e.message, 'bad')]);
      } finally {
        running = false;
      }
    }

    /* ============================================================
     * 结果
     * ========================================================== */
    function rebuild() {
      mount(elHead, [setupCard()]);
      mount(elBody, result ? resultSections(result) : [introCard()]);
      LS.shell.refreshBadges();
    }

    function introCard() {
      return LS.ui.card({
        title: '还没跑对照',
        sub: '你会得到什么',
        body: [
          h('div.grid.g-2', [
            h('div', [
              h('div.card-title', { style: { fontSize: '14px' } }, '① 差异是否真实'),
              h('p', { style: { color: 'var(--t-2)', lineHeight: '1.7', fontSize: 'var(--f-sm)' } },
                'Bootstrap 重抽样给出"两组平均财富之差"的 95% 置信区间。如果区间跨过 0，就不能说哪个更好 —— 差异可能纯粹是抽样噪声。'),
            ]),
            h('div', [
              h('div.card-title', { style: { fontSize: '14px' } }, '② 谁的分布更宽'),
              h('p', { style: { color: 'var(--t-2)', lineHeight: '1.7', fontSize: 'var(--f-sm)' } },
                '平均更高不等于更值得选。箱线图会告诉你哪一组的 P05 更低（下限更危险），以及中位数与均值的差距。'),
            ]),
            h('div', [
              h('div.card-title', { style: { fontSize: '14px' } }, '③ 逐条人生的胜负'),
              h('p', { style: { color: 'var(--t-2)', lineHeight: '1.7', fontSize: 'var(--f-sm)' } },
                '在锁定种子的条件下，可以逐条比较"同一个人的两种人生"。胜率比平均值更直观：它回答"如果我反复重来，哪边赢的次数更多"。'),
            ]),
            h('div', [
              h('div.card-title', { style: { fontSize: '14px' } }, '④ 代价是什么'),
              h('p', { style: { color: 'var(--t-2)', lineHeight: '1.7', fontSize: 'var(--f-sm)' } },
                '财富更高往往伴随健康、幸福或破产概率的恶化。所以报告里同时给出全部六个维度，而不是只比钱。'),
            ]),
          ]),
        ],
      });
    }

    function resultSections(res) {
      const A = res.arms[0].result, B = res.arms[1].result;
      const test = res.test;

      /* ---- 结论 ---- */
      const head = h('div.card.roomy', [
        h('div.eyebrow', '对照结论'),
        h('h2.h2', { style: { marginTop: '4px' } }, verdictTitle(test, res)),
        h('div.lead', { style: { marginTop: '8px', maxWidth: '82ch' } }, verdictBody(test, A, B, res)),
        h('div', { style: { height: 'var(--s-5)' } }),
        h('div.grid.g-4', [
          LS.ui.metric({
            label: '平均财富差（A − B）',
            value: (test && isFinite(test.diff) ? (test.diff >= 0 ? '+' : '') + U.money(test.diff) : '—'),
            size: 'lg', tone: test && test.ci && test.ci[0] > 0 ? 'ok' : test && test.ci && test.ci[1] < 0 ? 'bad' : 'warn',
            note: test && test.ci
              ? `95% CI [${U.money(test.ci[0])}, ${U.money(test.ci[1])}]`
              : '',
          }),
          LS.ui.metric({
            label: '逐条胜率（A 胜过 B）',
            value: test && isFinite(test.winRate) ? U.pct(test.winRate, 1) : '—',
            size: 'lg', tone: test && test.winRate > 0.55 ? 'ok' : test && test.winRate < 0.45 ? 'bad' : 'warn',
            note: '同一个命运种子下逐条比较',
          }),
          LS.ui.metric({
            label: '差异显著性',
            value: significance(test),
            size: 'lg',
            tone: test && test.ci && (test.ci[0] > 0 || test.ci[1] < 0) ? 'ok' : 'warn',
            note: '区间是否跨过 0',
          }),
          LS.ui.metric({
            label: lockWorldSeed ? '随机性' : '⚠ 未锁定种子',
            value: lockWorldSeed ? '已控制' : '未控制',
            size: 'lg', tone: lockWorldSeed ? 'ok' : 'bad',
            note: lockWorldSeed ? '差异主要来自策略' : '差异混合了运气，结论仅供参考',
          }),
        ]),
      ]);

      /* ---- 箱线图 ---- */
      const box = LS.ui.chartCard({
        title: '财富分布对比',
        sub: '箱体 = P25–P75 · 粗线 = 中位数 · 菱形 = 平均值 · 须 = P05–P95',
        minHeight: 340,
        onMount: (host) => {
          LS.charts.create('boxplot', host, {
            groups: res.arms.map((arm, i) => {
              const sm = arm.result.summary.wealth;
              const s = LS.stats.sorted(arm.result.samples.wealth);
              return {
                label: arm.name + ' · ' + presetLabel(arm.strategy),
                sub: '均值 ' + U.money(sm.mean),
                color: COLORS[i],
                min: sm.q05, q1: sm.q25, median: sm.median, q3: sm.q75, max: sm.q95,
                mean: sm.mean,
                outliers: Array.from({ length: 60 }, (_, k) =>
                  LS.stats.quantileSorted(s, 0.97 + k / 60 * 0.029)),
              };
            }),
            fmt: (v) => U.money(v),
          });
        },
      });

      /* ---- 六维对照表 ---- */
      const rows = Object.keys(MC.METRICS).map((k) => {
        const a = A.summary[k], b = B.summary[k];
        const fmt = k === 'wealth' ? U.money : ((v) => U.fixed(v, 1));
        const d = a.mean - b.mean;
        return [
          MC.METRICS[k].label,
          fmt(a.mean), fmt(b.mean),
          (d >= 0 ? '+' : '') + fmt(d),
          fmt(a.median), fmt(b.median),
        ];
      });

      const table = LS.ui.card({
        title: '六维详细对照',
        sub: '平均更高不代表更好 —— 中位数与尾部风险往往更接近真实体验',
        body: [LS.ui.table(
          ['指标', 'A 平均', 'B 平均', '平均差', 'A 中位数', 'B 中位数'],
          rows,
          {
            align: ['left', 'right', 'right', 'right', 'right', 'right'],
            highlight: (ri, ci) => {
              if (ci !== 3) return '';
              const txt = String(rows[ri][3]);
              if (txt.startsWith('+')) return 'win';
              if (txt.startsWith('-')) return 'lose';
              return '';
            },
          },
        )],
      });

      /* ---- 尾部差异 ---- */
      const tailDiff = LS.ui.card({
        title: '极端情况下的差异',
        sub: '平均值相近时，尾部差异往往才是关键',
        body: h('div.grid.g-2', res.arms.map((arm, i) => {
          const sm = arm.result.summary.wealth;
          const pct = arm.result.percentiles.wealth;
          return h('div', [
            h('div.row.gap-2', { style: { marginBottom: 'var(--s-3)' } }, [
              h('span.arm-dot', { style: { background: COLORS[i] } }),
              h('b', arm.name + ' · ' + presetLabel(arm.strategy)),
            ]),
            h('div.def-list', [
              V.defRow('最差 5% 平均（CVaR）', U.money(sm.cvar95), 'bad'),
              V.defRow('5% 分位（VaR）', U.money(sm.var95), sm.var95 < 0 ? 'bad' : 'warn'),
              V.defRow('P95（乐观情形）', U.money(pct.p95), 'gold'),
              V.defRow('标准差', U.money(sm.std)),
              V.defRow('负债概率', U.pct(sm.probabilityOfLoss, 2),
                sm.probabilityOfLoss > 0.05 ? 'bad' : 'warn'),
            ]),
          ]);
        })),
      });

      /* ---- 建议 ---- */
      const advice = LS.ui.card({
        title: '该选哪个？',
        sub: '软件不会替你做决定，但可以告诉你代价',
        body: [
          adviceText(test, A, B, res),
          h('div', { style: { height: 'var(--s-3)' } }),
          h('div.grid.g-3', ['confidence_interval', 'decision_theory', 'ruin']
            .map((id) => LS.knowledge.card(id, { compact: true }))),
        ],
      });

      return [
        head, gap(), h('div.split-63', [box, tailDiff]), gap(), table, gap(), advice,
        gap(),
        h('div.row.gap-3.wrap', [
          LS.ui.button('换一个种子再跑一次（稳健性检验）', {
            variant: 'primary',
            onClick: () => {
              worldSeed = (Math.floor(Math.random() * 899999) + 100000) >>> 0;
              rebuild();
              setTimeout(run, 60);
            },
          }),
          LS.ui.button('把赢的那套策略拿去重演 10,000 次', {
            variant: 'ghost',
            onClick: () => {
              const winner = (test && test.diff > 0) ? 0 : 1;
              LS.store.state.strategy = { ...res.arms[winner].strategy };
              LS.store.state.lastSeed = worldSeed;
              LS.store.state.lastLockWorldSeed = lockWorldSeed;
              LS.store.saveNow();
              LS.router.go('/universe');
            },
          }),
        ]),
      ];
    }

    /* ---------- 文案 ---------- */
    function verdictTitle(test, res) {
      if (!test || !isFinite(test.diff)) return '两组差异无法计算';
      const sig = test.ci[0] > 0 || test.ci[1] < 0;
      if (!sig) return '两组之间没有统计上可靠的差异';
      const better = test.diff > 0 ? res.arms[0] : res.arms[1];
      return `在控制随机性的条件下，${better.name} 的平均财富更高`;
    }

    function verdictBody(test, A, B, res) {
      if (!test || !isFinite(test.diff)) return '样本量不足，无法给出结论。';
      const parts = [];
      parts.push(`平均差为 ${U.money(Math.abs(test.diff))}，95% 置信区间为 [${U.money(test.ci[0])}, ${U.money(test.ci[1])}]。`);
      if (test.ci[0] > 0 || test.ci[1] < 0) {
        parts.push('区间不包含 0，所以在当前样本量下可以认为差异是真实的。');
      } else {
        parts.push('区间包含 0 —— 这意味着"差异"可能只是抽样波动。此时更该看的是分布形状与破产概率，而不是均值。');
      }
      if (isFinite(test.winRate)) {
        parts.push(`逐条比较的胜率是 ${U.pct(test.winRate, 1)}。`);
      }
      const pa = A.summary.wealth.probabilityOfLoss, pb = B.summary.wealth.probabilityOfLoss;
      if (Math.abs(pa - pb) > 0.005) {
        parts.push(`但要注意风险：A 的负债概率是 ${U.pct(pa, 2)}，B 是 ${U.pct(pb, 2)}。`);
      }
      if (!res.lockWorldSeed) {
        parts.push('⚠ 本次没有锁定世界种子，两组面对的经济环境不同，结论的因果解释要谨慎。');
      }
      return parts.join('');
    }

    function adviceText(test, A, B, res) {
      const pa = A.summary.wealth.probabilityOfLoss, pb = B.summary.wealth.probabilityOfLoss;
      const out = [];
      if (Math.abs(pa - pb) > 0.01) {
        const riskier = pa > pb ? res.arms[0] : res.arms[1];
        const safer = pa > pb ? res.arms[1] : res.arms[0];
        out.push(h('p', { style: { lineHeight: '1.8', color: 'var(--t-2)' } }, [
          `「${riskier.name}」的负债概率比「${safer.name}」高 ${U.pct(Math.abs(pa - pb), 2)}。`,
          '如果你的处境无法承受一次归零（比如没有家庭缓冲、没有可转换的技能），那么即使期望值更高，这个方案的实际效用也可能更低 —— 这就是风险厌恶的数学表达。',
        ]));
      } else {
        out.push(h('p', { style: { lineHeight: '1.8', color: 'var(--t-2)' } },
          '两组的破产概率接近，说明主要差别在分布的中间部分，而不是尾部。这类差异相对"安全"，可以从容选择。'));
      }
      out.push(h('p', { style: { lineHeight: '1.8', color: 'var(--t-2)' } }, [
        '最后提醒：这里的"更好"只在模型的意义上成立。',
        '模型简化了很多现实因素（家庭支持、行业周期、个体健康禀赋），所以它的价值在于让你看清',
        h('b', '结构性权衡'),
        '，而不是替你做出人生选择。',
      ]));
      return out;
    }

    function significance(test) {
      if (!test || !test.ci) return '—';
      if (test.ci[0] > 0 || test.ci[1] < 0) return '显著';
      return '不显著';
    }

    function presetLabel(strategy) {
      const k = keyOf(strategy);
      for (const [key, p] of Object.entries(C.STRATEGY_PRESETS)) {
        if (keyOf(p.values) === k) return p.label;
      }
      return LS.character.describeStrategy(strategy);
    }

    function gap() { return h('div', { style: { height: 'var(--s-5)' } }); }

    /* ---------- 启动 ---------- */
    const page = V.render({
      title: '策略对照',
      sub: '第 5 步 / 共 5 步',
      fate: { seed: worldSeed, locked: lockWorldSeed },
    }, [
      V.head({
        kicker: '第 5 步 / 共 5 步',
        title: '同样的命运，不同的选择',
        sub: '这是全站最接近"科学实验"的一页：控制随机性，只改变一个变量，然后看差异是否真实存在。',
        tight: true,
        actions: [
          LS.ui.button('回到设计页', { variant: 'ghost', size: 'sm', onClick: () => LS.router.go('/create') }),
          LS.ui.button('看单个策略的分布', { variant: 'ghost', size: 'sm', onClick: () => LS.router.go('/universe') }),
        ],
      }),
      elHead,
      h('div', { style: { height: 'var(--s-5)' } }),
      elBody,
    ]);

    rebuild();
    if (query.auto === '1') setTimeout(run, 240);
    LS.views._cleanup = () => { running = false; };
    return page;
  }

  function keyOf(s) {
    if (!s) return '';
    return Object.keys(s).sort().map((k) => k + ':' + U.fixed(s[k], 2)).join('|');
  }

  /** 缓存键：一组策略的指纹（顺序敏感，因为 A/B 是两个不同的方案） */
  function cacheKeyFor(strategies) {
    return strategies.map(keyOf).join('||');
  }

  LS.router.register('/compare', renderCompare);
  LS.views.compare = { render: renderCompare, keyOf, cacheKeyFor };
})(typeof globalThis !== 'undefined' ? globalThis : this);
