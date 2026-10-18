/* ============================================================
 * LifeSim · charts/life.js
 * 人生专属图表：路径云 / 人生曲线 / 时间轴 / 五维雷达
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const B = LS.charts.Base;
  const { scaleLinear, niceTicks, withAlpha, roundRect, theme, F, tipHTML, register } = LS.charts;
  const S = LS.stats;

  /* ============================================================
   * PathCloud · 平行人生路径云（规格书 §12.2）
   *
   * 设计意图：一眼看出"命运的扇形发散"。
   * 因此默认画 200 条淡线 + 4 条高层分位线（P05/P25/P75/P95）+
   * 3 条被点名的具体人生（最好 / 最差 / 你自己）。
   * ========================================================== */
  class PathCloud extends B {
    /**
     * opts.paths: [{id, label, points:[{age,wealth}], kind:'sample'|'mine'|'best'|'worst'|'median', color}]
     * opts.band: 可选 [{age, p05, p25, p50, p75, p95}] 分位带
     * opts.unitY: 'wealth'|'score'
     * opts.scale: 'linear'|'log'
     */
    constructor(host, opts = {}) {
      super(host, Object.assign({ pad: { t: 24, r: 26, b: 34, l: 62 } }, opts));
      this.setData(opts);
    }

    setData(opts = {}) {
      Object.assign(this.opts, opts);
      const paths = (this.opts.paths || []).filter((p) => p && p.points && p.points.length);
      // 绘制顺序：普通样本先画（被后画的盖住），重点路径最后画
      const rank = { sample: 0, median: 1, worst: 2, best: 3, mine: 4 };
      this.paths = paths.slice().sort((a, b) =>
        (rank[a.kind] || 0) - (rank[b.kind] || 0));
      const ages = [];
      let min = Infinity, max = -Infinity;
      for (const p of this.paths) {
        for (const pt of p.points) {
          ages.push(pt.age);
          if (isFinite(pt.wealth)) {
            min = Math.min(min, pt.wealth);
            max = Math.max(max, pt.wealth);
          }
        }
      }
      if (!this.paths.length) { min = 0; max = 1; }
      this.ageMin = Math.min(...ages, 18);
      this.ageMax = Math.max(...ages, 90);
      this.yMin = isFinite(min) ? Math.min(min * 1.05, 0) : 0;
      this.yMax = isFinite(max) ? max * 1.06 : 1;
      this.tf = LS.charts.TF[this.opts.scale || 'linear'] || LS.charts.TF.linear;
      this.play();
    }

    draw() {
      const c = this.ctx, th = theme(), o = this.opts;
      this.clear();
      if (!this.paths.length) { this.empty(o.emptyText || '还没有可展示的平行人生'); return; }
      const g = this.plot();
      const pr = this.progress;

      const x = scaleLinear(this.ageMin, this.ageMax, g.x0, g.x1);
      const useLog = (o.scale || 'linear') === 'log';
      const fl = this.tf.f(this.yMin), fh = this.tf.f(this.yMax);
      const y = scaleLinear(fl, fh, g.y1, g.y0);

      const yTicks = this.tf.ticks(this.yMin, this.yMax);
      this.gridY(y, yTicks.map((v) => this.tf.f(v)), { fmt: (u) => this.tf.label(this.tf.inv(u)) });
      const ageTicks = [20, 30, 40, 50, 60, 70, 80, 90].filter((a) => a >= this.ageMin && a <= this.ageMax);
      this.axisX(x, ageTicks, { fmt: (a) => a + ' 岁' });

      // 0 线（负债分界）
      if (this.yMin < 0 && this.yMax > 0) {
        const zy = y(this.tf.f(0));
        c.save();
        c.strokeStyle = withAlpha(th.bad, 0.55);
        c.lineWidth = 1;
        c.setLineDash([4, 4]);
        c.beginPath(); c.moveTo(g.x0, zy); c.lineTo(g.x1, zy); c.stroke();
        c.setLineDash([]);
        c.fillStyle = withAlpha(th.bad, 0.8);
        c.font = '10px system-ui';
        c.textAlign = 'left';
        c.textBaseline = 'bottom';
        c.fillText('0（负债线）', g.x0 + 3, zy - 3);
        c.restore();
      }

      // 分位带
      if (o.band && o.band.length > 2) {
        c.save();
        const bx = (a) => x(a);
        const by = (v) => y(this.tf.f(v));
        c.beginPath();
        o.band.forEach((b, i) => { i ? c.lineTo(bx(b.age), by(b.p95)) : c.moveTo(bx(b.age), by(b.p95)); });
        for (let i = o.band.length - 1; i >= 0; i--) c.lineTo(bx(o.band[i].age), by(o.band[i].p05));
        c.closePath();
        c.fillStyle = withAlpha(th.brand, 0.09);
        c.fill();
        c.beginPath();
        o.band.forEach((b, i) => { i ? c.lineTo(bx(b.age), by(b.p75)) : c.moveTo(bx(b.age), by(b.p75)); });
        for (let i = o.band.length - 1; i >= 0; i--) c.lineTo(bx(o.band[i].age), by(o.band[i].p25));
        c.closePath();
        c.fillStyle = withAlpha(th.brand, 0.13);
        c.fill();
        // 中位线
        c.beginPath();
        o.band.forEach((b, i) => { i ? c.lineTo(bx(b.age), by(b.p50)) : c.moveTo(bx(b.age), by(b.p50)); });
        c.strokeStyle = withAlpha(th.brand, 0.6);
        c.lineWidth = 1.6;
        c.setLineDash([5, 4]);
        c.stroke();
        c.setLineDash([]);
        c.restore();
      }

      // 路径
      const cutoff = this.ageMin + (this.ageMax - this.ageMin) * pr;
      for (const p of this.paths) {
        const isKey = p.kind && p.kind !== 'sample';
        c.save();
        c.lineWidth = isKey ? (p.kind === 'mine' ? 2.8 : 2) : 1;
        c.strokeStyle = isKey
          ? (p.color || { best: th.ok, worst: th.bad, mine: th.gold, median: th.brand }[p.kind] || th.brand)
          : withAlpha(p.color || th.blue, 0.13);
        if (isKey) {
          c.shadowColor = c.strokeStyle;
          c.shadowBlur = p.kind === 'mine' ? 14 : 6;
        }
        c.lineJoin = 'round';
        c.beginPath();
        let started = false;
        for (const pt of p.points) {
          if (pt.age > cutoff) break;
          if (!isFinite(pt.wealth)) continue;
          const px = x(pt.age), py = y(this.tf.f(pt.wealth));
          if (!started) { c.moveTo(px, py); started = true; } else c.lineTo(px, py);
        }
        c.stroke();
        c.restore();

        if (isKey) {
          this.addHit({
            type: 'vband', x0: g.x0, x1: g.x1,
            html: null,
          });
        }
      }

      // 重点路径末端标注
      const labels = [];
      for (const p of this.paths) {
        if (!p.kind || p.kind === 'sample') continue;
        const last = p.points[p.points.length - 1];
        if (!last || !isFinite(last.wealth)) continue;
        labels.push({
          y: y(this.tf.f(last.wealth)),
          x: x(last.age),
          text: p.label || { best: '最幸运', worst: '最糟糕', mine: '你的一生', median: '中位人生' }[p.kind],
          color: p.color || { best: th.ok, worst: th.bad, mine: th.gold, median: th.brand }[p.kind] || th.brand,
          kind: p.kind,
        });
      }
      labels.sort((a, b) => a.y - b.y);
      let lastY = -99;
      for (const L of labels) {
        const ly = Math.max(L.y, lastY + 15);
        lastY = ly;
        c.save();
        c.strokeStyle = withAlpha(L.color, 0.35);
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(L.x, L.y);
        c.lineTo(Math.min(g.x1 + 4, L.x + 10), ly);
        c.stroke();
        c.fillStyle = L.color;
        c.font = (L.kind === 'mine' ? '700 11px' : '600 10.5px') + ' system-ui';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(L.text, Math.min(g.x1 + 6, L.x + 12), ly);
        c.restore();
      }

      // 结局分布直方（右侧竖条，规格书 §12.2 一屏读懂）
      if (o.endpointBars !== false) {
        const ends = this.paths.filter((p) => p.kind === 'sample')
          .map((p) => p.points[p.points.length - 1])
          .filter((p) => p && isFinite(p.wealth));
        if (ends.length > 10) {
          const nb = 26;
          const vals = ends.map((e) => e.wealth);
          const lo = S.quantile(vals, 0.01), hi = S.quantile(vals, 0.99);
          const counts = new Array(nb).fill(0);
          for (const v of vals) {
            if (v < lo || v > hi) continue;
            counts[Math.min(nb - 1, Math.floor((v - lo) / ((hi - lo) || 1) * nb))]++;
          }
          const mc = Math.max(...counts, 1);
          const bw = (g.x1 - g.x0) / nb;
          c.save();
          c.fillStyle = withAlpha(th.t2, 0.16);
          for (let i = 0; i < nb; i++) {
            if (!counts[i]) continue;
            const h = counts[i] / mc * g.h * 0.28;
            c.fillRect(g.x0 + i * bw, g.y1 - h, Math.max(1, bw - 1), h);
          }
          c.fillStyle = th.t4;
          c.font = '10px system-ui';
          c.textAlign = 'left';
          c.textBaseline = 'bottom';
          c.fillText('终点财富分布', g.x0 + 4, g.y1 - 4);
          c.restore();
        }
      }
    }
  }

  /* ============================================================
   * TimeSeries · 单条人生曲线（结果页主图）
   * 支持双轴：财富（左）/ 0–100 状态分（右）
   * ========================================================== */
  class TimeSeries extends B {
    /**
     * opts.ages: number[]
     * opts.series: [{key,label,color,values,axis:'left'|'right',fill,width,dash}]
     * opts.events: [{age,title,icon,major,category}]
     * opts.marks: [{age,label,color}]
     */
    constructor(host, opts = {}) {
      super(host, Object.assign({ pad: { t: 26, r: 52, b: 46, l: 60 } }, opts));
      this.setData(opts);
    }

    setData(opts = {}) {
      Object.assign(this.opts, opts);
      const ages = this.opts.ages || [];
      this.ages = ages;
      this.series = (this.opts.series || []).filter((s) => s && s.values);
      const left = [], right = [];
      for (const s of this.series) {
        for (const v of s.values) if (isFinite(v)) (s.axis === 'right' ? right : left).push(v);
      }
      this.leftRange = left.length ? [Math.min(0, ...left), Math.max(...left)] : [0, 1];
      this.rightRange = right.length ? [Math.min(...right), Math.max(...right)] : [0, 100];
      if (this.opts.rightFixed) this.rightRange = this.opts.rightFixed;
      this.play();
    }

    draw() {
      const c = this.ctx, th = theme(), o = this.opts;
      this.clear();
      if (!this.ages.length || !this.series.length) { this.empty(o.emptyText || '还没有人生数据'); return; }
      const g = this.plot();
      const pr = this.progress;

      const x = scaleLinear(this.ages[0], this.ages[this.ages.length - 1], g.x0, g.x1);
      const lo = niceTicks(this.leftRange[0], this.leftRange[1], 5);
      const ly = scaleLinear(lo[0], lo[lo.length - 1], g.y1, g.y0);
      const hi = o.rightFixed || niceTicks(this.rightRange[0], this.rightRange[1], 4);
      const ry = scaleLinear(hi[0], hi[hi.length - 1], g.y1, g.y0);

      this.gridY(ly, lo, { fmt: o.leftFmt || ((t) => F.wealthShort(t)) });
      this.axisY(ly, lo, { fmt: o.leftFmt || ((t) => F.wealthShort(t)) });
      // 右轴
      c.save();
      c.strokeStyle = th.line2;
      c.beginPath();
      c.moveTo(Math.round(g.x1) + 0.5, g.y0);
      c.lineTo(Math.round(g.x1) + 0.5, g.y1);
      c.stroke();
      c.font = '10.5px var(--font-mono, monospace)';
      c.fillStyle = th.t4;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      for (const t of hi) c.fillText(F.num(t, 0), g.x1 + 8, ry(t));
      c.restore();

      const step = Math.max(1, Math.ceil(this.ages.length / 12));
      const aTicks = this.ages.filter((a, i) => i % step === 0);
      this.axisX(x, aTicks, { fmt: (a) => a + '岁' });

      // 事件竖线
      this.eventHits = [];
      for (const ev of (o.events || [])) {
        if (!isFinite(ev.age)) continue;
        const px = x(ev.age);
        const major = ev.major || ev.category === 'crisis';
        c.save();
        c.strokeStyle = withAlpha(major ? th.fate : th.t3, major ? 0.5 : 0.22);
        c.lineWidth = major ? 1.4 : 1;
        if (!major) c.setLineDash([3, 5]);
        c.beginPath();
        c.moveTo(px, g.y0 + 12);
        c.lineTo(px, g.y1);
        c.stroke();
        c.restore();
        if (major) {
          c.save();
          c.font = '12px system-ui';
          c.textAlign = 'center';
          c.textBaseline = 'top';
          c.globalAlpha = 0.9;
          c.fillText(ev.icon || '◆', px, g.y0 - 2);
          c.restore();
        }
        this.addHit({
          type: 'vband', x0: px - 5, x1: px + 5, y0: g.y0, y1: g.y1,
          html: tipHTML((ev.icon || '') + ' ' + ev.title, [
            { label: '年龄', value: F.age(ev.age) },
            ev.probability != null ? { label: '发生概率', value: F.pct(ev.probability, 1) } : null,
            ev.narrative ? { label: '结果', value: ev.narrative } : null,
          ]),
        });
      }

      // 曲线（逐点描绘动画）
      for (const s of this.series) {
        if (s.hidden) continue;
        const color = s.color || th.brand;
        const yScale = s.axis === 'right' ? ry : ly;
        // 面积
        if (s.fill) {
          c.save();
          c.beginPath();
          let started = false;
          const n = Math.max(2, Math.floor(this.ages.length * pr));
          for (let i = 0; i < n; i++) {
            const v = s.values[i];
            if (!isFinite(v)) continue;
            const px = x(this.ages[i]), py = yScale(v);
            if (!started) { c.moveTo(px, py); started = true; } else c.lineTo(px, py);
          }
          if (started) {
            c.lineTo(x(this.ages[n - 1]), g.y1);
            c.lineTo(x(this.ages[0]), g.y1);
            c.closePath();
            const grad = c.createLinearGradient(0, g.y0, 0, g.y1);
            grad.addColorStop(0, withAlpha(color, 0.28));
            grad.addColorStop(1, withAlpha(color, 0.01));
            c.fillStyle = grad;
            c.fill();
          }
          c.restore();
        }
        c.save();
        c.strokeStyle = color;
        c.lineWidth = s.width || 2.4;
        c.lineJoin = 'round';
        if (s.dash) c.setLineDash(s.dash);
        if (o.glow !== false) { c.shadowColor = withAlpha(color, 0.55); c.shadowBlur = 9; }
        c.beginPath();
        let started = false;
        const n = Math.max(2, Math.floor(this.ages.length * pr));
        for (let i = 0; i < n; i++) {
          const v = s.values[i];
          if (!isFinite(v)) { started = false; continue; }
          const px = x(this.ages[i]), py = yScale(v);
          if (!started) { c.moveTo(px, py); started = true; } else c.lineTo(px, py);
        }
        c.stroke();
        c.restore();
      }

      // 关键年龄标记
      for (const m of (o.marks || [])) {
        if (!isFinite(m.age)) continue;
        const px = x(m.age);
        c.save();
        c.strokeStyle = withAlpha(m.color || th.gold, 0.7);
        c.setLineDash([5, 4]);
        c.beginPath(); c.moveTo(px, g.y0); c.lineTo(px, g.y1); c.stroke();
        if (m.label) {
          c.setLineDash([]);
          c.fillStyle = m.color || th.gold;
          c.font = '600 10.5px system-ui';
          c.textAlign = 'center';
          c.textBaseline = 'top';
          c.fillText(m.label, px, g.y0 - 14);
        }
        c.restore();
      }

      // hover：读取该年龄的所有序列值
      this.onHoverChange = (hit, mx) => {
        if (!hit) return;
        const age = x.invert(mx);
        let idx = 0, bd = Infinity;
        for (let i = 0; i < this.ages.length; i++) {
          const d = Math.abs(this.ages[i] - age);
          if (d < bd) { bd = d; idx = i; }
        }
        const rows = this.series.filter((s) => !s.hidden).map((s) => ({
          label: s.label,
          value: s.axis === 'right' ? F.score(s.values[idx]) : (s.fmt ? s.fmt(s.values[idx]) : F.wealth(s.values[idx])),
          color: s.color || th.brand,
        }));
        this.showTip(tipHTML(F.age(this.ages[idx]), rows), x(this.ages[idx]), 30);
      };
      this.addHit({ type: 'vband', x0: g.x0, x1: g.x1, html: null });
    }
  }

  /* ============================================================
   * TimelineChart · 一生长条（结果页顶部 / 档案卡）
   * ========================================================== */
  class TimelineChart extends B {
    /**
     * opts.lifespan: number
     * opts.states: [{age, career, economy}]  用于画职业/经济色带
     * opts.events: [{age,title,icon,category,major}]
     */
    constructor(host, opts = {}) {
      super(host, Object.assign({ pad: { t: 16, r: 16, b: 18, l: 16 } }, opts));
      this.setData(opts);
    }

    setData(opts = {}) {
      Object.assign(this.opts, opts);
      this.lifespan = this.opts.lifespan || 85;
      this.play();
    }

    draw() {
      const c = this.ctx, th = theme(), o = this.opts;
      this.clear();
      if (!this.lifespan) { this.empty(); return; }
      const g = this.plot();
      const pr = this.progress;
      const x = scaleLinear(0, this.lifespan, g.x0, g.x1);

      const C = LS.config;
      const careerColor = {
        student: '#60a5fa', junior: '#38bdf8', senior: '#22d3ee', manager: '#34d399',
        unemployed: 'rgba(248,113,113,0.55)', freelance: '#a78bfa', entrepreneur: '#c084fc',
        retired: '#64748b',
      };
      const bandY = g.y0 + 6;
      const bandH = 12;

      // 人生阶段色带
      const states = o.states || [];
      if (states.length) {
        let cur = states[0].career, start = states[0].age;
        const segs = [];
        for (let i = 1; i <= states.length; i++) {
          const nx = i < states.length ? states[i] : null;
          if (!nx || nx.career !== cur) {
            segs.push({ career: cur, from: start, to: states[i - 1].age });
            if (nx) { cur = nx.career; start = nx.age; }
          }
        }
        for (const s of segs) {
          const w = x(s.to + 1) - x(s.from);
          c.fillStyle = withAlpha(careerColor[s.career] || th.brand, 0.55);
          c.fillRect(x(s.from), bandY, Math.max(1, w), bandH);
        }
      } else {
        c.fillStyle = withAlpha(th.brand, 0.25);
        c.fillRect(g.x0, bandY, g.w, bandH);
      }

      // 事件点
      const evs = (o.events || []).filter((e) => isFinite(e.age));
      const rows = [bandY + bandH + 14, bandY + bandH + 28];
      evs.forEach((ev, i) => {
        const px = x(ev.age);
        const rowY = ev.major ? rows[0] : rows[1];
        c.save();
        if (ev.age <= this.lifespan * pr + 0.001) {
          c.strokeStyle = withAlpha(ev.major ? th.fate : th.t3, ev.major ? 0.6 : 0.3);
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(px, bandY + bandH);
          c.lineTo(px, rowY - 3);
          c.stroke();
          c.beginPath();
          c.arc(px, rowY, ev.major ? 3.6 : 2.4, 0, Math.PI * 2);
          c.fillStyle = ev.major ? th.fate : withAlpha(th.t3, 0.7);
          c.fill();
        }
        c.restore();
      });

      // 年龄刻度
      c.save();
      c.font = '10px var(--font-mono, monospace)';
      c.fillStyle = th.t4;
      c.textAlign = 'center';
      c.textBaseline = 'top';
      for (let a = 0; a <= this.lifespan; a += 10) {
        c.fillText(a, x(a), rows[1] + 10);
      }
      c.restore();

      this.addHit({
        type: 'vband', x0: g.x0, x1: g.x1, y0: g.y0 + 4, y1: this.h - 2,
        html: null,
      });
      this.onHoverChange = (hit, mx) => {
        if (!hit) return;
        const age = Math.round(x.invert(mx));
        const near = evs.filter((e) => Math.abs(e.age - age) <= 1).slice(0, 3);
        const st = states.find((s) => s.age === age);
        const rowsHtml = [];
        if (st) rowsHtml.push({ label: '职业', value: C.CAREER_LABEL[st.career] || st.career, color: careerColor[st.career] });
        for (const e of near) rowsHtml.push({ label: e.title, value: (e.icon || '') + ' ' + F.pct(e.probability != null ? e.probability : 0, 1) });
        this.showTip(tipHTML(F.age(age), rowsHtml.length ? rowsHtml : [{ label: '无重大事件', value: '—' }]), mx, 20);
      };
    }
  }

  /* ============================================================
   * Radar · 五维人生雷达（规格书 §13.2）
   * ========================================================== */
  class Radar extends B {
    /**
     * opts.dims: [{key,label,max}]
     * opts.series: [{label,color,values:number[]}]
     */
    constructor(host, opts = {}) {
      super(host, Object.assign({ pad: { t: 30, r: 30, b: 30, l: 30 } }, opts));
      this.setData(opts);
    }

    setData(opts = {}) {
      Object.assign(this.opts, opts);
      this.dims = this.opts.dims || [];
      this.series = (this.opts.series || []).filter(Boolean);
      this.play();
    }

    draw() {
      const c = this.ctx, th = theme(), o = this.opts;
      this.clear();
      if (!this.dims.length || !this.series.length) { this.empty(o.emptyText || '暂无维度数据'); return; }
      const g = this.plot();
      const cx = (g.x0 + g.x1) / 2;
      const cy = (g.y0 + g.y1) / 2 + 4;
      const R = Math.min(g.w, g.h) / 2 - 26;
      const n = this.dims.length;
      const angle = (i) => -Math.PI / 2 + i * Math.PI * 2 / n;
      const pr = this.progress;

      // 网格环
      c.save();
      for (let ring = 1; ring <= 4; ring++) {
        const r = R * ring / 4;
        c.beginPath();
        for (let i = 0; i <= n; i++) {
          const a = angle(i % n);
          const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
          i ? c.lineTo(px, py) : c.moveTo(px, py);
        }
        c.closePath();
        c.strokeStyle = ring === 4 ? th.line2 : th.gridBg;
        c.lineWidth = 1;
        c.stroke();
      }
      // 轴线 + 标签
      c.font = '600 11.5px system-ui';
      for (let i = 0; i < n; i++) {
        const a = angle(i);
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        c.strokeStyle = th.gridBg;
        c.stroke();
        const lx = cx + Math.cos(a) * (R + 20);
        const ly = cy + Math.sin(a) * (R + 18);
        c.fillStyle = th.t2;
        c.textAlign = Math.abs(Math.cos(a)) < 0.3 ? 'center' : (Math.cos(a) > 0 ? 'left' : 'right');
        c.textBaseline = Math.abs(Math.sin(a)) < 0.3 ? 'middle' : (Math.sin(a) > 0 ? 'top' : 'bottom');
        c.fillText(this.dims[i].label, lx, ly);
      }
      c.restore();

      // 数据多边形
      for (const s of this.series) {
        const color = s.color || th.brand;
        const pts = this.dims.map((d, i) => {
          const raw = s.values[i];
          const norm = Math.max(0, Math.min(1, (raw || 0) / (d.max || 100)));
          const r = R * norm * pr;
          const a = angle(i);
          return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, norm];
        });
        c.save();
        c.beginPath();
        pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
        c.closePath();
        const grad = c.createRadialGradient(cx, cy, 0, cx, cy, R);
        grad.addColorStop(0, withAlpha(color, 0.34));
        grad.addColorStop(1, withAlpha(color, 0.10));
        c.fillStyle = grad;
        c.fill();
        c.strokeStyle = color;
        c.lineWidth = 2.2;
        c.shadowColor = withAlpha(color, 0.6);
        c.shadowBlur = 10;
        c.stroke();
        c.shadowBlur = 0;
        for (const p of pts) {
          c.beginPath();
          c.arc(p[0], p[1], 3.2, 0, Math.PI * 2);
          c.fillStyle = color;
          c.fill();
          c.strokeStyle = 'rgba(9,11,22,0.9)';
          c.lineWidth = 1.4;
          c.stroke();
        }
        c.restore();
      }

      // 顶点 hover
      this.series.forEach((s) => {
        this.dims.forEach((d, i) => {
          const raw = s.values[i];
          const norm = Math.max(0, Math.min(1, (raw || 0) / (d.max || 100)));
          const a = angle(i);
          this.addHit({
            x: cx + Math.cos(a) * R * norm,
            y: cy + Math.sin(a) * R * norm,
            r: 12,
            html: tipHTML(d.label, [
              { label: s.label, value: F.score(raw) + ' / ' + (d.max || 100), color: s.color || th.brand },
            ]),
          });
        });
      });
    }
  }

  register('pathcloud', PathCloud);
  register('timeseries', TimeSeries);
  register('timeline', TimelineChart);
  register('radar', Radar);

  LS.charts.PathCloud = PathCloud;
  LS.charts.TimeSeries = TimeSeries;
  LS.charts.TimelineChart = TimelineChart;
  LS.charts.Radar = Radar;
})(typeof globalThis !== 'undefined' ? globalThis : this);
