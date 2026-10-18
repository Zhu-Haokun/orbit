/* ============================================================
 * LifeSim · charts/basic.js
 * 基础统计图表：直方图 / 条形图 / 密度曲线 / 收敛曲线 / 箱线图
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const B = LS.charts.Base;
  const { scaleLinear, niceTicks, withAlpha, roundRect, theme, F, tipHTML, register } = LS.charts;
  const U = LS.util;
  const S = LS.stats;

  /* ============================================================
   * 分布变换：处理财富这种「长右尾 + 可能有负值」的数据
   * 规格书 §27.1 要求直方图默认对数轴，否则 99% 的样本挤在一根柱子里
   * ========================================================== */
  const TF = {
    linear: {
      f: (v) => v,
      inv: (u) => u,
      label: (v) => F.wealth(v),
      ticks: (a, b) => niceTicks(a, b, 5),
    },
    log: {
      f: (v) => Math.sign(v) * Math.log1p(Math.abs(v)),
      inv: (u) => Math.sign(u) * Math.expm1(Math.abs(u)),
      label: (v) => F.wealthShort(v),
      ticks: (a, b) => {
        const fa = Math.sign(a) * Math.log1p(Math.abs(a));
        const fb = Math.sign(b) * Math.log1p(Math.abs(b));
        const marks = [-50, -20, 0, 20, 100, 300, 1000, 3000, 10000, 30000];
        return marks.filter((m) => {
          const t = Math.sign(m) * Math.log1p(Math.abs(m));
          return t >= Math.min(fa, fb) - 1e-9 && t <= Math.max(fa, fb) + 1e-9;
        });
      },
    },
  };

  /* ============================================================
   * Histogram · 结果分布直方图
   * ========================================================== */
  class Histogram extends B {
    /**
     * @param {HTMLElement} host
     * @param {object} opts
     *   data: number[]           样本
     *   scale: 'linear'|'log'
     *   bins: number
     *   color: string
     *   markers: [{value,label,color,dash}]
     *   focus: {from, to, label} 高亮区间（如最差 5%）
     *   me: number               你的位置（发光的线）
     *   clip: [lo,hi]            裁剪分位（默认 p002~p998）
     */
    constructor(host, opts = {}) {
      super(host, Object.assign({ pad: { t: 22, r: 18, b: 34, l: 54 } }, opts));
      this.opts = opts;
      this.setData(opts.data || [], opts);
    }

    setData(data, opts = {}) {
      this.data = (data || []).filter((v) => v != null && isFinite(v));
      Object.assign(this.opts, opts);
      this._prepare();
      this.play();
    }

    _prepare() {
      const o = this.opts;
      const d = this.data;
      this.tf = TF[o.scale || 'log'] || TF.log;
      if (!d.length) { this.bins = []; this.maxC = 1; this.total = 0; return; }

      const clip = o.clip || [0.002, 0.998];
      let lo = S.quantile(d, clip[0]);
      let hi = S.quantile(d, clip[1]);
      if (lo == null || !isFinite(lo)) lo = Math.min.apply(null, d);
      if (hi == null || !isFinite(hi)) hi = Math.max.apply(null, d);
      if (lo === hi) { lo -= 1; hi += 1; }
      // 让 0 恒在可视范围内（财富的语义基线）
      lo = Math.min(lo, 0);

      const fl = this.tf.f(lo);
      const fh = this.tf.f(hi);
      const nb = o.bins || Math.max(18, Math.min(60, Math.round(Math.sqrt(d.length))));
      // 注意：edges 是 nb+1 个「边界」，而 counts 是 nb 个「区间」。
      // 用 edges.map 直接生成 bins 会多出最后一个，它的 count 是 undefined，
      // 于是绘制时算出 NaN —— 浏览器里 createLinearGradient 会因此抛异常。
      const edges = [];
      for (let i = 0; i <= nb; i++) edges.push(fl + (fh - fl) * i / nb);

      const counts = new Array(nb).fill(0);
      let under = 0, over = 0;
      for (const v of d) {
        const u = this.tf.f(v);
        if (u < fl) { under++; continue; }
        if (u > fh) { over++; continue; }
        let k = Math.floor((u - fl) / (fh - fl) * nb);
        if (k >= nb) k = nb - 1;
        if (k < 0) k = 0;
        counts[k]++;
      }

      this.bins = edges.slice(0, nb).map((e, i) => ({
        u0: e,
        u1: edges[i + 1],
        v0: this.tf.inv(e),
        v1: this.tf.inv(edges[i + 1]),
        count: counts[i],
      }));
      this.maxC = Math.max(1, Math.max.apply(null, counts));
      this.total = d.length;
      this.under = under;
      this.over = over;
      this.fLo = fl;
      this.fHi = fh;
    }

    draw() {
      const c = this.ctx, th = theme(), o = this.opts;
      this.clear();
      if (!this.data.length) { this.empty(o.emptyText || '还没有样本'); return; }
      const g = this.plot();
      const pr = this.progress;

      const x = scaleLinear(this.fLo, this.fHi, g.x0, g.x1);
      const y = scaleLinear(0, this.maxC, g.y1, g.y0);

      const yTicks = niceTicks(0, this.maxC, 4).filter((t) => t >= 0);
      this.gridY(y, yTicks, { fmt: (t) => F.int(t) });
      this.axisY(y, yTicks, { fmt: (t) => F.int(t) });
      const xTicks = this.tf.ticks(this.tf.inv(this.fLo), this.tf.inv(this.fHi));
      this.axisX(x, xTicks.map((v) => this.tf.f(v)), { fmt: (u) => this.tf.label(this.tf.inv(u)) });

      // 高亮区间（例如最差 5%）
      if (o.focus) {
        const a = Math.max(this.fLo, this.tf.f(o.focus.from));
        const b = Math.min(this.fHi, this.tf.f(o.focus.to));
        if (b > a) {
          c.save();
          c.fillStyle = withAlpha(o.focus.color || th.bad, 0.10);
          c.fillRect(x(a), g.y0, x(b) - x(a), g.h);
          c.strokeStyle = withAlpha(o.focus.color || th.bad, 0.35);
          c.setLineDash([4, 4]);
          c.strokeRect(x(a) + 0.5, g.y0 + 0.5, x(b) - x(a), g.h - 1);
          c.setLineDash([]);
          if (o.focus.label) {
            c.fillStyle = withAlpha(o.focus.color || th.bad, 0.95);
            c.font = '600 10.5px system-ui';
            c.textAlign = 'center';
            c.textBaseline = 'top';
            c.fillText(o.focus.label, (x(a) + x(b)) / 2, g.y0 + 5);
          }
          c.restore();
        }
      }

      // 柱子
      const bw = g.w / this.bins.length;
      const baseColor = o.color || th.brand;
      for (let i = 0; i < this.bins.length; i++) {
        const bin = this.bins[i];
        const h = g.y1 - y(bin.count * pr);
        const bx = g.x0 + i * bw;
        const grad = c.createLinearGradient(0, g.y1 - h, 0, g.y1);
        grad.addColorStop(0, withAlpha(baseColor, 0.95));
        grad.addColorStop(1, withAlpha(baseColor, 0.28));
        c.fillStyle = grad;
        const k = Math.max(0.5, bw - 1.5);
        roundRect(c, bx + (bw - k) / 2, g.y1 - h, k, Math.max(0, h), Math.min(3, bw / 3));
        c.fill();
        if (bin.count > 0) {
          this.addHit({
            type: 'band', x0: bx, x1: bx + bw, y0: g.y0, y1: g.y1,
            html: tipHTML(F.wealth(bin.v0) + ' ~ ' + F.wealth(bin.v1), [
              { label: '样本数', value: F.int(bin.count) },
              { label: '占比', value: F.pct(bin.count / (this.total || 1), 2), color: baseColor },
            ]),
          });
        }
      }

      // 标记线（均值 / 中位数等）
      for (const m of (o.markers || [])) {
        if (m.value == null || !isFinite(m.value)) continue;
        const u = this.tf.f(m.value);
        if (u < this.fLo || u > this.fHi) continue;
        const px = x(u);
        c.save();
        c.strokeStyle = m.color || th.t3;
        c.lineWidth = m.width || 1.4;
        if (m.dash !== false) c.setLineDash([5, 4]);
        c.beginPath();
        c.moveTo(px, g.y0);
        c.lineTo(px, g.y1);
        c.stroke();
        c.setLineDash([]);
        if (m.label) {
          c.fillStyle = m.color || th.t2;
          c.font = '600 10.5px system-ui';
          c.textAlign = 'center';
          c.textBaseline = 'bottom';
          c.fillText(m.label, px, m.labelY != null ? m.labelY : g.y0 + 14);
        }
        c.restore();
      }

      // 「你的人生」位置
      if (o.me != null && isFinite(o.me)) {
        const u = this.tf.f(o.me);
        if (u >= this.fLo && u <= this.fHi) {
          const px = x(u);
          c.save();
          c.strokeStyle = th.gold;
          c.lineWidth = 2;
          c.shadowColor = th.gold;
          c.shadowBlur = 12;
          c.beginPath();
          c.moveTo(px, g.y0);
          c.lineTo(px, g.y1);
          c.stroke();
          c.beginPath();
          c.arc(px, g.y0 - 6, 4, 0, Math.PI * 2);
          c.fillStyle = th.gold;
          c.fill();
          c.shadowBlur = 0;
          c.font = '700 10.5px system-ui';
          c.fillStyle = th.gold;
          c.textAlign = px > (g.x0 + g.x1) / 2 ? 'right' : 'left';
          c.textBaseline = 'top';
          c.fillText('你 · ' + F.wealth(o.me), px + (px > (g.x0 + g.x1) / 2 ? -6 : 6), g.y0 - 16);
          c.restore();
        }
      }

      // 裁剪提示：被排除的极端样本必须显式说明，否则会造成误读
      if (this.under + this.over > 0) {
        c.save();
        c.fillStyle = th.t4;
        c.font = '10.5px system-ui';
        c.textAlign = 'center';
        c.textBaseline = 'bottom';
        c.fillText(
          '（' + F.int(this.under + this.over) + ' 个极端样本超出显示范围，占 '
          + F.pct((this.under + this.over) / (this.total || 1), 2) + '）',
          (g.x0 + g.x1) / 2, this.h - 2);
        c.restore();
      }
    }
  }

  /* ============================================================
   * BarChart · 条形图（事件发生率 / 因子贡献 / 结局构成）
   * ========================================================== */
  class BarChart extends B {
    /**
     * opts.items: [{label, value, color, note, sub}]
     * opts.fmt: 值格式化
     * opts.max: 手动指定最大值（例如概率图统一到某个上限）
     */
    constructor(host, opts = {}) {
      super(host, Object.assign({ pad: { t: 14, r: 22, b: 26, l: 108 } }, opts));
      this.setData(opts.items || [], opts);
    }

    setData(items, opts = {}) {
      this.items = (items || []).filter(Boolean);
      Object.assign(this.opts, opts);
      this.fmt = this.opts.fmt || F.pct;
      const vals = this.items.map((i) => i.value).filter((v) => v != null && isFinite(v));
      this.max = this.opts.max != null ? this.opts.max : Math.max(0.0001, Math.max.apply(null, vals.concat([0]))) * 1.12;
      this.play();
    }

    draw() {
      const c = this.ctx, th = theme(), o = this.opts;
      this.clear();
      if (!this.items.length) { this.empty(o.emptyText || '暂无数据'); return; }
      const g = this.plot();
      const n = this.items.length;
      const rowH = g.h / n;
      const barH = Math.min(o.barHeight || 22, rowH * 0.62);
      const x = scaleLinear(0, this.max, g.x0, g.x1);
      const pr = this.progress;

      c.save();
      c.strokeStyle = th.gridBg;
      for (const t of niceTicks(0, this.max, 4)) {
        if (t < 0) continue;
        const px = Math.round(x(t)) + 0.5;
        c.beginPath(); c.moveTo(px, g.y0); c.lineTo(px, g.y1); c.stroke();
      }
      c.restore();

      this.items.forEach((it, i) => {
        const cy = g.y0 + rowH * i + rowH / 2;
        const y0 = cy - barH / 2;
        const color = it.color || th.brand;
        const val = it.value != null && isFinite(it.value) ? it.value : 0;
        const w = Math.max(1, x(val * pr) - g.x0);

        c.save();
        c.fillStyle = 'rgba(255,255,255,0.035)';
        roundRect(c, g.x0, y0, g.x1 - g.x0, barH, barH / 2);
        c.fill();
        c.restore();

        const grad = c.createLinearGradient(g.x0, 0, g.x0 + w, 0);
        grad.addColorStop(0, withAlpha(color, 0.55));
        grad.addColorStop(1, withAlpha(color, 1));
        c.fillStyle = grad;
        roundRect(c, g.x0, y0, w, barH, barH / 2);
        c.fill();

        // 左侧标签
        c.save();
        c.fillStyle = th.t2;
        c.font = '600 12px system-ui';
        c.textAlign = 'right';
        c.textBaseline = 'middle';
        c.fillText(it.label, g.x0 - 12, cy);
        if (it.sub) {
          c.fillStyle = th.t4;
          c.font = '10px var(--font-mono, monospace)';
          c.fillText(it.sub, g.x0 - 12, cy + 1);
        }
        c.restore();

        // 右侧数值
        c.save();
        c.fillStyle = color;
        c.font = '700 12px var(--font-mono, monospace)';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(this.fmt(val), Math.max(g.x0 + w + 8, g.x0 + 10), cy);
        c.restore();

        this.addHit({
          type: 'band', x0: g.x0, x1: g.x1, y0: cy - rowH / 2, y1: cy + rowH / 2,
          html: tipHTML(it.label, [
            { label: o.valueLabel || '数值', value: this.fmt(val), color: color },
            it.note ? { label: '说明', value: it.note } : null,
          ]),
        });
      });
    }
  }

  /* ============================================================
   * DensityChart · 理论分布曲线 + 样本经验分布（分布实验室）
   * 离散分布自动画柱状 pmf，连续分布画曲线
   * ========================================================== */
  const DISCRETE = ['bernoulli', 'binomial', 'geometric', 'poisson'];

  class DensityChart extends B {
    /**
     * opts.dist: 分布对象（distributions.js 里的那个）
     * opts.params: 分布参数
     * opts.data: 可选样本，用于叠加经验分布
     * opts.mode: 'pdf' | 'cdf'
     * opts.marks: [{value,label,color}]
     */
    constructor(host, opts = {}) {
      super(host, Object.assign({ pad: { t: 16, r: 18, b: 34, l: 48 } }, opts));
      this.setData(opts);
    }

    setData(opts = {}) {
      Object.assign(this.opts, opts);
      const d = opts.dist || this.opts.dist;
      const p = opts.params || this.opts.params || (d && d.params) || {};
      this.dist = d;
      this.params = p;
      if (!d) { this.curve = []; this.play(); return; }

      this.isDiscrete = DISCRETE.indexOf(d.key) >= 0;
      const sup = d.support ? d.support(p) : [-4, 4];
      let lo = sup[0];
      let hi = sup[1];
      const mean = d.mean ? d.mean(p) : 0;
      const varr = d.variance ? d.variance(p) : 1;

      if (!isFinite(hi)) hi = quantileLike(mean, varr, 0.9995);
      if (!isFinite(lo)) lo = quantileLike(mean, varr, 0.0005);
      if (lo === hi) { lo -= 1; hi += 1; }

      if (!this.isDiscrete) {
        const sd = Math.sqrt(Math.max(varr, 1e-9));
        lo = Math.max(lo, mean - 4.2 * sd);
        hi = Math.min(hi, mean + 4.2 * sd);
        if (!isFinite(lo) || !isFinite(hi) || hi <= lo) { lo = mean - 3; hi = mean + 3; }
      } else if ((d.key === 'binomial' || d.key === 'poisson' || d.key === 'geometric')
        && hi - lo > 60) {
        hi = lo + 60;
      }

      this.lo = lo;
      this.hi = hi;
      this._buildCurve();
      this.play();
    }

    _buildCurve() {
      const d = this.dist, p = this.params;
      const mode = this.opts.mode || 'pdf';
      const pts = [];
      if (this.isDiscrete && mode === 'pdf') {
        const kLo = Math.max(Math.ceil(this.lo), d.support(p)[0] || 0);
        let kHi = Math.floor(this.hi);
        if (!isFinite(kHi)) kHi = kLo + 60;
        for (let k = kLo; k <= kHi && k - kLo < 400; k++) {
          pts.push({ x: k, y: d.pdf(k, p) });
        }
      } else {
        const N = 240;
        for (let i = 0; i <= N; i++) {
          const x = this.lo + (this.hi - this.lo) * i / N;
          const y = mode === 'cdf' ? d.cdf(x, p) : d.pdf(x, p);
          pts.push({ x, y: isFinite(y) ? y : 0 });
        }
      }
      this.curve = pts;
      const yMax = Math.max.apply(null, pts.map((q) => q.y).concat([1e-9]));
      this.yMax = mode === 'cdf' ? 1.02 : yMax * 1.14;
    }

    draw() {
      const c = this.ctx, th = theme(), o = this.opts;
      this.clear();
      if (!this.curve || !this.curve.length) { this.empty('选择一种分布'); return; }
      const g = this.plot();
      const x = scaleLinear(this.lo, this.hi, g.x0, g.x1);
      const y = scaleLinear(0, this.yMax, g.y1, g.y0);
      const pr = this.progress;
      const isCdf = (o.mode || 'pdf') === 'cdf';

      const yTicks = niceTicks(0, this.yMax, 4).filter((t) => t >= 0);
      const yFmt = isCdf ? ((t) => F.num(t, 1)) : ((t) => F.num(t, 2));
      this.gridY(y, yTicks, { fmt: yFmt });
      this.axisY(y, yTicks, { fmt: yFmt });
      const xT = this.isDiscrete
        ? niceTicks(this.lo, this.hi, Math.min(8, Math.max(3, Math.round(this.hi - this.lo))))
        : niceTicks(this.lo, this.hi, 6);
      this.axisX(x, xT, {
        fmt: (t) => F.num(t, this.isDiscrete ? 0 : (o.xDecimals != null ? o.xDecimals : 2)),
      });

      // 经验分布（半透明底色），用于对照"样本 vs 理论"
      if (Array.isArray(o.data) && o.data.length && o.showSample !== false) {
        const nb = this.isDiscrete ? Math.max(1, Math.round(this.hi - this.lo)) : 40;
        const counts = new Array(nb).fill(0);
        for (const v of o.data) {
          if (v == null || !isFinite(v) || v < this.lo || v > this.hi) continue;
          const k = this.isDiscrete
            ? Math.round(v) - Math.round(this.lo)
            : Math.floor((v - this.lo) / ((this.hi - this.lo) || 1) * nb);
          if (k >= 0 && k < nb) counts[k]++;
        }
        const maxC = Math.max(1, Math.max.apply(null, counts));
        const bw = g.w / nb;
        c.save();
        c.fillStyle = withAlpha(th.blue, 0.22);
        for (let i = 0; i < nb; i++) {
          if (!counts[i]) continue;
          const h = (counts[i] / maxC) * g.h * 0.82 * pr;
          roundRect(c, g.x0 + i * bw + 1, g.y1 - h, Math.max(1, bw - 2), h, 2);
          c.fill();
        }
        c.restore();
      }

      // 均值 / ±σ 标记
      for (const m of (o.marks || [])) {
        if (m.value == null || !isFinite(m.value) || m.value < this.lo || m.value > this.hi) continue;
        const px = x(m.value);
        c.save();
        c.strokeStyle = withAlpha(m.color || th.gold, 0.8);
        c.setLineDash(m.dash || [4, 4]);
        c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(px, g.y0); c.lineTo(px, g.y1); c.stroke();
        c.setLineDash([]);
        if (m.label) {
          c.fillStyle = m.color || th.gold;
          c.font = '600 10px system-ui';
          c.textAlign = 'center';
          c.textBaseline = 'top';
          c.fillText(m.label, px, g.y0 + 3);
        }
        c.restore();
      }

      const color = o.color || th.teal;
      const upto = Math.max(2, Math.floor(this.curve.length * pr));

      if (this.isDiscrete && !isCdf) {
        // 柱状 pmf
        const bw = Math.max(3, Math.min(26, g.w / Math.max(1, this.curve.length) * 0.62));
        for (let i = 0; i < upto; i++) {
          const pt = this.curve[i];
          const px = x(pt.x);
          const py = y(pt.y);
          const grad = c.createLinearGradient(0, py, 0, g.y1);
          grad.addColorStop(0, withAlpha(color, 0.95));
          grad.addColorStop(1, withAlpha(color, 0.22));
          c.fillStyle = grad;
          roundRect(c, px - bw / 2, py, bw, Math.max(0, g.y1 - py), 3);
          c.fill();
          this.addHit({
            x: px, y: py, r: 14,
            html: tipHTML('P(X = ' + pt.x + ')', [
              { label: '概率', value: F.num(pt.y, 4), color: color },
            ]),
          });
        }
      } else {
        // 曲线 + 面积
        c.save();
        c.beginPath();
        let started = false;
        for (let i = 0; i < upto; i++) {
          const pt = this.curve[i];
          const px = x(pt.x), py = y(pt.y);
          if (!started) { c.moveTo(px, py); started = true; } else c.lineTo(px, py);
        }
        if (started && !isCdf) {
          c.lineTo(x(this.curve[upto - 1].x), g.y1);
          c.lineTo(x(this.curve[0].x), g.y1);
          c.closePath();
          const grad = c.createLinearGradient(0, g.y0, 0, g.y1);
          grad.addColorStop(0, withAlpha(color, 0.26));
          grad.addColorStop(1, withAlpha(color, 0.01));
          c.fillStyle = grad;
          c.fill();
        }
        // 描边
        c.beginPath();
        started = false;
        for (let i = 0; i < upto; i++) {
          const pt = this.curve[i];
          const px = x(pt.x), py = y(pt.y);
          if (!started) { c.moveTo(px, py); started = true; } else c.lineTo(px, py);
        }
        c.strokeStyle = color;
        c.lineWidth = 2.4;
        c.shadowColor = withAlpha(color, 0.5);
        c.shadowBlur = 10;
        c.stroke();
        c.restore();
      }

      // 轴标题
      c.save();
      c.font = '600 10.5px system-ui';
      c.fillStyle = th.t3;
      c.textAlign = 'right';
      c.textBaseline = 'bottom';
      c.fillText(
        isCdf ? '累积分布函数 F(x)' : (this.isDiscrete ? '概率质量函数 P(X=x)' : '概率密度 f(x)'),
        g.x1, this.h - 2);
      c.restore();
    }
  }

  /* ============================================================
   * ConvergenceChart · 大数定律收敛曲线
   * ========================================================== */
  class ConvergenceChart extends B {
    /**
     * opts.series: [{label, color, points:[{n, mean, lo, hi}]}]
     * opts.truth: number     理论值
     * opts.xLog: 默认 true
     */
    constructor(host, opts = {}) {
      super(host, Object.assign({ pad: { t: 20, r: 22, b: 34, l: 58 } }, opts));
      this.setData(opts);
    }

    setData(opts = {}) {
      Object.assign(this.opts, opts);
      this.series = (this.opts.series || []).filter((s) => s && s.points && s.points.length);
      this.play();
    }

    draw() {
      const c = this.ctx, th = theme(), o = this.opts;
      this.clear();
      if (!this.series.length) { this.empty(o.emptyText || '还没有数据'); return; }
      const g = this.plot();
      const pr = this.progress;

      const allN = [];
      const allY = [];
      for (const s of this.series) {
        for (const p of s.points) {
          if (p.n == null || !isFinite(p.n) || p.n <= 0) continue;
          allN.push(p.n);
          if (isFinite(p.lo)) allY.push(p.lo);
          if (isFinite(p.hi)) allY.push(p.hi);
          if (isFinite(p.mean)) allY.push(p.mean);
        }
      }
      if (!allN.length || !allY.length) { this.empty(o.emptyText || '还没有数据'); return; }
      if (isFinite(o.truth)) allY.push(o.truth);

      const nMin = Math.min.apply(null, allN);
      const nMax = Math.max.apply(null, allN);
      let yMin = Math.min.apply(null, allY);
      let yMax = Math.max.apply(null, allY);
      const padY = (yMax - yMin) * 0.12 || 0.05;
      yMin -= padY;
      yMax += padY;

      const useLog = o.xLog !== false;
      const lx = (n) => (useLog ? Math.log10(Math.max(1, n)) : n);
      const x = scaleLinear(lx(nMin), lx(nMax), g.x0, g.x1);
      const y = scaleLinear(yMin, yMax, g.y1, g.y0);
      const yFmt = o.yFmt || ((t) => F.num(t, 2));

      const yTicks = niceTicks(yMin, yMax, 5);
      this.gridY(y, yTicks, { fmt: yFmt });
      this.axisY(y, yTicks, { fmt: yFmt });
      const cand = [10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000, 300000];
      const xTicks = cand.filter((n) => n >= nMin && n <= nMax);
      this.axisX(x, xTicks.map(lx), { fmt: (u) => F.int(Math.round(useLog ? Math.pow(10, u) : u)) });
      c.save();
      c.fillStyle = th.t4;
      c.font = '10px system-ui';
      c.textAlign = 'right';
      c.textBaseline = 'top';
      c.fillText(useLog ? '样本量 n（对数轴）' : '样本量 n', g.x1, g.y1 + 18);
      c.restore();

      // 理论真值
      if (isFinite(o.truth)) {
        const py = y(o.truth);
        c.save();
        c.strokeStyle = withAlpha(th.gold, 0.85);
        c.setLineDash([6, 4]);
        c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(g.x0, py); c.lineTo(g.x1, py); c.stroke();
        c.setLineDash([]);
        c.fillStyle = th.gold;
        c.font = '600 10.5px system-ui';
        c.textAlign = 'left';
        c.textBaseline = 'bottom';
        c.fillText((o.truthLabel || '理论值') + ' ' + yFmt(o.truth), g.x0 + 4, py - 4);
        c.restore();
      }

      for (const s of this.series) {
        const color = s.color || th.brand;
        const cut = Math.max(1, Math.floor(s.points.length * pr));
        const pts = s.points.slice(0, cut).filter((p) => p && isFinite(p.n) && p.n > 0);
        if (!pts.length) continue;

        if (o.showBand !== false && pts.some((p) => isFinite(p.lo))) {
          c.save();
          c.beginPath();
          pts.forEach((p, i) => {
            const px = x(lx(p.n));
            const py = y(isFinite(p.hi) ? p.hi : p.mean);
            if (i) c.lineTo(px, py); else c.moveTo(px, py);
          });
          for (let i = pts.length - 1; i >= 0; i--) {
            const p = pts[i];
            c.lineTo(x(lx(p.n)), y(isFinite(p.lo) ? p.lo : p.mean));
          }
          c.closePath();
          c.fillStyle = withAlpha(color, 0.13);
          c.fill();
          c.restore();
        }

        c.save();
        c.strokeStyle = color;
        c.lineWidth = 2.2;
        c.lineJoin = 'round';
        c.beginPath();
        let started = false;
        for (const p of pts) {
          if (!isFinite(p.mean)) { started = false; continue; }
          const px = x(lx(p.n)), py = y(p.mean);
          if (!started) { c.moveTo(px, py); started = true; } else c.lineTo(px, py);
        }
        c.stroke();
        const last = pts[pts.length - 1];
        if (isFinite(last.mean)) {
          c.beginPath();
          c.arc(x(lx(last.n)), y(last.mean), 3.4, 0, Math.PI * 2);
          c.fillStyle = color;
          c.shadowColor = color;
          c.shadowBlur = 8;
          c.fill();
        }
        c.restore();
      }

      // hover：读出该样本量下所有序列的值
      this.onHoverChange = (hit, mx) => {
        if (!hit) return;
        const un = useLog ? Math.pow(10, x.invert(mx)) : x.invert(mx);
        const rows = this.series.map((s) => {
          let best = null, bd = Infinity;
          for (const p of s.points) {
            if (!p || !isFinite(p.n) || p.n <= 0) continue;
            const d = Math.abs(Math.log10(p.n) - Math.log10(Math.max(1, un)));
            if (d < bd) { bd = d; best = p; }
          }
          return best ? {
            label: s.label,
            value: yFmt(best.mean),
            color: s.color || th.brand,
          } : null;
        }).filter(Boolean);
        this.showTip(tipHTML('n = ' + F.int(Math.round(un)), rows), mx, 40);
      };
      this.addHit({ type: 'vband', x0: g.x0, x1: g.x1, html: null });
    }
  }

  /* ============================================================
   * BoxPlot · 策略对照的分布对比
   * ========================================================== */
  class BoxPlot extends B {
    /**
     * opts.groups: [{label, sub, min, q1, median, q3, max, mean, color, outliers:[]}]
     */
    constructor(host, opts = {}) {
      super(host, Object.assign({ pad: { t: 20, r: 20, b: 52, l: 62 } }, opts));
      this.setData(opts.groups || [], opts);
    }

    setData(groups, opts = {}) {
      this.groups = (groups || []).filter(Boolean);
      Object.assign(this.opts, opts);
      const vals = [];
      for (const gp of this.groups) {
        [gp.min, gp.q1, gp.median, gp.q3, gp.max, gp.mean].forEach((v) => {
          if (v != null && isFinite(v)) vals.push(v);
        });
        (gp.outliers || []).forEach((v) => { if (v != null && isFinite(v)) vals.push(v); });
      }
      this.yMin = vals.length ? Math.min.apply(null, vals.concat([0])) : 0;
      this.yMax = vals.length ? Math.max.apply(null, vals.concat([1])) : 1;
      if (this.yMin === this.yMax) this.yMax = this.yMin + 1;
      this.play();
    }

    draw() {
      const c = this.ctx, th = theme(), o = this.opts;
      this.clear();
      if (!this.groups.length) { this.empty(o.emptyText || '还没有对比数据'); return; }
      const g = this.plot();
      const yT = niceTicks(this.yMin, this.yMax, 5);
      const y = scaleLinear(yT[0], yT[yT.length - 1], g.y1, g.y0);
      const fmt = o.fmt || ((t) => F.num(t, 0));
      this.gridY(y, yT, { fmt: fmt });
      this.axisY(y, yT, { fmt: fmt });

      const n = this.groups.length;
      const colW = g.w / n;
      const bw = Math.min(o.boxWidth || 62, colW * 0.42);
      const pr = this.progress;

      this.groups.forEach((grp, i) => {
        const cx = g.x0 + colW * i + colW / 2;
        const color = grp.color || th.brand;
        const mid = isFinite(grp.median) ? grp.median : (grp.q1 + grp.q3) / 2;
        const e = (val) => mid + (val - mid) * pr;

        c.save();
        c.strokeStyle = withAlpha(color, 0.55);
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(cx, y(e(grp.min)));
        c.lineTo(cx, y(e(grp.max)));
        c.stroke();
        c.beginPath();
        c.moveTo(cx - bw * 0.28, y(e(grp.max)));
        c.lineTo(cx + bw * 0.28, y(e(grp.max)));
        c.moveTo(cx - bw * 0.28, y(e(grp.min)));
        c.lineTo(cx + bw * 0.28, y(e(grp.min)));
        c.stroke();

        const yTop = y(e(grp.q3));
        const yBot = y(e(grp.q1));
        const grad = c.createLinearGradient(0, yTop, 0, yBot);
        grad.addColorStop(0, withAlpha(color, 0.42));
        grad.addColorStop(1, withAlpha(color, 0.16));
        c.fillStyle = grad;
        c.strokeStyle = withAlpha(color, 0.85);
        c.lineWidth = 1.6;
        roundRect(c, cx - bw / 2, yTop, bw, Math.max(1, yBot - yTop), 5);
        c.fill();
        c.stroke();

        c.beginPath();
        c.moveTo(cx - bw / 2, y(e(grp.median)));
        c.lineTo(cx + bw / 2, y(e(grp.median)));
        c.strokeStyle = color;
        c.lineWidth = 2.6;
        c.stroke();

        if (isFinite(grp.mean)) {
          const my = y(e(grp.mean));
          c.beginPath();
          c.moveTo(cx, my - 4.5); c.lineTo(cx + 4.5, my);
          c.lineTo(cx, my + 4.5); c.lineTo(cx - 4.5, my);
          c.closePath();
          c.fillStyle = th.gold;
          c.fill();
        }

        c.fillStyle = withAlpha(th.t3, 0.5);
        for (const ov of (grp.outliers || []).slice(0, 80)) {
          if (ov == null || !isFinite(ov) || ov < yT[0] || ov > yT[yT.length - 1]) continue;
          c.beginPath();
          c.arc(cx + (Math.random() - 0.5) * bw * 0.5, y(ov), 1.7, 0, Math.PI * 2);
          c.fill();
        }

        c.fillStyle = th.t2;
        c.font = '600 12px system-ui';
        c.textAlign = 'center';
        c.textBaseline = 'top';
        c.fillText(grp.label, cx, g.y1 + 8);
        if (grp.sub) {
          c.fillStyle = th.t4;
          c.font = '10px var(--font-mono, monospace)';
          c.fillText(grp.sub, cx, g.y1 + 24);
        }
        c.restore();

        this.addHit({
          type: 'vband', x0: cx - colW / 2, x1: cx + colW / 2,
          html: tipHTML(grp.label, [
            { label: '中位数', value: fmt(grp.median), color: color },
            { label: '平均值', value: fmt(grp.mean), color: th.gold },
            { label: 'P25 – P75', value: fmt(grp.q1) + ' – ' + fmt(grp.q3) },
            { label: 'P05 – P95', value: fmt(grp.min) + ' – ' + fmt(grp.max) },
            grp.note ? { label: '说明', value: grp.note } : null,
          ]),
        });
      });
    }
  }

  /* ============================================================
   * 标准正态分位近似（给无界分布找显示范围用）
   * Acklam 近似，绝对误差 < 1.15e-9
   * ========================================================== */
  function quantileLike(mean, varr, p) {
    const sd = Math.sqrt(Math.max(varr, 1e-9));
    return mean + invNorm(p) * sd;
  }

  function invNorm(p) {
    if (p <= 0) return -6;
    if (p >= 1) return 6;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
      1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
      6.680131188771972e+01, -1.328068155288572e+01];
    const cl = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
      -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const dl = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
      3.754408661907416e+00];
    const pl = 0.02425;
    let q, r;
    if (p < pl) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((cl[0] * q + cl[1]) * q + cl[2]) * q + cl[3]) * q + cl[4]) * q + cl[5]) /
        ((((dl[0] * q + dl[1]) * q + dl[2]) * q + dl[3]) * q + 1);
    }
    if (p <= 1 - pl) {
      q = p - 0.5;
      r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((cl[0] * q + cl[1]) * q + cl[2]) * q + cl[3]) * q + cl[4]) * q + cl[5]) /
      ((((dl[0] * q + dl[1]) * q + dl[2]) * q + dl[3]) * q + 1);
  }

  register('histogram', Histogram);
  register('bar', BarChart);
  register('density', DensityChart);
  register('convergence', ConvergenceChart);
  register('boxplot', BoxPlot);

  LS.charts.Histogram = Histogram;
  LS.charts.BarChart = BarChart;
  LS.charts.DensityChart = DensityChart;
  LS.charts.ConvergenceChart = ConvergenceChart;
  LS.charts.BoxPlot = BoxPlot;
  LS.charts.TF = TF;
  LS.charts.invNorm = invNorm;
})(typeof globalThis !== 'undefined' ? globalThis : this);
