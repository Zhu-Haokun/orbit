/* ============================================================
 * LifeSim · ui/router.js
 * 极简哈希路由（规格书 §55）
 *   #/                      首页
 *   #/create                人生创建器
 *   #/run                   人生运行
 *   #/result                人生结果
 *   #/universe              平行宇宙
 *   #/compare               策略对比
 *   #/archive               人生档案
 *   #/codex                 人生图鉴（事件 / 成就）
 *   #/settings              设置
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});

  const routes = new Map();
  let notFound = null;
  let current = null;
  let onChange = null;

  /** 注册路由：path 形如 '/lab/:sub' */
  function register(path, handler) {
    routes.set(path, handler);
  }

  function parseHash() {
    const raw = (location.hash || '#/').replace(/^#/, '');
    const [pathPart, queryPart] = raw.split('?');
    const path = pathPart || '/';
    const segs = path.split('/').filter(Boolean);
    const query = {};
    if (queryPart) {
      for (const kv of queryPart.split('&')) {
        if (!kv) continue;
        const [k, v] = kv.split('=');
        query[decodeURIComponent(k)] = decodeURIComponent(v || '');
      }
    }
    return { path, segs, query };
  }

  /** 匹配路由，返回 {handler, params} */
  function match(path, segs) {
    if (routes.has(path)) return { handler: routes.get(path), params: {} };
    for (const [pattern, handler] of routes) {
      if (!pattern.includes(':')) continue;
      const ps = pattern.split('/').filter(Boolean);
      if (ps.length !== segs.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < ps.length; i++) {
        if (ps[i].startsWith(':')) params[ps[i].slice(1)] = decodeURIComponent(segs[i]);
        else if (ps[i] !== segs[i]) { ok = false; break; }
      }
      if (ok) return { handler, params };
    }
    return null;
  }

  function go(path, query) {
    let hash = '#' + path;
    if (query && Object.keys(query).length) {
      hash += '?' + Object.entries(query)
        .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
        .join('&');
    }
    if (location.hash === hash) return;
    location.hash = hash;
  }

  function resolve() {
    const { path, segs, query } = parseHash();
    const m = match(path, segs);
    current = { path, segs, query, params: m ? m.params : {} };
    const handler = m ? m.handler : notFound;
    if (typeof onChange === 'function') onChange(current);
    if (handler) {
      try {
        handler(current);
      } catch (e) {
        console.error('[LifeSim] 页面渲染失败', current.path, e);
        if (notFound) notFound(current, e);
      }
    }
    // 切换页面时把视口滚回顶部
    const vp = document.getElementById('viewport');
    if (vp) vp.scrollTop = 0;
  }

  function start(options = {}) {
    notFound = options.notFound || null;
    onChange = options.onChange || null;
    global.addEventListener('hashchange', resolve);
    resolve();
  }

  LS.router = {
    register, go, start, resolve,
    get current() { return current; },
    /** 当前是否停在某个路径前缀下（用于导航高亮） */
    isUnder(prefix) {
      if (!current) return false;
      return current.path === prefix || current.path.startsWith(prefix + '/');
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
