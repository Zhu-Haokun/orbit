/* ============================================================
 * LifeSim · views/codex.js
 * 概率图鉴（规格书 §29）
 *
 * 三个标签页：概率概念 / 事件图鉴 / 成就
 * 图鉴的解锁条件是"你真正看过它"，而不是"你点了它"。
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const V = LS.views;
  const { h, mount } = LS.dom;
  const U = LS.util;
  const C = LS.config;

  const TABS = [
    { value: 'concept', label: '📖 概率概念' },
    { value: 'event', label: '✦ 事件图鉴' },
    { value: 'ach', label: '🏆 成就' },
  ];

  const EVENT_NOTE = {
    first_job: '求职是一个几何分布过程：每次面试成功概率越低，需要投的简历越多。',
    graduation: '学历不是终点而是收入的乘数 —— 它把整条收入分布向右推。',
    marriage: '关系事件同时影响幸福与支出结构。',
    child: '生育会显著提高支出、降低短期可支配收入，但提升长期关系与幸福。',
    retirement: '退休后收入骤降，但支出与压力也下降。',
    startup: '创业是典型的厚尾赌注：投入确定，收益分布极不对称。',
    startup_success: '初创成功是罕见事件，一旦发生会改变整个量级。',
    high_offer: '高薪机会是收入乘数的跳变，直接影响后续所有年份。',
    investment_chance: '投资机会的收益来自对数正态分布 —— 中位数远低于均值。',
    career_change: '转行会重置收入乘数，但可能带来更高的职业资本增速。',
    overseas: '海外发展提高收入上限，同时提高关系与健康的波动。',
    layoff: '失业是最典型的左尾事件：它同时打击收入、幸福与健康。',
    health_issue: '健康冲击是不可逆的资产减值，且会通过寿命放大影响。',
    market_crash: '系统性风险：所有资产同时下跌，分散化在此时失效。',
    industry_decline: '行业衰退是慢性的，它的伤害在于持续多年。',
    extreme_success: '极端成功需要运气与选择同时到位，概率极低但影响极大。',
    catastrophe: '重大冲击是模型的"压力测试"，用来暴露脆弱性。',
    windfall: '意外之财是纯粹的随机注入，与你的策略无关。',
    bankruptcy: '破产是吸收壁：一旦触及，后续所有复利都从零开始。',
    death: '死亡是模型的终止条件，它本身也是一次概率抽样。',
  };

  function renderCodex() {
    let tab = 'concept';
    const elBody = h('div');

    function unlockedCount() {
      return Object.keys(LS.store.state.codexSeen || {}).filter((k) => k.startsWith('concept:')).length;
    }

    function rebuild() {
      mount(elBody, [body()]);
      LS.shell.refreshBadges();
    }

    function body() {
      if (tab === 'concept') return conceptTab();
      if (tab === 'event') return eventTab();
      return achTab();
    }

    /* ---------------- 概念 ---------------- */
    function conceptTab() {
      const all = LS.knowledge.list();
      const seen = LS.store.state.codexSeen || {};
      const p = LS.knowledge.relevant(null);
      return h('div', [
        LS.ui.card({
          title: '概率概念图鉴',
          sub: '每个概念都有三层解释：直觉比喻 → 数学定义 → 简化解释',
          body: [
            h('div.row.between.wrap', { style: { marginBottom: 'var(--s-4)' } }, [
              h('div', { style: { flex: '1', minWidth: '220px' } }, [
                h('div.row.between', { style: { marginBottom: '6px' } }, [
                  h('span', { style: { fontSize: 'var(--f-sm)', color: 'var(--t-3)' } }, '解锁进度'),
                  h('b', { style: { fontFamily: 'var(--font-mono)' } },
                    unlockedCount() + ' / ' + all.length),
                ]),
                LS.ui.progressBar(unlockedCount() / all.length, { tone: 'know', thick: true }),
              ]),
              h('div.row.gap-2.wrap', [
                LS.ui.button('解锁全部（仅供浏览）', {
                  variant: 'ghost', size: 'sm',
                  onClick: () => {
                    for (const c of all) LS.store.seeCodex('concept:' + c.id);
                    LS.ui.toast('已标记全部概念为已读', 'fate');
                    rebuild();
                  },
                }),
              ]),
            ]),
            LS.ui.notice('术语第一次出现在正文里时，可以直接点击查看解释 —— 不需要离开当前页面。', 'know'),
          ],
        }),
        h('div', { style: { height: 'var(--s-5)' } }),
        h('div.codex-grid', all.map((c) => {
          const got = !!seen['concept:' + c.id];
          return h('div.codex-item' + (got ? '' : '.locked'), {
            onclick: () => { LS.store.seeCodex('concept:' + c.id); LS.knowledge.explain(c.id); rebuild(); },
          }, [
            h('div.row.gap-2', [
              h('span', { style: { fontSize: '20px' } }, c.ico),
              h('div', [
                h('div.ci-name', c.name),
                h('div.ci-bind', got ? '已解锁' : '未查看'),
              ]),
              got ? LS.ui.chip('✓', 'ok') : LS.ui.chip('未读', 'ghost'),
            ]),
            h('div', {
              style: { fontSize: 'var(--f-xs)', color: 'var(--t-3)', lineHeight: '1.6', marginTop: 'var(--s-3)' },
            }, c.metaphor.slice(0, 68) + (c.metaphor.length > 68 ? '…' : '')),
          ]);
        })),
        h('div', { style: { height: 'var(--s-4)' } }),
        LS.ui.card({
          title: '推荐从这里开始',
          sub: '如果只想理解三件事，就理解这三个',
          body: h('div.grid.g-3', p.slice(0, 3).map((id) => LS.knowledge.card(id, { compact: true }))),
        }),
      ]);
    }

    /* ---------------- 事件 ---------------- */
    function eventTab() {
      const sim = new LS.life.Simulator({
        character: LS.store.state.character || LS.character.makeCharacter(new LS.rng.Rng(1), {}),
        strategy: LS.store.state.strategy || LS.character.defaultStrategy(),
        worldSeed: 20240101, agentSeed: 20240101,
        worldConfig: C.makeWorldConfig('standard'),
        mode: 'codex',
      });
      const groups = {};
      for (const ev of LS.events.EVENTS) {
        (groups[ev.category] = groups[ev.category] || []).push(ev);
      }
      const catLabel = { lifecycle: '人生节点', opportunity: '机会', risk: '风险', rare: '稀有' };

      function previewFor(ev) {
        const ctx = sim.context();
        ctx.age = Math.max(ev.minAge || 22, 30);
        ctx.flags.gotFirstJob = true;
        ctx.flags.graduated = true;
        if (ctx.age >= 26) ctx.career = 'junior';
        if (ctx.age >= 32) { ctx.career = 'senior'; ctx.careerCapital = 24; }
        ctx.income = 14;
        try {
          return LS.events.evaluate(ev, ctx, { next: () => 0.5 });
        } catch (e) {
          return { p: NaN, base: NaN, factors: [] };
        }
      }

      return h('div', [
        LS.ui.card({
          title: '随机事件图鉴',
          sub: `共 ${LS.events.EVENTS.length} 个事件 · 概率为"典型 30 岁"下的基准值，会随你的策略与状态变化`,
          body: [
            LS.ui.notice([
              '每个事件的概率都是可拆解的：',
              h('b', '最终概率 = 基础概率 + Σ 各项修正'),
              '。这也是软件里所有概率条都能"加得起来"的原因。',
            ], 'know'),
          ],
        }),
        h('div', { style: { height: 'var(--s-5)' } }),
        ...Object.entries(groups).map(([cat, list]) => {
          const cards = list.map((ev) => {
            const r = previewFor(ev);
            return LS.ui.card({
              className: 'event-codex-card',
              title: (ev.icon || '') + ' ' + ev.title,
              sub: (ev.major ? '重大事件 · ' : '') + (ev.minAge ? ev.minAge + '–' + (ev.maxAge || '∞') + ' 岁' : '全年段'),
              body: [
                h('div', { style: { marginBottom: 'var(--s-3)' } },
                  h('div.prob-bar', [
                    h('div.track', h('i', { style: { width: U.clamp01(r.p) * 100 + '%' } })),
                    h('span', {
                      style: { fontFamily: 'var(--font-mono)', fontWeight: '700', minWidth: '56px', textAlign: 'right' },
                    }, U.pct(r.p, 2)),
                  ])),
                EVENT_NOTE[ev.id] ? h('p', {
                  style: { fontSize: 'var(--f-sm)', color: 'var(--t-2)', lineHeight: '1.65' },
                }, EVENT_NOTE[ev.id]) : null,
                h('div.factor-list', [
                  h('div.factor-row', [h('span.f-name', '基础概率'), h('span.f-val', U.pct(r.base, 2))]),
                  ...(r.factors || []).slice(0, 3).map((f) => h('div.factor-row', [
                    h('span.f-name', f.label),
                    h('span.f-val' + (f.delta >= 0 ? '.pos' : '.neg'), U.signedPct(f.delta, 2)),
                  ])),
                ]),
              ],
            });
          });
          return h('div', [
            V.section(catLabel[cat] || cat, `${list.length} 个事件`),
            h('div.grid.g-3', cards),
            h('div', { style: { height: 'var(--s-6)' } }),
          ]);
        }),
      ]);
    }

    /* ---------------- 成就 ---------------- */
    function achTab() {
      const tiers = LS.meta.byTier();
      const p = LS.meta.progress();
      const order = ['bronze', 'silver', 'gold', 'myth'];
      return h('div', [
        LS.ui.card({
          title: '成就进度',
          sub: '成就描述的是"你观察到了什么"，而不是"你点了多少下"',
          body: [
            h('div.row.between', { style: { marginBottom: '8px' } }, [
              h('span', { style: { fontSize: 'var(--f-sm)', color: 'var(--t-3)' } }, '总进度'),
              h('b', { style: { fontFamily: 'var(--font-mono)' } }, p.done + ' / ' + p.total),
            ]),
            LS.ui.progressBar(p.percent, { tone: 'fate', thick: true }),
          ],
        }),
        h('div', { style: { height: 'var(--s-5)' } }),
        ...order.filter((t) => tiers[t]).map((t) => h('div', [
          V.section(LS.meta.TIER_META[t].label + '成就',
            tiers[t].filter((a) => a.got).length + ' / ' + tiers[t].length),
          h('div.ach-grid', tiers[t].map((a) =>
            h('div.ach-item' + (a.got ? '.done' : ''), [
              h('span.ai-ico', a.got ? a.icon : '🔒'),
              h('div', [
                h('div.ai-name', a.name),
                h('div.ai-desc', a.got ? a.desc : '尚未解锁'),
              ]),
              a.got && a.gotAt ? h('div', {
                style: { fontSize: '10px', color: 'var(--t-4)', marginTop: '4px', fontFamily: 'var(--font-mono)' },
              }, new Date(a.gotAt).toLocaleDateString('zh-CN')) : null,
            ]))),
          h('div', { style: { height: 'var(--s-5)' } }),
        ])),
      ]);
    }

    const page = V.render({ title: '概率图鉴', sub: '概念 · 事件 · 成就', fate: null }, [
      V.head({
        kicker: '图鉴',
        title: '把概率论变成可以收藏的东西',
        sub: '这里的每一条都对应软件里真实存在的模型。看懂它们，你就看懂了这个软件在算什么。',
        tight: true,
        actions: [LS.ui.segmented(TABS, tab, (v) => { tab = v; rebuild(); })],
      }),
      elBody,
    ]);

    rebuild();
    return page;
  }

  LS.views.codex = { render: renderCodex };
  LS.router.register('/codex', renderCodex);
})(typeof globalThis !== 'undefined' ? globalThis : this);
