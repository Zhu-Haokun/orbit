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
        { path: '/', icon: 'home', label: '开始', exact: true },
      ],
    },
    {
      group: '人生',
      items: [
        { path: '/create', icon: 'sliders', label: '设计人生' },
        { path: '/run', icon: 'play', label: '运行这一生' },
        { path: '/result', icon: 'report', label: '人生报告' },
        { path: '/universe', icon: 'orbit', label: '平行宇宙' },
        { path: '/compare', icon: 'scale', label: '策略对照' },
      ],
    },
    {
      group: '收藏',
      items: [
        { path: '/archive', icon: 'archive', label: '人生档案', badge: 'lives' },
        { path: '/codex', icon: 'book', label: '人生图鉴', badge: 'codex' },
      ],
    },
  ];

  /* ============================================================
   * 内部状态
   * ========================================================== */
  let elNav = null, elMain = null, elViewport = null, elTopTitle = null,
    elTopSub = null, elFate = null, elBadges = {}, elNavLinks = {},
    elBrand = null, elBurger = null, elBackdrop = null;
  let immersive = false;

  /* ============================================================
   * 构建
   * ========================================================== */

  function buildBrand() {
    // 品牌图标就是桌面端的“收起 / 展开”开关：不额外占一个按钮的位置。
    elBrand = h('button.brand', {
      type: 'button',
      title: '收起导航',
      'aria-label': '收起导航',
      onClick: toggleNavFromBrand,
    }, [
      h('div.brand-mark', '◈'),
      h('div.brand-text', [
        h('div.brand-name', '平行人生'),
        h('div.brand-sub', '人生沙盒 · 离线'),
      ]),
    ]);
    return elBrand;
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
      h('span.nav-ico', LS.ui.icon(item.icon, 18) || item.icon),
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
    // 汉堡只在移动端显示（桌面端由侧栏顶部的品牌图标负责收起/展开）。
    elBurger = LS.ui.iconButton(LS.ui.icon('menu', 18) || '☰', {
      onClick: toggleNavFromBurger,
      title: '打开导航',
    });
    elBurger.classList.add('tb-icon', 'tb-burger');

    return h('header.topbar', [
      elBurger,
      h('div.tb-left', [elTopTitle, elTopSub]),
      h('div.tb-right', [
        elFate,
        h('button.btn.ghost.sm.tb-quick', {
          type: 'button',
          onclick: () => LS.router.go('/create'),
          title: '快速设计一个新人生',
        }, [h('span', LS.ui.icon('spark', 14) || '✦'), h('span', '新人生')]),
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
        h('span.nav-ico', LS.ui.icon('settings', 18) || '⚙️'),
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
    // 沉浸模式与“手动收起”互斥：进入/退出沉浸都清掉 nav-collapsed，
    // 否则两个折叠状态叠在一起，会出现“按了没反应”的错觉。
    document.body.classList.remove('nav-collapsed');
    persistNavCollapsed();
    // 进入沉浸模式时顺手关掉移动端抽屉，避免两个状态叠在一起。
    if (immersive) toggleNavMobile(false);
    try { localStorage.setItem('lifesim.immersive', immersive ? '1' : '0'); } catch (e) { /* ignore */ }
    updateNavToggle();
    window.dispatchEvent(new Event('resize'));
  }

  function setActive(path) {
    for (const [p, link] of Object.entries(elNavLinks)) {
      const on = p === path || (p !== '/' && path.startsWith(p + '/'));
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
    updateNavToggle();
  }

  function isNarrowNav() {
    return !!(global.matchMedia && global.matchMedia('(max-width: 1080px)').matches);
  }

  /** 同步品牌图标与移动端汉堡按钮的“收起 / 展开”语义。 */
  function updateNavToggle() {
    const narrow = isNarrowNav();
    let label;

    if (narrow) {
      const open = document.body.classList.contains('nav-open');
      label = open ? '关闭导航' : '打开导航';
      if (elBurger) {
        elBurger.textContent = '☰';
        elBurger.title = label;
        elBurger.setAttribute('aria-label', label);
      }
    } else {
      const collapsed = document.body.classList.contains('immersive') ||
        document.body.classList.contains('nav-collapsed');
      label = collapsed ? '展开导航' : '收起导航';
      if (elBurger) {
        elBurger.textContent = collapsed ? '☰' : '«';
        elBurger.title = label;
        elBurger.setAttribute('aria-label', label);
      }
    }

    if (elBrand) {
      elBrand.title = label;
      elBrand.setAttribute('aria-label', label);
    }
  }

  function persistNavCollapsed() {
    try {
      localStorage.setItem(
        'lifesim.nav-collapsed',
        document.body.classList.contains('nav-collapsed') ? '1' : '0'
      );
    } catch (e) { /* ignore */ }
  }

  /**
   * 侧栏顶部的品牌图标：桌面端的“收起 / 展开”开关。
   * 沉浸模式造成的折叠也在这里退出；移动端点击则关闭抽屉。
   */
  function toggleNavFromBrand() {
    if (isNarrowNav()) {
      toggleNavMobile(false);
      return;
    }

    if (document.body.classList.contains('immersive')) {
      toggleImmersive(false);
      return;
    }

    document.body.classList.toggle('nav-collapsed');
    persistNavCollapsed();
    updateNavToggle();
  }

  /**
   * 移动端的汉堡按钮：打开/关闭抽屉。
   * 桌面端它被 CSS 隐藏，收起/展开由侧栏品牌图标负责。
   */
  function toggleNavFromBurger() {
    if (isNarrowNav()) {
      if (document.body.classList.contains('immersive')) toggleImmersive(false);
      toggleNavMobile();
      updateNavToggle();
      return;
    }

    if (document.body.classList.contains('immersive')) {
      toggleImmersive(false);
      return;
    }

    document.body.classList.toggle('nav-collapsed');
    persistNavCollapsed();
    updateNavToggle();
  }

  function setTitle(title, sub) {
    if (elTopTitle) elTopTitle.textContent = title || '';
    if (elTopSub) elTopSub.textContent = sub || '';
    document.title = (title ? title + ' · ' : '') + '平行人生 LifeSim';
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
      const p = LS.meta.progress();
      elBadges.codex.textContent = p.done + '/' + p.total;
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
        case '7': LS.router.go('/archive'); break;
        case '8': LS.router.go('/codex'); break;
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
      if (localStorage.getItem('lifesim.nav-collapsed') === '1') {
        document.body.classList.add('nav-collapsed');
      }
    } catch (e) { /* ignore */ }
    try {
      if (localStorage.getItem('lifesim.immersive') === '1') toggleImmersive(true);
    } catch (e) { /* ignore */ }
    updateNavToggle();
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
