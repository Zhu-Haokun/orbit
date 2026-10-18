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
          desc: '晚几年进入职场，但学历会把起点抬高一些。',
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
      id: 'home_choice', age: 30, icon: '🏠', title: '买下来，还是再租几年？',
      q: '首付会拿走一大块现金，但每个月的房租也会变成自己的月供。',
      when: (sim) => !sim.flags.houseOwned && (sim.state.wealth >= 12 || sim.character.familyResource === 'rich'),
      options: [
        {
          id: 'buy', label: '买下来', tag: '安定下来',
          desc: '把大部分积蓄变成首付，换来一个自己的住处和更稳的关系。',
          effect: (sim) => {
            const down = Math.max(6, Math.min(60, Math.round(sim.state.wealth * 0.45)));
            sim.state.wealth -= down;
            sim.flags.houseOwned = true;
            sim.state.happiness = U.clamp(sim.state.happiness + 6, 0, 100);
            sim.state.relationship = U.clamp(sim.state.relationship + 3, 0, 100);
          },
          effectText: '首付约一半积蓄 · 有房 · 幸福 +6',
        },
        {
          id: 'rent', label: '再租几年', tag: '保留现金',
          desc: '不急着背上月供，把钱留在手里，也保留换城市、换工作的余地。',
          effect: (sim) => {
            sim.state.happiness = U.clamp(sim.state.happiness - 1, 0, 100);
            sim.strategy.investmentRisk = U.clamp01(sim.strategy.investmentRisk + 0.03);
          },
          effectText: '保留现金 · 幸福 −1 · 投资风险 +3%',
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
          desc: '短期收入更高，但健康衰减加速，身体老得更快。',
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
      id: 'parent_choice', age: 40, icon: '🏥', title: '父母住院了，谁来照顾？',
      q: '时间和钱总要先拿出一样。没有标准答案，只有你更想保住什么。',
      when: (sim) => !sim.flags.parentIllness,
      options: [
        {
          id: 'leave', label: '请长假，自己去照顾', tag: '关系优先',
          desc: '花的时间多，钱花得少；工作和身体都会受影响。',
          effect: (sim) => {
            sim.flags.parentIllness = true;
            sim.state.wealth -= 5;
            sim.state.health = U.clamp(sim.state.health - 2, 0, 100);
            sim.state.relationship = U.clamp(sim.state.relationship + 8, 0, 100);
            sim.state.happiness = U.clamp(sim.state.happiness + 2, 0, 100);
          },
          effectText: '支出 5 万 · 健康 −2 · 关系 +8',
        },
        {
          id: 'hire', label: '请护工，自己继续工作', tag: '现金流优先',
          desc: '花更多的钱，把时间留给工作和自己的小家庭。',
          effect: (sim) => {
            sim.flags.parentIllness = true;
            sim.state.wealth -= 15;
            sim.state.relationship = U.clamp(sim.state.relationship + 2, 0, 100);
          },
          effectText: '支出 15 万 · 关系 +2',
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
      LS.ui.toast('还没有角色，已为你随机生成一套 —— 可以随时回到设计页调整', 'warn', 4200);
      const d = LS.views.create.randomDraft
        ? LS.views.create.randomDraft(mode)
        : LS.views.create.newDraft(mode);
      character = d.character; strategy = d.strategy;
      st.character = character; st.strategy = strategy;
      st.worldPreset = d.worldPreset;
      st.worldOverrides = { ...d.worldOverrides };
      st.lastSeed = d.worldSeed;
      st.lastMode = d.mode;
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
    let interactive = mode === 'key' || !!st.settings.intervention;
    let finished = false;
    let pendingDecision = null;
    let decided = {};
    if (interactive) {
      for (const x of DECISIONS) if (x.age < sim.state.age) decided[x.id] = true;
    }

    const elAge = h('div.hero-num.sm', String(sim.state.age));
    const elModeKicker = h('div.eyebrow', (interactive ? '关键人生' : '极速一生') + ' · 进行中');
    const elStatusGrid = h('div.status-grid');
    const elEventStream = h('div.event-stream');
    const elLens = h('div.lens-panel');
    const elProgress = LS.ui.progressBar(0, { thick: true, tone: 'fate' });
    const elYearLabel = h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--f-lg)', fontWeight: '700' } }, '18 岁');
    const elChips = h('div.chips-row');
    const elDecision = h('div.decision-host');
    const elScene = h('div.scene-host');
    const elNext = h('div.next-choice');
    let sceneStage = '';
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
            V.whyButton('conditional_probability', '这个数字怎么算的？'),
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
      for (const x of DECISIONS) {
        if (decided[x.id]) continue;
        if (x.age < character.age) { decided[x.id] = true; continue; }
        if (x.age > sim.state.age) continue;
        if (x.when && !x.when(sim)) { decided[x.id] = true; continue; }
        return x;
      }
      return null;
    }

    /** 下一个还没到的关键抉择（用于“跳过去”提示） */
    function upcomingDecision() {
      return DECISIONS.find((x) =>
        !decided[x.id] &&
        x.age > sim.state.age &&
        (!x.when || x.when(sim))) || null;
    }

    function jumpToDecision() {
      if (pendingDecision) { LS.ui.toast('先做完眼前这个选择', 'warn'); return; }
      pause();
      let guard = 0;
      while (!pendingDecision && !finished && sim.state.alive && guard++ < 120) {
        advance();
      }
    }

    function setIntervention(on) {
      if (pendingDecision && !on) {
        const d = pendingDecision;
        choose(d, d.options[0]);
        LS.ui.toast('已关闭决策干预，按默认选项继续', 'know');
      }
      if (on) {
        // 只对“现在之后”的节点生效：已经过去的年龄不再补弹
        for (const x of DECISIONS) if (x.age <= sim.state.age) decided[x.id] = true;
      }
      interactive = on;
      st.settings.intervention = on;
      st.lastMode = on ? 'key' : 'fast';
      LS.store.saveNow();
      elModeKicker.textContent = (on ? '关键人生' : '极速一生') + ' · 进行中';
      btnIntervene.textContent = on ? '决策干预 · 开' : '决策干预';
      btnIntervene.classList.toggle('primary', on);
      btnIntervene.classList.toggle('ghost', !on);
      btnJump.style.display = on ? '' : 'none';
      refreshControls();
      renderNextChoice();
      if (on) LS.ui.toast('决策干预已开启：关键节点会停下来等你选', 'fate');
      else LS.ui.toast('决策干预已关闭：会连续跑到结束', 'ghost');
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
      renderScene();
      renderNextChoice();
    }

    function metricCell(label, value, tone) {
      return h('div.status-cell', [
        h('div.sc-label', label),
        h('div.sc-value' + (tone ? '.v-' + tone : ''), value),
      ]);
    }

    function renderScene() {
      const on = LS.store.state.settings.showScenes !== false;
      const stage = LS.ui.stageOfAge(sim.state.age);
      if (!on) {
        if (sceneStage !== 'off') { mount(elScene, []); sceneStage = 'off'; }
        return;
      }
      if (stage === sceneStage) return;
      sceneStage = stage;
      mount(elScene, [LS.ui.lifeScene(stage)]);
    }

    function renderNextChoice() {
      if (!interactive) {
        mount(elNext, [
          h('div.nc-kicker', '决策干预已关闭'),
          h('div.nc-note', '从现在起到结束不会停下来。想在中途做选择，打开上方「决策干预」；只对之后的关键节点生效。'),
        ]);
        return;
      }
      const d = upcomingDecision();
      if (!d) {
        const logs = (sim.decisionLog || []).slice(-4).map((x) =>
          h('div.nc-log', [h('span', x.age + ' 岁'), h('span', x.label)]));
        mount(elNext, [
          h('div.nc-kicker', '关键抉择'),
          h('div.nc-note', '这一生的选择题已经走完，剩下的交给运气。'),
          ...logs,
        ]);
        if (btnJump) { btnJump.disabled = true; btnJump.textContent = '没有更多抉择'; }
        return;
      }
      mount(elNext, [
        h('div.nc-kicker', '下一个关键抉择'),
        h('div.nc-title', `${d.age} 岁 · ${d.title}`),
        LS.ui.button('现在就跳过去', { variant: 'ghost', size: 'sm', onClick: jumpToDecision }),
      ]);
      if (btnJump) { btnJump.disabled = false; btnJump.textContent = '跳到下一个抉择'; }
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
          h('span', '🔎 这一年可能发生的事'),
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
      pause();
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
          h('div.choice-grid' + (d.options.length === 2 ? '.cols-2' : ''), d.options.map((o, i) =>
            h('button.choice-card', {
              type: 'button',
              onclick: () => choose(d, o),
            }, [
              h('div.cc-index', String(i + 1).padStart(2, '0')),
              h('div.cc-top', [h('span.cc-label', o.label), LS.ui.chip(o.tag, 'ghost')]),
              h('div.cc-desc', o.desc),
              h('div.cc-effect', o.effectText),
              h('div.cc-go', [h('span', '选择这条'), h('span', '→')]),
            ]))),
          h('div.decision-note', '选择会立刻改变接下来的日子，不能撤回。想清楚再点。'),
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
      // 选完不再等“开始推进”，直接继续推演
      if (!finished) {
        playing = true;
        refreshControls();
        schedule();
      }
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
    const btnJump = LS.ui.button('跳到下一个抉择', { variant: 'ghost', onClick: jumpToDecision });
    btnJump.style.display = interactive ? '' : 'none';
    const btnIntervene = LS.ui.button('决策干预', {
      variant: interactive ? 'primary' : 'ghost',
      onClick: () => setIntervention(!interactive),
    });
    if (interactive) { btnIntervene.textContent = '决策干预 · 开'; btnIntervene.classList.add('primary'); btnIntervene.classList.remove('ghost'); }
    const btnEnd = LS.ui.button('直接看到结局', { variant: 'ghost', onClick: runToEnd });
    const btnLens = LS.ui.button('看细节', {
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
      mount(btnPlay, [h('span', playing ? '⏸ 暂停' : (interactive ? '▶ 开始推进' : '▶ 自动跑完'))]);
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
            elModeKicker,
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
        h('div.control-bar', [btnPlay, btnJump, btnIntervene, btnEnd, btnLens].filter(Boolean)),
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
        elNext,
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
            V.defRow('这次的世界编号', '#' + worldSeed),
            V.defRow('锁住运气', lockWorldSeed ? '是（每次都遇到同一串事）' : '否'),
            V.defRow('策略', LS.character.describeStrategy(sim.strategy)),
            V.defRow('模式', mode === 'key' ? '关键人生' : '极速一生'),
          ]),
          h('div.row.gap-2', { style: { marginTop: 'var(--s-3)' } }, [
            LS.ui.button('复制这次的世界链接', {
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
      elScene,
      h('div.card.roomy', [
        h('div.row.between', [
          h('div', [
            h('div.card-title', '人生日志'),
            h('div.card-sub', '每一条都可能发生 —— 点开看看当时的样子'),
          ]),
          elChips,
        ]),
        elEventStream,
      ]),
      elDecision,
    ]);

    const page = V.render({
      title: '运行这一生',
      sub: lockWorldSeed ? '锁住运气 · 只有选择会改变' : '一年一年往下走',
      fate: { seed: worldSeed, locked: lockWorldSeed },
    }, [
      h('div.run-head', [
        V.head({
          kicker: '过日子',
          title: '看着这一生一年一年走过去',
          sub: '一年一年往下走。打开「决策干预」，关键节点会停下来等你选；不打开就连续跑到结束。',
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
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (interactive) jumpToDecision(); else step1(); }
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
