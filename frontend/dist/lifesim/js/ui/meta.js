/* ============================================================
 * LifeSim · ui/meta.js
 * 成就系统与渐进解锁（规格书 §29、§31）
 *
 * 设计原则：成就描述"你观察到了什么"，而不是"你点了多少下"。
 * 因此大部分成就由**模拟结果**触发，而不是由 UI 操作触发。
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const U = LS.util;

  const ACHIEVEMENTS = [
    /* ---------- 入门 ---------- */
    {
      id: 'first_life', icon: '🌱', tier: 'bronze',
      name: '第一次降临', desc: '完整看完一条人生的全部年份',
      test: (c) => !!c.run || (c.kind === 'life' && c.done),
    },
    {
      id: 'first_batch', icon: '🎲', tier: 'bronze',
      name: '推开平行宇宙的门', desc: '完成第一次批量模拟（≥ 1,000 次）',
      test: (c) => c.mc && c.mc.sampleSize >= 1000,
    },
    {
      id: 'ten_lives', icon: '📚', tier: 'bronze',
      name: '十世轮回', desc: '累计模拟 10 条人生',
      test: (c) => (c.state && c.state.stats.totalRuns >= 10),
    },
    {
      id: 'hundred_lives', icon: '📈', tier: 'silver',
      name: '百次人生', desc: '累计模拟 100 条人生',
      test: (c) => (c.state && c.state.stats.totalRuns >= 100),
    },
    /* ---------- 规模 ---------- */
    {
      id: 'monte_10k', icon: '🌌', tier: 'silver',
      name: '万人平行宇宙', desc: '单次模拟 10,000 条人生',
      test: (c) => c.mc && c.mc.sampleSize >= 10000,
    },
    {
      id: 'monte_100k', icon: '🛰', tier: 'gold',
      name: '十万次重演', desc: '单次模拟 100,000 条人生',
      test: (c) => c.mc && c.mc.sampleSize >= 100000,
    },
    {
      id: 'monte_million', icon: '🌠', tier: 'myth',
      name: '百万人生', desc: '累计模拟次数超过 1,000,000',
      test: (c) => (c.state && c.state.stats.totalSimulated >= 1000000),
    },
    /* ---------- 结果观察 ---------- */
    {
      id: 'bankrupt', icon: '🧾', tier: 'silver',
      name: '负债的十年', desc: '观察到一条以负债收场的人生',
      test: (c) => (c.run && c.run.result.finalWealth < 0) ||
        (c.mc && c.mc.summary.wealth.p05 < 0),
    },
    {
      id: 'millionaire', icon: '💎', tier: 'gold',
      name: '三千万身家', desc: '有一条人生最终财富超过 3,000 万',
      test: (c) => (c.run && c.run.result.finalWealth >= 3000) ||
        (c.mc && c.mc.summary.wealth.max >= 3000),
    },
    {
      id: 'billionaire', icon: '👑', tier: 'gold',
      name: '亿级人生', desc: '观察到最终财富超过 1 亿的人生',
      test: (c) => (c.run && c.run.result.finalWealth >= 10000) ||
        (c.mc && c.mc.summary.wealth.max >= 10000),
    },
    {
      id: 'tail_reader', icon: '🔍', tier: 'bronze',
      name: '看见另一头', desc: '打开过最差 5% 的人生画像',
      test: (c) => c.kind === 'tail',
    },
    {
      id: 'startup_win', icon: '🚀', tier: 'gold',
      name: '赌赢了的那一次', desc: '有一条人生创业成功',
      test: (c) => c.run && c.run.events && c.run.events.some((e) =>
        e.id === 'startup' && e.outcome && e.outcome.flags && e.outcome.flags.startupSuccess),
    },
    {
      id: 'long_life', icon: '🐢', tier: 'silver',
      name: '长寿样本', desc: '有一条人生活过 95 岁',
      test: (c) => (c.run && c.run.result.lifespan >= 95) ||
        (c.mc && c.mc.summary.lifespan.max >= 95),
    },
    {
      id: 'healthy', icon: '💪', tier: 'silver',
      name: '健康的人生', desc: '健康分达到 88 以上',
      test: (c) => (c.run && c.run.result.health >= 88) ||
        (c.mc && c.mc.summary.health.max >= 88),
    },
    {
      id: 'scholar', icon: '🎓', tier: 'silver',
      name: '读到最高学历', desc: '完成一条博士学历的人生',
      test: (c) => c.run && c.run.result.educationLabel &&
        c.run.result.educationLabel.indexOf('博士') >= 0,
    },
    /* ---------- 方法 ---------- */
    {
      id: 'compare_first', icon: '⚖️', tier: 'bronze',
      name: '第一次对照', desc: '完成第一次两种活法的比较',
      test: (c) => c.kind === 'compare' && c.compare && c.compare.arms,
    },
    {
      id: 'compare_three', icon: '🧭', tier: 'silver',
      name: '多试几种活法', desc: '完成 3 次策略对照',
      test: (c) => c.state && (c.state.stats.compareRuns || 0) >= 3,
    },
    {
      id: 'seed_locked', icon: '🔒', tier: 'gold',
      name: '锁住运气', desc: '在锁定运气的条件下对比两种选择',
      test: (c) => c.kind === 'compare' && c.compare && c.compare.lockWorldSeed,
    },
    {
      id: 'homeowner', icon: '🏠', tier: 'silver',
      name: '有房了', desc: '完成一次买房',
      test: (c) => c.run && c.run.events && c.run.events.some((e) => e.id === 'buy_house'),
    },
    {
      id: 'promoted', icon: '📈', tier: 'bronze',
      name: '往上走了一格', desc: '在职业上被提拔',
      test: (c) => c.run && c.run.events && c.run.events.some((e) => e.id === 'promotion'),
    },
    {
      id: 'survivor', icon: '🩹', tier: 'silver',
      name: '意外之后', desc: '经历过一次意外事故',
      test: (c) => c.run && c.run.events && c.run.events.some((e) => e.id === 'accident'),
    },
    /* ---------- 人生彩蛋 ---------- */
    {
      id: 'old_friend', icon: '☕', tier: 'bronze',
      name: '老友记', desc: '在人生里与老朋友重逢',
      test: (c) => c.run && c.run.events && c.run.events.some((e) => e.id === 'old_friend'),
    },
    {
      id: 'cat_person', icon: '🐈', tier: 'silver',
      name: '猫奴', desc: '收养过一只流浪猫',
      test: (c) => c.run && c.run.events && c.run.events.some((e) => e.id === 'stray_cat'),
    },
    {
      id: 'late_bloom', icon: '🌼', tier: 'gold',
      name: '大器晚成', desc: '在 50 岁之后迎来事业转机',
      test: (c) => c.run && c.run.events && c.run.events.some((e) => e.id === 'late_bloom'),
    },
    {
      id: 'side_hustle', icon: '🌙', tier: 'bronze',
      name: '斜杠青年', desc: '做过一份副业',
      test: (c) => c.run && c.run.events && c.run.events.some((e) => e.id === 'side_hustle'),
    },
    {
      id: 'plain_life', icon: '🍵', tier: 'silver',
      name: '平安是福', desc: '活过 80 岁，最后没有负债',
      test: (c) => c.run && c.run.result.lifespan >= 80 && c.run.result.finalWealth >= 0,
    },
    {
      id: 'no_debt_retire', icon: '🧾', tier: 'silver',
      name: '干干净净退休', desc: '退休时没有负债',
      test: (c) => c.run && c.run.result.finalCareer === 'retired' && c.run.result.finalWealth >= 0,
    },
    {
      id: 'archivist', icon: '🗄️', tier: 'bronze',
      name: '档案馆主人', desc: '收藏 5 条人生',
      test: (c) => c.state && c.state.lives.length >= 5,
    },
    {
      id: 'dark_mode', icon: '🌙', tier: 'bronze',
      name: '沉浸体验', desc: '开启过沉浸模式',
      test: (c) => c.kind === 'immersive',
    },
  ];

  const TIER_META = {
    bronze: { label: '青铜', color: 'ghost' },
    silver: { label: '白银', color: 'know' },
    gold: { label: '黄金', color: 'gold' },
    myth: { label: '神话', color: 'fate' },
  };

  /** 评估一次事件，返回本次新解锁的成就列表 */
  function evaluate(ctx) {
    if (!LS.store) return [];
    const st = LS.store.state;
    const found = [];
    for (const a of ACHIEVEMENTS) {
      if (st.achievements[a.id]) continue;
      let ok = false;
      try { ok = !!a.test(ctx || {}); } catch (e) { ok = false; }
      if (ok) {
        LS.store.unlock(a.id);
        found.push(a);
      }
    }
    return found;
  }

  /** 评估并弹出提示 */
  function evaluateAndToast(ctx) {
    const list = evaluate(ctx);
    for (const a of list) {
      setTimeout(() => {
        LS.ui.toast(`${a.icon} 解锁成就：${a.name}`, 'fate', 4200);
      }, 260);
    }
    return list;
  }

  function all() { return ACHIEVEMENTS.slice(); }

  function progress() {
    const st = LS.store ? LS.store.state : { achievements: {} };
    const done = ACHIEVEMENTS.filter((a) => st.achievements[a.id]).length;
    return { done, total: ACHIEVEMENTS.length, percent: done / ACHIEVEMENTS.length };
  }

  function byTier() {
    const st = LS.store ? LS.store.state : { achievements: {} };
    const out = {};
    for (const a of ACHIEVEMENTS) {
      const t = a.tier || 'bronze';
      (out[t] = out[t] || []).push({ ...a, got: !!st.achievements[a.id], gotAt: st.achievements[a.id] });
    }
    return out;
  }

  LS.meta = { ACHIEVEMENTS, TIER_META, evaluate, evaluateAndToast, all, progress, byTier };
})(typeof globalThis !== 'undefined' ? globalThis : this);
