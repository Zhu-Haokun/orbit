/* ============================================================
 * LifeSim · views/compare.js
 * 策略对照（规格书 §14、§48）
 *
 * 这一页只想回答一个很朴素的问题：
 *   “如果只改一个选择，人生会差多少？”
 * 锁住运气时，差别更可能来自选择；没锁时，差别里会混进运气。
 * 不用把它讲成实验设计课。
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
        V.head({ kicker: '两种活法', title: '先活一遍，再来比较' }),
        V.needRun({
          icon: '⚖️',
          title: '还没有可以对照的活法',
          desc: '先设计一个人生，或者直接去设计页把滑块调好，再回来看看另一种选择。',
        }),
      ]);
    }

    const presetKeys = Object.keys(C.STRATEGY_PRESETS);
    const baseKey = presetKeys.find((k) => keyOf(C.STRATEGY_PRESETS[k].values) === keyOf(st.strategy)) || 'balanced';

    let arms = [
      { name: '活法 A', preset: baseKey, strategy: { ...st.strategy } },
      {
        name: '活法 B',
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
        title: '两种活法',
        sub: '只改一个选择，其他都一样。看看差别有多大。',
        body: [
          h('div', { style: { marginBottom: 'var(--s-4)' } },
            LS.ui.notice(
              lockWorldSeed
                ? '运气已经锁住。两边遇到的是同一串事，差别更可能来自你的选择。'
                : '没锁运气也没关系。只是差别里会混进一点运气——图个乐，别太当真。',
              lockWorldSeed ? 'ok' : 'warn')),

          h('div.compare-arms', arms.map((arm, i) => armCard(arm, i))),

          h('div', { style: { height: 'var(--s-4)' } }),

          h('div.grid.g-3', [
            lockBox(),
            sizeBox(),
            seedBox(),
          ]),

          h('div', { style: { height: 'var(--s-4)' } }),
          h('div.row.gap-3.wrap', [
            LS.ui.button('看看两种未来', {
              variant: 'primary', size: 'lg', id: 'run-compare',
              onClick: () => run(),
            }),
            LS.ui.button('A 用我现在的活法', {
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
        h('div.mb-title', '🍀 运气开关'),
        LS.ui.switchRow({
          name: '锁住这次的运气',
          checked: lockWorldSeed,
          onChange: (v) => { lockWorldSeed = v; rebuild(); },
        }),
        h('div.mb-note', lockWorldSeed
          ? '锁住：两边遇到同一串事'
          : '没锁：两边各自碰运气'),
      ]);
    }

    function sizeBox() {
      return h('div.mini-box', [
        h('div.mb-title', '🎬 每种活法演多少遍'),
        LS.ui.segmented(
          [1000, 5000, 20000, 50000].map((v) => ({ value: v, label: U.int(v) })),
          sampleSize, (v) => { sampleSize = v; rebuild(); },
        ),
        h('div.mb-note', `每种 ${U.int(sampleSize)} 次，一共 ${U.int(sampleSize * 2)} 次人生`),
      ]);
    }

    function seedBox() {
      return h('div.mini-box', [
        h('div.mb-title', '🌍 这次的世界编号'),
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
        h('div.mb-note', '换个编号再演一次，看看结论是不是还站得住'),
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
      LS.shell.setStatus('正在把两种活法各演一遍……', 'ok');

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
        title: '还没开始比较',
        sub: '你会看到什么',
        body: [
          h('div.grid.g-2', [
            h('div', [
              h('div.card-title', { style: { fontSize: '14px' } }, '① 差别是不是运气'),
              h('p', { style: { color: 'var(--t-2)', lineHeight: '1.7', fontSize: 'var(--f-sm)' } },
                '先看两边差多少，再看看这点差别是不是可能只是运气。'),
            ]),
            h('div', [
              h('div.card-title', { style: { fontSize: '14px' } }, '② 谁的日子更稳'),
              h('p', { style: { color: 'var(--t-2)', lineHeight: '1.7', fontSize: 'var(--f-sm)' } },
                '平均高不代表过得好。看看中位数，再看看最差的那 5% 是什么样。'),
            ]),
            h('div', [
              h('div.card-title', { style: { fontSize: '14px' } }, '③ 同一个人，两种活法'),
              h('p', { style: { color: 'var(--t-2)', lineHeight: '1.7', fontSize: 'var(--f-sm)' } },
                '锁住运气时，可以逐条比较同一个人在不同选择下的结果。'),
            ]),
            h('div', [
              h('div.card-title', { style: { fontSize: '14px' } }, '④ 代价是什么'),
              h('p', { style: { color: 'var(--t-2)', lineHeight: '1.7', fontSize: 'var(--f-sm)' } },
                '钱多一点，可能健康、关系或破产概率更差。报告会把这些一起摆出来。'),
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
        h('div.eyebrow', '所以呢？'),
        h('h2.h2', { style: { marginTop: '4px' } }, verdictTitle(test, res)),
        h('div.lead', { style: { marginTop: '8px', maxWidth: '82ch' } }, verdictBody(test, A, B, res)),
        h('div', { style: { height: 'var(--s-5)' } }),
        h('div.grid.g-4', [
          LS.ui.metric({
            label: '两种活法的平均差（A − B）',
            value: (test && isFinite(test.diff) ? (test.diff >= 0 ? '+' : '') + U.money(test.diff) : '—'),
            size: 'lg', tone: test && test.ci && test.ci[0] > 0 ? 'ok' : test && test.ci && test.ci[1] < 0 ? 'bad' : 'warn',
            note: test && test.ci
              ? `95% 区间 [${U.money(test.ci[0])}, ${U.money(test.ci[1])}]`
              : '',
          }),
          LS.ui.metric({
            label: '同一个人反复重来，A 赢的次数',
            value: test && isFinite(test.winRate) ? U.pct(test.winRate, 1) : '—',
            size: 'lg', tone: test && test.winRate > 0.55 ? 'ok' : test && test.winRate < 0.45 ? 'bad' : 'warn',
            note: '同一个世界编号下逐条比较',
          }),
          LS.ui.metric({
            label: '这个差像不像运气',
            value: significance(test),
            size: 'lg',
            tone: test && test.ci && (test.ci[0] > 0 || test.ci[1] < 0) ? 'ok' : 'warn',
            note: '跨过 0 就说不准',
          }),
          LS.ui.metric({
            label: lockWorldSeed ? '运气' : '⚠ 没锁运气',
            value: lockWorldSeed ? '锁住了' : '没锁',
            size: 'lg', tone: lockWorldSeed ? 'ok' : 'bad',
            note: lockWorldSeed ? '两边遇到的是同一串事' : '两边各自碰运气，别太当真',
          }),
        ]),
      ]);

      /* ---- 箱线图 ---- */
      const box = LS.ui.chartCard({
        title: '两种活法的财富分布',
        sub: '箱体 = 中间一半人 · 粗线 = 中位数 · 菱形 = 平均 · 须 = 大多数人的范围',
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
        title: '六个维度，一起看',
        sub: '别只看钱 —— 健康、关系、幸福也可能被悄悄换走',
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
        title: '如果运气特别差 / 特别好',
        sub: '平均值差不多时，极端的那些人差别更大',
        body: h('div.grid.g-2', res.arms.map((arm, i) => {
          const sm = arm.result.summary.wealth;
          const pct = arm.result.percentiles.wealth;
          return h('div', [
            h('div.row.gap-2', { style: { marginBottom: 'var(--s-3)' } }, [
              h('span.arm-dot', { style: { background: COLORS[i] } }),
              h('b', arm.name + ' · ' + presetLabel(arm.strategy)),
            ]),
            h('div.def-list', [
              V.defRow('最差 5% 平均', U.money(sm.cvar95), 'bad'),
              V.defRow('5% 分位', U.money(sm.var95), sm.var95 < 0 ? 'bad' : 'warn'),
              V.defRow('乐观情形（P95）', U.money(pct.p95), 'gold'),
              V.defRow('波动', U.money(sm.std)),
              V.defRow('负债概率', U.pct(sm.probabilityOfLoss, 2),
                sm.probabilityOfLoss > 0.05 ? 'bad' : 'warn'),
            ]),
          ]);
        })),
      });

      /* ---- 建议 ---- */
      const advice = LS.ui.card({
        title: '该选哪个？',
        sub: '没有标准答案，只有代价',
        body: [adviceText(test, A, B, res)],
      });

      return [
        head, gap(), h('div.split-63', [box, tailDiff]), gap(), table, gap(), advice,
        gap(),
        h('div.row.gap-3.wrap', [
          LS.ui.button('再换一个世界演一次', {
            variant: 'primary',
            onClick: () => {
              worldSeed = (Math.floor(Math.random() * 899999) + 100000) >>> 0;
              rebuild();
              setTimeout(run, 60);
            },
          }),
          LS.ui.button('把赢的那套活法拿去演一万遍', {
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
      if (!test || !isFinite(test.diff)) return '这次没算出来';
      const sig = test.ci[0] > 0 || test.ci[1] < 0;
      if (!sig) return '两种活法看起来差不多';
      const better = test.diff > 0 ? res.arms[0] : res.arms[1];
      return `锁住运气后，${better.name} 的平均日子更宽裕`;
    }

    function verdictBody(test, A, B, res) {
      if (!test || !isFinite(test.diff)) return '演得还不够多，先别急着下结论。';
      const parts = [];
      parts.push(`平均下来，两边差了 ${U.money(Math.abs(test.diff))}。`);
      if (test.ci[0] > 0 || test.ci[1] < 0) {
        parts.push('这个差不太像运气能解释的。');
      } else {
        parts.push('但这点差别也可能只是运气，先别太当真。');
      }
      if (isFinite(test.winRate)) {
        parts.push(`如果同一个人反复重来，A 赢的次数占 ${U.pct(test.winRate, 1)}。`);
      }
      const pa = A.summary.wealth.probabilityOfLoss, pb = B.summary.wealth.probabilityOfLoss;
      if (Math.abs(pa - pb) > 0.005) {
        parts.push(`也要看代价：A 的负债概率是 ${U.pct(pa, 2)}，B 是 ${U.pct(pb, 2)}。`);
      }
      if (!res.lockWorldSeed) {
        parts.push('这次没锁运气，两边遇到的事不一样，别把差别全算在选择头上。');
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
          '如果你现在经不起一次归零（没有家庭缓冲、没有能换饭吃的技能），那就算平均更高，这条路的实际日子也可能更难。',
        ]));
      } else {
        out.push(h('p', { style: { lineHeight: '1.8', color: 'var(--t-2)' } },
          '两边的负债概率差不多，差别主要在中间那些普通年份，而不是极端情况。这种差别相对好承受。'));
      }
      out.push(h('p', { style: { lineHeight: '1.8', color: 'var(--t-2)' } }, [
        '最后还是那句话：这里的“更好”只在这个小世界里成立。',
        '现实里的家庭支持、行业周期、身体禀赋都没被完全建模，所以它只能帮你看清',
        h('b', '权衡'),
        '，不能替你选。',
      ]));
      return out;
    }

    function significance(test) {
      if (!test || !test.ci) return '—';
      if (test.ci[0] > 0 || test.ci[1] < 0) return '像真的';
      return '说不准';
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
      sub: '两种活法',
      fate: { seed: worldSeed, locked: lockWorldSeed },
    }, [
      V.head({
        kicker: 'A / B',
        title: '同样的命运，不同的选择',
        sub: '只动一个选择，看看两条路会把日子带到哪里。',
        tight: true,
        actions: [
          LS.ui.button('改改选择', { variant: 'ghost', size: 'sm', onClick: () => LS.router.go('/create') }),
          LS.ui.button('只看一种活法', { variant: 'ghost', size: 'sm', onClick: () => LS.router.go('/universe') }),
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

  /** 缓存键：一组策略的指纹（顺序敏感，因为 A/B 是两种不同的活法） */
  function cacheKeyFor(strategies) {
    return strategies.map(keyOf).join('||');
  }

  LS.router.register('/compare', renderCompare);
  LS.views.compare = { render: renderCompare, keyOf, cacheKeyFor };
})(typeof globalThis !== 'undefined' ? globalThis : this);
