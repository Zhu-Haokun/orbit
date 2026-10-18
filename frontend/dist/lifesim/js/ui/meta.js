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
      id: 'millionaire', icon: '💎', tier: 'silver',
      name: '千万身家', desc: '有一条人生最终财富超过 1,000 万',
      test: (c) => (c.run && c.run.result.finalWealth >= 1000) ||
        (c.mc && c.mc.summary.wealth.max >= 1000),
    },
    {
      id: 'billionaire', icon: '👑', tier: 'gold',
      name: '亿级人生', desc: '观察到最终财富超过 1 亿的人生',
      test: (c) => (c.run && c.run.result.finalWealth >= 10000) ||
        (c.mc && c.mc.summary.wealth.max >= 10000),
    },
    {
      id: 'tail_reader', icon: '🔍', tier: 'bronze',
      name: '尾部阅读者', desc: '打开过最差 5% 人群的画像',
      test: (c) => c.kind === 'tail',
    },
    {
      id: 'startup_win', icon: '🚀', tier: 'gold',
      name: '赌赢了的那一次', desc: '有一条人生创业成功',
      test: (c) => c.run && c.run.events && c.run.events.some((e) => e.id === 'startup_success'),
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
      name: '对照实验者', desc: '完成第一次双策略对照',
      test: (c) => c.kind === 'compare' && c.compare && c.compare.arms,
    },
    {
      id: 'compare_three', icon: '🔬', tier: 'silver',
      name: '变量控制', desc: '完成 3 次策略对照',
      test: (c) => c.state && (c.state.stats.compareRuns || 0) >= 3,
    },
    {
      id: 'seed_locked', icon: '🔒', tier: 'gold',
      name: '锁定命运', desc: '在锁定随机种子的条件下对比两种选择',
      test: (c) => c.kind === 'compare' && c.compare && c.compare.lockWorldSeed,
    },
    {
      id: 'sensitivity', icon: '🎛️', tier: 'silver',
      name: '找到那个杠杆', desc: '运行过一次参数敏感性热力图',
      test: (c) => c.kind === 'sensitivity',
    },
    {
      id: 'bayes', icon: '🔄', tier: 'bronze',
      name: '修正信念的人', desc: '在贝叶斯实验室完成一次先验更新',
      test: (c) => c.kind === 'bayes',
    },
    {
      id: 'markov_walk', icon: '⛓️', tier: 'bronze',
      name: '走一遍马尔可夫链', desc: '在马尔可夫实验室观察到平稳分布',
      test: (c) => c.kind === 'markov',
    },
    {
      id: 'converge', icon: '📉', tier: 'silver',
      name: '亲眼看见收敛', desc: '完整看过大数定律收敛过程',
      test: (c) => c.kind === 'law',
    },
    /* ---------- 收藏 ---------- */
    {
      id: 'codex_10', icon: '📖', tier: 'bronze',
      name: '好奇的读者', desc: '解锁 10 个概率概念',
      test: (c) => c.state && Object.keys(c.state.codexSeen).length >= 10,
    },
    {
      id: 'codex_all', icon: '🏛', tier: 'gold',
      name: '概率图鉴收藏家', desc: '解锁全部概率概念',
      test: (c) => c.state && Object.keys(c.state.codexSeen).length >= LS.knowledge.list().length,
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
    {
      id: 'dist_all', icon: '🧮', tier: 'silver',
      name: '分布百科通读', desc: '查看过全部 9 种概率分布',
      test: (c) => c.state && (c.state.stats.distributionsOpened || 0) >= 9,
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
