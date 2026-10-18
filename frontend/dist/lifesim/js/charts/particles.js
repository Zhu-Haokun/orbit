/* ============================================================
 * LifeSim · charts/particles.js
 * 首页背景粒子场：缓慢漂浮的"概率点"，靠近时连成细线
 * 设计目标：传达"无数种可能正在浮动"的隐喻（规格书 §7.1）
 * 刻意保持低开销：默认 54 个粒子，requestAnimationFrame 上限 30fps
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});

  class ParticleField {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.count = opts.count || 54;
      this.linkDist = opts.linkDist || 132;
      this.running = false;
      this._last = 0;
      this._raf = 0;
      this.pts = [];
      this.seed = opts.seed || 20240101;
      this._rand = this._mulberry(this.seed);
      this._ro = typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => this.resize())
        : null;
      if (this._ro) this._ro.observe(canvas.parentElement || canvas);
      else window.addEventListener('resize', () => this.resize());
      this.resize();
    }

    _mulberry(a) {
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    resize() {
      const host = this.canvas.parentElement || this.canvas;
      const w = Math.max(120, host.clientWidth || window.innerWidth);
      const h = Math.max(120, host.clientHeight || 420);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = w; this.h = h;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._spawn();
    }

    _spawn() {
      const r = this._rand;
      this.pts = [];
      for (let i = 0; i < this.count; i++) {
        this.pts.push({
          x: r() * this.w,
          y: r() * this.h,
          vx: (r() - 0.5) * 0.16,
          vy: (r() - 0.5) * 0.16,
          r: 0.9 + r() * 1.9,
          a: 0.16 + r() * 0.44,
          hue: r() < 0.28 ? 'gold' : r() < 0.5 ? 'teal' : 'brand',
        });
      }
    }

    start() {
      if (this.running) return;
      this.running = true;
      const loop = (now) => {
        if (!this.running) return;
        this._raf = requestAnimationFrame(loop);
        if (now - this._last < 33) return; // 约 30fps，够顺滑且省电
        this._last = now;
        this.step();
      };
      this._raf = requestAnimationFrame(loop);
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this._raf);
    }

    step() {
      const c = this.ctx;
      const th = LS.charts.theme();
      c.clearRect(0, 0, this.w, this.h);
      const colors = { brand: th.brand, gold: th.gold, teal: th.teal };

      for (const p of this.pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = this.w + 10;
        if (p.x > this.w + 10) p.x = -10;
        if (p.y < -10) p.y = this.h + 10;
        if (p.y > this.h + 10) p.y = -10;
      }

      // 连线
      c.lineWidth = 0.6;
      for (let i = 0; i < this.pts.length; i++) {
        for (let j = i + 1; j < this.pts.length; j++) {
          const a = this.pts[i], b = this.pts[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > this.linkDist * this.linkDist) continue;
          const t = 1 - Math.sqrt(d2) / this.linkDist;
          c.strokeStyle = LS.charts.withAlpha(th.brand, t * 0.14);
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.stroke();
        }
      }

      // 点
      for (const p of this.pts) {
        const col = colors[p.hue] || th.brand;
        c.beginPath();
        c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        c.fillStyle = LS.charts.withAlpha(col, p.a);
        c.fill();
        if (p.r > 2.2) {
          c.beginPath();
          c.arc(p.x, p.y, p.r * 3.4, 0, Math.PI * 2);
          c.fillStyle = LS.charts.withAlpha(col, p.a * 0.10);
          c.fill();
        }
      }
    }

    destroy() {
      this.stop();
      if (this._ro) this._ro.disconnect();
    }
  }

  LS.charts.ParticleField = ParticleField;
  LS.charts.createParticles = function (canvas, opts) {
    const f = new ParticleField(canvas, opts);
    f.start();
    return f;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
