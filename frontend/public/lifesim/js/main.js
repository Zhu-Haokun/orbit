/* ============================================================
 * LifeSim · main.js
 * 应用启动：加载状态 → 建立外壳 → 注册路由 → 启动
 *
 * 加载顺序由 index.html 的 script 标签保证，这里只负责"把它们串起来"。
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});

  /** 依赖自检：任何模块缺失都直接给出可读的错误，而不是白屏 */
  const REQUIRED = [
    'util', 'rng', 'distributions', 'stats', 'markov',
    'config', 'character', 'world', 'events', 'life', 'montecarlo',
    'dom', 'store', 'router', 'ui', 'knowledge', 'meta', 'audio', 'shell',
    'charts', 'views',
  ];

  function checkModules() {
    const missing = REQUIRED.filter((k) => !LS[k]);
    if (missing.length) {
      document.body.innerHTML =
        '<div style="padding:40px;font-family:system-ui;color:#f2f4fb;background:#080a14;' +
        'min-height:100vh;line-height:1.7">' +
        '<h1 style="font-size:22px">LifeSim 启动失败</h1>' +
        '<p>以下模块没有加载成功：<b>' + missing.join(', ') + '</b></p>' +
        '<p style="color:#8f97b3">请检查 <code>js/</code> 目录是否完整，' +
        '并确认浏览器控制台没有 JS 语法错误。</p></div>';
      return false;
    }
    return true;
  }

  function applyGlobalSettings() {
    const s = LS.store.state.settings;
    LS.audio.setEnabled(!!s.sound);
    document.body.classList.toggle('reduce-motion', !!s.reduceMotion);
  }

  function notFound(route) {
    LS.views.render({ title: '页面不存在', sub: route ? route.path : '' }, [
      LS.dom.h('div.card.roomy', [
        LS.dom.h('div.empty', [
          LS.dom.h('div.e-ico', '🧭'),
          LS.dom.h('div.h3', '这个页面不存在'),
          LS.dom.h('div', { style: { lineHeight: '1.7', maxWidth: '46ch' } },
            '地址可能写错了。下面这几个入口一定能到：'),
          LS.dom.h('div.row.gap-3.wrap', { style: { marginTop: 'var(--s-4)' } }, [
            LS.ui.button('回到首页', { variant: 'primary', onClick: () => LS.router.go('/') }),
            LS.ui.button('设计人生', { variant: 'ghost', onClick: () => LS.router.go('/create') }),
            LS.ui.button('人生图鉴', { variant: 'ghost', onClick: () => LS.router.go('/codex') }),
            LS.ui.button('人生档案', { variant: 'ghost', onClick: () => LS.router.go('/archive') }),
          ]),
        ]),
      ]),
    ]);
  }

  /** 全局错误兜底：不让任何异常变成白屏 */
  function installErrorHandlers() {
    global.addEventListener('error', (e) => {
      console.error('[LifeSim] 未捕获错误', e.error || e.message);
      try {
        LS.ui.toast('出现了一个内部错误，已记录到控制台。当前页面仍可继续使用。', 'warn', 5200);
      } catch (err) { /* ignore */ }
    });
    global.addEventListener('unhandledrejection', (e) => {
      console.error('[LifeSim] 未处理的 Promise 拒绝', e.reason);
    });
  }

  /** localStorage 在 file:// 或隐私模式下可能不可用，统一包一层 */
  function lsGet(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, value) {
    try { global.localStorage.setItem(key, value); } catch (e) { /* 静默 */ }
  }

  /** 首次访问的引导（规格书 §41 黄金路径） */
  function firstRunHint() {
    const st = LS.store.state;
    if (st.stats.totalSimulated > 0) return;
    if (lsGet('lifesim.seen-welcome') === '1') return;
    setTimeout(() => {
      LS.ui.modal({
        title: '欢迎来到平行人生',
        sub: '第一次使用，建议按这个顺序体验',
        size: 'lg',
        body: [
          LS.dom.h('div.golden-path', [
            LS.dom.h('div.gp-step', [
              LS.dom.h('div.gp-num', '1'),
              LS.dom.h('div.gp-body', [
                LS.dom.h('div.gp-title', '设计一个角色'),
                LS.dom.h('div.gp-desc', '调几个滑块，捏出一个更像你的角色'),
              ]),
            ]),
            LS.dom.h('div.gp-step', [
              LS.dom.h('div.gp-num', '2'),
              LS.dom.h('div.gp-body', [
                LS.dom.h('div.gp-title', '看完这一生'),
                LS.dom.h('div.gp-desc', '逐年往下走，遇到岔路就停一下'),
              ]),
            ]),
            LS.dom.h('div.gp-step', [
              LS.dom.h('div.gp-num', '3'),
              LS.dom.h('div.gp-body', [
                LS.dom.h('div.gp-title', '重演一万次'),
                LS.dom.h('div.gp-desc', '把同一种活法演一万遍，看看有多少种结局'),
              ]),
            ]),
          ]),
          LS.dom.h('div', { style: { height: 'var(--s-4)' } }),
          LS.ui.notice('全部计算都在你的浏览器里完成：没有服务器、没有网络请求、不上传任何数据。', 'know'),
          LS.dom.h('div.row.gap-3.wrap', { style: { marginTop: 'var(--s-4)' } }, [
            LS.ui.button('开始设计人生', {
              variant: 'primary',
              onClick: () => { lsSet('lifesim.seen-welcome', '1'); LS.router.go('/create'); },
            }),
            LS.ui.button('先看看首页', {
              variant: 'ghost',
              onClick: () => { lsSet('lifesim.seen-welcome', '1'); },
            }),
          ]),
        ],
      });
    }, 700);
  }

  function boot() {
    if (!checkModules()) return;

    LS.store.load();
    applyGlobalSettings();
    installErrorHandlers();

    LS.shell.start();

    LS.router.start({
      notFound,
      onChange: (cur) => {
        LS.shell.setActive(cur.path);
        // 页面标题由各视图通过 views.render 设置，这里只处理导航高亮
      },
    });

    // 设置变化时同步全局状态
    global.addEventListener('lifesim:settings', () => {
      applyGlobalSettings();
      LS.shell.refreshBadges();
    });

    firstRunHint();

    // 便于在控制台里调试
    global.LifeSim = LS;
    console.log(
      '%cLifeSim%c 平行人生已启动 · 版本 v1.1 · 完全离线运行',
      'background:linear-gradient(135deg,#7c5cff,#2dd4bf);color:#fff;padding:2px 6px;border-radius:4px;font-weight:700',
      'color:#8f97b3',
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
