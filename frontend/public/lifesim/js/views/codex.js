/* ============================================================
 * LifeSim · views/codex.js
 * 人生图鉴（事件 / 成就）
 *
 * 两个标签页：事件图鉴 / 成就
 * 这里不收概率概念；概率只在“看细节”里露出一点。
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const V = LS.views;
  const { h, mount } = LS.dom;
  const U = LS.util;
  const C = LS.config;

  const TABS = [
    { value: 'event', label: '✦ 事件图鉴' },
    { value: 'ach', label: '🏆 成就' },
  ];

  const EVENT_NOTE = {
    first_job: '第一份工作往往决定了起点，但不太决定终点。',
    graduation: '学历会把第一份工作的起点往上推一点，之后要看你怎么走。',
    marriage: '结婚是两个人的事，也是两张账单的事。',
    child: '养孩子会明显改变接下来二十年的现金流和作息。',
    child_school: '孩子上学后，家里的时间表和账单都会变。',
    buy_house: '买房是把很多年的现金流，换成一把钥匙。',
    promotion: '升职是好事，也意味着更多责任和更少的觉。',
    parent_illness: '父母老去，是很多人中年第一次真正被叫醒。',
    divorce: '有些关系走到这里，分开是两个人的决定。',
    accident: '意外不会提前打招呼。',
    scam: '骗局通常看起来像机会。',
    burnout: '身体有时会先于意识发出警告。',
    retirement: '收入会降一截，时间会多一截。',
    startup: '创业是把稳定的工资换成一个结果差得很远的赌注。',
    startup_success: '少数人真的做成了，但别把幸存者当成平均值。',
    high_offer: '有时候，一次跳槽比十年省吃俭用更管用。',
    investment_chance: '投资机会看起来像机会，也可能像账单。',
    career_change: '转行会归零一部分积累，也可能打开另一条路。',
    overseas: '去更远的地方，收入和孤独一起变高。',
    layoff: '被裁不是你的错，但现金流会先疼一下。',
    health_issue: '身体出问题的时候，其他事情都会变小。',
    market_crash: '市场一起跌的时候，分散也救不了所有人。',
    industry_decline: '行业下行是慢慢发生的，等感觉到时通常已经晚了。',
    extreme_success: '极少数人会被时代选中。看看就好，别把它当计划。',
    catastrophe: '有些意外没有道理可讲，只能提前留一点缓冲。',
    windfall: '天上掉下来的钱，和你的努力关系不大。',
    bankruptcy: '债务重组不是终点，但从零开始很疼。',
    death: '死亡不是随机停止键。模型会按年龄、健康和发生过的事，给出一个具体原因。',
    old_friend: '有些朋友几年不联系，坐下来还是能聊很久。',
    stray_cat: '有些日子是被一只猫救回来的。',
    late_bloom: '有些人前半生普通，后半生才慢慢开花。',
    side_hustle: '副业不一定让你发财，但可能让你多一条退路。',
  };

  function renderCodex() {
    let tab = 'event';
    const elBody = h('div');

    function rebuild() {
      mount(elBody, [body()]);
      LS.shell.refreshBadges();
    }

    function body() {
      if (tab === 'event') return eventTab();
      return achTab();
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
          title: '你可能会遇到的事',
          sub: `共 ${LS.events.EVENTS.length} 个事件 · 年龄是大致范围 · 出现的可能性只是参考，会随你的性格和选择变化`,
          body: [
            LS.ui.notice('这里收藏的是故事，不是术语。想较真的时候，再点开“看细节”。', 'know'),
          ],
        }),
        h('div', { style: { height: 'var(--s-5)' } }),
        ...Object.entries(groups).map(([cat, list]) => {
          const cards = list.map((ev) => {
            const r = previewFor(ev);
            return LS.ui.card({
              className: 'event-codex-card',
              title: (ev.icon || '') + ' ' + ev.title,
              sub: (ev.major ? '重要的事 · ' : '') + (ev.minAge ? ev.minAge + '–' + (ev.maxAge || '∞') + ' 岁' : '全年段'),
              body: [
                EVENT_NOTE[ev.id] ? h('p', {
                  style: { fontSize: 'var(--f-sm)', color: 'var(--t-2)', lineHeight: '1.65', marginBottom: 'var(--s-3)' },
                }, EVENT_NOTE[ev.id]) : h('p', {
                  style: { fontSize: 'var(--f-sm)', color: 'var(--t-2)', lineHeight: '1.65', marginBottom: 'var(--s-3)' },
                }, '它可能在你人生的某个普通年份里出现。'),
                h('div.row.between', { style: { marginBottom: '6px' } }, [
                  h('span', { style: { fontSize: 'var(--f-xs)', color: 'var(--t-3)' } }, '出现的可能性'),
                  h('span', { style: { fontFamily: 'var(--font-mono)', fontWeight: '700' } }, U.pct(r.p, 1)),
                ]),
                h('div.prob-bar', h('div.track', h('i', { style: { width: U.clamp01(r.p) * 100 + '%' } }))),
                h('details', { style: { marginTop: 'var(--s-3)' } }, [
                  h('summary', {
                    style: { cursor: 'pointer', fontSize: 'var(--f-xs)', color: 'var(--t-3)' },
                  }, '这个数字怎么来的'),
                  h('div.factor-list', [
                    h('div.factor-row', [h('span.f-name', '基础可能性'), h('span.f-val', U.pct(r.base, 2))]),
                    ...(r.factors || []).slice(0, 3).map((f) => h('div.factor-row', [
                      h('span.f-name', f.label),
                      h('span.f-val' + (f.delta >= 0 ? '.pos' : '.neg'), U.signedPct(f.delta, 2)),
                    ])),
                  ]),
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
          sub: '你活成了什么样子，就会点亮什么',
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

    const page = V.render({ title: '人生图鉴', sub: '事件 · 成就', fate: null }, [
      V.head({
        kicker: '收藏',
        title: '你遇到过的事，和你活成的样子',
        sub: '这里不收术语，只收故事。有些事件要真的遇到，才会亮起来。',
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
