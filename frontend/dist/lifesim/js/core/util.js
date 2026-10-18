/* ============================================================
 * LifeSim · core/util.js
 * 通用工具：数学小函数 + 数值格式化
 * 依赖：无（最底层模块）
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});

  /* ---------------- 数学 ---------------- */

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const clamp01 = (v) => clamp(v, 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sum = (arr) => {
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i];
    return s;
  };
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const last = (arr) => arr[arr.length - 1];

  /** 把 x 线性映射到 [0,1]（超出会被截断；非有限输入返回 0，避免 NaN 扩散） */
  const norm01 = (x, lo, hi) => {
    if (!isFinite(x)) return 0;
    return hi === lo ? 0 : clamp01((x - lo) / (hi - lo));
  };

  /** 非有限数就回退到默认值 —— 用于防止单个坏数据污染整条模拟 */
  const finiteOr = (v, fallback = 0) => (isFinite(v) ? v : fallback);

  /** Logistic 函数，事件概率模型的核心 */
  const sigmoid = (z) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

  /** 稳定的对数求和（log-sum-exp），避免极端值溢出 */
  function logSumExp(vals) {
    let m = -Infinity;
    for (const v of vals) if (v > m) m = v;
    if (m === -Infinity) return -Infinity;
    let s = 0;
    for (const v of vals) s += Math.exp(v - m);
    return m + Math.log(s);
  }

  /** 简单字符串哈希，用来把任意 id 变成稳定的整数种子 */
  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  const uid = (() => {
    let n = 0;
    return (prefix) => `${prefix || 'id'}_${Date.now().toString(36)}_${(n++).toString(36)}`;
  })();

  /* ---------------- 数值格式化 ----------------
   *
   * 注意 `isFinite(null) === true`（null 会被转成 0）这个 JS 陷阱：
   * 所有格式化函数必须先排除 null / undefined / 空字符串，
   * 否则"没有这个数据"会被显示成 0，或者直接在 toFixed 上抛错。
   * ------------------------------------------------ */
  const missing = (v) => v == null || v === '' || (typeof v === 'number' && !isFinite(v));
  const absent = (v) => missing(v);

  /** 千分位整数 */
  function int(v) {
    if (absent(v) || !isFinite(v)) return '—';
    return Math.round(v).toLocaleString('zh-CN');
  }

  /** 默认 1 位小数，可选多位 */
  function fixed(v, d = 1) {
    if (absent(v) || !isFinite(v)) return '—';
    return Number(v).toFixed(d);
  }

  /** 百分比：0.314 -> "31.4%" */
  function pct(v, d = 1) {
    if (absent(v) || !isFinite(v)) return '—';
    return (Number(v) * 100).toFixed(d) + '%';
  }

  /** 金额：以「万」为单位传入，自动切换 万 / 亿 */
  function money(wan, d = 1) {
    if (absent(wan) || !isFinite(wan)) return '—';
    const n = Number(wan);
    const a = Math.abs(n);
    if (a >= 10000) return (n / 10000).toFixed(Math.max(0, d - 1)) + ' 亿';
    if (a >= 1) return n.toFixed(d) + ' 万';
    return (n * 10000).toFixed(0) + ' 元';
  }

  /** 紧凑计数：10000 -> "1.0万"，100000 -> "10万" */
  function compact(n) {
    if (absent(n) || !isFinite(n)) return '—';
    const v = Number(n);
    const a = Math.abs(v);
    if (a >= 100000000) return (v / 100000000).toFixed(1) + ' 亿';
    if (a >= 10000) return (v / 10000).toFixed(a >= 100000 ? 0 : 1) + ' 万';
    if (a >= 1000) return v.toLocaleString('zh-CN');
    return String(Math.round(v));
  }

  /** 带正负号，用于「修正 +8%」这类展示 */
  function signedPct(v, d = 0) {
    if (absent(v) || !isFinite(v)) return '—';
    const n = Number(v);
    const s = (n * 100).toFixed(d) + '%';
    return n > 0 ? '+' + s : s;
  }

  function signed(v, d = 1) {
    if (absent(v) || !isFinite(v)) return '—';
    const n = Number(v);
    const s = n.toFixed(d);
    return n > 0 ? '+' + s : s;
  }

  /** 分位数转百分位文本：0.914 -> "91.4%" */
  const percentile = (q) => pct(q, 1);

  /* ---------------- 其他 ---------------- */

  function pick(arr, rng01) {
    const r = typeof rng01 === 'function' ? rng01() : Math.random();
    return arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];
  }

  /** 加权抽样：weights 不必归一化 */
  function weightedPick(items, weights, rng01) {
    const r = typeof rng01 === 'function' ? rng01() : Math.random();
    let total = 0;
    for (const w of weights) total += w;
    let acc = 0;
    const target = r * total;
    for (let i = 0; i < items.length; i++) {
      acc += weights[i];
      if (target < acc) return items[i];
    }
    return items[items.length - 1];
  }

  function groupBy(arr, keyFn) {
    const m = new Map();
    for (const it of arr) {
      const k = keyFn(it);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(it);
    }
    return m;
  }

  /** 深拷贝（只处理 JSON 可序列化结构，够用且快） */
  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

  LS.util = {
    clamp, clamp01, lerp, sum, range, last, norm01, finiteOr, sigmoid, logSumExp,
    hashSeed, uid, int, fixed, pct, money, compact, signedPct, signed,
    percentile, pick, weightedPick, groupBy, clone,
    /** 判断"这个值是不是缺失"（排除 null / undefined / 空串 / 非有限数） */
    absent,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
