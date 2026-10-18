/* ============================================================
 * LifeSim · views/result.js
 * 人生报告（规格书 §10 ~ §13）
 *
 * 报告的组织顺序遵循一条原则：
 *   先给结论（我过得怎么样）→ 再给结构（为什么是这样）→ 最后给方法（怎么验证）
 * 所以是 指标 → 曲线 → 时间轴 → 事件 → 概率复盘 → 知识。
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const V = LS.views;
  const { h } = LS.dom;
  const U = LS.util;
  const C = LS.config;

  function currentFull() {
    const st = LS.store.state;
    const card = LS.store.currentLife();
    const cached = LS.views.lastRun;
    if (cached && card && cached.id === card.id) return { full: cached, card };
    return { full: null, card };
  }

  /* ============================================================
   * 页面
   * ========================================================== */
  function renderResult() {
    const { full, card } = currentFull();
    if (!card) {
      return V.render({ title: '人生报告', sub: '' }, [
        V.head({ kicker: '回头看', title: '人生报告' }),
        V.needRun({
          icon: '📄',
          title: '还没有可以分析的人生',
          desc: '报告需要一个完整的人生记录。先生成一条人生，这里就会出现财富曲线、这一生的几个瞬间和五维评价。',
        }),
      ]);
    }

    const r = card.result;
    const states = card.states || [];
    const events = card.events || [];
    const ages = states.map((s) => s.age);
    const lastRun = full;

    /* ---------- 1. 结论区 ---------- */
    const hero = h('div.card.roomy', [
      h('div.row.between.wrap', { style: { gap: 'var(--s-5)' } }, [
        h('div', [
          h('div.eyebrow', card.mode === 'key' ? '关键人生 · 报告' : '极速一生 · 报告'),
          h('h2.h2', { style: { marginTop: '4px' } },
            `${r.lifespan} 岁的人生，${C.CAREER_LABEL[r.finalCareer] || r.finalCareer}`),
          h('div.lead', { style: { marginTop: '8px', maxWidth: '64ch' } },
            verdict(r)),
          r.deathCause ? h('div', { style: { marginTop: 'var(--s-3)', maxWidth: '64ch' } },
            LS.ui.notice([
              h('b', `${r.lifespan} 岁离世 · ${r.deathCause.label}`),
              h('br'),
              r.deathCause.note,
            ], 'warn')) : null,
        ]),
        h('div.row.gap-2.wrap', [
          LS.ui.button('重演 10,000 次', {
            variant: 'primary',
            onClick: () => LS.router.go('/universe'),
          }),
          LS.ui.button('锁定命运，改变选择', {
            variant: 'ghost',
            onClick: () => LS.router.go('/compare', { seed: String(card.worldSeed), lock: '1' }),
          }),
        ]),
      ]),
      h('div', { style: { height: 'var(--s-5)' } }),
      h('div.grid.g-6', [
        bigMetric('最终财富', U.money(r.finalWealth), V.wealthTone(r.finalWealth), '一生结束时的可支配净资产（不含自住房）'),
        bigMetric('峰值财富', U.money(r.peakWealth), 'gold', '曾经达到过的最高点'),
        bigMetric('健康', U.fixed(r.health, 1), V.scoreTone(r.health), '65 岁前平均'),
        bigMetric('幸福', U.fixed(r.happiness, 1), V.scoreTone(r.happiness, 70, 48), '一生平均'),
        bigMetric('事业成就', U.fixed(r.achievement, 1), 'know', '峰值型指标'),
        bigMetric('社会关系', U.fixed(r.relationship, 1), V.scoreTone(r.relationship, 70, 48), '一生平均'),
      ]),
    ]);

    /* ---------- 2. 曲线 + 雷达 ---------- */
    let curveMode = 'all';
    let curveChart = null;

    /** 三种视图模式：全部 / 只看财富 / 只看状态分 */
    function curveSeries(mode) {
      const th = LS.charts.theme();
      const wealth = {
        key: 'wealth', label: '财富', color: th.fate,
        values: states.map((s) => s.wealth), fill: true,
      };
      const score = [
        { key: 'health', label: '健康', color: th.ok, values: states.map((s) => s.health), axis: 'right' },
        { key: 'happiness', label: '幸福', color: th.warn, values: states.map((s) => s.happiness), axis: 'right' },
        { key: 'relationship', label: '关系', color: th.gold, values: states.map((s) => s.relationship), axis: 'right', dash: [5, 4] },
      ];
      if (mode === 'wealth') return [wealth];
      if (mode === 'score') return score;
      return [wealth, ...score];
    }

    const curveCard = LS.ui.chartCard({
      title: '人生曲线',
      sub: '左轴：财富（万）· 右轴：0–100 状态分 · 竖线为该年发生的重大事件',
      minHeight: 320,
      actions: [
        LS.ui.segmented(
          [
            { value: 'all', label: '全部' },
            { value: 'wealth', label: '只看财富' },
            { value: 'score', label: '只看状态' },
          ],
          curveMode,
          (v) => {
            curveMode = v;
            // 就地重绘，不重建整个页面（避免打断用户滚动位置）
            const host = document.getElementById('curve-chart');
            if (!host) return;
            curveChart = LS.charts.replace(host, 'timeseries', curveOpts(v));
          },
        ),
      ],
      onMount: (host) => {
        host.id = 'curve-chart';
        curveChart = LS.charts.create('timeseries', host, curveOpts(curveMode));
      },
    });

    function curveOpts(mode) {
      return {
        ages,
        series: curveSeries(mode),
        events: events.map((e) => ({
          age: e.age, title: e.title, icon: e.icon, major: true, probability: e.probability,
        })),
        marks: lifeMarks(r, card),
        rightFixed: mode === 'wealth' ? null : [0, 100],
      };
    }

    const radarCard = LS.ui.chartCard({
      title: '五维人生',
      sub: '同一套尺度下的自我画像',
      minHeight: 320,
      onMount: (host) => {
        LS.charts.create('radar', host, {
          dims: [
            { key: 'wealth', label: '财富', max: 100 },
            { key: 'health', label: '健康', max: 100 },
            { key: 'happiness', label: '幸福', max: 100 },
            { key: 'achievement', label: '成就', max: 100 },
            { key: 'relationship', label: '关系', max: 100 },
          ],
          series: [{
            label: '这一生',
            color: LS.charts.theme().brand,
            values: [
              wealthScore(r.finalWealth),
              r.health, r.happiness, r.achievement, r.relationship,
            ],
          }],
        });
      },
    });

    /* ---------- 3. 时间轴 ---------- */
    const timelineCard = LS.ui.chartCard({
      title: '一生长条',
      sub: '职业阶段色带 + 重要的事',
      minHeight: 130,
      onMount: (host) => {
        LS.charts.create('timeline', host, {
          lifespan: r.lifespan,
          states: states.map((s) => ({ age: s.age, career: s.career, economy: s.economy })),
          events: events.map((e) => ({ age: e.age, title: e.title, icon: e.icon, category: e.category, major: true, probability: e.probability })),
        });
      },
    });

    /* ---------- 4. 关键事件 ---------- */
    const eventList = h('div.event-list', events.length
      ? events.map((e) => {
        const row = V.eventRow(e, {
          onClick: () => LS.ui.modal({
            title: (e.icon || '') + ' ' + e.title,
            sub: e.age + ' 岁 · 当时的可能 ' + (e.probability != null ? U.pct(e.probability, 2) : '—'),
            body: [
              h('div.lead', e.narrative || ''),
              h('div', { style: { height: 'var(--s-4)' } }),
              e.probability != null ? LS.ui.eventCard({
                id: e.id, title: e.title, icon: e.icon, age: e.age,
                probability: e.probability, base: e.base, factors: e.factors,
                randomDraw: e.randomDraw, distribution: e.distribution,
                outcome: { narrative: '' },
              }) : null,
              h('div', { style: { height: 'var(--s-3)' } }),
              h('div.row.gap-2.wrap', [
                V.whyButton('conditional_probability', '这个数字怎么来的？'),
              ]),
            ].filter(Boolean),
          }),
        });
        return row;
      })
      : [h('div.muted', { style: { padding: 'var(--s-4)' } },
        '这一生没有触发重大事件。能平安过完一生，本身就是一种运气。')]);

    /* ---------- 5. 概率复盘 ---------- */
    const rated = events.filter((e) => e.probability != null);
    const rarest = rated.slice().sort((a, b) => a.probability - b.probability).slice(0, 3);
    const likely = rated.slice().sort((a, b) => b.probability - a.probability).slice(0, 3);

    const review = h('div.split-63', [
      LS.ui.card({
        title: '回头看看：那些小概率的事',
        sub: '不是说运气好坏，只是单次人生本来就偶然',
        body: rarest.length
          ? [
            h('div', rarest.map((e) => h('div.review-row', [
              h('span.rr-ico', e.icon || '◆'),
              h('div.rr-body', [
                h('div.rr-title', e.title),
                h('div.rr-meta', e.age + ' 岁 · 当时只有 ' + U.pct(e.probability, 2)),
              ]),
              h('div.rr-bar', LS.ui.progressBar(e.probability, { tone: 'bad', thin: true })),
            ]))),
            h('div', { style: { height: 'var(--s-3)' } }),
            LS.ui.notice('别把单次结果当成评价自己的证据。发生了就是发生了，它只说明这一局比较特别。', 'warn'),
          ]
          : [h('div.muted', '这次没遇到什么小概率的事。')],
      }),
      LS.ui.card({
        title: '几乎一定会发生的事',
        sub: '太常见了，反而没什么好说的',
        body: likely.length
          ? likely.map((e) => h('div.review-row', [
            h('span.rr-ico', e.icon || '◆'),
            h('div.rr-body', [
              h('div.rr-title', e.title),
              h('div.rr-meta', e.age + ' 岁 · 当时有 ' + U.pct(e.probability, 1) + ' 的可能'),
            ]),
            h('div.rr-bar', LS.ui.progressBar(e.probability, { tone: 'ok', thin: true })),
          ]))
          : [h('div.muted', '—')],
      }),
    ]);

    /* ---------- 6. 决策回顾（关键人生模式） ---------- */
    let decisionCard = null;
    if (card.decisions && Object.keys(card.decisions).length) {
      const DEFS = LS.views.run.DECISIONS;
      decisionCard = LS.ui.card({
        title: '决策回顾',
        sub: '你在岔路口的选择，以及它们改变了什么',
        body: Object.entries(card.decisions).map(([id, optId]) => {
          const d = DEFS.find((x) => x.id === id);
          if (!d) return null;
          const o = d.options.find((x) => x.id === optId);
          if (!o) return null;
          return h('div.decision-review', [
            h('div.dr-age', d.age + ' 岁'),
            h('div.grow', [
              h('div.dr-q', d.title),
              h('div.dr-opt', '你选择了：' + o.label),
              h('div.dr-effect', o.effectText),
            ]),
            LS.ui.chip(o.tag, 'fate'),
          ]);
        }),
      });
    }

    /* ---------- 7. 百分位（如果有同策略的批量结果） ---------- */
    const mc = LS.views.mcCache && LS.views.mcCache.key === strategyKey(card.strategy)
      ? LS.views.mcCache.result : null;
    let percentileCard = null;
    if (mc) {
      const sorted = LS.stats.sorted(mc.samples.wealth);
      const p = LS.stats.percentileOf(mc.samples.wealth, r.finalWealth, sorted);
      percentileCard = LS.ui.card({
        title: '你在平行宇宙中的位置',
        sub: `${U.int(mc.sampleSize)} 条人生中，你的最终财富排在第 ${(p * 100).toFixed(1)} 百分位`,
        body: [
          LS.ui.percentileScale(p),
          h('div', { style: { height: 'var(--s-3)' } }),
          h('div.grid.g-3', [
            V.defRow('比你差的人生', U.pct(p, 1)),
            V.defRow('中位人生', U.money(mc.percentiles.wealth.p50)),
            V.defRow('P95 人生', U.money(mc.percentiles.wealth.p95)),
          ]),
          h('div', { style: { height: 'var(--s-3)' } }),
          h('div.row.gap-2.wrap', [
            LS.ui.button('看看一万种活法', { variant: 'ghost', size: 'sm', onClick: () => LS.router.go('/universe') }),
            V.whyButton('percentile', '百分位是什么？'),
          ]),
        ],
      });
    } else {
      percentileCard = LS.ui.card({
        title: '你在平行宇宙中的位置',
        sub: '需要一个批量结果才能计算',
        body: [
          LS.ui.notice('一个人算不出百分位，得有一群人才行。想看看自己落在哪，用同样的活法重演一万次。', 'know'),
          h('div', { style: { marginTop: 'var(--s-3)' } }),
          LS.ui.button('用同样策略重演 10,000 次', {
            variant: 'primary',
            onClick: () => LS.router.go('/universe'),
          }),
        ],
      });
    }

    /* ---------- 组装 ---------- */
    return V.render({
      title: '人生报告',
      sub: '这一生',
      fate: { seed: card.worldSeed, locked: false },
    }, [
      V.head({
        kicker: '回头看',
        title: '这一生到底发生了什么',
        sub: '先看日子过成什么样，再回头看看那些岔路口。所有数字都来自这次模拟，没有修饰。',
        tight: true,
        actions: [
          LS.ui.button('重新设计', { variant: 'ghost', size: 'sm', onClick: () => LS.router.go('/create') }),
          LS.ui.button('再跑一次', { variant: 'ghost', size: 'sm', onClick: () => LS.router.go('/run', { seed: String(Math.floor(Math.random() * 900000) + 100000) }) }),
          LS.ui.button('去档案馆', { variant: 'ghost', size: 'sm', onClick: () => LS.router.go('/archive') }),
          LS.ui.button('导出 JSON', { variant: 'ghost', size: 'sm', onClick: () => exportLifeJSON(card) }),
          LS.ui.button('导出 CSV', { variant: 'ghost', size: 'sm', onClick: () => exportLifeCSV(card) }),
        ],
      }),
      hero,
      h('div', { style: { height: 'var(--s-5)' } }),
      h('div.split-63', [curveCard, radarCard]),
      h('div', { style: { height: 'var(--s-5)' } }),
      timelineCard,
      h('div', { style: { height: 'var(--s-5)' } }),
      LS.ui.card({
        title: '重大事件时间线',
        sub: `共 ${events.length} 个重要瞬间 · 点开看看当时发生了什么`,
        body: [eventList],
      }),
      h('div', { style: { height: 'var(--s-5)' } }),
      review,
      decisionCard ? h('div', { style: { height: 'var(--s-5)' } }) : null,
      decisionCard,
      h('div', { style: { height: 'var(--s-5)' } }),
      percentileCard,
    ]);
  }

  /* ============================================================
   * 辅助
   * ========================================================== */
  function bigMetric(label, value, tone, note) {
    return LS.ui.metric({ label, value, note, tone, size: 'lg' });
  }

  /** 财富 → 0~100 的刻度（对数感知，避免一个亿把雷达打爆） */
  function wealthScore(w) {
    if (!isFinite(w)) return 0;
    if (w <= 0) return Math.max(0, 22 + w);          // 负债压到 0 附近
    return U.clamp(22 + 22 * Math.log10(1 + w), 0, 100);
  }

  /** 自动生成"人生转折点"标记：财富斜率最大上升/下降的年份 */
  function lifeMarks(r, card) {
    const st = card.states || [];
    if (st.length < 5) return [];
    const marks = [];
    let bestUp = { d: 0 }, bestDown = { d: 0 };
    for (let i = 2; i < st.length; i++) {
      const d = (st[i].wealth - st[i - 1].wealth) / Math.max(1, st[i].age - st[i - 1].age);
      if (d > bestUp.d) bestUp = { d, age: st[i].age };
      if (d < bestDown.d) bestDown = { d, age: st[i].age };
    }
    if (bestUp.age) marks.push({ age: bestUp.age, label: '财富最快增长', color: LS.charts.theme().ok });
    if (bestDown.age) marks.push({ age: bestDown.age, label: '财富最快下跌', color: LS.charts.theme().bad });
    return marks;
  }

  function verdict(r) {
    const parts = [];
    if (r.finalWealth < 0) parts.push('这一生以负债收场。不是判你失败，只是说这条路上，破产的可能真的存在。');
    else if (r.finalWealth > 3000) parts.push('你落在了很靠前的位置，这通常需要运气和选择同时到位。');
    else if (r.finalWealth > 800) parts.push('比大多数人的日子宽裕一些，算是靠前的那一拨。');
    else parts.push('和大多数人的日子差不多，是人群里最常见的那一种。');

    if (r.health >= 78) parts.push('健康维护得很好。');
    else if (r.health < 58) parts.push('健康是这一生明显的短板，它会通过寿命反过来压缩其他维度。');

    if (r.happiness >= 68) parts.push('幸福水平偏高，说明你在财富之外也积累了别的东西。');
    else if (r.happiness < 50) parts.push('幸福水平偏低，值得看看是哪些年份拖低了它。');

    parts.push('下面把这一生拆开来看。');
    return parts.join('');
  }

  function downloadText(filename, text, mime) {
    try {
      const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 500);
    } catch (e) {
      LS.ui.toast('导出失败：' + e.message, 'bad');
    }
  }

  function exportLifeJSON(card) {
    const payload = {
      app: 'LifeSim',
      exportedAt: new Date().toISOString(),
      worldSeed: card.worldSeed,
      character: card.character,
      strategy: card.strategy,
      result: card.result,
      states: card.states,
      events: card.events,
      decisions: card.decisions,
    };
    downloadText('lifesim-' + card.id + '.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    LS.ui.toast('已导出这一生的 JSON', 'fate');
  }

  function exportLifeCSV(card) {
    const head = ['年龄', '净资产（万）', '健康', '幸福', '关系', '职业', '学历', '年收入（万）', '年支出（万）', '经济环境'];
    const rows = (card.states || []).map((s) => [
      s.age, s.wealth, s.health, s.happiness, s.relationship,
      s.career, s.education, s.income, s.expense, s.economy,
    ]);
    const esc = (v) => {
      const x = v == null ? '' : String(v);
      return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
    };
    const csv = '\uFEFF' + [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
    downloadText('lifesim-' + card.id + '.csv', csv, 'text/csv;charset=utf-8');
    LS.ui.toast('已导出逐年记录的 CSV', 'fate');
  }

  function strategyKey(s) {
    if (!s) return '';
    return Object.keys(s).sort().map((k) => k + ':' + U.fixed(s[k], 2)).join('|');
  }

  LS.router.register('/result', renderResult);
  LS.views.result = { render: renderResult, strategyKey, wealthScore };
})(typeof globalThis !== 'undefined' ? globalThis : this);
