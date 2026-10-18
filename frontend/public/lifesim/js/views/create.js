/* ============================================================
 * LifeSim · views/create.js
 * 人生创建器（规格书 §8）
 *
 * 布局：300px 角色 | 1fr 策略 | 340px 世界
 * 交互核心：任何一次调整都要立刻在右侧/下方看到"概率数字变了"。
 * 因为规格书 §8.1 的要求是 —— 让用户理解「滑块不是命令，是倾向」。
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const V = LS.views;
  const { h, mount } = LS.dom;
  const U = LS.util;
  const CH = LS.character;
  const C = LS.config;

  /* ---------- 天赋点 ---------- */
  const TALENT_POOL = 10;
  const TALENT_DEFS = [
    { key: 'learn', label: '学习天赋', icon: '🧠', unit: '点', desc: '每点 +3 学习能力（影响收入成长与教育上限）' },
    { key: 'body', label: '身体素质', icon: '💪', unit: '点', desc: '每点 +3 健康基线（影响寿命与抗病能力）' },
    { key: 'seed', label: '起步资源', icon: '💰', unit: '点', desc: '每点 +0.9 万初始资产（影响早期投资本金）' },
  ];

  /** 页面级草稿状态（不落盘，直到点击"生成我的一生"） */
  let draft = null;

  function newDraft(mode) {
    const seed = Math.floor(Math.random() * 900000) + 100000;
    const ch = CH.makeCharacter(new LS.rng.Rng(seed), {});
    const d = {
      mode: mode || 'fast',
      worldSeed: (Math.floor(Math.random() * 899999) + 100000) >>> 0,
      lockWorldSeed: false,
      worldPreset: 'standard',
      worldOverrides: {},
      character: ch,
      strategy: CH.strategyFromPreset('balanced'),
      preset: 'balanced',
      talents: { learn: 3, body: 4, seed: 3 },
      traits: (ch.traits || []).slice(0, 2),
      previewAge: 30,
    };
    applyTalents(d);
    return d;
  }

  /** 随机抽一个键（尽量避开当前值，保证点一次就能看出变化） */
  function pickKey(obj, current) {
    const keys = Object.keys(obj).filter((k) => k !== current);
    if (!keys.length) return current;
    return keys[Math.floor(Math.random() * keys.length)];
  }

  /** 随机天赋：三点保底，其余随机；尽量和上一次不同 */
  function randomTalents(previous) {
    const t = { learn: 1, body: 1, seed: 1 };
    const keys = ['learn', 'body', 'seed'];
    for (let i = 0; i < TALENT_POOL - 3; i++) {
      t[keys[Math.floor(Math.random() * keys.length)]]++;
    }
    if (previous && t.learn === previous.learn && t.body === previous.body && t.seed === previous.seed) {
      const from = keys.slice().sort((a, b) => t[b] - t[a])[0];
      const to = keys.find((k) => k !== from);
      t[from]--;
      t[to]++;
    }
    return t;
  }

  /**
   * 全部随机：角色、天赋、策略、世界一起换。
   * 首页"随机来一局"和设计页"全部随机"共用。
   */
  function randomDraft(mode, previous) {
    const d = newDraft(mode);

    // 策略：预设里随机一个，且避开当前值
    const currentPreset = (previous && previous.preset) || d.preset;
    const presetKey = pickKey(C.STRATEGY_PRESETS, currentPreset);
    d.preset = presetKey;
    d.strategy = CH.strategyFromPreset(presetKey);

    // 世界：标准 / 温和 / 动荡 / 黄金时代随机一个，且避开当前值
    const currentWorld = (previous && previous.worldPreset) || d.worldPreset;
    d.worldPreset = pickKey(C.WORLD_PRESETS, currentWorld);
    d.worldOverrides = {};

    // 天赋：10 点随机分给学习 / 身体 / 起步资源，三点保底
    d.talents = randomTalents((previous && previous.talents) || d.talents);
    applyTalents(d);
    d.traits = (d.character.traits || []).slice(0, 2);
    d.character.traits = d.traits.slice();
    d.character.traitLabels = d.traits.map((k) => (C.TRAITS.find((t) => t.key === k) || {}).label).filter(Boolean);
    return d;
  }

  /** 天赋点 → 角色数值 */
  function applyTalents(d) {
    const fam = C.FAMILY.find((f) => f.key === d.character.familyResource) || C.FAMILY[1];
    d.character.ability = Math.max(5, Math.min(100, Math.round(38 + fam.abilityBias + d.talents.learn * 3.2)));
    d.character.health = Math.max(20, Math.min(100, Math.round(58 + d.talents.body * 3.1)));
    d.character.initialWealth = +((fam.wealth[0] + fam.wealth[1]) / 2 + d.talents.seed * 0.9).toFixed(2);
    d.character.traits = d.traits.slice();
    d.character.traitLabels = d.traits.map((k) => (C.TRAITS.find((t) => t.key === k) || {}).label).filter(Boolean);
  }

  function talentUsed(d) {
    return d.talents.learn + d.talents.body + d.talents.seed;
  }

  /* ============================================================
   * 页面
   * ========================================================== */
  function renderCreate(route) {
    const mode = (route && route.query && route.query.mode) || 'fast';
    draft = newDraft(mode);

    const colChar = h('div.col.gap-4');
    const colStrategy = h('div.col.gap-4');
    const colWorld = h('div.col.gap-4');
    const previewBox = h('div');

    const grid = h('div.create-grid', [colChar, colStrategy, colWorld]);

    const page = V.render({
      title: '设计人生',
      sub: mode === 'key' ? '关键人生 · 你将在岔路口亲自决策' : '极速一生 · 自动推进，逐年观察',
    }, [
      V.head({
        kicker: '先捏一个人',
        title: '设计一个起点，然后让日子自己走',
        sub: '你调的不是结果，而是倾向。同样的性格和选择，在不同运气下会走出很不一样的人生。',
        actions: [
          LS.ui.button('全部随机', {
            variant: 'ghost',
            onClick: () => {
              draft = randomDraft(draft.mode, draft);
              rebuild();
              LS.ui.toast('角色、天赋、策略和世界都换了', 'fate');
            },
          }),
          LS.ui.button('重演 10,000 次', {
            variant: 'primary',
            onClick: () => commitAndGo('/universe'),
          }),
        ],
      }),
      grid,
      h('div', { style: { height: 'var(--s-5)' } }),
      previewBox,
    ]);

    /* ---------- 渲染各列 ---------- */
    function rebuild() {
      mount(colChar, [panelCharacter()]);
      mount(colStrategy, [panelStrategy()]);
      mount(colWorld, [panelWorld()]);
      mount(previewBox, [panelPreview()]);
      LS.shell.refreshBadges();
    }

    /* ============================================================
     * 左：角色
     * ========================================================== */
    function panelCharacter() {
      const ch = draft.character;
      const used = talentUsed(draft);
      const left = TALENT_POOL - used;

      return LS.ui.card({
        title: '① 角色',
        sub: '天注定的一部分',
        body: [
          h('div.desc-box', CH.describeCharacter(ch)),

          LS.ui.section('家庭背景', '决定初始资产与教育起点'),
          LS.ui.segmented(
            C.FAMILY.map((f) => ({ value: f.key, label: f.label })),
            ch.familyResource,
            (v) => { ch.familyResource = v; ch.familyLabel = (C.FAMILY.find((f) => f.key === v) || {}).label; applyTalents(draft); rebuild(); },
          ),
          h('div', { style: { height: 'var(--s-3)' } }),

          h('div.row.between', [
            LS.ui.chip('剩余天赋点 ' + left + ' / ' + TALENT_POOL, left > 0 ? 'warn' : 'ok'),
            h('span', { style: { fontSize: 'var(--f-xxs)', color: 'var(--t-4)' } }, '可以不用完'),
          ]),
          h('div.talent-list', TALENT_DEFS.map((t) => h('div.talent-row', [
            h('div.tr-head', [
              h('span.tr-ico', t.icon),
              h('div', [
                h('div.tr-label', t.label),
                h('div.tr-desc', t.desc),
              ]),
            ]),
            h('div.stepper', [
              LS.ui.button('−', {
                variant: 'ghost', size: 'xs',
                onClick: () => {
                  if (draft.talents[t.key] <= 0) return;
                  draft.talents[t.key]--; applyTalents(draft); rebuild();
                },
              }),
              h('span.st-val', String(draft.talents[t.key])),
              LS.ui.button('+', {
                variant: 'ghost', size: 'xs',
                onClick: () => {
                  if (talentUsed(draft) >= TALENT_POOL) { LS.audio.play('nope'); return; }
                  draft.talents[t.key]++; applyTalents(draft); rebuild();
                },
              }),
            ]),
          ]))),

          h('div.hr'),
          LS.ui.section('个性标签', '最多 2 个 · 影响一些事出现的可能'),
          h('div.trait-chips', C.TRAITS.map((t) => {
            const on = draft.traits.includes(t.key);
            return h('button.trait-chip' + (on ? '.on' : ''), {
              type: 'button', title: t.desc,
              onclick: () => {
                if (on) draft.traits = draft.traits.filter((k) => k !== t.key);
                else if (draft.traits.length < 2) draft.traits.push(t.key);
                else { LS.audio.play('nope'); LS.ui.toast('最多选择 2 个个性标签', 'warn'); return; }
                applyTalents(draft); rebuild();
              },
            }, [
              h('span.tc-label', t.label),
              h('span.tc-desc', t.desc),
            ]);
          })),

          h('div.hr'),
          LS.ui.defList([
            V.defRow('学习能力', String(ch.ability)),
            V.defRow('健康基线', String(ch.health)),
            V.defRow('初始资产', U.money(ch.initialWealth)),
            V.defRow('教育起点', LS.life.educationLabel(ch.educationSeed)),
          ]),
        ],
      });
    }

    /* ============================================================
     * 中：策略
     * ========================================================== */
    function panelStrategy() {
      const s = draft.strategy;
      const rp = CH.riskProfile(s);
      const eduInfo = LS.life.educationInfo(U.clamp01(0.42 + s.educationPreference * 0.5));
      const inv = CH.investParams(s.investmentRisk, C.WORLD_PRESETS[draft.worldPreset].marketVolatility);

      return LS.ui.card({
        title: '② 策略',
        sub: '六个维度 · 决定你在每个岔路口的倾向',
        body: [
          h('div.row.gap-2.wrap', { style: { marginBottom: 'var(--s-4)' } },
            Object.entries(C.STRATEGY_PRESETS).map(([key, p]) =>
              h('button.preset-chip' + (draft.preset === key ? '.on' : ''), {
                type: 'button',
                title: p.desc,
                onclick: () => {
                  draft.preset = key;
                  draft.strategy = CH.strategyFromPreset(key);
                  rebuild();
                },
              }, [h('span', p.icon), h('span', p.label)]))),

          h('div.slider-stack', C.STRATEGY_DIMS.map((d) =>
            LS.ui.slider({
              name: d.label, icon: d.icon, left: d.left, right: d.right,
              value: s[d.key],
              onChange: (v) => {
                draft.strategy[d.key] = v;
                draft.preset = null;
                updateStrategyOutputs();
              },
            }))),

          h('div.hr'),

          h('div.row.gap-3.wrap', { id: 'strategy-outputs' }, [
            h('div.risk-cell' + (rp.tone === 'ok' ? '.ok' : rp.tone === 'bad' ? '.bad' : ''), [
              h('div.rc-label', '风险画像'),
              h('div.rc-val', rp.label),
              LS.ui.progressBar(rp.score, { tone: rp.tone, thin: true }),
            ]),
            h('div.risk-cell', [
              h('div.rc-label', '预期学历'),
              h('div.rc-val', eduInfo.label),
            ]),
            h('div.risk-cell', [
              h('div.rc-label', '投资参数'),
              h('div.rc-val', 'μ ' + U.fixed(inv.mu * 100, 1) + '% / σ ' + U.fixed(inv.sigma * 100, 1) + '%'),
            ]),
          ]),
          h('div', { style: { height: 'var(--s-3)' } }),
          LS.ui.notice('滑块改变的是「倾向」，不是命令：把「职业风险」拉满，不代表你一定去创业，只是每个岔路口都更可能选择冒险。', 'know'),
        ],
      });

      function updateStrategyOutputs() {
        const rp2 = CH.riskProfile(draft.strategy);
        const inv2 = CH.investParams(draft.strategy.investmentRisk, C.WORLD_PRESETS[draft.worldPreset].marketVolatility);
        const edu2 = LS.life.educationInfo(U.clamp01(0.42 + draft.strategy.educationPreference * 0.5));
        const host = document.getElementById('strategy-outputs');
        if (!host) return;
        mount(host, [
          h('div.risk-cell' + (rp2.tone === 'ok' ? '.ok' : rp2.tone === 'bad' ? '.bad' : ''), [
            h('div.rc-label', '风险画像'),
            h('div.rc-val', rp2.label),
            LS.ui.progressBar(rp2.score, { tone: rp2.tone, thin: true }),
          ]),
          h('div.risk-cell', [h('div.rc-label', '预期学历'), h('div.rc-val', edu2.label)]),
          h('div.risk-cell', [
            h('div.rc-label', '投资参数'),
            h('div.rc-val', 'μ ' + U.fixed(inv2.mu * 100, 1) + '% / σ ' + U.fixed(inv2.sigma * 100, 1) + '%'),
          ]),
        ]);
        // 预览面板同步刷新（但不动输入焦点）
        updatePreview();
      }
    }

    /* ============================================================
     * 右：世界
     * ========================================================== */
    function panelWorld() {
      return LS.ui.card({
        title: '③ 世界环境',
        sub: '你无法选择的外部条件',
        body: [
          h('div.world-cards', Object.entries(C.WORLD_PRESETS).map(([key, p]) =>
            h('button.world-card' + (draft.worldPreset === key ? '.on' : ''), {
              type: 'button',
              onclick: () => { draft.worldPreset = key; rebuild(); },
            }, [
              h('div.wc-title', p.label),
              h('div.wc-desc', p.desc),
              h('div.wc-params', [
                wcParam('经济波动', p.economicVolatility),
                wcParam('就业稳定', p.laborStability),
                wcParam('市场波动', p.marketVolatility),
                wcParam('健康风险', p.healthRisk),
              ]),
            ]))),

          h('div.hr'),
          LS.ui.section('这次的世界编号', '同一个编号，就会遇到同一串事'),
          h('div.seed-row', [
            h('input.input', {
              type: 'number', value: String(draft.worldSeed), id: 'seed-input',
              oninput: (e) => { draft.worldSeed = Math.max(1, parseInt(e.target.value, 10) || 1); updatePreview(); },
            }),
            LS.ui.button('🎲', {
              variant: 'ghost', title: '换一个世界',
              onClick: () => {
                draft.worldSeed = (Math.floor(Math.random() * 899999) + 100000) >>> 0;
                const el = document.getElementById('seed-input');
                if (el) el.value = String(draft.worldSeed);
                updatePreview();
              },
            }),
          ]),
          h('div', { style: { marginTop: 'var(--s-3)' } },
            LS.ui.switchRow({
              name: '锁住这次的运气',
              desc: '所有平行人生遇到同一串事 —— 这样差别就只来自你的选择，而不是运气',
              checked: draft.lockWorldSeed,
              onChange: (v) => { draft.lockWorldSeed = v; updatePreview(); },
            })),

          h('div.hr'),
          LS.ui.section('年龄与状态', null),
          LS.ui.slider({
            name: '起始年龄', icon: '🎂', left: '18 岁', right: '40 岁',
            min: 18, max: 40, step: 1, value: draft.character.age,
            fmt: (v) => U.fixed(v, 0) + ' 岁',
            onChange: (v) => { draft.character.age = Math.round(v); updatePreview(); },
          }),

          h('div.hr'),
          h('div.cta-stack', [
            LS.ui.button('生成我的一生', {
              variant: 'primary', size: 'lg',
              onClick: () => commitAndGo(draft.mode === 'key' ? '/run' : '/run'),
            }),
            h('div.row.gap-2', [
              LS.ui.button('只跑 1,000 次看看', {
                variant: 'ghost',
                onClick: () => commitAndGo('/universe', { size: 1000 }),
              }),
              LS.ui.button('先看看默认活法的结果', {
                variant: 'ghost',
                onClick: () => { draft.strategy = CH.strategyFromPreset('balanced'); commitAndGo('/universe'); },
              }),
            ]),
          ]),
        ],
      });
    }

    function wcParam(label, v) {
      return h('div.wcp', [
        h('span.wcp-l', label),
        h('span.wcp-v', U.fixed(v, 2) + '×'),
      ]);
    }

    /* ============================================================
     * 下：概率预览（规格书 §8.5）
     * 这是整个页面最重要的教学装置：
     * 让用户在"还没运行"的时候就看见概率如何被策略推动。
     * ========================================================== */
    function panelPreview() {
      const ctx = previewCtx();
      return LS.ui.card({
        title: '④ 那时候，可能会遇到什么',
        sub: `${draft.previewAge} 岁时，这些事出现的可能性（会跟着你的性格和选择变）`,
        actions: [
          LS.ui.segmented(
            [20, 25, 30, 35, 45, 55].map((a) => ({ value: a, label: a + '岁' })),
            draft.previewAge,
            (v) => { draft.previewAge = v; rebuild(); },
          ),
        ],
        body: [h('div', { id: 'preview-body' }, previewBody(ctx))],
      });
    }

    function previewBody() {
      const ctx = previewCtx();
      const rows = [];
      const dummy = { next: () => 0.5 };
      for (const ev of LS.events.EVENTS) {
        if (ev.cond && !ev.cond(ctx)) continue;
        if (ev.minAge != null && ctx.age < ev.minAge) continue;
        if (ev.maxAge != null && ctx.age > ev.maxAge) continue;
        let r;
        try { r = LS.events.evaluate(ev, ctx, dummy); } catch (e) { continue; }
        rows.push({ ev, ...r });
      }
      rows.sort((a, b) => b.p - a.p);
      const top = rows.slice(0, 7);

      return h('div', [
        LS.ui.chartCard({
          title: null, minHeight: 240,
          onMount: (host) => {
            LS.charts.create('bar', host, {
              items: top.map((r) => ({
                label: r.ev.title,
                value: r.p,
                color: { lifecycle: '#93c5fd', opportunity: '#34d399', risk: '#fbbf24', rare: '#c084fc' }[r.ev.category],
                note: V.CATEGORY_LABEL[r.ev.category],
              })),
              max: Math.max(0.4, ...top.map((r) => r.p)) * 1.2,
              fmt: (v) => U.pct(v, 1),
              valueLabel: '出现的可能',
              pad: { t: 10, r: 60, b: 10, l: 116 },
              barHeight: 20,
            });
          },
        }),
        h('div', { style: { height: 'var(--s-3)' } }),
        LS.ui.notice([
          h('span', '想较真的时候，点开任意一项，看看这个数字怎么来的。'),
          h('br'),
          h('span', { style: { opacity: 0.8 } },
            `比如「极端成功」，基础只有 0.09%，加上你的选择后变成 ${
              U.pct((rows.find((r) => r.ev.id === 'extreme_success') || { p: 0 }).p, 3)}。`),
        ], 'know'),
        h('div', { style: { height: 'var(--s-3)' } }),
        h('div.row.gap-2.wrap', [
          LS.ui.button('这个数字怎么来的', {
            variant: 'ghost', size: 'sm',
            onClick: () => {
              const target = top[0];
              if (!target) return;
              LS.ui.modal({
                title: '这件事有多可能 · ' + target.ev.title,
                sub: '现在看起来是 ' + U.pct(target.p, 2),
                body: [LS.ui.eventCard({
                  id: target.ev.id, title: target.ev.title, icon: target.ev.icon,
                  age: ctx.age, probability: target.p, base: target.base,
                  factors: target.factors, randomDraw: null,
                  outcome: { narrative: target.ev.desc || '' },
                }), h('div', { style: { height: 'var(--s-3)' } }),
                LS.knowledge.card('conditional_probability', { defaultOpen: 0 })],
              });
            },
          }),
        ]),
      ]);
    }

    function updatePreview() {
      const host = document.getElementById('preview-body');
      if (host) mount(host, [previewBody()]);
    }

    /** 用真实 Simulator 的上下文，保证预览和实跑完全一致 */
    function previewCtx() {
      const worldConfig = C.makeWorldConfig(draft.worldPreset, draft.worldOverrides);
      const sim = new LS.life.Simulator({
        character: draft.character, strategy: draft.strategy,
        worldSeed: draft.worldSeed, agentSeed: draft.worldSeed,
        worldConfig, mode: 'preview',
      });
      const ctx = sim.context();
      ctx.age = draft.previewAge;
      ctx.flags.gotFirstJob = draft.previewAge >= 23;
      ctx.flags.graduated = draft.previewAge >= 22;
      if (draft.previewAge >= 26) ctx.career = 'junior';
      if (draft.previewAge >= 30) { ctx.career = 'senior'; ctx.careerCapital = 22; }
      if (draft.previewAge >= 38) { ctx.career = 'manager'; ctx.careerCapital = 42; }
      ctx.income = ctx.career === 'student' ? 0 : 12;
      return ctx;
    }

    /* ============================================================
     * 提交：写入 store 并跳转
     * ========================================================== */
    function commitAndGo(path, query) {
      if (LS.audio.isEnabled()) LS.audio.play('click');
      const st = LS.store.state;
      st.character = { ...draft.character, traits: draft.traits.slice() };
      st.strategy = { ...draft.strategy };
      st.worldPreset = draft.worldPreset;
      st.worldOverrides = { ...draft.worldOverrides };
      st.lastSeed = draft.worldSeed;
      st.lastLockWorldSeed = draft.lockWorldSeed;
      st.lastMode = draft.mode;
      LS.store.saveNow();
      LS.router.go(path, query);
    }

    rebuild();
    return page;
  }

  LS.router.register('/create', renderCreate);
  LS.views.create = { render: renderCreate, newDraft, randomDraft };
})(typeof globalThis !== 'undefined' ? globalThis : this);
