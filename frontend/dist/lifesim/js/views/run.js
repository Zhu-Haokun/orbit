/* ============================================================
 * LifeSim · views/run.js
 * 人生运行页（规格书 §9）
 *
 * 这是全站最重要的"体验"页面，设计要点：
 *   · 逐年推进，让时间真的在走（§9.2 "年份推进动画"）
 *   · 事件出现时先给结论、再给理由（§9.4）
 *   · 概率透视默认关闭，用户主动打开才显示公式（§9.5）
 *   · 关键人生模式下在岔路口暂停，让用户做选择（§13.3）
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const V = LS.views;
  const { h, mount, append, $ } = LS.dom;
  const U = LS.util;
  const C = LS.config;

  /* ============================================================
   * 决策点定义（规格书 §13.3）
   *
   * 设计说明：引擎本身是"策略驱动"的，没有内置分支剧本。
   * 这里的选择通过**即时修改策略与状态**生效 ——
   * 也就是说，你的选择改变的是"之后所有年份的行为倾向"，
   * 而不是硬编码一个结局。这样选择的影响是真实传导的。
   * ========================================================== */
  const DECISIONS = [
    {
      id: 'grad_path', age: 22, icon: '🎓', title: '毕业了，然后呢？',
      q: '三条路都能走通，但它们的收益曲线形状完全不同。',
      options: [
        {
          id: 'work', label: '直接工作', tag: '现金流优先',
          desc: '立刻开始赚钱，职业资本稳步积累；收入起点低但来得早。',
          effect: (sim) => {
            sim.strategy.careerRisk = U.clamp01(sim.strategy.careerRisk - 0.12);
            sim.strategy.educationPreference = U.clamp01(sim.strategy.educationPreference - 0.15);
            sim.state.careerCapital += 3;
          },
          effectText: '职业风险 −12% · 教育投入 −15% · 职业资本 +3',
        },
        {
          id: 'study', label: '继续深造', tag: '延迟兑现',
          desc: '晚几年进入职场，但学历会把整条收入分布向右推。',
          effect: (sim) => {
            sim.strategy.educationPreference = U.clamp01(sim.strategy.educationPreference + 0.22);
            sim.state.wealth -= 6;
          },
          effectText: '教育投入 +22% · 立即支出 6 万学费',
        },
        {
          id: 'gap', label: '间隔一年', tag: '买回一点自己',
          desc: '不急着选。这一年关系与幸福上升，但职业资本原地踏步。',
          effect: (sim) => {
            sim.state.happiness = U.clamp(sim.state.happiness + 7, 0, 100);
            sim.state.relationship = U.clamp(sim.state.relationship + 6, 0, 100);
            sim.state.wealth -= 3;
          },
          effectText: '幸福 +7 · 关系 +6 · 支出 3 万',
        },
      ],
    },
    {
      id: 'mid_career', age: 27, icon: '🧭', title: '第一个职业岔路',
      q: '现在的工作不难也不差。这正是最危险的状态。',
      options: [
        {
          id: 'stay', label: '继续深耕', tag: '复利路径',
          desc: '在同一领域积累，薪资增长更平滑，但天花板也更明确。',
          effect: (sim) => { sim.strategy.careerRisk = U.clamp01(sim.strategy.careerRisk - 0.08); sim.state.careerCapital += 5; },
          effectText: '职业资本 +5 · 职业风险 −8%',
        },
        {
          id: 'jump', label: '跳槽换赛道', tag: '波动换上升',
          desc: '短期内收入可能跳升，也可能摔一跤。',
          effect: (sim) => {
            sim.strategy.careerRisk = U.clamp01(sim.strategy.careerRisk + 0.10);
            sim.state.incomeMult = (sim.state.incomeMult || 1) * 1.14;
          },
          effectText: '职业风险 +10% · 收入乘数 ×1.14',
        },
        {
          id: 'side', label: '开始副业', tag: '期权思维',
          desc: '用业余时间买一张低价期权：大概率不赚，但保留上升可能。',
          effect: (sim) => {
            sim.strategy.careerRisk = U.clamp01(sim.strategy.careerRisk + 0.06);
            sim.strategy.healthPriority = U.clamp01(sim.strategy.healthPriority - 0.06);
            sim.state.wealth -= 4;
          },
          effectText: '职业风险 +6% · 健康投入 −6% · 投入 4 万',
        },
      ],
    },
    {
      id: 'allocation', age: 31, icon: '📈', title: '手上终于有了一笔钱',
      q: '资产配置决定了你未来二十年的分布形状。',
      options: [
        {
          id: 'safe', label: '绝大部分放稳健资产', tag: '窄分布',
          desc: '下限抬高，上限压低。睡得着觉的那种选择。',
          effect: (sim) => { sim.strategy.investmentRisk = U.clamp01(sim.strategy.investmentRisk - 0.22); sim.strategy.consumptionPreference = U.clamp01(sim.strategy.consumptionPreference - 0.06); },
          effectText: '投资风险 −22% · 消费倾向 −6%',
        },
        {
          id: 'balance', label: '均衡配置', tag: '默认解',
          desc: '不试图战胜市场，只求不被单一风险吞掉。',
          effect: (sim) => { sim.strategy.investmentRisk = 0.5; },
          effectText: '投资风险 = 50%（回到中性）',
        },
        {
          id: 'heavy', label: '重仓高风险资产', tag: '厚尾',
          desc: '期望值更高，但方差陷阱也在等你：多数人会在中途下车。',
          effect: (sim) => {
            sim.strategy.investmentRisk = U.clamp01(sim.strategy.investmentRisk + 0.24);
            sim.strategy.consumptionPreference = U.clamp01(sim.strategy.consumptionPreference + 0.08);
          },
          effectText: '投资风险 +24% · 消费倾向 +8%',
        },
      ],
    },
    {
      id: 'startup', age: 34, icon: '🚀', title: '有人拉你一起创业',
      q: '成功率不高，但回报是厚尾的。这一次你打算押多少？',
      options: [
        {
          id: 'full', label: '辞职 all in', tag: '高方差',
          desc: '放弃稳定的收入曲线，换取一次可能改变量级的机会。',
          effect: (sim) => {
            sim.strategy.careerRisk = U.clamp01(sim.strategy.careerRisk + 0.26);
            sim.state.careerCapital += 6;
            sim.state.wealth -= 12;
          },
          effectText: '职业风险 +26% · 启动投入 12 万',
        },
        {
          id: 'part', label: '兼职试水', tag: '保留退路',
          desc: '用一部分时间和资金验证想法，代价是两边都做不深。',
          effect: (sim) => {
            sim.strategy.careerRisk = U.clamp01(sim.strategy.careerRisk + 0.10);
            sim.strategy.healthPriority = U.clamp01(sim.strategy.healthPriority - 0.05);
            sim.state.wealth -= 5;
          },
          effectText: '职业风险 +10% · 健康投入 −5% · 投入 5 万',
        },
        {
          id: 'no', label: '婉拒，专心本职', tag: '稳定路径',
          desc: '不参与这次机会，把精力放在晋升上。',
          effect: (sim) => { sim.strategy.careerRisk = U.clamp01(sim.strategy.careerRisk - 0.10); sim.state.careerCapital += 4; },
          effectText: '职业风险 −10% · 职业资本 +4',
        },
      ],
    },
    {
      id: 'health_alarm', age: 38, icon: '🩺', title: '体检报告上出现了箭头',
      q: '医生说"还来得及"。把时间花在哪里，是个真实的取舍。',
      options: [
        {
          id: 'recover', label: '认真调整作息与运动', tag: '投资健康',
          desc: '收入和晋升会慢一点，但后半生的健康曲线明显上移。',
          effect: (sim) => {
            sim.strategy.healthPriority = U.clamp01(sim.strategy.healthPriority + 0.28);
            sim.state.health = U.clamp(sim.state.health + 6, 0, 100);
            sim.state.wealth -= 4;
          },
          effectText: '健康投入 +28% · 健康 +6',
        },
        {
          id: 'hold', label: '先维持现状', tag: '拖延',
          desc: '什么都没改变。健康会按原来的速度继续走。',
          effect: () => {},
          effectText: '不改变任何参数',
        },
        {
          id: 'push', label: '这几年再拼一把', tag: '透支',
          desc: '短期收入更高，但健康衰减加速，寿命分布左移。',
          effect: (sim) => {
            sim.strategy.healthPriority = U.clamp01(sim.strategy.healthPriority - 0.24);
            sim.strategy.consumptionPreference = U.clamp01(sim.strategy.consumptionPreference + 0.05);
            sim.state.incomeMult = (sim.state.incomeMult || 1) * 1.10;
          },
          effectText: '健康投入 −24% · 收入乘数 ×1.10',
        },
      ],
    },
    {
      id: 'family', age: 42, icon: '🏡', title: '家庭与事业，只能先顾一头',
      q: '这一题没有"都不选"的选项，只有"先选哪个"。',
      options: [
        {
          id: 'family', label: '把时间给家人', tag: '关系优先',
          desc: '关系与幸福显著提升，职业上升速度放缓。',
          effect: (sim) => {
            sim.strategy.socialPreference = U.clamp01(sim.strategy.socialPreference + 0.22);
            sim.strategy.careerRisk = U.clamp01(sim.strategy.careerRisk - 0.12);
            sim.state.relationship = U.clamp(sim.state.relationship + 9, 0, 100);
          },
          effectText: '社交投入 +22% · 关系 +9',
        },
        {
          id: 'balance', label: '努力两边都顾好', tag: '高压力',
          desc: '什么都不放弃的代价是健康与幸福被两边消耗。',
          effect: (sim) => {
            sim.strategy.healthPriority = U.clamp01(sim.strategy.healthPriority - 0.08);
            sim.state.happiness = U.clamp(sim.state.happiness - 4, 0, 100);
          },
          effectText: '健康投入 −8% · 幸福 −4',
        },
        {
          id: 'career', label: '这几年的机会不能错过', tag: '事业优先',
          desc: '职业资本与收入乘数上升，关系值下降。',
          effect: (sim) => {
            sim.strategy.socialPreference = U.clamp01(sim.strategy.socialPreference - 0.16);
            sim.strategy.careerRisk = U.clamp01(sim.strategy.careerRisk + 0.10);
            sim.state.careerCapital += 6;
            sim.state.relationship = U.clamp(sim.state.relationship - 8, 0, 100);
          },
          effectText: '社交投入 −16% · 职业资本 +6',
        },
      ],
    },
  ];

  const SPEEDS = [
    { value: 1, label: '1×' },
    { value: 3, label: '3×' },
    { value: 8, label: '8×' },
    { value: 40, label: '急速' },
  ];

  /* ============================================================
   * 页面
   * ========================================================== */
  function renderRun(route) {
    const st = LS.store.state;
    const mode = (route && route.query && route.query.mode) || st.lastMode || 'fast';
    const query = (route && route.query) || {};

    /* ---- 没有角色就先造一个（不能让用户看到死路，规格书 §38.2） ---- */
    let character = st.character;
    let strategy = st.strategy;
    if (!character || !strategy) {
      LS.ui.toast('还没有角色，已为你随机生成一个 —— 可以随时回到设计页调整', 'warn', 4200);
      const d = LS.views.create.newDraft(mode);
      character = d.character; strategy = d.strategy;
      st.character = character; st.strategy = strategy;
      st.worldPreset = d.worldPreset;
      LS.store.saveNow();
    }

    const worldSeed = query.seed != null
      ? parseInt(query.seed, 10)
      : (st.lastSeed != null ? st.lastSeed : Math.floor(Math.random() * 899999) + 100000);
    const agentSeed = LS.rng.derive(worldSeed, 'player');
    const lockWorldSeed = query.lock === '1' ? true : !!st.lastLockWorldSeed;

    /* ---- 模拟器 ---- */
    const sim = new LS.life.Simulator({
      character, strategy: { ...strategy },
      worldSeed, agentSeed,
      worldConfig: C.makeWorldConfig(st.worldPreset || 'standard', st.worldOverrides || {}),
      mode, light: false,
    });

    let playing = false;
    let timer = null;
    let speed = query.speed ? parseFloat(query.speed) : 3;
    let lensOn = !!st.settings.lens;
    let interactive = mode === 'key';
    let finished = false;
    let pendingDecision = null;
    let decided = {};

    const elAge = h('div.hero-num.sm', String(sim.state.age));
    const elStatusGrid = h('div.status-grid');
    const elEventStream = h('div.event-stream');
    const elLens = h('div.lens-panel');
    const elProgress = LS.ui.progressBar(0, { thick: true, tone: 'fate' });
    const elYearLabel = h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--f-lg)', fontWeight: '700' } }, '18 岁');
    const elChips = h('div.chips-row');
    const elDecision = h('div.decision-host');
    const elEconomy = h('div');

    const careerChipHost = h('div.row.gap-2.wrap');

    function postEvent(ev) {
      const row = h('div.log-row', [
        h('span.lr-age', U.fixed(ev.age, 0)),
        h('span.lr-ico', ev.icon || '◆'),
        h('span.lr-title', ev.title),
        ev.probability != null ? h('span.lr-p', U.pct(ev.probability, 1)) : null,
      ]);
      row.onclick = () => openEventModal(ev);
      append(elEventStream, [row]);
      elEventStream.scrollTop = elEventStream.scrollHeight;
      // 音效
      if (ev.id === 'death') LS.audio.play('death');
      else if (ev.id === 'bankruptcy') LS.audio.play('bankruptcy');
      else if (ev.major) LS.audio.play(ev.category === 'risk' || ev.category === 'rare' && /catastrophe|health/.test(ev.id) ? 'bad' : 'major');
      else LS.audio.play('event');
    }

    function openEventModal(ev) {
      LS.store.seeCodex('event:' + ev.id);
      LS.ui.modal({
        title: (ev.icon || '') + ' ' + ev.title,
        sub: ev.age + ' 岁时发生',
        body: [
          LS.ui.eventCard(ev),
          h('div', { style: { height: 'var(--s-3)' } }),
          h('div.row.gap-2.wrap', [
            V.whyButton('conditional_probability', '为什么这个概率是这样算的？'),
            V.whyButton('probability_vs_outcome', '概率 90% 也可能不发生？'),
          ]),
        ],
      });
    }

    /* ---------------- 一年 ---------------- */
    function advance() {
      if (finished || pendingDecision) return;
      const ageBefore = sim.state.age;
      const before = {
        career: sim.state.career,
        incomeMult: sim.state.incomeMult,
        wealth: sim.state.wealth,
        credit: sim.state.careerCapital,
      };
      if (!sim.state.alive) return finish();
      if (ageBefore >= (sim.world.cfg.maxAge || 105)) return finish();

      sim.step();

      // 状态刷新
      renderStatus();
      renderLens();

      // 新事件
      for (const ev of sim.events) {
        if (ev.age >= ageBefore && !ev._shown) { ev._shown = true; postEvent(ev); }
      }
      for (const ch of sim.chips) {
        if (ch.age >= ageBefore && !ch._shown) {
          ch._shown = true;
          LS.ui.floatChip(elChips, ch.text, ch.tone);
        }
      }

      // 自动人生决策（规格书 §9.6）：引擎在极速模式下自己做的决定，
      // 要让玩家看见"它替我选了什么"，否则策略与结果之间就断了因果。
      for (const t of autoDecisions(before)) LS.ui.floatChip(elChips, t.text, t.tone);

      // 年份进度
      const span = (sim.world.cfg.maxAge || 105) - character.age;
      elProgress.firstChild.style.width =
        U.clamp01((sim.state.age - character.age) / Math.max(1, span)) * 100 + '%';
      elYearLabel.textContent = sim.state.age + ' 岁';
      LS.shell.setStatus(`${sim.state.age} 岁 · ${C.CAREER_LABEL[sim.state.career]}`, 'ok');

      // 决策点：年龄到达即暂停（起始年龄之前的分支直接跳过，避免倒叙）
      if (interactive) {
        const d = nextDecision();
        if (d && sim.state.alive) {
          pause();
          showDecision(d);
          return;
        }
      }
      if (!sim.state.alive) finish();
    }

    /** 找出当前应该出现的决策点（返回 null 表示没有） */
    function nextDecision() {
      return DECISIONS.find((x) =>
        !decided[x.id] &&
        x.age >= character.age &&
        x.age <= sim.state.age) || null;
    }

    /**
     * 从"本年状态变化"反推出引擎自动做了哪些决定。
     * 这些决定本来就是策略驱动的（规格书 §8.4：滑块给的是倾向），
     * 但如果不显示出来，玩家会觉得结果是从天上掉下来的。
     */
    function autoDecisions(before) {
      const s = sim.state;
      const out = [];
      if (s.career !== before.career) {
        out.push({
          text: '自动决策 · 转为' + (C.CAREER_LABEL[s.career] || s.career),
          tone: s.career === 'unemployed' ? 'bad'
            : s.career === 'entrepreneur' || s.career === 'manager' ? 'ok' : 'fate',
        });
      }
      const m = s.incomeMult || 1;
      const pm = before.incomeMult || 1;
      if (m > pm * 1.06) out.push({ text: '自动决策 · 收入 ×' + U.fixed(m, 2), tone: 'ok' });
      else if (m < pm * 0.94) out.push({ text: '自动决策 · 收入 ×' + U.fixed(m, 2), tone: 'bad' });
      if (s.careerCapital - before.credit >= 3) {
        out.push({ text: '职业资本 +' + U.fixed(s.careerCapital - before.credit, 0), tone: 'know' });
      }
      return out.slice(0, 2);
    }

    function renderStatus() {
      const s = sim.state;
      elAge.textContent = String(s.age);
      mount(elStatusGrid, [
        metricCell('净资产', U.money(s.wealth), V.wealthTone(s.wealth)),
        metricCell('健康', U.fixed(s.health, 0), V.scoreTone(s.health, 75, 50)),
        metricCell('幸福', U.fixed(s.happiness, 0), V.scoreTone(s.happiness, 70, 48)),
        metricCell('关系', U.fixed(s.relationship, 0), V.scoreTone(s.relationship, 70, 48)),
        metricCell('年收入', s.income > 0 ? U.money(s.income) : '—', s.income > 0 ? 'ok' : 'ghost'),
        metricCell('职业资本', U.fixed(s.careerCapital, 0), 'know'),
      ]);
      mount(careerChipHost, [
        LS.ui.careerChip(s.career),
        LS.ui.economyChip(sim.world.stateName),
        LS.ui.chip('学历 ' + LS.life.educationLabel(s.education), 'know'),
      ]);
      // 经济周期色带（规格化到 18 → 终点）
      if (sim.world.history && sim.world.history.length > 1) {
        mount(elEconomy, [
          h('div.card.tight', [
            h('div.card-title', { style: { fontSize: '13px', marginBottom: '6px' } }, '经济周期'),
            LS.ui.economyStrip(sim.world.history.map((x) => ({ age: x.age, label: x.label || x.state }))),
          ]),
        ]);
      }
    }

    function metricCell(label, value, tone) {
      return h('div.status-cell', [
        h('div.sc-label', label),
        h('div.sc-value' + (tone ? '.v-' + tone : ''), value),
      ]);
    }

    /* ---- 概率透视（规格书 §9.5） ---- */
    function renderLens() {
      if (!lensOn) { mount(elLens, []); return; }
      const ctx = sim.context();
      const dummy = { next: () => 0.5 };
      const rows = [];
      for (const ev of LS.events.EVENTS) {
        if (ev.cond && !ev.cond(ctx)) continue;
        if (ev.minAge != null && ctx.age < ev.minAge) continue;
        if (ev.maxAge != null && ctx.age > ev.maxAge) continue;
        try { rows.push({ ev, ...LS.events.evaluate(ev, ctx, dummy) }); } catch (e) { /* ignore */ }
      }
      rows.sort((a, b) => b.p - a.p);
      const top = rows.slice(0, 6);
      mount(elLens, [
        h('div.lens-head', [
          h('span', '🔎 概率透视 · 本年度候选事件'),
          LS.knowledge.hint('conditional_probability'),
        ]),
        ...top.map((r) => h('div.lens-row', [
          h('span.lr-n', (r.ev.icon || '') + ' ' + r.ev.title),
          LS.ui.probBar(r.p, { showPct: true }),
        ])),
        h('div.lens-note', `共评估 ${rows.length} 项候选事件；同一时间最多触发 1 个重大事件。`),
      ]);
    }

    /* ---- 决策卡 ---- */
    function showDecision(d) {
      pendingDecision = d;
      mount(elDecision, [
        h('div.decision-card', [
          h('div.de-head', [
            h('span.de-ico', d.icon),
            h('div', [
              h('div.de-title', d.title),
              h('div.de-q', d.q),
            ]),
            LS.ui.chip(d.age + ' 岁 · 岔路口', 'fate'),
          ]),
          h('div.choice-grid', d.options.map((o) =>
            h('button.choice-card', {
              type: 'button',
              onclick: () => choose(d, o),
            }, [
              h('div.cc-top', [h('span.cc-label', o.label), LS.ui.chip(o.tag, 'ghost')]),
              h('div.cc-desc', o.desc),
              h('div.cc-effect', o.effectText),
            ]))),
        ]),
      ]);
      elDecision.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function choose(d, o) {
      decide(d, o);
      LS.audio.play('choose');
      mount(elDecision, []);
      pendingDecision = null;
      // 记录到引擎，保证同一选择在同一次人生中可追溯
      sim.decisions[d.id] = o.id;
      sim.decisionLog.push({ age: d.age, id: d.id, option: o.id, label: o.label });
      LS.ui.toast(`你选择了「${o.label}」：${o.effectText}`, 'fate', 3600);
      postDecisionRow(d, o);
      LS.store.seeCodex('concept:decision_theory');
      if (playing) schedule();
    }

    function decide(d, o) {
      decided[d.id] = true;
      try { o.effect(sim); } catch (e) { console.error('决策效果应用失败', e); }
      renderStatus();
      renderLens();
    }

    function postDecisionRow(d, o) {
      const row = h('div.log-row.decision', [
        h('span.lr-age', U.fixed(d.age, 0)),
        h('span.lr-ico', d.icon),
        h('span.lr-title', '你的选择：' + o.label),
        h('span.lr-p', '决策'),
      ]);
      append(elEventStream, [row]);
      elEventStream.scrollTop = elEventStream.scrollHeight;
    }

    /* ---- 播放控制 ---- */
    function schedule() {
      clearTimeout(timer);
      if (!playing) return;
      const delay = speed >= 40 ? 14 : Math.max(30, 760 / speed);
      timer = setTimeout(() => {
        if (!playing || finished || pendingDecision) return;
        advance();
        if (playing) schedule();
      }, delay);
    }

    function play() {
      if (finished) return;
      if (pendingDecision) { LS.audio.play('nope'); LS.ui.toast('先做一个选择才能继续', 'warn'); return; }
      playing = true;
      refreshControls();
      schedule();
    }

    function pause() {
      playing = false;
      clearTimeout(timer);
      refreshControls();
    }

    function step1() {
      pause();
      advance();
    }

    function runToEnd() {
      pause();
      let guard = 0;
      while (sim.state.alive && guard++ < 200) {
        const d = interactive ? nextDecision() : null;
        if (d) { showDecision(d); return; }
        advance();
        if (pendingDecision) return;
      }
      finish();
    }

    const btnPlay = LS.ui.button('▶ 开始推进', { variant: 'primary', onClick: () => (playing ? pause() : play()) });
    const btnStep = LS.ui.button('单步一年', { variant: 'ghost', onClick: step1 });
    const btnEnd = LS.ui.button('直接看到结局', { variant: 'ghost', onClick: runToEnd });
    const btnLens = LS.ui.button('概率透视', {
      variant: 'ghost',
      onClick: () => {
        lensOn = !lensOn;
        st.settings.lens = lensOn;
        LS.store.save();
        btnLens.classList.toggle('primary', lensOn);
        btnLens.classList.toggle('ghost', !lensOn);
        renderLens();
      },
    });
    if (lensOn) { btnLens.classList.add('primary'); btnLens.classList.remove('ghost'); }

    function refreshControls() {
      mount(btnPlay, [h('span', playing ? '⏸ 暂停' : '▶ 开始推进')]);
      btnPlay.classList.toggle('primary', !playing);
      btnPlay.classList.toggle('ghost', playing);
    }

    /* ---- 结束 ---- */
    function finish() {
      if (finished) return;
      finished = true;
      playing = false;
      clearTimeout(timer);
      LS.audio.play('done');

      const result = sim.result();
      const run = {
        id: LS.util.uid('life'),
        worldSeed: sim.worldSeed,
        agentSeed: sim.agentSeed,
        character: sim.character,
        strategy: sim.strategy,
        mode,
        decisions: sim.decisions,
        states: sim.states,
        events: sim.events,
        result,
        worldSummary: sim.world.summary(),
      };
      LS.store.saveLife(run);
      LS.store.noteSimulation(1);
      LS.store.state.currentLifeId = run.id;
      LS.store.saveNow();
      // 让结果页拿到未压缩的完整数据
      LS.views.lastRun = run;
      LS.meta.evaluateAndToast({ kind: 'life', run, state: LS.store.state });

      mount(elDecision, [
        h('div.card.roomy.finish-card', [
          h('div.eyebrow', '这一生结束了'),
          h('div.finish-title', `${character.age} → ${result.lifespan} 岁`),
          h('div.finish-grid', [
            metricCell('最终财富', U.money(result.finalWealth), V.wealthTone(result.finalWealth)),
            metricCell('峰值财富', U.money(result.peakWealth), 'gold'),
            metricCell('健康', U.fixed(result.health, 1), V.scoreTone(result.health)),
            metricCell('幸福', U.fixed(result.happiness, 1), V.scoreTone(result.happiness, 70, 48)),
            metricCell('成就', U.fixed(result.achievement, 1), 'know'),
            metricCell('关系', U.fixed(result.relationship, 1), V.scoreTone(result.relationship, 70, 48)),
            metricCell('最终职业', result.careerLabel, 'fate'),
            metricCell('学历', result.educationLabel, 'know'),
          ]),
          h('div.row.gap-3.wrap', { style: { marginTop: 'var(--s-4)' } }, [
            LS.ui.button('看完整人生报告', {
              variant: 'primary',
              onClick: () => LS.router.go('/result'),
            }),
            LS.ui.button('把这套策略重演 10,000 次', {
              variant: 'ghost',
              onClick: () => LS.router.go('/universe'),
            }),
            LS.ui.button('锁定命运，换个选择', {
              variant: 'ghost',
              onClick: () => LS.router.go('/compare', { seed: String(worldSeed), lock: '1' }),
            }),
          ]),
        ]),
      ]);
      LS.shell.refreshBadges();
      LS.shell.setStatus('这一生已结束 · 可查看报告', 'warn');
    }

    /* ---------------- 组装 ---------------- */
    const rail = h('div.run-rail', [
      h('div.card.roomy.status-card', [
        h('div.row.between', [
          h('div', [
            h('div.eyebrow', `${mode === 'key' ? '关键人生' : '极速一生'} · 进行中`),
            h('div.row.gap-2', [
              elAge,
              h('span', { style: { fontSize: 'var(--f-lg)', color: 'var(--t-3)', alignSelf: 'flex-end', paddingBottom: '8px' } }, '岁'),
            ]),
          ]),
          h('div.col', { style: { alignItems: 'flex-end' } }, [
            LS.ui.chip(playing ? '● 运行中' : '⏸ 已暂停', playing ? 'ok' : 'ghost'),
            h('div', { style: { marginTop: '6px' } }, elYearLabel),
          ]),
        ]),
        elProgress,
        careerChipHost,
        elStatusGrid,
        h('div.control-bar', [btnPlay, btnStep, btnEnd, btnLens]),
        h('div.speed-row', SPEEDS.map((sp) =>
          h('button.speed-btn' + (speed === sp.value ? '.on' : ''), {
            type: 'button',
            onclick: (e) => {
              speed = sp.value;
              for (const b of e.target.parentElement.children) b.classList.remove('on');
              e.target.classList.add('on');
              if (playing) schedule();
            },
          }, sp.label))),
      ]),

      h('div', { style: { marginTop: 'var(--s-2)' } }, elEconomy),

      LS.ui.card({
        title: '世界环境',
        sub: (C.WORLD_PRESETS[st.worldPreset] || {}).label,
        body: [
          h('div.def-list', [
            V.defRow('经济波动', U.fixed(sim.world.cfg.economicVolatility, 2) + '×'),
            V.defRow('就业稳定', U.fixed(sim.world.cfg.laborStability, 2) + '×'),
            V.defRow('市场波动', U.fixed(sim.world.cfg.marketVolatility, 2) + '×'),
            V.defRow('当前经济', sim.world.stateName),
          ]),
          h('div', { style: { marginTop: 'var(--s-3)' } },
            LS.ui.notice('世界环境是你无法选择的变量：先天的家庭、时代的经济周期、市场的波动。软件把它们显式地建模出来，才能把"运气"和"选择"分开。', 'know')),
        ],
      }),

      LS.ui.card({
        title: '本局参数',
        sub: '可重放的完整记录',
        body: [
          h('div.def-list', [
            V.defRow('世界种子', '#' + worldSeed),
            V.defRow('锁定种子', lockWorldSeed ? '是（所有重演共享同一经济曲线）' : '否'),
            V.defRow('策略', LS.character.describeStrategy(sim.strategy)),
            V.defRow('模式', mode === 'key' ? '关键人生' : '极速一生'),
          ]),
          h('div.row.gap-2', { style: { marginTop: 'var(--s-3)' } }, [
            LS.ui.button('复制种子链接', {
              variant: 'ghost', size: 'sm',
              onClick: () => {
                const url = location.origin + location.pathname +
                  '#/run?seed=' + worldSeed + (lockWorldSeed ? '&lock=1' : '') + '&mode=' + mode;
                copyText(url);
              },
            }),
            LS.ui.button('重跑同一命运', {
              variant: 'ghost', size: 'sm',
              onClick: () => LS.router.go('/run', { seed: String(worldSeed), lock: '1', mode }),
            }),
          ]),
        ],
      }),
    ]);

    const main = h('div.run-main', [
      h('div.card.roomy', [
        h('div.row.between', [
          h('div', [
            h('div.card-title', '人生日志'),
            h('div.card-sub', '每一条都记录了发生时的概率 —— 点开可以看到完整拆解'),
          ]),
          elChips,
        ]),
        elEventStream,
      ]),
      elDecision,
    ]);

    const page = V.render({
      title: '运行这一生',
      sub: lockWorldSeed ? '命运已锁定 · 只有选择会改变' : '逐年推进',
      fate: { seed: worldSeed, locked: lockWorldSeed },
    }, [
      h('div.run-head', [
        V.head({
          kicker: '第 2 步 / 共 5 步',
          title: '看着这一生一年一年走过去',
          sub: interactive
            ? '关键人生模式：每个岔路口会暂停等你决定。你的选择会即时改变之后所有年份的行为倾向。'
            : '极速一生模式：全部由策略和概率自动决定。想看概率公式时，打开右上角的「概率透视」。',
          tight: true,
          actions: [
            LS.ui.button('重新设计', { variant: 'ghost', size: 'sm', onClick: () => LS.router.go('/create') }),
            LS.ui.button('去平行宇宙', { variant: 'ghost', size: 'sm', onClick: () => LS.router.go('/universe') }),
          ],
        }),
      ]),
      h('div.run-lower', [rail, main]),
      h('div', { style: { height: 'var(--s-4)' } }),
      h('div.lens-wrap', elLens),
    ]);

    /* ---- 启动 ---- */
    renderStatus();
    renderLens();
    refreshControls();
    append(elEventStream, [h('div.log-row', [
      h('span.lr-age', U.fixed(character.age, 0)),
      h('span.lr-ico', '🌱'),
      h('span.lr-title', '你出生了 —— ' + LS.character.describeCharacter(character)),
    ])]);
    LS.audio.play('birth');
    LS.shell.setStatus('准备就绪 · 点「开始推进」', 'warn');

    // 沉浸模式：运行时收起导航（规格书 §5.4）
    const wasImmersive = LS.shell.immersive;
    LS.shell.toggleImmersive(true);
    LS.views._cleanup = () => {
      clearTimeout(timer);
      playing = false;
      if (!wasImmersive) LS.shell.toggleImmersive(false);
    };

    // 键盘：空格播放/暂停，→ 单步
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step1(); }
    };
    document.addEventListener('keydown', onKey);
    const prevCleanup = LS.views._cleanup;
    LS.views._cleanup = () => { prevCleanup(); document.removeEventListener('keydown', onKey); };

    /* 调试 / 自动化句柄：把这条人生的驱动接口挂在页面元素上，
       便于在控制台里检查状态，或在未来做"自动播放一遍"的回归测试。 */
    page.__lsRun = {
      sim,
      advance,
      play,
      pause,
      step: step1,
      runToEnd,
      finish,
      isPlaying: () => playing,
      isFinished: () => finished,
      /** 当前是否有岔路口在等玩家决定 */
      pending: () => pendingDecision,
      /** 自动决策的可读描述（纯函数，便于单测） */
      autoDecisions,
      /** 自动选择一个选项（index 默认 0），供自动化与调试使用 */
      resolveDecision: (index) => {
        if (!pendingDecision) return false;
        const o = pendingDecision.options[index || 0];
        if (!o) return false;
        choose(pendingDecision, o);
        return true;
      },
      snapshot: () => ({
        age: sim.state.age, alive: sim.state.alive, wealth: sim.state.wealth,
        events: sim.events.length, decisions: sim.decisionLog,
      }),
    };

    return page;
  }

  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () => LS.ui.toast('已复制到剪贴板', 'ok'),
          () => fallback());
      } else fallback();
    } catch (e) { fallback(); }
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); LS.ui.toast('已复制到剪贴板', 'ok'); }
      catch (e) { LS.ui.toast('复制失败，请手动复制：' + text, 'warn'); }
      ta.remove();
    }
  }

  LS.router.register('/run', renderRun);
  LS.views.run = { render: renderRun, DECISIONS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
