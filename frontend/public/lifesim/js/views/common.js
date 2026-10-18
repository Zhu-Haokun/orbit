/* ============================================================
 * LifeSim · views/common.js
 * 页面公共构件：挂载、区块、指标网格、空状态、人生卡
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const { h, mount } = LS.dom;
  const U = LS.util;

  /* ============================================================
   * 挂载：切换页面时统一销毁上一个页面的图表，避免 rAF 泄漏
   * ========================================================== */
  function render(meta, children) {
    if (LS.charts && LS.charts.destroyAll) LS.charts.destroyAll();
    if (LS.views && LS.views._cleanup) { LS.views._cleanup(); LS.views._cleanup = null; }
    const vp = LS.shell.viewport;
    if (!vp) return null;
    const page = h('div.page.page-enter', children.filter(Boolean));
    mount(vp, [page]);
    if (meta) {
      LS.shell.setTitle(meta.title, meta.sub);
      LS.shell.setActive(meta.path || (LS.router.current && LS.router.current.path) || '/');
      if (meta.fate !== undefined) {
        if (meta.fate) LS.shell.setFateBadge(meta.fate.seed, meta.fate.locked);
        else LS.shell.setFate(null);
      }
    }
    LS.shell.refreshBadges();
    return page;
  }

  /* ============================================================
   * 通用排版构件：规范定义在 ui/components.js，这里只做别名，
   * 让页面既能写 V.section(...) 也能写 LS.ui.section(...)。
   * ========================================================== */
  const { head, section, metricGrid, defRow, defList } = LS.ui;

  /* ============================================================
   * 语义色工具
   * ========================================================== */
  function scoreTone(v, good = 75, mid = 55) {
    return v >= good ? 'ok' : v >= mid ? 'warn' : 'bad';
  }

  function wealthTone(v) {
    if (v < 0) return 'bad';
    if (v < 50) return 'warn';
    if (v >= 1000) return 'gold';
    return 'ok';
  }

  function pctTone(p, invert) {
    const v = invert ? 1 - p : p;
    return v >= 0.7 ? 'ok' : v >= 0.4 ? 'warn' : 'bad';
  }

  /* ============================================================
   * 人生卡（档案页 / 首页最近人生）
   * ========================================================== */
  function lifeCard(life, opts = {}) {
    const r = life.result || {};
    const mini = h('div', { style: { height: '34px', marginTop: '2px' } });
    const card = h('div.life-card' + (opts.active ? '.active' : ''), {
      onclick: opts.onClick,
    }, [
      h('div.row.between', [
        h('div.row.gap-2', [
          LS.ui.chip((life.character && life.character.traitLabels || []).join(' · ') || '普通人', 'ghost'),
        ]),
        h('span', { style: { fontSize: 'var(--f-xxs)', color: 'var(--t-4)', fontFamily: 'var(--font-mono)' } },
          '#' + life.worldSeed),
      ]),
      h('div.lc-title', LS.config.CAREER_LABEL[r.finalCareer] || '一生'),
      h('div.lc-sub', `${r.lifespan || '—'} 岁 · ${r.educationLabel || ''}`),
      mini,
      h('div.row.between', { style: { marginTop: '8px' } }, [
        h('div.lc-num' + (r.finalWealth < 0 ? '.bad' : ''), U.money(r.finalWealth)),
        h('div.row.gap-1', [
          LS.ui.chip('健康 ' + U.fixed(r.health, 0), scoreTone(r.health)),
          LS.ui.chip('幸福 ' + U.fixed(r.happiness, 0), scoreTone(r.happiness, 70, 50)),
        ]),
      ]),
    ]);
    requestAnimationFrame(() => {
      try {
        LS.charts.create('timeseries', mini, {
          ages: (life.states || []).map((s) => s.age),
          series: [{
            key: 'wealth', label: '财富', color: LS.charts.theme().fate,
            values: (life.states || []).map((s) => s.wealth), fill: true,
          }],
          animate: true, duration: 620,
          pad: { t: 4, r: 2, b: 2, l: 2 },
          glow: false,
        });
      } catch (e) { /* 迷你图失败不影响卡片 */ }
    });
    return card;
  }

  /* ============================================================
   * 事件流条目（运行页 / 结果页共用）
   * ========================================================== */
  const CATEGORY_TONE = {
    lifecycle: 'ghost', opportunity: 'know', risk: 'warn', rare: 'fate',
  };
  const CATEGORY_LABEL = {
    lifecycle: '人生节点', opportunity: '机会', risk: '风险', rare: '稀有',
  };

  function eventRow(ev, opts = {}) {
    const tone = CATEGORY_TONE[ev.category] || 'ghost';
    const row = h('div.event-row' + (ev.major ? '.major' : ''), {
      onclick: opts.onClick,
    }, [
      h('div.er-age', U.fixed(ev.age, 0)),
      h('div.er-ico', ev.icon || '◆'),
      h('div.er-body', [
        h('div.er-title', [
          h('span', ev.title),
          LS.ui.chip(CATEGORY_LABEL[ev.category] || '', tone),
        ]),
        ev.narrative ? h('div.er-sub', ev.narrative) : null,
      ]),
      ev.probability != null
        ? h('div.er-p', [
          h('span.pv', U.pct(ev.probability, 1)),
          h('span.pl', '发生概率'),
        ])
        : null,
    ]);
    return row;
  }

  /* ============================================================
   * 骨架 / 加载
   * ========================================================== */
  function skeleton(rows = 3, height = 84) {
    return h('div.col.gap-3', Array.from({ length: rows }, () =>
      h('div.skeleton', { style: { height: height + 'px' } })));
  }

  /** 空状态：符合规格书 §38.2 的文案要求（解释"为什么空"+下一步） */
  function needRun(opts = {}) {
    const last = LS.store.state.lives[0];
    return LS.ui.emptyState({
      icon: opts.icon || '🎲',
      title: opts.title || '还没有可以展示的数据',
      desc: opts.desc || '先运行一次人生或一次批量模拟，这里就会自动填充真实数据。',
      action: h('div.row.gap-3', { style: { marginTop: 'var(--s-3)' } }, [
        LS.ui.button('生成我的一生', {
          variant: 'primary', onClick: () => LS.router.go('/create'),
        }),
        last ? LS.ui.button('打开最近的一生', {
          variant: 'ghost',
          onClick: () => { LS.store.state.currentLifeId = last.id; LS.router.go('/result'); },
        }) : null,
        LS.ui.button('重演 1,000 次', {
          variant: 'ghost', onClick: () => LS.router.go('/universe'),
        }),
      ]),
    });
  }

  /* ============================================================
   * 数值解释（"为什么会这样？"入口，规格书 §30.4）
   * ========================================================== */
  function whyButton(conceptId, label) {
    return LS.ui.button(label || '为什么会这样？', {
      variant: 'ghost', size: 'sm',
      onClick: () => LS.knowledge.explain(conceptId),
    });
  }

  /** 把一组数字渲染成"分位数条" */
  function quantileBar(percentiles, opts = {}) {
    const fmt = opts.fmt || U.money;
    const keys = ['p05', 'p25', 'p50', 'p75', 'p95'];
    const labels = { p05: 'P05', p25: 'P25', p50: '中位', p75: 'P75', p95: 'P95' };
    return h('div.col.gap-2', keys.map((k) =>
      h('div.qb-row', [
        h('span.qb-label', labels[k]),
        h('div.qb-track', [
          h('i', { style: { width: (100 - [5, 25, 50, 75, 95][keys.indexOf(k)]) + '%' } }),
        ]),
        h('span.qb-val', fmt(percentiles[k])),
      ])));
  }

  LS.views = LS.views || {};
  Object.assign(LS.views, {
    render, head, section, metricGrid, defRow, defList,
    scoreTone, wealthTone, pctTone,
    lifeCard, eventRow, CATEGORY_TONE, CATEGORY_LABEL,
    skeleton, needRun, whyButton, quantileBar,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
