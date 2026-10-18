/* ============================================================
 * LifeSim · ui/audio.js
 * 极简音效（WebAudio 合成，无音频文件 —— 保证零依赖离线可用）
 *
 * 默认关闭（规格书 §51.4：不要突然发出声音）。
 * 音色刻意做得很轻：短促、低音量、带淡出，避免游戏化噪音。
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});

  let ctx = null;
  let master = null;
  let enabled = false;
  let broken = false;

  function ensure() {
    if (broken) return null;
    if (ctx) return ctx;
    try {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) { broken = true; return null; }
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.16;
      master.connect(ctx.destination);
      return ctx;
    } catch (e) {
      broken = true;
      return null;
    }
  }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled) {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
    }
  }

  function isEnabled() { return enabled; }

  /**
   * 播放一个音符
   * @param {number} freq 频率
   * @param {number} dur 时长（秒）
   * @param {string} type 波形
   * @param {number} vol 音量倍数
   * @param {number} delay 延迟（秒）
   */
  function tone(freq, dur, type, vol, delay) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime((vol || 1) * 0.9, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.12));
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + (dur || 0.12) + 0.02);
  }

  const SFX = {
    /** 年份推进 */
    tick() { tone(1180, 0.035, 'sine', 0.18); },
    /** 随机事件出现 */
    event() { tone(660, 0.09, 'triangle', 0.5); tone(990, 0.14, 'sine', 0.32, 0.05); },
    /** 重大事件 */
    major() {
      [523.25, 659.25, 783.99].forEach((f, i) => tone(f, 0.34, 'sine', 0.5, i * 0.07));
    },
    /** 负面事件 */
    bad() { tone(196, 0.28, 'sawtooth', 0.34); tone(146, 0.4, 'sine', 0.3, 0.06); },
    /** 好事 */
    good() { tone(784, 0.16, 'sine', 0.4); tone(1174, 0.24, 'sine', 0.3, 0.08); },
    /** 出生 */
    birth() { tone(392, 0.5, 'sine', 0.42); tone(587, 0.7, 'sine', 0.3, 0.14); },
    /** 死亡 */
    death() { tone(220, 0.7, 'sine', 0.42); tone(164, 1.0, 'sine', 0.3, 0.2); },
    /** 破产 */
    bankruptcy() { tone(140, 0.5, 'square', 0.28); tone(110, 0.8, 'sawtooth', 0.22, 0.12); },
    /** 按钮 */
    click() { tone(880, 0.03, 'sine', 0.14); },
    /** 决策选择 */
    choose() { tone(587, 0.08, 'triangle', 0.35); tone(880, 0.12, 'sine', 0.25, 0.05); },
    /** 成就解锁 */
    unlock() {
      [659.25, 830.61, 987.77, 1318.51].forEach((f, i) => tone(f, 0.42, 'sine', 0.42, i * 0.09));
    },
    /** 模拟完成 */
    done() { tone(523, 0.2, 'sine', 0.4); tone(784, 0.34, 'sine', 0.34, 0.1); },
    /** 错误 / 无效操作 */
    nope() { tone(233, 0.12, 'square', 0.2); },
  };

  function play(name) {
    if (!enabled) return;
    const fn = SFX[name];
    if (fn) { try { fn(); } catch (e) { /* 静默失败，音效不该影响功能 */ } }
  }

  /** 从设置同步 */
  function syncFromSettings() {
    if (LS.store && LS.store.state && LS.store.state.settings) {
      setEnabled(!!LS.store.state.settings.sound);
    }
  }

  LS.audio = { SFX, play, setEnabled, isEnabled, syncFromSettings, get available() { return !broken; } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
