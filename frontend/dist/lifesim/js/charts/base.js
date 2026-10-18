/* ============================================================
 * LifeSim · charts/base.js
 * 自研 Canvas 图表引擎（零依赖，彻底离线）
 *
 * 全项目所有图表都继承 Base，保证：
 *   · 高 DPI 清晰（devicePixelRatio 缩放）
 *   · 容器尺寸变化自动重绘（ResizeObserver）
 *   · 统一的入场动画与缓动
 *   · 统一的 hover 命中与 tooltip
 *   · 颜色全部来自 tokens.css（规格书 §50.3）
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const U = LS.util;

  /* ============================================================
   * 主题色（从 CSS 变量读取，保证单一来源）
   * ========================================================== */
  let _theme = null;
  function theme() {
    if (_theme) return _theme;
    const s = getComputedStyle(document.documentElement);
    const g = (n, fb) => (s.getPropertyValue(n) || '').trim() || fb;
    _theme = {
      t1: g('--t-1', '#f2f4fb'),
      t2: g('--t-2', '#c3c9dd'),
      t3: g('--t-3', '#8f97b3'),
      t4: g('--t-4', '#5d6480'),
      line: g('--line-1', 'rgba(255,255,255,0.08)'),
      line2: g('--line-2', 'rgba(255,255,255,0.14)'),
      brand: '#a78bfa',
      brand2: '#7c5cff',
      blue: '#60a5fa',
      teal: '#2dd4bf',
      ok: '#34d399',
      warn: '#fbbf24',
      bad: '#f87171',
      fate: '#c084fc',
      gold: '#f5c860',
      know: '#93c5fd',
      ghost: '#64748b',
      gridBg: 'rgba(255,255,255,0.05)',
    };
    return _theme;
  }
  function resetTheme() { _theme = null; }

  /* ============================================================
   * 数学 / 工具
   * ========================================================== */
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  /** 线性比例尺 */
  function scaleLinear(d0, d1, r0, r1) {
    const dd = d1 - d0 || 1;
    const f = (v) => r0 + (v - d0) / dd * (r1 - r0);
    f.invert = (p) => d0 + (p - r0) / ((r1 - r0) || 1) * dd;
    f.domain = [d0, d1];
    f.range = [r0, r1];
    return f;
  }

  /** 生成"好看"的刻度值 */
  function niceTicks(min, max, count = 5) {
    if (!isFinite(min) || !isFinite(max)) return [0];
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    const raw = span / Math.max(1, count);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
    const start = Math.ceil(min / step) * step;
    const out = [];
    for (let v = start; v <= max + step * 1e-9; v += step) {
      out.push(Math.abs(v) < step * 1e-9 ? 0 : +v.toPrecision(12));
    }
    return out.length ? out : [min, max];
  }

  /** 取整到好看的边界 */
  function niceExtent(min, max) {
    if (min === max) return [min - 1, max + 1];
    const ticks = niceTicks(min, max, 5);
    const step = ticks.length > 1 ? ticks[1] - ticks[0] : (max - min);
    return [Math.floor(min / step) * step, Math.ceil(max / step) * step];
  }

  function withAlpha(color, a) {
    if (!color) return color;
    if (color[0] === '#') {
      const h = color.slice(1);
      const n = h.length === 3
        ? h.split('').map((c) => c + c).join('')
        : h;
      const r = parseInt(n.slice(0, 2), 16);
      const g = parseInt(n.slice(2, 4), 16);
      const b = parseInt(n.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${a})`;
    }
    const m = color.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(',').map((x) => x.trim());
      return `rgba(${p[0]},${p[1]},${p[2]},${a})`;
    }
    return color;
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  /** 折线（支持缺失值断线） */
  function polyline(ctx, pts, alpha) {
    let started = false;
    ctx.beginPath();
    for (const p of pts) {
      if (!p || !isFinite(p[1])) { started = false; continue; }
      if (!started) { ctx.moveTo(p[0], p[1]); started = true; }
      else ctx.lineTo(p[0], p[1]);
    }
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.stroke();
    if (alpha != null) ctx.globalAlpha = 1;
  }

  /* ============================================================
   * 数字格式化（规格书 §50.4：单位统一，避免误读）
   *
   * 全部先做 `v == null` 判断：`isFinite(null)` 在 JS 里是 true，
   * 只写 isFinite 会让"没有这个数据"显示成 0，或在 toFixed 上抛错。
   * ========================================================== */
  const F = {
    wealth(v) {
      if (v == null || !isFinite(v)) return '—';
      const n = Number(v);
      const a = Math.abs(n);
      if (a >= 10000) return (n / 10000).toFixed(2) + ' 亿';
      if (a >= 1) return Math.round(n).toLocaleString('zh-CN') + ' 万';
      return n.toFixed(1) + ' 万';
    },
    wealthShort(v) {
      if (v == null || !isFinite(v)) return '—';
      const n = Number(v);
      const a = Math.abs(n);
      if (a >= 10000) return (n / 10000).toFixed(1) + '亿';
      if (a >= 1000) return (n / 1000).toFixed(1) + '千万';
      return Math.round(n) + '万';
    },
    int(v) {
      if (v == null || !isFinite(v)) return '—';
      return Math.round(Number(v)).toLocaleString('zh-CN');
    },
    pct(v, d = 1) {
      if (v == null || !isFinite(v)) return '—';
      return (Number(v) * 100).toFixed(d) + '%';
    },
    score(v) {
      if (v == null || !isFinite(v)) return '—';
      return Number(v).toFixed(1);
    },
    age(v) {
      if (v == null || !isFinite(v)) return '—';
      return Math.round(Number(v)) + ' 岁';
    },
    num(v, d = 2) {
      if (v == null || !isFinite(v)) return '—';
      return Number(v).toFixed(d);
    },
  };

  /* ============================================================
   * Base
   * ========================================================== */
  class Base {
    /**
     * @param {HTMLElement} host 容器
     * @param {object} opts { pad, animate, duration, minHeight }
     */
    constructor(host, opts = {}) {
      this.host = host;
      this.opts = opts;
      this.pad = Object.assign({ t: 18, r: 18, b: 30, l: 48 }, opts.pad || {});
      this.animate = opts.animate !== false;
      this.duration = opts.duration || 780;
      this.progress = this.animate ? 0 : 1;
      this.hits = [];
      this._raf = 0;
      this._t0 = 0;
      this._tip = null;
      this._destroyed = false;

      host.classList.add('chart-host');
      if (opts.minHeight && !host.style.minHeight) host.style.minHeight = opts.minHeight + 'px';

      this.canvas = document.createElement('canvas');
      this.canvas.className = 'chart-canvas';
      host.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');

      this._onMove = (e) => this._handleMove(e);
      this._onLeave = () => this.hideTip();
      this.canvas.addEventListener('mousemove', this._onMove);
      this.canvas.addEventListener('mouseleave', this._onLeave);
      this.canvas.addEventListener('touchstart', (e) => {
        if (e.touches[0]) this._handleMove(e.touches[0]);
      }, { passive: true });
      this.canvas.addEventListener('touchmove', (e) => {
        if (e.touches[0]) this._handleMove(e.touches[0]);
      }, { passive: true });

      this._ro = typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => this.resize())
        : null;
      if (this._ro) this._ro.observe(host);
      else window.addEventListener('resize', () => this.resize());

      /* 构造阶段只量尺寸，不绘制。
         基类构造一定早于子类的 setData，此时 this.bins / this.series 等还不存在；
         如果这里就 play()，在「减少动效」模式下会同步 draw() 并读到 undefined。
         第一次绘制统一交给 setData 触发，就不会有"数据未就绪"的窗口。 */
      this.resize(false);
    }

    /* ---------- 尺寸 ---------- */
    resize(redraw = true) {
      if (this._destroyed) return;
      const host = this.host;
      /* 量宿主之前必须先把画布高度归零。
         <canvas> 不设 CSS 高度时会按默认的 300×150 固有比例（2:1）显示，
         于是它会把宿主撑到「宽度的一半」，而 resize() 又把这个错误高度
         读回来固化 —— 结果每张图都比 minHeight 设计值高出近一倍，
         整页也跟着长一倍。归零后 clientHeight 就只剩 min-height 生效。 */
      this.canvas.style.height = '0px';
      const w = Math.max(80, host.clientWidth || 300);
      const h = Math.max(60, host.clientHeight || this.opts.height || 200);
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      this.w = w;
      this.h = h;
      this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (redraw) this.play();
    }

    plot() {
      const p = this.pad;
      return {
        x0: p.l, y0: p.t, x1: this.w - p.r, y1: this.h - p.b,
        w: Math.max(1, this.w - p.l - p.r),
        h: Math.max(1, this.h - p.t - p.b),
      };
    }

    /* ---------- 动画 ---------- */
    play() {
      this.hits = [];
      const reduced = !!(LS.store && LS.store.state.settings && LS.store.state.settings.reduceMotion);
      if (!this.animate || reduced) {
        this.progress = 1;
        this.draw();
        return;
      }
      this.progress = 0;
      this._t0 = performance.now();
      cancelAnimationFrame(this._raf);
      const step = (now) => {
        if (this._destroyed) return;
        const t = U.clamp01((now - this._t0) / this.duration);
        this.progress = easeOutCubic(t);
        this.draw();
        if (t < 1) this._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
    }

    /** 不重播动画的立即重绘（hover 时用） */
    redraw() { this.hits = []; this.draw(); }

    setData() { this.play(); }

    clear() {
      const c = this.ctx;
      c.clearRect(0, 0, this.w, this.h);
    }

    empty(message) {
      const c = this.ctx, th = theme();
      c.save();
      c.fillStyle = th.t4;
      c.font = '13px var(--font-sans, system-ui)';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(message || '暂无数据', this.w / 2, this.h / 2);
      c.restore();
    }

    /* ---------- 坐标轴辅助 ---------- */
    gridY(scale, ticks, opts = {}) {
      const c = this.ctx, th = theme(), g = this.plot();
      c.save();
      c.strokeStyle = opts.color || th.gridBg;
      c.lineWidth = 1;
      c.font = `${opts.fontSize || 10.5}px var(--font-mono, monospace)`;
      c.fillStyle = opts.labelColor || th.t4;
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      for (const t of ticks) {
        const y = Math.round(scale(t)) + 0.5;
        if (y < g.y0 - 1 || y > g.y1 + 1) continue;
        c.beginPath();
        c.moveTo(g.x0, y);
        c.lineTo(g.x1, y);
        c.stroke();
        c.fillText(opts.fmt ? opts.fmt(t) : String(t), g.x0 - 8, y);
      }
      c.restore();
    }

    axisY(scale, ticks, opts = {}) {
      const c = this.ctx, th = theme(), g = this.plot();
      c.save();
      c.strokeStyle = th.line2;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(Math.round(g.x0) + 0.5, g.y0);
      c.lineTo(Math.round(g.x0) + 0.5, g.y1);
      c.stroke();
      c.font = `${opts.fontSize || 10.5}px var(--font-mono, monospace)`;
      c.fillStyle = th.t4;
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      for (const t of ticks) {
        const y = scale(t);
        c.fillText(opts.fmt ? opts.fmt(t) : String(t), g.x0 - 8, y);
      }
      c.restore();
    }

    axisX(scale, ticks, opts = {}) {
      const c = this.ctx, g = this.plot();
      c.save();
      c.font = `${opts.fontSize || 10.5}px var(--font-mono, monospace)`;
      c.fillStyle = theme().t4;
      c.textAlign = 'center';
      c.textBaseline = 'top';
      for (const t of ticks) {
        const x = scale(t);
        if (x < g.x0 - 2 || x > g.x1 + 2) continue;
        c.fillText(opts.fmt ? opts.fmt(t) : String(t), x, g.y1 + 8);
      }
      if (opts.title) {
        c.textAlign = 'right';
        c.fillStyle = theme().t4;
        c.fillText(opts.title, g.x1, g.y1 + 8);
      }
      c.restore();
    }

    /** 可点击/悬停的矩形或点集合 */
    addHit(hit) { this.hits.push(hit); return hit; }

    /* ---------- 命中与 tooltip ---------- */
    _handleMove(e) {
      const r = this.canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const th = theme();
      let best = null, bestD = Infinity;
      for (const h of this.hits) {
        let d;
        if (h.type === 'band') {
          if (y >= (h.y0 ?? 0) && y <= (h.y1 ?? this.h)) {
            if (x >= h.x0 && x <= h.x1) { best = h; bestD = -1; break; }
            continue;
          }
          continue;
        }
        if (h.type === 'vband') {
          if (x >= h.x0 && x <= h.x1) { best = h; bestD = -1; break; }
          continue;
        }
        const dx = x - h.x, dy = y - h.y;
        d = Math.sqrt(dx * dx + dy * dy);
        if (d < (h.r || 12) && d < bestD) { best = h; bestD = d; }
      }
      if (best && best.html) {
        this.showTip(best.html, best.tx != null ? best.tx : x, best.ty != null ? best.ty : y, th);
      } else if (best && best.onHover) {
        best.onHover();
        this.hideTip();
      } else {
        this.hideTip();
      }
      this.hovered = best;
      if (this.onHoverChange) this.onHoverChange(best, x, y);
    }

    showTip(html, x, y) {
      if (!this._tip) {
        this._tip = document.createElement('div');
        this._tip.className = 'chart-tip';
        this.host.appendChild(this._tip);
      }
      const tip = this._tip;
      tip.innerHTML = html;
      tip.classList.add('on');
      // 先渲染再量宽高，避免抖动
      const tw = tip.offsetWidth, thh = tip.offsetHeight;
      const hw = this.w, hh = this.h;
      let left = x + 14;
      if (left + tw > hw - 6) left = Math.max(6, x - tw - 14);
      let top = y - thh - 12;
      if (top < 4) top = Math.min(hh - thh - 4, y + 16);
      tip.style.left = left + 'px';
      tip.style.top = Math.max(4, top) + 'px';
      tip.style.opacity = '1';
    }

    hideTip() {
      if (this._tip) this._tip.classList.remove('on');
    }

    destroy() {
      this._destroyed = true;
      cancelAnimationFrame(this._raf);
      if (this._ro) this._ro.disconnect();
      else window.removeEventListener('resize', this.resize);
      this.canvas.removeEventListener('mousemove', this._onMove);
      this.canvas.removeEventListener('mouseleave', this._onLeave);
      if (this._tip) this._tip.remove();
      if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    }

    /* 子类实现 */
    draw() { /* override */ }
  }

  /* ============================================================
   * tooltip HTML 组装（供各图表复用）
   * ========================================================== */
  function tipHTML(title, rows) {
    const parts = [];
    if (title) parts.push(`<div class="tt-title">${title}</div>`);
    for (const r of rows) {
      if (!r) continue;
      parts.push(`<div class="tt-row"><span style="color:${r.color || 'inherit'}">${r.label}</span><b>${r.value}</b></div>`);
    }
    return parts.join('');
  }

  /* ============================================================
   * 图表注册表（供页面按名创建，便于销毁管理）
   * ========================================================== */
  const registry = new Map();
  const live = new Set();

  function register(name, Ctor) { registry.set(name, Ctor); }

  function create(name, host, opts) {
    const Ctor = registry.get(name);
    if (!Ctor) throw new Error('未注册的图表类型: ' + name);
    const inst = new Ctor(host, opts || {});
    live.add(inst);
    return inst;
  }

  /** 页面切换时统一销毁，避免 rAF / 监听泄漏 */
  function destroyAll() {
    for (const c of live) c.destroy();
    live.clear();
  }

  /**
   * 在同一个容器上重建图表：先把该容器上已有的图表销毁，再创建新的。
   * 参数面板拖动时会高频重建，没有这一步会持续泄漏 ResizeObserver 与 rAF。
   */
  function replace(host, name, opts) {
    for (const c of Array.from(live)) {
      if (c.host === host) { c.destroy(); live.delete(c); }
    }
    return create(name, host, opts);
  }

  LS.charts = Object.assign(LS.charts || {}, {
    Base, theme, resetTheme,
    scaleLinear, niceTicks, niceExtent, withAlpha, roundRect, polyline,
    easeOutCubic, F, tipHTML,
    register, create, replace, destroyAll, registry,
    LIVE: live,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
