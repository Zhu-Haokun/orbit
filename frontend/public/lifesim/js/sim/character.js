/* ============================================================
 * LifeSim · sim/character.js
 * 角色生成与策略对象（规格书 §8.2 / §33.1、§33.2）
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const { clamp, clamp01, weightedPick, uid } = LS.util;
  const C = LS.config;

  /* ------------------------------------------------------------
   * 策略
   * ---------------------------------------------------------- */

  const STRATEGY_KEYS = C.STRATEGY_DIMS.map((d) => d.key);

  function defaultStrategy() {
    return { ...C.STRATEGY_PRESETS.balanced.values };
  }

  function makeStrategy(values = {}) {
    const s = defaultStrategy();
    for (const k of STRATEGY_KEYS) {
      if (values[k] != null) s[k] = clamp01(Number(values[k]));
    }
    return s;
  }

  /** 从预设构造策略，可再覆盖若干维度 */
  function strategyFromPreset(key, overrides = {}) {
    const p = C.STRATEGY_PRESETS[key] || C.STRATEGY_PRESETS.balanced;
    return makeStrategy({ ...p.values, ...overrides });
  }

  /** 策略的可读描述，例如「高创业 / 高教育 / 中投资」 */
  function describeStrategy(s) {
    const tag = (v) => (v >= 0.66 ? '高' : v >= 0.34 ? '中' : '低');
    return `${tag(s.careerRisk)}创业 / ${tag(s.educationPreference)}教育 / ${tag(s.investmentRisk)}投资`;
  }

  /** 由策略推导出「风险画像」文字（规格书 §8.1 右侧即时预览） */
  function riskProfile(s) {
    const risk = clamp01(
      0.42 * s.careerRisk + 0.34 * s.investmentRisk + 0.14 * (1 - s.educationPreference) +
      0.10 * (1 - s.healthPriority)
    );
    let label;
    let tone;
    if (risk < 0.30) { label = '低'; tone = 'ok'; }
    else if (risk < 0.58) { label = '中'; tone = 'know'; }
    else if (risk < 0.80) { label = '高'; tone = 'warn'; }
    else { label = '很高'; tone = 'bad'; }
    return { score: risk, label, tone };
  }

  /**
   * 投资档位插值：investmentRisk ∈ [0,1] -> {mu, sigma}
   * 用分段线性，任意滑块位置都有连续可解释的结果。
   */
  function investParams(risk, marketVolatility = 1) {
    const { lowRisk, midRisk, highRisk, blendPoints } = C.INVEST;
    const r = clamp01(risk);
    const [p0, p1, p2] = blendPoints;
    let mu;
    let sigma;
    if (r <= p1) {
      const t = (r - p0) / (p1 - p0 || 1);
      mu = lowRisk.mu + (midRisk.mu - lowRisk.mu) * t;
      sigma = lowRisk.sigma + (midRisk.sigma - lowRisk.sigma) * t;
    } else {
      const t = (r - p1) / (p2 - p1 || 1);
      mu = midRisk.mu + (highRisk.mu - midRisk.mu) * t;
      sigma = midRisk.sigma + (highRisk.sigma - midRisk.sigma) * t;
    }
    return { mu, sigma: sigma * marketVolatility };
  }

  /* ------------------------------------------------------------
   * 角色
   * ---------------------------------------------------------- */

  function pickTraits(rng, count = 2) {
    const pool = rng.shuffle(C.TRAITS);
    return pool.slice(0, count);
  }

  /** 由（可能为空的）覆盖项生成一个角色 */
  function makeCharacter(rng, overrides = {}) {
    const familyKey = overrides.familyResource
      || rng.weighted(C.FAMILY.map((f) => f.key), C.FAMILY.map((f) => f.weight));
    const family = C.FAMILY.find((f) => f.key === familyKey) || C.FAMILY[1];

    const ability = overrides.ability != null
      ? clamp(overrides.ability, 5, 100)
      : clamp(52 + rng.normal01() * 14 + family.abilityBias, 5, 100);

    const health = overrides.health != null
      ? clamp(overrides.health, 20, 100)
      : clamp(80 + rng.normal01() * 8 - 2, 20, 100);

    const wealth = overrides.initialWealth != null
      ? Math.max(0, overrides.initialWealth)
      : Math.max(0.1, rng.uniform(family.wealth[0], family.wealth[1]));

    const traits = overrides.traits
      ? C.TRAITS.filter((t) => overrides.traits.includes(t.key))
      : pickTraits(rng, 2);

    const age = overrides.age != null ? overrides.age : 18;

    return {
      id: overrides.id || uid('char'),
      age,
      ability: Math.round(ability),
      health: Math.round(health),
      initialWealth: +wealth.toFixed(2),
      familyResource: family.key,
      familyLabel: family.label,
      traits: traits.map((t) => t.key),
      traitLabels: traits.map((t) => t.label),
      /** 教育等级 0..1，初始由家庭资源与随机决定（后续受策略影响） */
      educationSeed: clamp01(0.42 + family.eduBias + rng.normal01() * 0.12),
    };
  }

  /** 汇总角色的"效果"修正，供决策与事件使用 */
  function traitEffects(character) {
    const eff = { learn: 0, risk: 0, capital: 0, social: 0, luck: 0, recover: 0, ambition: 0 };
    for (const key of character.traits || []) {
      const t = C.TRAITS.find((x) => x.key === key);
      if (!t) continue;
      for (const k of Object.keys(t.effect)) eff[k] += t.effect[k];
    }
    return eff;
  }

  /** 生成一句人物简介（规格书 §8.2） */
  function describeCharacter(ch) {
    const fam = { poor: '一个资源有限的家庭', normal: '一个普通家庭', rich: '一个条件不错的家庭' }[ch.familyResource]
      || '一个普通家庭';
    const ability = ch.ability >= 72 ? '学习能力很强'
      : ch.ability >= 56 ? '学习能力不错'
        : ch.ability >= 42 ? '资质中等' : '起步时并不占优势';
    const risk = ch.traits.includes('adventurous') ? '天生风险偏好较高'
      : ch.traits.includes('steady') ? '做事偏保守'
        : '对风险的态度比较中性';
    const trait = ch.traitLabels && ch.traitLabels.length
      ? `，个性${ch.traitLabels.join('、')}` : '';
    return `你来自${fam}，${ability}，${risk}${trait}。`;
  }

  LS.character = {
    STRATEGY_KEYS, defaultStrategy, makeStrategy, strategyFromPreset,
    describeStrategy, riskProfile, investParams,
    makeCharacter, traitEffects, describeCharacter, pickTraits,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
