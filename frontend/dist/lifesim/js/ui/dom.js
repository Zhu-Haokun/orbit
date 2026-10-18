/* ============================================================
 * LifeSim · ui/dom.js
 * 极简 DOM 构建工具（无框架，纯原生）
 *
 * 用法：
 *   h('div.card', { onclick: fn }, [ h('span', '文本') ])
 *   h('button.btn.primary', '开始')
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SVG_TAGS = new Set([
    'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line',
    'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient',
    'stop', 'text', 'tspan', 'use',
  ]);

  /**
   * 创建元素。
   * @param {string} spec 形如 'div.cls1.cls2#id' 或 'div'
   * @param {object|string|Array|Node} [props] 属性，或直接是子节点
   * @param {...any} children
   */
  function h(spec, props, ...children) {
    // 解析 tag / id / classes
    let tag = 'div';
    let id = null;
    const classes = [];
    const m = String(spec).match(/^([a-zA-Z0-9-]+)?((?:[.#][^.#]+)*)$/);
    if (m) {
      if (m[1]) tag = m[1];
      const rest = m[2] || '';
      rest.replace(/([.#])([^.#]+)/g, (_, sym, name) => {
        if (sym === '#') id = name;
        else classes.push(name);
        return '';
      });
    } else {
      tag = String(spec);
    }

    const isSvg = SVG_TAGS.has(tag);
    const el = isSvg
      ? document.createElementNS(SVG_NS, tag)
      : document.createElement(tag);
    if (id) el.id = id;
    if (classes.length) {
      if (isSvg) el.setAttribute('class', classes.join(' '));
      else el.className = classes.join(' ');
    }

    // props 可能是子节点
    let attrs = null;
    if (props && (typeof props === 'object') && !(props instanceof Node) &&
        !Array.isArray(props) && !(props instanceof global.Node)) {
      attrs = props;
    } else if (props != null) {
      children.unshift(props);
    }

    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class' || k === 'className') {
          el.className = (el.className ? el.className + ' ' : '') + v;
        } else if (k === 'style' && typeof v === 'object') {
          Object.assign(el.style, v);
        } else if (k === 'dataset' && typeof v === 'object') {
          Object.assign(el.dataset, v);
        } else if (k === 'html') {
          el.innerHTML = v;
        } else if (k === 'text') {
          el.textContent = v;
        } else if (k.startsWith('on') && typeof v === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'value' && 'value' in el) {
          el.value = v;
        } else if (k === 'checked' && 'checked' in el) {
          el.checked = !!v;
        } else if (v === true) {
          el.setAttribute(k, '');
        } else {
          el.setAttribute(k, v);
        }
      }
    }

    append(el, children);
    return el;
  }

  function append(el, children) {
    for (const c of children) {
      if (c == null || c === false) continue;
      if (Array.isArray(c)) { append(el, c); continue; }
      if (c instanceof Node) { el.appendChild(c); continue; }
      el.appendChild(document.createTextNode(String(c)));
    }
  }

  /** 清空并可选填入新内容 */
  function mount(target, ...children) {
    target.textContent = '';
    append(target, children);
    return target;
  }

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** 事件委托 */
  function on(root, event, selector, handler) {
    root.addEventListener(event, (e) => {
      const t = e.target.closest(selector);
      if (t && root.contains(t)) handler(e, t);
    });
  }

  /** 数字滚动动画（规格书 §8.2：点击随机角色后数值快速滚动） */
  function rollNumber(el, from, to, ms = 520, fmt = (v) => Math.round(v)) {
    const t0 = performance.now();
    const dur = ms;
    function tick(now) {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * eased);
      if (k < 1) requestAnimationFrame(tick);
      else el.textContent = fmt(to);
    }
    requestAnimationFrame(tick);
  }

  /** 元素出现动画：依次错开，让列表有节奏感 */
  function stagger(els, step = 32, cls = 'anim-up') {
    els.forEach((el, i) => {
      if (!el) return;
      el.style.animationDelay = i * step + 'ms';
      el.classList.add(cls);
    });
  }

  /** 简易节流 */
  function rafThrottle(fn) {
    let queued = false;
    let lastArgs = null;
    return function (...args) {
      lastArgs = args;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fn.apply(this, lastArgs);
      });
    };
  }

  LS.dom = { h, mount, append, $, $$, on, rollNumber, stagger, rafThrottle };
})(typeof globalThis !== 'undefined' ? globalThis : this);
