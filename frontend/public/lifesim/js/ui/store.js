/* ============================================================
 * LifeSim · ui/store.js
 * 全局状态 + 本地持久化（规格书 §32 人生档案、§49 实验配置）
 *
 * 只依赖 localStorage，不联网。数据结构带 schema 版本，
 * 导入旧版本时做一次迁移，避免以后改字段时用户数据全废。
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const KEY = 'lifesim.state.v1';
  const SCHEMA = 1;
  /** 最多保留多少张"人生卡"（避免 localStorage 爆掉） */
  const MAX_LIVES = 40;
  const MAX_EXPERIMENTS = 12;

  function emptyState() {
    return {
      schema: SCHEMA,
      savedAt: '',
      settings: {
        sound: false,
        reduceMotion: false,
        showScenes: true,      // 人生阶段场景插画（纯 SVG，可关闭）
        intervention: false,   // 决策干预：关键节点是否暂停
        lens: false,          // 概率透视默认关闭（规格书 §9.5 保持沉浸感）
        lensLevel: 2,         // 知识解释深度 1/2/3
        pathSamples: 300,
        autoExpand: false,
      },
      character: null,
      strategy: null,
      worldPreset: 'standard',
      worldOverrides: {},
      lives: [],              // 人生卡列表
      currentLifeId: null,
      experiments: [],        // 保存的蒙特卡洛配置
      achievements: {},
      codexSeen: {},
      stats: {
        totalRuns: 0,
        totalSimulated: 0,
        maxSample: 0,
        bestWealth: null,
        worstWealth: null,
        distributionsOpened: 0,
      },
    };
  }

  const state = emptyState();
  let saveTimer = null;

  function load() {
    try {
      const raw = global.localStorage.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;
      // 字段级合并，缺字段用默认值补齐（等价于一次轻量迁移）
      const base = emptyState();
      Object.assign(base.settings, data.settings || {});
      base.character = data.character || null;
      base.strategy = data.strategy || null;
      base.worldPreset = data.worldPreset || 'standard';
      base.worldOverrides = data.worldOverrides || {};
      base.lives = Array.isArray(data.lives) ? data.lives.slice(0, MAX_LIVES) : [];
      base.currentLifeId = data.currentLifeId || null;
      base.experiments = Array.isArray(data.experiments)
        ? data.experiments.slice(0, MAX_EXPERIMENTS) : [];
      base.achievements = data.achievements || {};
      base.codexSeen = data.codexSeen || {};
      Object.assign(base.stats, data.stats || {});
      Object.assign(state, base);
    } catch (e) {
      // 数据坏了就回到默认，不让程序起不来
      console.warn('[LifeSim] 读取本地进度失败，已重置：', e);
    }
  }

  function saveNow() {
    try {
      state.savedAt = new Date().toISOString();
      global.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[LifeSim] 保存失败（可能是隐私模式或空间不足）：', e);
    }
  }

  /** 节流保存：拖滑块时不会疯狂写 localStorage */
  function save() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveNow();
    }, 350);
  }

  function reset() {
    Object.assign(state, emptyState());
    saveNow();
  }

  /* ---------------- 人生档案 ---------------- */

  /**
   * 保存一张人生卡（规格书 §32）。
   * 只存摘要 + 关键状态，不存完整事件流，避免 localStorage 膨胀。
   */
  function saveLife(run) {
    const card = {
      id: run.id,
      savedAt: new Date().toISOString(),
      worldSeed: run.worldSeed,
      agentSeed: run.agentSeed,
      character: run.character,
      strategy: run.strategy,
      mode: run.mode,
      decisions: run.decisions || {},
      // 摘要
      result: {
        finalWealth: run.result.finalWealth,
        peakWealth: run.result.peakWealth,
        health: run.result.health,
        happiness: run.result.happiness,
        achievement: run.result.achievement,
        relationship: run.result.relationship,
        lifespan: run.result.lifespan,
        deathCause: run.result.deathCause || null,
        finalCareer: run.result.finalCareer,
        careerLabel: run.result.careerLabel,
        educationLabel: run.result.educationLabel,
        peakIncome: run.result.peakIncome,
        majorEvents: run.result.majorEvents,
      },
      worldLabel: run.worldSummary ? '' : '',
      // 压缩后的轨迹（保留每 2 年一个点即可画出曲线）
      states: compressStates(run.states),
      // 只保留重大事件
      events: (run.events || [])
        .filter((e) => e.major)
        .map((e) => ({
          id: e.id, title: e.title, icon: e.icon, age: e.age,
          category: e.category, probability: e.probability,
          narrative: (e.outcome && e.outcome.narrative) || e.narrative || '',
          distribution: e.distribution || null,
          factors: (e.factors || []).slice(0, 8),
          randomDraw: e.randomDraw,
          base: e.base,
        })),
    };
    state.lives.unshift(card);
    if (state.lives.length > MAX_LIVES) state.lives.length = MAX_LIVES;
    state.currentLifeId = card.id;
    state.stats.totalRuns++;
    if (state.stats.bestWealth == null || card.result.finalWealth > state.stats.bestWealth) {
      state.stats.bestWealth = card.result.finalWealth;
    }
    if (state.stats.worstWealth == null || card.result.finalWealth < state.stats.worstWealth) {
      state.stats.worstWealth = card.result.finalWealth;
    }
    saveNow();
    return card;
  }

  /** 轨迹压缩：每 step 年取一个点，首尾必留 */
  function compressStates(states, step = 2) {
    if (!states || !states.length) return [];
    const out = [];
    for (let i = 0; i < states.length; i += step) out.push(compactState(states[i]));
    const lastIdx = states.length - 1;
    if (out.length && out[out.length - 1].age !== states[lastIdx].age) {
      out.push(compactState(states[lastIdx]));
    }
    return out;
  }

  function compactState(s) {
    return {
      age: s.age,
      wealth: round2(s.wealth),
      health: round1(s.health),
      happiness: round1(s.happiness),
      relationship: round1(s.relationship),
      career: s.career,
      income: round2(s.income),
      economy: s.economy,
    };
  }

  const round2 = (v) => Math.round(v * 100) / 100;
  const round1 = (v) => Math.round(v * 10) / 10;

  function getLife(id) {
    return state.lives.find((l) => l.id === id) || null;
  }

  function currentLife() {
    return getLife(state.currentLifeId) || state.lives[0] || null;
  }

  function removeLife(id) {
    state.lives = state.lives.filter((l) => l.id !== id);
    if (state.currentLifeId === id) {
      state.currentLifeId = state.lives[0] ? state.lives[0].id : null;
    }
    saveNow();
  }

  function clearLives() {
    state.lives = [];
    state.currentLifeId = null;
    saveNow();
  }

  /* ---------------- 实验配置 ---------------- */

  function saveExperiment(cfg) {
    const item = {
      id: 'exp_' + Date.now().toString(36),
      savedAt: new Date().toISOString(),
      ...cfg,
    };
    state.experiments.unshift(item);
    if (state.experiments.length > MAX_EXPERIMENTS) state.experiments.length = MAX_EXPERIMENTS;
    saveNow();
    return item;
  }

  /* ---------------- 成就 ---------------- */

  function unlock(id) {
    if (state.achievements[id]) return false;
    state.achievements[id] = new Date().toISOString();
    saveNow();
    return true;
  }

  function seeCodex(id) {
    if (state.codexSeen[id]) return false;
    state.codexSeen[id] = true;
    save();
    return true;
  }

  /* ---------------- 统计埋点 ---------------- */

  function noteSimulation(sampleSize) {
    const n = Math.max(0, Math.floor(sampleSize || 0));
    state.stats.totalSimulated += n;
    state.stats.maxSample = Math.max(state.stats.maxSample || 0, n);
    save();
  }

  /** 导出 / 导入全部进度（规格书 §33 数据可带走） */
  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }

  function importJSON(text) {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') throw new Error('格式不正确');
    if (!('lives' in data) && !('settings' in data)) throw new Error('这不是 LifeSim 的进度文件');
    Object.assign(state, emptyState());
    Object.assign(state.settings, data.settings || {});
    state.character = data.character || null;
    state.strategy = data.strategy || null;
    state.worldPreset = data.worldPreset || 'standard';
    state.worldOverrides = data.worldOverrides || {};
    state.lives = (data.lives || []).slice(0, MAX_LIVES);
    state.currentLifeId = data.currentLifeId || null;
    state.experiments = (data.experiments || []).slice(0, MAX_EXPERIMENTS);
    state.achievements = data.achievements || {};
    state.codexSeen = data.codexSeen || {};
    Object.assign(state.stats, data.stats || {});
    saveNow();
  }

  LS.store = {
    state,
    load, save, saveNow, reset,
    saveLife, getLife, currentLife, removeLife, clearLives,
    saveExperiment, unlock, seeCodex, noteSimulation,
    exportJSON, importJSON,
    MAX_LIVES,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
