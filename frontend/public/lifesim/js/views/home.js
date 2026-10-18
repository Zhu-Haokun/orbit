/* ============================================================
 * LifeSim · views/home.js
 * 首页（规格书 §7）
 *
 * 目标：3 秒内让用户知道"我该点哪里开始"。
 * 所以首屏只有一个主 CTA，其余都是引子。
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const V = LS.views;
  const { h } = LS.dom;
  const U = LS.util;

  /* ---------- 每日一问（规格书 §7.4） ---------- */
  const DAILY = [
    {
      q: '抛硬币连续出现 5 次正面，第 6 次出现反面的概率是多少？',
      a: '仍然是 50%。硬币没有记忆——这就是「赌徒谬误」。独立事件的概率不会因为历史而改变。',
      concept: 'independence',
    },
    {
      q: '一种罕见病患病率 0.1%，检测准确率 99%。你检测阳性，真的患病概率是多少？',
      a: '大约 9%，不是 99%。因为健康人太多，1% 的假阳性数量远超真阳性。这叫「基础比率谬误」。',
      concept: 'bayes',
    },
    {
      q: '某策略平均收益更高，是否一定应该选它？',
      a: '不一定。平均值会被极少数极端样本抬高。要看中位数、P05 和破产概率——这就是本软件同时给出多个分位数的原因。',
      concept: 'lognormal',
    },
    {
      q: '为什么观察了 1000 次还不够，要观察 10000 次？',
      a: '估计误差按 1/√n 缩小：样本量翻 100 倍，精度才提高 10 倍。所以稀有事件需要极大的样本量才能被看见。',
      concept: 'monte_carlo',
    },
    {
      q: '「今年业绩最差的团队明年会变好」一定是因为他们努力了吗？',
      a: '不一定。这是均值回归：极端值本身难以持续。评估任何干预效果时都要警惕这个统计假象。',
      concept: 'regression_to_mean',
    },
    {
      q: '创业成功率只有 5%，为什么还有人前赴后继？',
      a: '因为收益是厚尾的：95% 归零，但那 5% 可能回报 100 倍。决策取决于期望效用，而不只是成功率。',
      concept: 'heavy_tail',
    },
    {
      q: '同时买 10 只不同的股票，风险就一定更低吗？',
      a: '只有在它们不完全相关时才行。如果遇到系统性危机，相关性会一起飙到接近 1——分散化在关键时刻会失效。',
      concept: 'correlation',
    },
  ];

  function dailyIndex() {
    const d = new Date();
    const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
    return doy % DAILY.length;
  }

  /* ---------- 首页 ---------- */
  function renderHome() {
    const st = LS.store.state;
    const stats = st.stats || {};
    const daily = DAILY[dailyIndex()];

    /* --- Hero --- */
    const particles = h('canvas', { id: 'home-particles' });
    const hero = h('section.home-hero', [
      particles,
      h('div.hero-inner', [
        h('div.eyebrow', '概率论 · 蒙特卡洛 · 平行人生'),
        h('h1.hero-title', [
          '如果人生可以重演',
          h('span.hero-num-inline', ' 10,000 '),
          '次，',
          h('br'),
          '你会看到什么？',
        ]),
        h('p.hero-lead', [
          '这里没有"正确答案"。你设定性格、策略与世界环境，',
          h('b', 'LifeSim'),
          ' 用蒙特卡洛方法把你的选择重演成千上万次，',
          '然后如实告诉你：均值在哪里，风险藏在哪里，概率与运气各占多少。',
        ]),
        h('div.hero-actions', [
          LS.ui.button('生成我的一生', {
            variant: 'primary', size: 'lg',
            onClick: () => LS.router.go('/create'),
          }),
          LS.ui.button('重演 10,000 次', {
            variant: 'ghost', size: 'lg',
            onClick: () => {
              if (st.character && st.strategy) LS.router.go('/universe');
              else LS.router.go('/create');
            },
          }),
          h('span.hero-hint', '≈ 3 分钟，无需注册，全部离线运行'),
        ]),
      ]),
      h('div.hero-facts', heroFacts()),
    ]);

    /* --- 三种玩法（规格书 §7.2） --- */
    const modes = h('section', [
      V.section('选择一种玩法', '三种精度，对应三种学习目标'),
      h('div.mode-grid', [
        LS.ui.modeCard({
          icon: '⚡', title: '极速一生',
          desc: '一次完整的 18 → 终老模拟。逐年推进，看到每一次随机事件的概率拆解。',
          tag: '约 5 秒 · 1 条人生',
          hint: '想先感受一下？从这里开始 →',
          glow: 'rgba(124,92,255,0.26)', line: 'rgba(167,139,250,0.5)',
          onClick: () => LS.router.go('/create?mode=fast'),
        }),
        LS.ui.modeCard({
          icon: '🎯', title: '关键人生',
          desc: '在人生岔路口由你亲自选择。同样的命运种子，不同的决策路径。',
          tag: '约 3 分钟 · 可交互',
          hint: '想体会"选择的力量"？',
          glow: 'rgba(245,200,96,0.22)', line: 'rgba(245,200,96,0.5)',
          onClick: () => LS.router.go('/create?mode=key'),
        }),
        LS.ui.modeCard({
          icon: '🌌', title: '平行宇宙',
          desc: '把你的人生重演 1,000 到 100,000 次，得到完整的财富分布、尾部风险与相关结构。',
          tag: '约 10 秒 · 1 万条人生',
          hint: '想看真正的概率？',
          glow: 'rgba(45,212,191,0.22)', line: 'rgba(45,212,191,0.5)',
          onClick: () => LS.router.go('/universe'),
        }),
      ]),
    ]);

    /* --- 数据条 --- */
    const totalSim = stats.totalSimulated || 0;
    const codexTotal = LS.knowledge.list().length;
    const codexDone = Object.keys(st.codexSeen || {}).length;
    const ach = LS.meta.progress();
    const strip = h('section', [
      V.section('你的实验室', '所有数据都保存在这台设备上（localStorage），不上传任何内容'),
      h('div.daily-strip', [
        dailyCard(daily),
        h('div.stat-mini-grid', [
          miniStat('🎲', U.int(totalSim), '累计模拟次数'),
          miniStat('🗄️', U.int(st.lives.length), '收藏的人生'),
          miniStat('📖', codexDone + ' / ' + codexTotal, '概率概念'),
          miniStat('🏆', ach.done + ' / ' + ach.total, '已解锁成就'),
        ]),
      ]),
    ]);

    /* --- 最近的人生 --- */
    let recent = null;
    if (st.lives.length) {
      recent = h('section', [
        V.section('最近的人生', '点击继续查看完整报告', [
          LS.ui.button('全部档案', { variant: 'ghost', size: 'sm', onClick: () => LS.router.go('/archive') }),
        ]),
        h('div.grid.g-4', st.lives.slice(0, 4).map((l) => V.lifeCard(l, {
          onClick: () => {
            LS.store.state.currentLifeId = l.id;
            LS.store.saveNow();
            LS.router.go('/result');
          },
        }))),
      ]);
    }

    /* --- 黄金路径指引（规格书 §41） --- */
    const path = h('section', [
      V.section('第一次来？按这条路线走', '大约 3 分钟，能理解这个软件的全部核心'),
      h('div.card.roomy', [
        h('div.golden-path', [
          step(1, '设计一个角色', '调 6 个滑块，看每条策略如何改变概率', '/create', 'primary'),
          step(2, '看完这一生', '逐年推进，点开任意事件看概率拆解', '/run', 'ghost'),
          step(3, '重演一万次', '得到分布、分位数与尾部风险', '/universe', 'ghost'),
          step(4, '对比两个未来', '锁定命运种子，只改变选择', '/compare', 'ghost'),
          step(5, '去实验室', '大数定律 / 贝叶斯 / 马尔可夫 / 敏感性', '/lab', 'ghost'),
        ]),
      ]),
    ]);

    const page = V.render({
      title: '开始',
      sub: '概率 · 平行人生',
      fate: null,
    }, [hero, modes, strip, recent, path].filter(Boolean));

    // 粒子背景
    if (page) {
      const cv = page.querySelector('#home-particles');
      if (cv && !LS.store.state.settings.reduceMotion) {
        const field = LS.charts.createParticles(cv, { count: 52 });
        LS.views._cleanup = () => field.destroy();
      }
    }
    return page;
  }

  function fact(num, label, tone) {
    return h('div.fact', [
      h('div.fact-num' + (tone ? '.' + tone : ''), num),
      h('div.fact-label', label),
    ]);
  }

  /**
   * Hero 下方的四个数据点。
   *
   * 这几个数字刻意**从模型里取**，不写死：
   * 之前写死过「16 种随机事件模型」，而引擎里实际有 17 个 ——
   * 页面上就留下了一个永远不会自愈的错误说法。
   * test_ui_render.js 里有一条断言专门盯着这件事。
   */
  function heroFacts() {
    const C = LS.config;
    const events = (LS.events && LS.events.EVENTS) ? LS.events.EVENTS.length : 0;
    const dists = (LS.distributions && LS.distributions.list)
      ? LS.distributions.list().length : 0;
    const dims = (C && C.STRATEGY_DIMS) ? C.STRATEGY_DIMS.length : 0;
    return [
      // 实测（Edge/V8，含预热）约 0.19 ms/条 → 100 万条约 3 分钟
      fact('1,000,000', '次重演约 3 分钟', 'v-fate'),
      fact(String(events), '种随机事件', 'v-know'),
      fact(String(dists), '种概率分布', 'v-teal'),
      fact(String(dims), '个策略维度', 'v-gold'),
    ];
  }

  function miniStat(icon, value, label) {
    return h('div.stat-mini', [
      h('div.sm-ico', icon),
      h('div', [
        h('div.sm-val', value),
        h('div.sm-label', label),
      ]),
    ]);
  }

  function dailyCard(d) {
    return h('div.daily-card', [
      h('div.dc-head', [
        h('span', '💡 今日一问'),
        LS.ui.chip('每日更新', 'know'),
      ]),
      h('div.dc-q', d.q),
      h('div.dc-a', { id: 'daily-a', style: { display: 'none' } }, d.a),
      h('div.row.gap-2', [
        LS.ui.button('看解答', {
          variant: 'ghost', size: 'sm',
          onClick: (e) => {
            const el = document.getElementById('daily-a');
            const on = el.style.display === 'none';
            el.style.display = on ? 'block' : 'none';
            e.target.textContent = on ? '收起解答' : '看解答';
            if (on) LS.store.seeCodex('concept:' + d.concept);
          },
        }),
        LS.ui.button('相关概念', {
          variant: 'ghost', size: 'sm',
          onClick: () => LS.knowledge.explain(d.concept),
        }),
      ]),
    ]);
  }

  function step(n, title, desc, path, variant) {
    return h('div.gp-step', [
      h('div.gp-num', String(n)),
      h('div.gp-body', [
        h('div.gp-title', title),
        h('div.gp-desc', desc),
      ]),
      LS.ui.button('去这里', {
        variant, size: 'sm',
        onClick: () => LS.router.go(path),
      }),
    ]);
  }

  LS.router.register('/', renderHome);
  LS.views.home = { render: renderHome };
})(typeof globalThis !== 'undefined' ? globalThis : this);
