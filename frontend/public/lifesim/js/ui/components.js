/* ============================================================
 * LifeSim · ui/components.js
 * 复用组件（规格书 §54）
 *
 * 原则（规格书 §54）：
 *   图表组件只接收数据，不直接执行模拟；
 *   模拟服务只输出结构化结果；页面只负责组织状态与交互。
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const { h, mount } = LS.dom;
  const U = LS.util;

  /* ============================================================
   * 基础容器
   * ========================================================== */

  function card(opts = {}) {
    const {
      title, sub, actions, body, className = '', tight, roomy, solid,
      hoverable, glow, onClick, headExtra,
    } = opts;
    const cls = ['card'];
    if (tight) cls.push('tight');
    if (roomy) cls.push('roomy');
    if (solid) cls.push('solid');
    if (hoverable) cls.push('hoverable');
    if (glow) cls.push('glow-' + glow);
    if (className) cls.push(className);

    const kids = [];
    if (title || sub || actions || headExtra) {
      kids.push(h('div.card-head', [
        h('div', [
          title ? h('div.card-title', title) : null,
          sub ? h('div.card-sub', sub) : null,
          headExtra || null,
        ]),
        actions ? h('div.card-actions', actions) : null,
      ]));
    }
    if (body) kids.push(...(Array.isArray(body) ? body : [body]));
    return h('div.' + cls.join('.'), { onclick: onClick }, kids);
  }

  /** 图表卡：统一顶部结构（规格书 §50.2） */
  function chartCard(opts = {}) {
    const {
      title, sub, actions, footer, className = '', minHeight,
      onMount, chartId, body,
    } = opts;
    // body 允许外部把一个已存在的容器（用于后续 mount 图表）放进卡片
    const host = body || h('div.chart-body', {
      id: chartId,
      style: minHeight ? { minHeight: minHeight + 'px' } : null,
    });
    if (body && minHeight && !body.style.minHeight) body.style.minHeight = minHeight + 'px';
    const kids = [];
    if (title || sub || actions) {
      kids.push(h('div.card-head', { style: { marginBottom: '10px' } }, [
        h('div', [
          title ? h('div.card-title', { style: { fontSize: '16px' } }, title) : null,
          sub ? h('div.card-sub', sub) : null,
        ]),
        actions ? h('div.card-actions', actions) : null,
      ]));
    }
    kids.push(host);
    if (footer) kids.push(footer);
    const el = h('div.card.chart-card' + (className ? '.' + className : ''), kids);
    if (onMount) requestAnimationFrame(() => onMount(host));
    return el;
  }

  /* ============================================================
   * 数值展示（规格书 §50.1：数字 + 语义）
   * ========================================================== */

  function metric(opts = {}) {
    const { label, value, note, tone, size, className = '', onClick } = opts;
    const cls = ['metric'];
    if (size) cls.push(size);
    if (className) cls.push(className);
    return h('div.' + cls.join('.'), { onclick: onClick }, [
      h('div.m-label', label),
      h('div.m-value' + (tone ? '.v-' + tone : ''), value),
      note ? h('div.m-note', note) : null,
    ]);
  }

  function heroNum(value, opts = {}) {
    const { gold, className = '', style } = opts;
    return h('div.hero-num' + (gold ? '.gold' : '') + (className ? '.' + className : ''),
      { style }, value);
  }

  /* ============================================================
   * 交互控件
   * ========================================================== */

  function button(label, opts = {}) {
    const {
      variant = '', size = '', icon, onClick, disabled, className = '',
      title, id,
    } = opts;
    const cls = ['btn'];
    if (variant) cls.push(variant);
    if (size) cls.push(size);
    if (className) cls.push(className);
    const kids = [];
    if (icon) kids.push(h('span', icon));
    if (label) kids.push(h('span', label));
    return h('button.' + cls.join('.'), {
      onclick: onClick, disabled, title, id, type: 'button',
    }, kids);
  }

  function iconButton(icon, opts = {}) {
    const { onClick, on, title, id } = opts;
    return h('button.btn-icon' + (on ? '.on' : ''), {
      onclick: onClick, title, id, type: 'button',
    }, icon);
  }

  function segmented(options, value, onChange, opts = {}) {
    return h('div.segmented', { id: opts.id }, options.map((o) =>
      h('button' + (o.value === value ? '.on' : ''), {
        type: 'button',
        title: o.title,
        onclick: () => onChange(o.value),
      }, o.label)));
  }

  function chip(text, tone) {
    return h('span.chip' + (tone ? '.' + tone : ''), text);
  }

  function fateBadge(seed, locked) {
    return h('span.fate-badge' + (locked ? '.locked' : ''), [
      h('span.lock', locked ? '🔒' : '🎲'),
      h('span', '命运种子 #' + seed),
      locked ? h('span.chip.teal', { style: { height: '18px', padding: '0 7px' } }, '已锁定') : null,
    ]);
  }

  /**
   * 策略滑块（规格书 §8.3）。
   * 注意：滑块改变的是"行为概率"，不是确定命令（§8.4），
   * 所以右侧数值显示的是倾向百分比而不是绝对承诺。
   */
  function slider(opts = {}) {
    const {
      name, icon, left, right, hint, value = 0.5, onChange, id,
      min = 0, max = 1, step = 0.01, fmt,
    } = opts;
    const valEl = h('span.slider-val', fmt ? fmt(value) : Math.round(value * 100) + '%');
    const input = h('input', {
      type: 'range', min, max, step, value,
      id,
      oninput: (e) => {
        const v = parseFloat(e.target.value);
        valEl.textContent = fmt ? fmt(v) : Math.round(v * 100) + '%';
        e.target.style.setProperty('--pct', ((v - min) / (max - min) * 100) + '%');
        if (onChange) onChange(v);
      },
    });
    input.style.setProperty('--pct', ((value - min) / (max - min) * 100) + '%');
    const wrap = h('div.slider-row', [
      h('div.slider-head', [
        h('div.slider-name', [icon ? h('span.ico', icon) : null, h('span', name)]),
        valEl,
      ]),
      input,
      (left || right) ? h('div.slider-ends', [h('span', left || ''), h('span', right || '')]) : null,
      hint ? h('div', { style: { fontSize: 'var(--f-xxs)', color: 'var(--t-4)', lineHeight: '1.45' } }, hint) : null,
    ]);
    wrap._input = input;
    wrap._valEl = valEl;
    return wrap;
  }

  function switchRow(opts = {}) {
    const { name, desc, checked, onChange, id } = opts;
    const input = h('input', {
      type: 'checkbox', checked, id,
      onchange: (e) => onChange && onChange(e.target.checked),
    });
    return h('label.switch', { style: desc ? { width: '100%' } : null }, [
      input, h('span.track'),
      h('span', [
        h('span', name),
        desc ? h('div', { style: { fontSize: 'var(--f-xxs)', color: 'var(--t-4)' } }, desc) : null,
      ]),
    ]);
  }

  function progressBar(value, opts = {}) {
    const { tone = '', thin, thick, marker } = opts;
    const cls = ['bar'];
    if (tone) cls.push(tone);
    if (thin) cls.push('thin');
    if (thick) cls.push('thick');
    const inner = h('i', { style: { width: Math.max(0, Math.min(1, value)) * 100 + '%' } });
    const kids = [inner];
    if (marker != null) {
      kids.push(h('span.marker', {
        style: { left: Math.max(0, Math.min(1, marker)) * 100 + '%' },
      }));
    }
    return h('div.' + cls.join('.'), kids);
  }

  /** 百分位尺（规格书 §12.3） */
  function percentileScale(p) {
    const pct = Math.max(0, Math.min(1, p));
    return h('div.percentile-scale', [
      h('div.p-track'),
      h('span.p-star', { style: { left: pct * 100 + '%' }, title: '你的位置' }, '★'),
      h('div.p-ticks', [
        h('span', '0%'), h('span', '25%'), h('span', '50%'), h('span', '75%'), h('span', '100%'),
      ]),
    ]);
  }

  function legend(items, opts = {}) {
    return h('div.legend', { style: opts.style }, items.map((it) =>
      h('div.lg-item', [
        h('span.swatch' + (it.dash ? '.dash' : it.line ? '.line' : ''), {
          style: it.dash
            ? { color: it.color, borderTopColor: it.color }
            : { background: it.color },
        }),
        h('span', it.label),
      ])));
  }

  /* ============================================================
   * 反馈
   * ========================================================== */

  function notice(text, tone = '', opts = {}) {
    const icons = { know: '💡', warn: '⚠️', bad: '⛔', ok: '✓' };
    return h('div.notice' + (tone ? '.' + tone : ''), { style: opts.style }, [
      tone && icons[tone] ? h('span', icons[tone]) : null,
      h('div.grow', typeof text === 'string' ? text : text),
    ]);
  }

  function emptyState(opts = {}) {
    const { icon = '🌌', title, desc, action } = opts;
    return h('div.empty', [
      h('div.e-ico', icon),
      h('div.h3', title || '这里还是空的'),
      desc ? h('div', { style: { maxWidth: '46ch', lineHeight: '1.6' } }, desc) : null,
      action || null,
    ]);
  }

  function toast(text, tone = '', ms = 3200) {
    let host = document.getElementById('toast-host');
    if (!host) {
      host = h('div.toast-host', { id: 'toast-host' });
      document.body.appendChild(host);
    }
    const icons = { ok: '✓', warn: '⚠', bad: '✕', fate: '✨' };
    const el = h('div.toast' + (tone ? '.' + tone : ''), [
      tone && icons[tone] ? h('span', icons[tone]) : null,
      h('span', text),
    ]);
    host.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s, transform .3s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(() => el.remove(), 320);
    }, ms);
    return el;
  }

  /** 浮出 chip（规格书 §9.6：自动决策时短暂出现） */
  function floatChip(host, text, tone) {
    if (!host) return;
    const r = host.getBoundingClientRect();
    const el = h('div.float-chip' + (tone ? '.v-' + tone : ''), {
      style: {
        left: (60 + Math.random() * Math.max(20, r.width - 220)) + 'px',
        top: (30 + Math.random() * Math.max(10, r.height - 90)) + 'px',
      },
    }, text);
    host.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  /* ============================================================
   * 模态框
   * ========================================================== */

  function modal(opts = {}) {
    const { title, sub, body, actions, size = '', onClose } = opts;
    const inner = h('div.modal' + (size ? '.' + size : ''), [
      (title || actions) ? h('div.card-head', [
        h('div', [
          title ? h('div.card-title', title) : null,
          sub ? h('div.card-sub', sub) : null,
        ]),
        h('div.card-actions', [
          ...(actions || []),
          iconButton('✕', { onClick: close, title: '关闭' }),
        ]),
      ]) : null,
      ...(Array.isArray(body) ? body : [body]),
    ]);
    const back = h('div.modal-back', {
      onclick: (e) => { if (e.target === back) close(); },
    }, inner);

    function close() {
      back.style.opacity = '0';
      setTimeout(() => back.remove(), 200);
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    return { close, el: back, inner };
  }

  /* ============================================================
   * 表格
   * ========================================================== */

  /**
   * @param {string[]} headers
   * @param {Array<Array>} rows
   * @param {object} opts { highlight: (rowIdx,colIdx)=>'win'|'lose'|'' }
   */
  function table(headers, rows, opts = {}) {
    const thead = h('thead', h('tr', headers.map((t, i) =>
      h('th', { style: opts.align ? { textAlign: opts.align[i] } : null }, t))));
    const tbody = h('tbody', rows.map((r, ri) =>
      h('tr', r.map((c, ci) => {
        const cls = opts.highlight ? opts.highlight(ri, ci) : '';
        return h('td' + (cls ? '.' + cls : ''), c);
      }))));
    return h('table.tbl', [thead, tbody]);
  }

  /* ============================================================
   * 概率条（含随机数位置标记）
   * ========================================================== */

  function probBar(p, opts = {}) {
    const { showPct = true, marker = null, tone = 'fate', label } = opts;
    return h('div.prob-bar', [
      label ? h('span', { style: { fontSize: 'var(--f-xs)', color: 'var(--t-3)', flex: '0 0 auto' } }, label) : null,
      h('div.track', [
        h('i', { style: { width: (p * 100) + '%' } }),
        marker != null ? h('span.marker', { style: { left: (marker * 100) + '%' } }) : null,
      ]),
      showPct ? h('span', {
        style: { fontFamily: 'var(--font-mono)', fontWeight: '700', flex: '0 0 auto', minWidth: '52px', textAlign: 'right' },
      }, U.pct(p, 1)) : null,
    ]);
  }

  /* ============================================================
   * 随机事件卡（规格书 §9.4）
   * ========================================================== */

  function eventCard(ev, opts = {}) {
    const { compact = false } = opts;
    const o = ev.outcome || {};
    const kids = [
      h('div.ev-head', [
        h('div.ev-ico', ev.icon || '✦'),
        h('div.grow', [
          h('div.ev-title', ev.title),
          h('div.ev-meta', [
            ev.age != null ? ev.age + ' 岁' : '',
            ev.probability != null ? ' · P = ' + U.pct(ev.probability, 1) : '',
          ].join('')),
        ]),
      ]),
    ];

    if (ev.probability != null) {
      kids.push(probBar(ev.probability, { marker: ev.randomDraw }));
    }

    // 概率拆解（规格书 §23.2：UI 展示"贡献拆解"）
    if (ev.factors && ev.factors.length && !compact) {
      const rows = [];
      if (ev.base != null) {
        rows.push(h('div.factor-row', [
          h('span.f-name', '基础概率'),
          h('span.f-val', U.pct(ev.base, 1)),
        ]));
      }
      for (const f of ev.factors) {
        rows.push(h('div.factor-row', [
          h('span.f-name', f.label),
          h('span.f-val' + (f.delta >= 0 ? '.pos' : '.neg'), U.signedPct(f.delta, 1)),
        ]));
      }
      rows.push(h('div.factor-divider'));
      rows.push(h('div.factor-row', [
        h('span.f-name', { style: { fontWeight: '700', color: 'var(--t-1)' } }, '最终概率'),
        h('span.f-val', { style: { color: 'var(--c-fate)' } }, U.pct(ev.probability, 1)),
      ]));
      kids.push(h('div.factor-list', rows));
    }

    if (o.narrative) {
      kids.push(h('div', {
        style: { fontSize: 'var(--f-sm)', color: 'var(--t-2)', lineHeight: '1.6' },
      }, o.narrative));
    }
    if (o.detail && o.detail.length) {
      kids.push(h('div.factor-list', o.detail.map((d) =>
        h('div.factor-row', [h('span.f-name', d.label), h('span.f-val', d.value)]))));
    }
    if (ev.distribution) {
      kids.push(h('div.notice.know', [
        h('div', [
          h('div', { style: { fontWeight: '700', fontFamily: 'var(--font-mono)' } },
            ev.distribution.name || ev.distribution.latex),
          ev.distribution.meaning
            ? h('div', { style: { fontSize: 'var(--f-xs)', marginTop: '3px', opacity: '0.85' } },
              ev.distribution.meaning)
            : null,
        ]),
      ]));
    }
    return h('div.event-card' + (ev.major ? '.major' : ''), kids);
  }

  /* ============================================================
   * 模拟进度（规格书 §38.1）
   * ========================================================== */

  function simulationProgress() {
    const pct = h('div.sp-pct', '0%');
    const label = h('div', { style: { fontSize: '14px', color: 'var(--t-2)' } },
      '正在生成平行人生……');
    const bar = progressBar(0, { thick: true });
    const list = h('div.discovery-list');
    const el = h('div.sim-progress', [
      h('div.sp-head', [label, pct]),
      bar,
      list,
    ]);
    return {
      el,
      update(p) {
        pct.textContent = Math.round(p.percent * 100) + '%';
        bar.firstChild.style.width = (p.percent * 100) + '%';
        if (p.discoveries) {
          const d = p.discoveries;
          const rows = [
            ['已发现破产人生', U.int(d.bankrupt) + ' 次'],
            ['千万级财富样本', U.int(d.millionaires) + ' 个'],
            ['创业尝试', U.int(d.startupFailures) + ' 次'],
            ['经历经济危机的人生', U.int(d.crises) + ' 个'],
          ];
          mount(list, rows.map(([a, b]) =>
            h('div.d-row', [h('span', a), h('b', b)])));
        }
        const speed = p.elapsedMs > 0
          ? ' · 已用 ' + (p.elapsedMs / 1000).toFixed(1) + 's'
          : '';
        label.textContent = `正在生成 ${U.int(p.total)} 个平行人生……${speed}`;
      },
    };
  }

  /* ============================================================
   * 模式卡（首页三入口，规格书 §7.2）
   * ========================================================== */

  function modeCard(opts) {
    const { icon, title, desc, tag, hint, glow, line, onClick } = opts;
    const el = h('div.mode-card', { onclick: onClick }, [
      h('div.mc-ico', icon),
      h('div.mc-title', title),
      h('div.mc-desc', desc),
      h('div.mc-tag', tag),
      hint ? h('div.mc-hint', hint) : null,
    ]);
    /* CSS 自定义属性必须用 setProperty 设置：
       Object.assign(el.style, { '--x': v }) 对 kebab-case / 自定义属性是静默失效的，
       所以不能让 h() 的 style 对象来干这件事。 */
    el.style.setProperty('--mc-glow', glow || 'rgba(124,92,255,0.24)');
    el.style.setProperty('--mc-line', line || 'rgba(167,139,250,0.45)');
    return el;
  }

  /* ============================================================
   * 人生状态面板
   * ========================================================== */

  function careerChip(career) {
    const C = LS.config;
    const label = C.CAREER_LABEL[career] || career;
    const tone = {
      student: 'know', junior: '', senior: 'teal', manager: 'ok',
      unemployed: 'bad', freelance: '', entrepreneur: 'fate', retired: 'ghost',
    }[career] || '';
    return chip((C.CAREER_ICON[career] || '') + ' ' + label, tone);
  }

  /** 世界环境带（规格书 §43.2） */
  function economyChip(stateName) {
    const tone = { 繁荣: 'ok', 正常: 'know', 衰退: 'warn', 危机: 'bad' }[stateName] || '';
    return chip('经济 · ' + stateName, tone);
  }

  /** 世界状态序列条（结果页/运行页用） */
  function economyStrip(history, width) {
    if (!history || !history.length) return h('div');
    const colors = { 繁荣: '#34d399', 正常: '#60a5fa', 衰退: '#fbbf24', 危机: '#f87171' };
    const segs = [];
    let cur = history[0].label;
    let start = 0;
    for (let i = 1; i <= history.length; i++) {
      const lbl = i < history.length ? history[i].label : null;
      if (lbl !== cur || i === history.length) {
        segs.push({ label: cur, from: history[start].age, to: history[i - 1].age });
        cur = lbl;
        start = i;
      }
    }
    const a0 = history[0].age;
    const a1 = history[history.length - 1].age;
    const span = Math.max(1, a1 - a0);
    return h('div', [
      h('div', { style: { display: 'flex', height: '8px', borderRadius: '999px', overflow: 'hidden' } },
        segs.map((s) => h('div', {
          title: `${s.label}（${s.from}–${s.to} 岁）`,
          style: {
            width: ((s.to - s.from + 1) / span * 100) + '%',
            background: colors[s.label] || '#666',
            opacity: '0.65',
          },
        }))),
      h('div', {
        style: {
          display: 'flex', justifyContent: 'space-between',
          fontSize: 'var(--f-xxs)', color: 'var(--t-4)', marginTop: '4px',
        },
      }, [h('span', a0 + ' 岁'), h('span', a1 + ' 岁')]),
    ]);
  }

  /* ============================================================
   * 区块与排版构件
   * 这些既被页面直接使用（views.*），也属于通用组件库（ui.*），
   * 两个命名空间都暴露，避免调用点记错位置。
   * ========================================================== */

  /** 页面头部（标题 + 说明 + 右侧动作） */
  function head(opts) {
    const { kicker, title, sub, actions, tight } = opts;
    return h('div.row.between.wrap', {
      style: { gap: 'var(--s-4)', marginBottom: tight ? 'var(--s-4)' : 'var(--s-6)' },
    }, [
      h('div', [
        kicker ? h('div.eyebrow', { style: { marginBottom: '6px' } }, kicker) : null,
        h('h1.h2', title),
        sub ? h('div.lead', { style: { marginTop: '8px', maxWidth: '78ch' } }, sub) : null,
      ]),
      actions ? h('div.row.gap-2.wrap', actions) : null,
    ]);
  }

  /** 区块标题 */
  function section(title, sub, actions) {
    return h('div.section-title', [
      h('div', [
        h('div.st-title', title),
        sub ? h('div.st-sub', sub) : null,
      ]),
      actions ? h('div.row.gap-2', actions) : null,
    ]);
  }

  /** 指标网格 */
  function metricGrid(items, cols) {
    return h('div.grid' + (cols ? '.g-' + cols : '.g-4'), items.filter(Boolean));
  }

  /** 一行「标签 + 数值」 */
  function defRow(label, value, tone) {
    return h('div.def-row', [
      h('span.dr-label', label),
      h('span.dr-value' + (tone ? '.v-' + tone : ''), value),
    ]);
  }

  function defList(rows) {
    return h('div.def-list', rows.filter(Boolean));
  }

  LS.ui = {
    card, chartCard, metric, heroNum,
    button, iconButton, segmented, chip, fateBadge, slider, switchRow,
    progressBar, percentileScale, legend, notice, emptyState, toast, floatChip,
    modal, table, probBar, eventCard, simulationProgress, modeCard,
    careerChip, economyChip, economyStrip,
    head, section, metricGrid, defRow, defList,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
