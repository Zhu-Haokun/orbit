/* ============================================================
 * LifeSim · charts/analysis.js
 * 分析型图表：热力图 / 相关矩阵 / 散点 / 贝叶斯 / 马尔可夫图
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const B = LS.charts.Base;
  const { scaleLinear, niceTicks, withAlpha, roundRect, theme, F, tipHTML, register } = LS.charts;
  const U = LS.util;

  /* ============================================================
   * 热力图（规格书 §27.4 参数敏感性）
   * 顺序色阶：低=深蓝，高=青绿；也支持以 center 为中心的发散色阶
   * ========================================================== */
  class Heatmap extends B {
    /**
     * opts.xLabels, opts.yLabels  string[]
     * opts.values: number[][]   行=y，列=x
     * opts.center: number       发散中心（不传则顺序色阶）
     * opts.fmt
     * opts.mark: {x:number,y:number} 当前参数位置（列/行下标）
     * opts.xTitle, opts.yTitle
     */
    constructor(host, opts = {}) {
      super(host, Object.assign({ pad: { t: 22, r: 18, b: 54, l: 84 } }, opts));
      this.setData(opts);
    }

    setData(opts = {}) {
      Object.assign(this.opts, opts);
      const v = this.opts.values || [];
      const flat = v.flat().filter(isFinite);
      this.vmin = flat.length ? Math.min(...flat) : 0;
      this.vmax = flat.length ? Math.max(...flat) : 1;
      if (this.opts.center != null) {
        const m = Math.max(Math.abs(this.vmin - this.opts.center), Math.abs(this.vmax - this.opts.center)) || 1;
        this.vmin = this.opts.center - m;
        this.vmax = this.opts.center + m;
      }
      this.play();
    }

    _color(v) {
      const o = this.opts;
      const span = (this.vmax - this.vmin) || 1;
      const t = Math.max(0, Math.min(1, (v - this.vmin) / span));
      if (o.center != null) {
        // 发散：负=红，0=深灰，正=青
        const m = (v - o.center) / ((this.vmax - this.vmin) / 2 || 1);
        if (m >= 0) {
          return `rgb(${Math.round(30 + 15 * m)},${Math.round(90 + 122 * m)},${Math.round(90 + 57 * m)})`;
        }
        const a = -m;
        return `rgb(${Math.round(90 + 158 * a)},${Math.round(90 - 30 * a)},${Math.round(90 - 20 * a)})`;
      }
      // 顺序：深蓝 → 青 → 金
      const stops = [
        [17, 24, 48], [30, 64, 130], [45, 160, 190], [52, 211, 153], [245, 200, 96],
      ];
      const pos = t * (stops.length - 1);
      const i0 = Math.floor(pos), i1 = Math.min(stops.length - 1, i0 + 1);
      const f = pos - i0;
      const mix = (a, b, k) => Math.round(a + (b - a) * k);
      return `rgb(${mix(stops[i0][0], stops[i1][0], f)},${mix(stops[i0][1], stops[i1][1], f)},${mix(stops[i0][2], stops[i1][2], f)})`;
    }

    draw() {
      const c = this.ctx, th = theme(), o = this.opts;
      this.clear();
      const vals = o.values || [];
      if (!vals.length) { this.empty(o.emptyText || '还没有敏感性数据'); return; }
      const g = this.plot();
      const rows = vals.length, cols = vals[0].length;
      const cw = g.w / cols, ch = g.h / rows;
      const pr = this.progress;

      c.save();
      for (let r = 0; r < rows; r++) {
        for (let q = 0; q < cols; q++) {
          const v = vals[r][q];
          if (!isFinite(v)) continue;
          const y = g.y0 + r * ch;
          const x = g.x0 + q * cw;
          c.fillStyle = this._color(v);
          // 动画：格子从中心向外淡入
          c.globalAlpha = U.clamp01(pr * 1.3 - (Math.abs(r - rows / 2) + Math.abs(q - cols / 2)) / (rows + cols) * 0.5);
          c.fillRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
          c.globalAlpha = 1;
          // 数值文字（格子够大时才写）
          if (cw > 52 && ch > 22) {
            const dark = (v - this.vmin) / ((this.vmax - this.vmin) || 1) > 0.62;
            c.fillStyle = dark ? 'rgba(9,11,22,0.82)' : 'rgba(255,255,255,0.86)';
            c.font = '600 10.5px var(--font-mono, monospace)';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(o.fmt ? o.fmt(v) : F.num(v, 2), x + cw / 2, y + ch / 2);
          }
          this.addHit({
            type: 'band', x0: x, x1: x + cw, y0: y, y1: y + ch,
            html: tipHTML((o.yLabels ? o.yLabels[r] + ' · ' : '') + (o.xLabels ? o.xLabels[q] : ''), [
              { label: o.valueLabel || '结果', value: (o.fmt ? o.fmt(v) : F.num(v, 3)) },
            ]),
          });
        }
      }
      c.restore();

      // 轴标签
      c.save();
      c.font = '10px var(--font-mono, monospace)';
      c.fillStyle = th.t4;
      c.textAlign = 'center';
      c.textBaseline = 'top';
      for (let q = 0; q < cols; q++) {
        c.fillText(o.xLabels ? o.xLabels[q] : String(q), g.x0 + q * cw + cw / 2, g.y1 + 8);
      }
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      for (let r = 0; r < rows; r++) {
        c.fillText(o.yLabels ? o.yLabels[r] : String(r), g.x0 - 10, g.y0 + r * ch + ch / 2);
      }
      c.restore();

      // 当前参数位置
      if (o.mark && isFinite(o.mark.x) && isFinite(o.mark.y)) {
        const mx = g.x0 + (o.mark.x + 0.5) * cw;
        const my = g.y0 + (o.mark.y + 0.5) * ch;
        c.save();
        c.strokeStyle = '#fff';
        c.lineWidth = 2.2;
        c.shadowColor = '#fff';
        c.shadowBlur = 10;
        c.strokeRect(g.x0 + o.mark.x * cw + 1, g.y0 + o.mark.y * ch + 1, cw - 2, ch - 2);
        c.restore();
      }

      // 轴标题
      if (o.xTitle) {
        c.save();
        c.font = '600 11px system-ui';
        c.fillStyle = th.t3;
        c.textAlign = 'center';
        c.textBaseline = 'bottom';
        c.fillText(o.xTitle, (g.x0 + g.x1) / 2, this.h - 4);
        c.restore();
      }
      if (o.yTitle) {
        c.save();
        c.font = '600 11px system-ui';
        c.fillStyle = th.t3;
        c.translate(13, (g.y0 + g.y1) / 2);
        c.rotate(-Math.PI / 2);
        c.textAlign = 'center';
        c.textBaseline = 'top';
        c.fillText(o.yTitle, 0, 0);
        c.restore();
      }
    }
  }

  /* ============================================================
   * 相关矩阵（规格书 §27.5）
   * ========================================================== */
  class CorrMatrix extends B {
    /**
     * opts.labels: string[]
     * opts.matrix: number[][]  （对称）
     * opts.method: 'pearson'|'spearman'（仅用于标题说明）
     */
    constructor(host, opts = {}) {
      super(host, Object.assign({ pad: { t: 14, r: 14, b: 76, l: 96 } }, opts));
      this.setData(opts);
    }

    setData(opts = {}) {
      Object.assign(this.opts, opts);
      this.play();
    }

    draw() {
      const c = this.ctx, th = theme(), o = this.opts;
      this.clear();
      const M = o.matrix, L = o.labels || [];
      if (!M || !M.length) { this.empty(o.emptyText || '样本不足，无法计算相关矩阵'); return; }
      const g = this.plot();
      const n = M.length;
      const cw = g.w / n, ch = g.h / n;
      const pr = this.progress;

      for (let r = 0; r < n; r++) {
        for (let q = 0; q < n; q++) {
          const v = M[r][q];
          if (!isFinite(v)) continue;
          const x = g.x0 + q * cw, y = g.y0 + r * ch;
          const a = Math.abs(v) * pr;
          const color = v >= 0 ? th.teal : th.bad;
          c.save();
          c.fillStyle = 'rgba(255,255,255,0.028)';
          c.fillRect(x + 1, y + 1, cw - 2, ch - 2);
          c.fillStyle = withAlpha(color, 0.10 + a * 0.62);
          c.fillRect(x + 1, y + 1, cw - 2, ch - 2);
          if (r === q) {
            c.strokeStyle = withAlpha(th.t3, 0.3);
            c.strokeRect(x + 1.5, y + 1.5, cw - 3, ch - 3);
          }
          if (cw > 44 && ch > 20) {
            c.fillStyle = a > 0.45 ? 'rgba(255,255,255,0.95)' : withAlpha(th.t2, 0.9);
            c.font = `600 ${Math.min(12, cw / 5)}px var(--font-mono, monospace)`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(v.toFixed(2), x + cw / 2, y + ch / 2);
          }
          c.restore();
          this.addHit({
            type: 'band', x0: x, x1: x + cw, y0: y, y1: y + ch,
            html: tipHTML((L[r] || r) + ' × ' + (L[q] || q), [
              { label: (o.method === 'spearman' ? 'Spearman ρ' : 'Pearson r'), value: v.toFixed(3), color },
              { label: '关系强度', value: Math.abs(v) > 0.6 ? '强' : Math.abs(v) > 0.3 ? '中等' : '弱' },
              { label: '方向', value: v >= 0 ? '同向变化' : '反向变化' },
            ]),
          });
        }
      }

      // 标签
      c.save();
      c.fillStyle = th.t3;
      c.font = '10.5px system-ui';
      c.textAlign = 'center';
      c.textBaseline = 'top';
      for (let q = 0; q < n; q++) {
        c.save();
        c.translate(g.x0 + q * cw + cw / 2, g.y1 + 8);
        c.rotate(-Math.PI / 3.4);
        c.textAlign = 'right';
        c.textBaseline = 'middle';
        c.fillText(L[q] || q, 0, 0);
        c.restore();
      }
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      for (let r = 0; r < n; r++) {
        c.fillText(L[r] || r, g.x0 - 8, g.y0 + r * ch + ch / 2);
      }
      c.restore();

      // 图例
      c.save();
      c.font = '10px system-ui';
      c.fillStyle = th.t4;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      const lx = g.x0, ly = g.y0 - 8;
      const seg = 26;
      for (let i = 0; i < 12; i++) {
        const t = -1 + 2 * i / 11;
        c.fillStyle = withAlpha(t >= 0 ? th.teal : th.bad, 0.1 + Math.abs(t) * 0.62);
        c.fillRect(lx + i * seg, ly - 4, seg - 1, 7);
      }
      c.fillText('-1', lx - 2, ly + 12);
      c.textAlign = 'center';
      c.fillText('0', lx + 6 * seg, ly + 12);
      c.textAlign = 'left';
      c.fillText('+1', lx + 12 * seg + 4, ly + 12);
      c.restore();
    }
  }

  /* ============================================================
   * 散点图（用于探索"收入 vs 幸福"这类关系）
   * ========================================================== */
  class Scatter extends B {
    /**
     * opts.points: [{x,y,label,color,r}]
     * opts.regression: {slope, intercept} | true
     * opts.xLabel, opts.yLabel, opts.xFmt, opts.yFmt
     */
    constructor(host, opts = {}) {
      super(host, Object.assign({ pad: { t: 18, r: 20, b: 40, l: 56 } }, opts));
      this.setData(opts);
    }

    setData(opts = {}) {
      Object.assign(this.opts, opts);
      const pts = (this.opts.points || []).filter((p) => isFinite(p.x) && isFinite(p.y));
      this.pts = pts;
      this.xr = pts.length ? [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x))] : [0, 1];
      this.yr = pts.length ? [Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))] : [0, 1];
      this.play();
    }

    draw() {
      const c = this.ctx, th = theme(), o = this.opts;
      this.clear();
      if (!this.pts.length) { this.empty(o.emptyText || '暂无数据'); return; }
      const g = this.plot();
      const xt = niceTicks(this.xr[0], this.xr[1], 5);
      const yt = niceTicks(this.yr[0], this.yr[1], 5);
      const x = scaleLinear(xt[0], xt[xt.length - 1], g.x0, g.x1);
      const y = scaleLinear(yt[0], yt[yt.length - 1], g.y1, g.y0);
      this.gridY(y, yt, { fmt: o.yFmt || ((t) => F.wealthShort(t)) });
      this.axisY(y, yt, { fmt: o.yFmt || ((t) => F.wealthShort(t)) });
      this.axisX(x, xt, { fmt: o.xFmt || ((t) => F.num(t, 0)) });
      const pr = this.progress;

      // 点
      c.save();
      for (let i = 0; i < this.pts.length; i++) {
        const p = this.pts[i];
        if (i / this.pts.length > pr) break;
        const px = x(p.x), py = y(p.y);
        c.beginPath();
        c.arc(px, py, p.r || 3.2, 0, Math.PI * 2);
        c.fillStyle = withAlpha(p.color || th.brand, p.alpha != null ? p.alpha : 0.55);
        c.fill();
      }
      c.restore();

      // 回归线
      const reg = o.regression;
      if (reg && isFinite(reg.slope)) {
        const x0 = xt[0], x1 = xt[xt.length - 1];
        c.save();
        c.strokeStyle = th.gold;
        c.lineWidth = 2;
        c.setLineDash([6, 4]);
        c.beginPath();
        c.moveTo(x(x0), y(reg.intercept + reg.slope * x0));
        c.lineTo(x(x1), y(reg.intercept + reg.slope * x1));
        c.stroke();
        c.setLineDash([]);
        if (o.regressionLabel) {
          c.fillStyle = th.gold;
          c.font = '600 10.5px system-ui';
          c.textAlign = 'right';
          c.textBaseline = 'bottom';
          c.fillText(o.regressionLabel, g.x1 - 4, g.y0 + 12);
        }
        c.restore();
      }

      if (o.xLabel) {
        c.save();
        c.font = '600 11px system-ui';
        c.fillStyle = th.t3;
        c.textAlign = 'right';
        c.textBaseline = 'bottom';
        c.fillText(o.xLabel, g.x1, this.h - 4);
        c.restore();
      }
      if (o.yLabel) {
        c.save();
        c.font = '600 11px system-ui';
        c.fillStyle = th.t3;
        c.translate(12, (g.y0 + g.y1) / 2);
        c.rotate(-Math.PI / 2);
        c.textAlign = 'center';
        c.textBaseline = 'top';
        c.fillText(o.yLabel, 0, 0);
        c.restore();
      }

      // 高亮点（如某个具体人生）
      for (const p of this.pts.filter((q) => q.highlight)) {
        const px = x(p.x), py = y(p.y);
        c.save();
        c.beginPath();
        c.arc(px, py, 6, 0, Math.PI * 2);
        c.fillStyle = p.color || th.gold;
        c.shadowColor = p.color || th.gold;
        c.shadowBlur = 14;
        c.fill();
        c.restore();
      }
      // hover：最近点
      this.onHoverChange = (hit, mx, my) => {
        if (!hit) return;
        let best = null, bd = Infinity;
        for (const p of this.pts) {
          const d = (x(p.x) - mx) ** 2 + (y(p.y) - my) ** 2;
          if (d < bd) { bd = d; best = p; }
        }
        if (best && bd < 26 * 26) {
          this.showTip(tipHTML(best.label || '样本', [
            { label: o.xLabel || 'X', value: (o.xFmt ? o.xFmt(best.x) : F.num(best.x, 1)), color: best.color },
            { label: o.yLabel || 'Y', value: (o.yFmt ? o.yFmt(best.y) : F.num(best.y, 1)), color: best.color },
            ...(best.rows || []),
          ]), x(best.x), y(best.y));
        } else this.hideTip();
      };
      this.addHit({ type: 'vband', x0: g.x0, x1: g.x1, html: null });
    }
  }

  /* ============================================================
   * 贝叶斯图（规格书 §16.2）
   * 先验 → 证据 → 后验，三根条形 + 自然频率方格阵列
   * ========================================================== */
  class BayesChart extends B {
    /**
     * opts.prior, opts.sensitivity, opts.falsePositive, opts.posterior
     * opts.labels: {prior, evidence, posterior}
     * opts.population: 自然频率方格数量（默认 1000）
     */
    constructor(host, opts = {}) {
      super(host, Object.assign({ pad: { t: 30, r: 22, b: 40, l: 70 } }, opts));
      this.setData(opts);
    }

    setData(opts = {}) {
      Object.assign(this.opts, opts);
      this.play();
    }

    draw() {
      const c = this.ctx, th = theme(), o = this.opts;
      this.clear();
      const pr = this.progress;
      const g = this.plot();

      const bars = [
        { label: '先验 P(H)', value: o.prior, color: th.blue },
        { label: '证据 P(E|H)', value: o.sensitivity, color: th.teal },
        { label: '假阳性 P(E|¬H)', value: o.falsePositive, color: th.warn },
        { label: '后验 P(H|E)', value: o.posterior, color: th.fate },
      ].filter((b) => isFinite(b.value));

      const rowH = Math.min(46, g.h / bars.length);
      const totalH = rowH * bars.length;
      const top = g.y0 + (g.h - totalH) / 2;
      const x = scaleLinear(0, 1, g.x0, g.x1);

      // 网格
      c.save();
      c.strokeStyle = th.gridBg;
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const px = Math.round(x(t)) + 0.5;
        c.beginPath(); c.moveTo(px, top); c.lineTo(px, top + totalH); c.stroke();
        c.fillStyle = th.t4;
        c.font = '10px var(--font-mono, monospace)';
        c.textAlign = 'center';
        c.textBaseline = 'top';
        c.fillText(F.pct(t, 0), px, top + totalH + 6);
      }
      c.restore();

      bars.forEach((b, i) => {
        const cy = top + rowH * i + rowH / 2;
        const bh = rowH * 0.5;
        const y0 = cy - bh / 2;
        const isPost = i === bars.length - 1 && bars.length === 4;
        c.save();
        c.fillStyle = 'rgba(255,255,255,0.035)';
        roundRect(c, g.x0, y0, g.w, bh, bh / 2);
        c.fill();
        const w = Math.max(2, (x(b.value * pr) - g.x0));
        const grad = c.createLinearGradient(g.x0, 0, g.x0 + w, 0);
        grad.addColorStop(0, withAlpha(b.color, isPost ? 0.6 : 0.42));
        grad.addColorStop(1, withAlpha(b.color, 1));
        c.fillStyle = grad;
        if (isPost) { c.shadowColor = withAlpha(b.color, 0.6); c.shadowBlur = 14; }
        roundRect(c, g.x0, y0, w, bh, bh / 2);
        c.fill();
        c.shadowBlur = 0;

        c.fillStyle = th.t2;
        c.font = (isPost ? '700 12.5px' : '600 12px') + ' system-ui';
        c.textAlign = 'right';
        c.textBaseline = 'middle';
        c.fillText(b.label, g.x0 - 10, cy);

        c.fillStyle = b.color;
        c.font = '700 12.5px var(--font-mono, monospace)';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(F.pct(b.value, 1), Math.min(g.x1 - 46, g.x0 + w + 8), cy);
        c.restore();
      });

      // 自然频率：1000 人方阵（规格书 §16.2 "换成人话"）
      if (o.population) {
        const N = o.population;
        const cols = Math.ceil(Math.sqrt(N));
        const cell = Math.min(6, (g.x1 - g.x0) / cols);
        const gridW = cols * cell;
        const gx = g.x1 - gridW;
        const gy = g.y0 - 22;
        const hitN = Math.round(N * (o.prior || 0) * (o.sensitivity || 0));
        const faN = Math.round(N * (1 - (o.prior || 0)) * (o.falsePositive || 0));
        c.save();
        c.font = '10px system-ui';
        c.fillStyle = th.t4;
        c.textAlign = 'right';
        c.textBaseline = 'bottom';
        c.fillText(`${N} 人中：真阳性 ${hitN} · 假阳性 ${faN}`, g.x1, gy - 4);
        let idx = 0;
        for (let r = 0; r < Math.ceil(N / cols); r++) {
          for (let q = 0; q < cols && idx < N; q++, idx++) {
            const isHit = idx < hitN;
            const isFa = idx >= Math.round(N * (o.prior || 0)) && idx < Math.round(N * (o.prior || 0)) + faN;
            c.fillStyle = isHit ? th.fate : isFa ? withAlpha(th.warn, 0.55) : 'rgba(255,255,255,0.075)';
            c.fillRect(gx + q * cell, gy + r * cell, cell - 1.2, cell - 1.2);
          }
        }
        c.restore();
      }
    }
  }

  /* ============================================================
   * 马尔可夫状态图（规格书 §17.2）
   * 环形节点 + 有向弧 + 自环，弧粗 ∝ 转移概率
   * ========================================================== */
  class MarkovDiagram extends B {
    /**
     * opts.labels: string[]
     * opts.matrix: number[][]
     * opts.stationary: number[]  平稳分布（节点外环）
     * opts.highlight: number     高亮的节点下标
     * opts.flow: number          0..1 动态流量点
     */
    constructor(host, opts = {}) {
      super(host, Object.assign({ pad: { t: 30, r: 30, b: 30, l: 30 } }, opts));
      this.setData(opts);
    }

    setData(opts = {}) {
      Object.assign(this.opts, opts);
      this.play();
    }

    draw() {
      const c = this.ctx, th = theme(), o = this.opts;
      this.clear();
      const L = o.labels || [], M = o.matrix || [];
      if (!L.length || !M.length) { this.empty(o.emptyText || '还没有转移矩阵'); return; }
      const g = this.plot();
      const cx = (g.x0 + g.x1) / 2;
      const cy = (g.y0 + g.y1) / 2;
      const R = Math.min(g.w, g.h) / 2 - 46;
      const n = L.length;
      const pos = (i) => {
        const a = -Math.PI / 2 + i * Math.PI * 2 / n;
        return [cx + Math.cos(a) * R, cy + Math.sin(a) * R, a];
      };
      const pr = this.progress;
      const nodeColors = ['#34d399', '#60a5fa', '#fbbf24', '#f87171'];

      // 有向弧
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const p = M[i][j];
          if (!isFinite(p) || p <= 0.001) continue;
          const [x0, y0] = pos(i);
          if (i === j) {
            // 自环
            const [px, py, a] = pos(i);
            const nx = Math.cos(a), ny = Math.sin(a);
            const loopR = 15 + p * 16;
            const cxx = px + nx * loopR * 1.5;
            const cyy = py + ny * loopR * 1.5;
            c.save();
            c.strokeStyle = withAlpha(nodeColors[i % 4], 0.35 + p * 0.5);
            c.lineWidth = 1 + p * 3.2;
            c.beginPath();
            c.arc(cxx, cyy, loopR, 0, Math.PI * 2);
            c.stroke();
            if (p > 0.25 && R > 60) {
              c.fillStyle = withAlpha(th.t2, 0.85);
              c.font = '600 10px var(--font-mono, monospace)';
              c.textAlign = 'center';
              c.textBaseline = 'middle';
              c.fillText(F.pct(p, 0), cxx, cyy);
            }
            c.restore();
            continue;
          }
          const [x1, y1] = pos(j);
          const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
          // 向圆心方向弯曲，避免穿过中心
          const bow = 0.30;
          const qx = mx + (cx - mx) * bow;
          const qy = my + (cy - my) * bow;
          c.save();
          c.strokeStyle = withAlpha(nodeColors[i % 4], 0.22 + p * 0.7);
          c.lineWidth = 0.8 + p * 4;
          c.lineCap = 'round';
          // 动画：只画到 pr 比例
          const steps = 24;
          c.beginPath();
          c.moveTo(x0, y0);
          for (let s = 1; s <= steps * pr; s++) {
            const t = s / steps;
            const bx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * qx + t * t * x1;
            const by = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * qy + t * t * y1;
            c.lineTo(bx, by);
          }
          c.stroke();
          // 箭头
          if (pr > 0.85) {
            const t = 0.93;
            const ax = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * qx + t * t * x1;
            const ay = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * qy + t * t * y1;
            const tx = 2 * (1 - t) * (qx - x0) + 2 * t * (x1 - qx);
            const ty = 2 * (1 - t) * (qy - y0) + 2 * t * (y1 - qy);
            const ang = Math.atan2(ty, tx);
            const ah = 5 + p * 5;
            c.beginPath();
            c.moveTo(ax, ay);
            c.lineTo(ax - ah * Math.cos(ang - 0.4), ay - ah * Math.sin(ang - 0.4));
            c.lineTo(ax - ah * Math.cos(ang + 0.4), ay - ah * Math.sin(ang + 0.4));
            c.closePath();
            c.fillStyle = withAlpha(nodeColors[i % 4], 0.35 + p * 0.65);
            c.fill();
          }
          c.restore();
          // 转移概率标签（只标较大的）
          if (p > 0.22 && R > 70) {
            const t = 0.5;
            const lx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * qx + t * t * x1;
            const ly = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * qy + t * t * y1;
            c.save();
            c.fillStyle = th.t2;
            c.font = '600 10px var(--font-mono, monospace)';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(F.pct(p, 0), lx, ly);
            c.restore();
          }
        }
      }

      // 节点
      for (let i = 0; i < n; i++) {
        const [px, py] = pos(i);
        const on = o.highlight === i;
        const color = nodeColors[i % 4];
        c.save();
        const r = on ? 21 : 17;
        const grad = c.createRadialGradient(px, py - r * 0.4, 2, px, py, r);
        grad.addColorStop(0, withAlpha(color, 0.95));
        grad.addColorStop(1, withAlpha(color, 0.35));
        c.beginPath();
        c.arc(px, py, r, 0, Math.PI * 2);
        c.fillStyle = grad;
        c.shadowColor = withAlpha(color, 0.7);
        c.shadowBlur = on ? 20 : 10;
        c.fill();
        c.shadowBlur = 0;
        c.strokeStyle = withAlpha(color, 0.9);
        c.lineWidth = 1.6;
        c.stroke();

        // 平稳分布外环
        const st = (o.stationary || [])[i];
        if (isFinite(st)) {
          c.beginPath();
          c.arc(px, py, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * st);
          c.strokeStyle = withAlpha(th.gold, 0.85);
          c.lineWidth = 2.6;
          c.stroke();
        }

        c.fillStyle = '#0b0f1c';
        c.font = '700 11px system-ui';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(L[i].slice(0, 3), px, py + 0.5);
        c.restore();

        c.save();
        c.fillStyle = th.t3;
        c.font = '600 9.5px var(--font-mono, monospace)';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        if (isFinite(st)) c.fillText(F.pct(st, 1), px, py + r + 12);
        c.restore();

        this.addHit({
          x: px, y: py, r: 24,
          html: tipHTML(L[i], [
            { label: '平稳分布占比', value: isFinite(st) ? F.pct(st, 1) : '—', color: th.gold },
            { label: '停留概率', value: F.pct(M[i][i], 1), color },
            { label: '最可能去向', value: (() => {
              let bi = 0;
              for (let j = 0; j < n; j++) if (j !== i && M[i][j] > M[i][bi]) bi = j;
              return L[bi] + ' ' + F.pct(M[i][bi], 0);
            })() },
          ]),
        });
      }
    }
  }

  register('heatmap', Heatmap);
  register('corrmatrix', CorrMatrix);
  register('scatter', Scatter);
  register('bayes', BayesChart);
  register('markov', MarkovDiagram);

  LS.charts.Heatmap = Heatmap;
  LS.charts.CorrMatrix = CorrMatrix;
  LS.charts.Scatter = Scatter;
  LS.charts.BayesChart = BayesChart;
  LS.charts.MarkovDiagram = MarkovDiagram;
})(typeof globalThis !== 'undefined' ? globalThis : this);
