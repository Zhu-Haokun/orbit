/* ============================================================
 * LifeSim · ui/shell.js
 * 应用外壳：侧边导航 + 顶栏 + 视图容器
 *
 * 设计目标（规格书 §5.3）：
 *   用户进入后 3 秒内应该知道"我该点哪里开始"。
 *   所以导航只放前进方向，不放功能清单。
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const { h, mount } = LS.dom;

  /* ============================================================
   * 导航结构（规格书 §7~§19 的页面地图）
   * ========================================================== */
  const NAV = [
    {
      group: null,
      items: [
        { path: '/', icon: '🏠', label: '开始', exact: true },
      ],
    },
    {
      group: '模拟',
      items: [
        { path: '/create', icon: '🧬', label: '设计人生' },
        { path: '/run', icon: '▶️', label: '运行这一生' },
        { path: '/result', icon: '📄', label: '人生报告' },
        { path: '/universe', icon: '🌌', label: '平行宇宙' },
        { path: '/compare', icon: '⚖️', label: '策略对照' },
      ],
    },
    {
      group: '实验室',
      items: [
        {
          path: '/lab', icon: '🧪', label: '概率实验室',
          children: [
            { path: '/lab/law', label: '大数定律' },
            { path: '/lab/bayes', label: '贝叶斯' },
            { path: '/lab/markov', label: '马尔可夫' },
            { path: '/lab/sensitivity', label: '敏感性' },
            { path: '/lab/dist', label: '分布百科' },
          ],
        },
      ],
    },
    {
      group: '收藏',
      items: [
        { path: '/archive', icon: '🗄️', label: '人生档案', badge: 'lives' },
        { path: '/codex', icon: '📖', label: '概率图鉴', badge: 'codex' },
      ],
    },
  ];

  /* ============================================================
   * 内部状态
   * ========================================================== */
  let elNav = null, elMain = null, elViewport = null, elTopTitle = null,
    elTopSub = null, elFate = null, elBadges = {}, elNavLinks = {},
    elImmersiveBtn = null, elBackdrop = null;
  let immersive = false;

  /* ============================================================
   * 构建
   * ========================================================== */

  function buildBrand() {
    return h('a.brand', { href: '#/' }, [
      h('div.brand-mark', '◈'),
      h('div.brand-text', [
        h('div.brand-name', '人生概率实验室'),
        h('div.brand-sub', 'LifeSim · Probability Lab'),
      ]),
    ]);
  }

  function buildNav() {
    const groups = [];
    for (const g of NAV) {
      const items = g.items.map(buildNavItem);
      groups.push(h('div.nav-group', [
        g.group ? h('div.nav-label', g.group) : null,
        ...items,
      ]));
    }
    return h('nav.nav-scroll', groups);
  }

  function buildNavItem(item) {
    const kids = [
      h('span.nav-ico', item.icon),
      h('span.nav-text', item.label),
    ];
    if (item.badge) {
      const b = h('span.nav-badge', '0');
      elBadges[item.badge] = b;
      kids.push(b);
    }
    if (item.children) kids.push(h('span.nav-arrow', '›'));

    const link = h('a.nav-link', { href: '#' + item.path, dataset: { path: item.path } }, kids);
    elNavLinks[item.path] = link;

    if (!item.children) return link;
    const sub = h('div.nav-sub', item.children.map((c) => {
      const cl = h('a.nav-sub-link', { href: '#' + c.path, dataset: { path: c.path } }, c.label);
      elNavLinks[c.path] = cl;
      return cl;
    }));
    return h('div.nav-item-wrap', [link, sub]);
  }

  function buildTopbar() {
    elTopTitle = h('div.tb-title', '开始');
    elTopSub = h('div.tb-sub', '');
    elFate = h('div.tb-fate');
    elImmersiveBtn = LS.ui.iconButton('⛶', {
      onClick: toggleImmersive,
      title: '沉浸模式（隐藏导航，快捷键 F）',
    });
    elImmersiveBtn.classList.add('tb-icon');
    const backBtn = LS.ui.iconButton('☰', {
      onClick: toggleNavFromBurger,
      title: '打开导航',
    });
    backBtn.classList.add('tb-icon', 'tb-burger');

    return h('header.topbar', [
      backBtn,
      h('div.tb-left', [elTopTitle, elTopSub]),
      h('div.tb-right', [
        elFate,
        h('button.btn.ghost.sm.tb-quick', {
          type: 'button',
          onclick: () => LS.router.go('/create'),
          title: '快速设计一个新人生',
        }, [h('span', '✦'), h('span', '新人生')]),
        elImmersiveBtn,
      ]),
    ]);
  }

  function build() {
    elViewport = h('div.viewport', { id: 'viewport' });
    elNav = h('aside.sidenav', [
      buildBrand(),
      buildNav(),
      buildNavFooter(),
    ]);
    elBackdrop = h('div.nav-backdrop', { onclick: () => toggleNavMobile(false) });
    elMain = h('main.main', [
      buildTopbar(),
      elViewport,
    ]);
    return h('div.app', { id: 'app' }, [elNav, elMain, elBackdrop]);
  }

  function buildNavFooter() {
    return h('div.nav-footer', [
      h('a.nav-link', { href: '#/settings', dataset: { path: '/settings' } }, [
        h('span.nav-ico', '⚙️'),
        h('span.nav-text', '设置'),
      ]),
      h('div.nav-progress', [
        h('div.np-row', [
          h('span', '模拟总量'),
          h('b.np-runs', { id: 'np-runs' }, '0'),
        ]),
        h('div.bar.thin', h('i', { id: 'np-bar', style: { width: '0%' } })),
      ]),
    ]);
  }

  /* ============================================================
   * 行为
   * ========================================================== */

  function toggleImmersive(force) {
    immersive = force == null ? !immersive : !!force;
    document.body.classList.toggle('immersive', immersive);
    // 进入沉浸模式时顺手关掉移动端抽屉，避免两个状态叠在一起。
    if (immersive) toggleNavMobile(false);
    if (elImmersiveBtn) {
      elImmersiveBtn.textContent = immersive ? '⛶' : '⛶';
      elImmersiveBtn.classList.toggle('on', immersive);
      elImmersiveBtn.title = immersive
        ? '退出沉浸模式（快捷键 F）'
        : '沉浸模式（隐藏导航，快捷键 F）';
    }
    try { localStorage.setItem('lifesim.immersive', immersive ? '1' : '0'); } catch (e) { /* ignore */ }
    window.dispatchEvent(new Event('resize'));
  }

  function setActive(path) {
    for (const [p, link] of Object.entries(elNavLinks)) {
      const on = p === path || (p !== '/' && path.startsWith(p + '/')) ||
        (p === '/lab' && path.startsWith('/lab'));
      link.classList.toggle('on', !!on);
      const wrap = link.parentElement;
      if (wrap && wrap.classList.contains('nav-item-wrap')) {
        wrap.classList.toggle('open', !!on);
      }
    }
    toggleNavMobile(false);
    if (elViewport) elViewport.scrollTop = 0;
  }

  function toggleNavMobile(force) {
    const on = force == null ? !document.body.classList.contains('nav-open') : !!force;
    document.body.classList.toggle('nav-open', on);
  }

  /**
   * 汉堡按钮：
   * - 桌面端的侧栏折叠只由 body.immersive 造成（body.nav-open 在 >1080px 没有样式），
   *   所以点击时先退出沉浸模式，侧栏就展开了；
   * - 移动端（≤1080px）则正常打开/关闭抽屉。
   *
   * 之前这里只调 toggleNavMobile(true)，桌面端点了完全没反应 ——
   * 而 .btn-icon 的 display:grid 又让汉堡在桌面常显，用户会以为它坏了。
   */
  function toggleNavFromBurger() {
    if (document.body.classList.contains('immersive')) {
      toggleImmersive(false);
      toggleNavMobile(true);
      return;
    }
    toggleNavMobile();
  }

  function setTitle(title, sub) {
    if (elTopTitle) elTopTitle.textContent = title || '';
    if (elTopSub) elTopSub.textContent = sub || '';
    document.title = (title ? title + ' · ' : '') + '人生概率实验室 LifeSim';
    // 同步更新导航高亮（路由会再调一次，这里保证即时反馈）
  }

  function setFate(node) {
    if (!elFate) return;
    mount(elFate, node ? [node] : []);
  }

  function setFateBadge(seed, locked) {
    setFate(LS.ui.fateBadge(seed, locked));
  }

  /** 顶栏右侧的状态点（运行中提示等） */
  function setStatus(text, tone) {
    if (!elTopSub) return;
    elTopSub.innerHTML = '';
    if (!text) return;
    elTopSub.appendChild(h('span.tb-dot' + (tone ? '.' + tone : '')));
    elTopSub.appendChild(h('span', text));
  }

  function refreshBadges() {
    const st = LS.store.state;
    if (elBadges.lives) {
      elBadges.lives.textContent = String(st.lives.length);
      elBadges.lives.style.display = st.lives.length ? '' : 'none';
    }
    if (elBadges.codex) {
      const total = LS.knowledge.list().length;
      elBadges.codex.textContent = Object.keys(st.codexSeen).length + '/' + total;
      elBadges.codex.classList.add('wide');
    }
    const runs = st.stats.totalSimulated || 0;
    const runsEl = document.getElementById('np-runs');
    const barEl = document.getElementById('np-bar');
    if (runsEl) runsEl.textContent = runs >= 10000 ? (runs / 10000).toFixed(1) + ' 万' : String(runs);
    if (barEl) {
      // 目标 100 万次模拟（规格书 §41 成就体系）
      barEl.style.width = Math.min(100, runs / 1000000 * 100) + '%';
    }
  }

  /* ============================================================
   * 快捷键（规格书 §51.3）
   * ========================================================== */
  function bindKeys() {
    document.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case 'f': case 'F': toggleImmersive(); break;
        case '1': LS.router.go('/'); break;
        case '2': LS.router.go('/create'); break;
        case '3': LS.router.go('/run'); break;
        case '4': LS.router.go('/result'); break;
        case '5': LS.router.go('/universe'); break;
        case '6': LS.router.go('/compare'); break;
        case '7': LS.router.go('/lab'); break;
        case '8': LS.router.go('/archive'); break;
        case '9': LS.router.go('/codex'); break;
        case 'Escape': toggleNavMobile(false); break;
        default: break;
      }
    });
  }

  /* ============================================================
   * 启动
   * ========================================================== */
  function start() {
    const root = document.getElementById('root') || document.body;
    mount(root, [build()]);
    bindKeys();
    try {
      if (localStorage.getItem('lifesim.immersive') === '1') toggleImmersive(true);
    } catch (e) { /* ignore */ }
    refreshBadges();
    return elViewport;
  }

  LS.shell = {
    start, setActive, setTitle, setStatus, setFate, setFateBadge,
    refreshBadges, toggleImmersive, toggleNavMobile, build,
    get viewport() { return elViewport; },
    get immersive() { return immersive; },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
