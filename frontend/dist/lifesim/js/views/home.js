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

  /* ---------- 随机来一局 ---------- */
  function randomLife() {
    const d = LS.views.create.randomDraft('fast');
    const st = LS.store.state;
    st.character = d.character;
    st.strategy = d.strategy;
    st.worldPreset = d.worldPreset;
    st.worldOverrides = { ...d.worldOverrides };
    st.lastSeed = d.worldSeed;
    st.lastMode = d.mode;
    st.lastLockWorldSeed = false;
    LS.store.saveNow();
    LS.ui.toast('角色、天赋、策略和世界都随机好了', 'fate', 2600);
    LS.router.go('/run?seed=' + d.worldSeed);
  }

  /* ---------- 首页 ---------- */
  function renderHome() {
    const st = LS.store.state;
    const stats = st.stats || {};

    /* --- Hero --- */
    const particles = h('canvas', { id: 'home-particles' });
    const hero = h('section.home-hero', [
      particles,
      h('div.hero-inner', [
        h('div.eyebrow', '一个关于选择与运气的人生沙盒'),
        h('h1.hero-title', [
          '如果人生可以重演',
          h('span.hero-num-inline', ' 10,000 '),
          '次，',
          h('br'),
          '你会看到什么？',
        ]),
        h('p.hero-lead', [
          '这里没有标准答案。你设定性格、策略和环境，',
          h('b', 'LifeSim'),
          ' 把不同选择下的人生各演一遍，',
          '看看它们会把日子带到哪里。偶尔，运气也会插一脚。',
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
          h('span.hero-hint', '全部离线运行'),
        ]),
      ]),
      h('div.hero-facts', heroFacts()),
    ]);

    /* --- 三种玩法 --- */
    const modes = h('section', [
      V.section('想怎么玩？', '三档节奏，从随手一局到认真推演'),
      h('div.mode-grid', [
        LS.ui.modeCard({
          icon: 'bolt', title: '极速一生',
          desc: '几分钟看完一辈子。适合先感受一下，看看命运会把你带到哪里。',
          tag: '最快上手',
          hint: '想先试试？从这里开始 →',
          glow: 'rgba(124,92,255,0.26)', line: 'rgba(167,139,250,0.5)',
          onClick: () => LS.router.go('/create?mode=fast'),
        }),
        LS.ui.modeCard({
          icon: 'target', title: '关键人生',
          desc: '在几个岔路口停一下，由你来做决定。其余的日子交给性格和习惯。',
          tag: '可交互',
          hint: '想看看“如果我当时……”？',
          glow: 'rgba(245,200,96,0.22)', line: 'rgba(245,200,96,0.5)',
          onClick: () => LS.router.go('/create?mode=key'),
        }),
        LS.ui.modeCard({
          icon: 'orbit', title: '平行宇宙',
          desc: '把同一种活法演上一万遍。有人安稳，有人大起大落，看看你落在哪。',
          tag: '一万种可能',
          hint: '想看看“另一种可能”？',
          glow: 'rgba(45,212,191,0.22)', line: 'rgba(45,212,191,0.5)',
          onClick: () => LS.router.go('/universe'),
        }),
      ]),
    ]);

    /* --- 数据条 --- */
    const totalSim = stats.totalSimulated || 0;
    const ach = LS.meta.progress();
    const strip = h('section', [
      V.section('你的沙盒', '所有数据只保存在这台设备上（localStorage），不上传任何内容'),
      h('div.daily-strip', [
        quickStartCard(),
        h('div.stat-mini-grid', [
          miniStat('🎲', U.int(totalSim), '累计模拟次数'),
          miniStat('🗄️', U.int(st.lives.length), '收藏的人生'),
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

    /* --- 上手路径 --- */
    const path = h('section', [
      V.section('想先试试？', '随便走一遍，不用先看说明'),
      h('div.card.roomy', [
        h('div.golden-path', [
          step(1, '捏一个自己', '调几个滑块：你更冒险，还是更求稳？', '/create', 'primary'),
          step(2, '看完这一生', '逐年往下走，遇到岔路就停一下', '/run', 'ghost'),
          step(3, '演一万遍', '同样的活法，一万种结果', '/universe', 'ghost'),
          step(4, '换一个选择', '只改一个地方，看看人生会差多少', '/compare', 'ghost'),
        ]),
      ]),
    ]);

    const page = V.render({
      title: '开始',
      sub: '选择 · 运气 · 平行人生',
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
   * Hero 下方的数据点。数字从模型里取，不写死。
   */
  function heroFacts() {
    const C = LS.config;
    const events = (LS.events && LS.events.EVENTS) ? LS.events.EVENTS.length : 0;
    const dims = (C && C.STRATEGY_DIMS) ? C.STRATEGY_DIMS.length : 0;
    return [
      fact('10,000', '次重演', 'v-fate'),
      fact(String(events), '种人生事件', 'v-know'),
      fact(String(dims), '个选择维度', 'v-teal'),
      fact('3', '种玩法', 'v-gold'),
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

  function quickStartCard() {
    return h('div.daily-card', [
      h('div.dc-head', [
        h('span', '🎲 命运发牌'),
        LS.ui.chip('试试手气', 'fate'),
      ]),
      h('div.dc-q', '不知道从哪开始？让命运随便发一手牌，看看你能活成什么样。'),
      h('div.row.gap-2.wrap.dc-actions', [
        LS.ui.button('随机来一局', {
          variant: 'primary', size: 'sm',
          onClick: randomLife,
        }),
        LS.ui.button('先捏一个', {
          variant: 'ghost', size: 'sm',
          onClick: () => LS.router.go('/create'),
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
