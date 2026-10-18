/* ============================================================
 * LifeSim · sim/config.js
 * 模型参数集中配置（规格书 §61「模型参数集中配置」）
 *
 * 原则：
 *   1. 所有会被"讲故事"的数字都放在这里，代码里不出现魔法数；
 *   2. 每个参数都写清楚单位和现实含义；
 *   3. 世界难度通过 world 段的乘数调整，不改公式。
 *
 * 金额单位统一为 **万元**，收入为 **万元/年**。
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});

  /* ------------------------------------------------------------
   * 经济状态（规格书 §43.1 的转移矩阵）
   * ---------------------------------------------------------- */
  const ECONOMY_STATES = ['繁荣', '正常', '衰退', '危机'];

  const ECONOMY_P = [
    [0.60, 0.30, 0.08, 0.02],
    [0.15, 0.65, 0.17, 0.03],
    [0.05, 0.35, 0.50, 0.10],
    [0.03, 0.22, 0.40, 0.35],
  ];

  /** 各经济状态如何改动各个概率与收益参数（共同因子，规格书 §43.3） */
  const ECONOMY_EFFECT = {
    繁荣: {
      jobFind: 1.30, salary: 1.12, startup: 1.35, order: 1.35,
      investMu: 0.060, investSigma: 0.85, stress: 0.85,
      tone: '#3ddc97', desc: '机会多、工资涨得快，但资产也可能过热',
    },
    正常: {
      jobFind: 1.00, salary: 1.00, startup: 1.00, order: 1.00,
      investMu: 0.020, investSigma: 1.00, stress: 1.00,
      tone: '#5aa9ff', desc: '一切按长期均值运转',
    },
    衰退: {
      jobFind: 0.62, salary: 0.90, startup: 0.68, order: 0.70,
      investMu: -0.062, investSigma: 1.45, stress: 1.25,
      tone: '#ffa94d', desc: '找工作变难，投资容易亏，创业成功率下降',
    },
    危机: {
      jobFind: 0.32, salary: 0.82, startup: 0.42, order: 0.40,
      investMu: -0.165, investSigma: 2.05, stress: 1.55,
      tone: '#ff5c7a', desc: '失业风险骤增，资产大幅回撤',
    },
  };

  /* ------------------------------------------------------------
   * 基准投资参数（长期年化，按“今天的钱”计的实际收益）
   *
   * 标定依据：中国一年期存款/货币基金长期实际收益约 0~1%，
   * 稳健的股债混合约 2.5%~3.5%，长期权益约 5%~6%（扣费后）。
   * 旧值（8.5% 高风险、4.8% 稳健）会让复利在 40 年里把普通人推到
   * 千万级，明显高于居民财富调查的中位数。
   * ---------------------------------------------------------- */
  const INVEST = {
    /** 现金 / 债券：低收益低波动 */
    lowRisk: { mu: 0.012, sigma: 0.010 },
    /** 稳健配置：股债混合 */
    midRisk: { mu: 0.030, sigma: 0.080 },
    /** 高风险资产：权益 / 创业股权 */
    highRisk: { mu: 0.055, sigma: 0.300 },
    /**
     * investmentRisk ∈ [0,1] 在这三档之间插值：
     *   0 -> lowRisk，0.5 -> midRisk，1 -> highRisk
     * 用分段线性，保证滑块连续可调（规格书 §8.3）
     */
    blendPoints: [0, 0.5, 1],
    /** 投资收益率下限（单年最多亏 85%，避免出现荒谬数值） */
    floor: -0.85,
    ceiling: 2.5,
  };

  /* ------------------------------------------------------------
   * 税与社保（简化）
   *
   * 不追求逐项复刻个税/五险一金，只按“年收入 → 有效负担率”给一条
   * 单调递增的曲线。数量级参考：
   *   - 个税起征点 6 万/年，综合所得 3%~45% 超额累进；
   *   - 个人社保 + 公积金约占工资 10%~20%；
   * 低收入段几乎不交，中高收入段合计约 10%~25%。
   * ---------------------------------------------------------- */
  const TAX = {
    brackets: [
      { upTo: 6, rate: 0.02 },
      { upTo: 12, rate: 0.08 },
      { upTo: 24, rate: 0.12 },
      { upTo: 48, rate: 0.17 },
      { upTo: 96, rate: 0.23 },
      { upTo: Infinity, rate: 0.28 },
    ],
  };

  /* ------------------------------------------------------------
   * 职业系统（规格书 §45）
   * ---------------------------------------------------------- */
  const CAREERS = ['student', 'junior', 'senior', 'manager',
                   'unemployed', 'freelance', 'entrepreneur', 'retired'];

  const CAREER_LABEL = {
    student: '学生', junior: '职员', senior: '资深职员', manager: '管理者',
    unemployed: '失业中', freelance: '自由职业', entrepreneur: '创业者',
    retired: '退休',
  };

  const CAREER_ICON = {
    student: '🎓', junior: '💼', senior: '📊', manager: '🧑‍💼',
    unemployed: '🔍', freelance: '🧰', entrepreneur: '🚀',
    retired: '🏖',
  };

  /**
   * 年收入（万元）用对数正态：中位数 median，对数标准差 sigma。
   *
   * 标定依据（2023 年）：
   *   - 全国居民人均可支配收入 3.92 万，中位数 3.30 万；
   *   - 城镇居民人均可支配收入 5.18 万，中位数 4.71 万；
   *   - 城镇非私营单位年平均工资约 12 万，私营单位约 6.8 万。
   * 模型里的是“个人税前工资”，比人均可支配收入高一些；
   * 下面的中位数对应城镇就业者的大致分布，不再用旧版的 22/48 万。
   */
  const INCOME = {
    student:       { median: 0.6, sigma: 0.55 },
    junior:        { median: 6.5, sigma: 0.30 },
    senior:        { median: 13.0, sigma: 0.34 },
    manager:       { median: 26.0, sigma: 0.38 },
    unemployed:    { median: 1.5, sigma: 0.45 },
    freelance:     { median: 8.0, sigma: 0.62 },
    entrepreneur:  { median: 5.0, sigma: 0.95 }, // 创业期收入波动极大
    retired:       { median: 3.8, sigma: 0.22 },
  };

  /** 各职业的年度"职业资本"增长（能力→晋升的燃料） */
  const CAREER_CAPITAL_GAIN = {
    student: 2.6, junior: 1.5, senior: 1.2, manager: 0.9,
    unemployed: -0.7, freelance: 1.3, entrepreneur: 2.2, retired: -0.6,
  };

  /* ------------------------------------------------------------
   * 教育系统（规格书 §44：教育改变"分布参数"，不是简单加成）
   * ---------------------------------------------------------- */
  const EDUCATION = {
    /** 教育等级 0..1（由 educationPreference 与家庭资源共同决定） */
    levels: [
      { min: 0.00, label: '高中/中专', incomeMult: 0.72, jobFind: 0.85, capGain: 0.9 },
      { min: 0.30, label: '大专',      incomeMult: 0.88, jobFind: 0.95, capGain: 1.0 },
      { min: 0.50, label: '本科',      incomeMult: 1.00, jobFind: 1.00, capGain: 1.1 },
      { min: 0.72, label: '硕士',      incomeMult: 1.32, jobFind: 1.12, capGain: 1.25 },
      { min: 0.90, label: '博士',      incomeMult: 1.55, jobFind: 1.05, capGain: 1.4 },
    ],
    /** 深造的代价：延迟进入劳动力市场 + 学费 */
    tuitionPerYear: 2.4,      // 万元/年
    yearsByLevel: [0, 2, 4, 6, 8],
    /** 教育投入对"高技能职业可达性"的增益 */
    highSkillAccess: 0.55,
  };

  /* ------------------------------------------------------------
   * 消费与生活成本（规格书 §46）
   * ---------------------------------------------------------- */
  const EXPENSE = {
    /** 基准生活成本随年龄变化（万元/年） */
    baseByAge: [
      { age: 18, v: 2.2 }, { age: 25, v: 3.6 }, { age: 32, v: 5.2 },
      { age: 40, v: 7.4 }, { age: 50, v: 8.6 }, { age: 60, v: 7.0 },
      { age: 75, v: 6.2 }, { age: 110, v: 6.0 },
    ],
    /** 消费倾向 0..1 -> 乘数 [0.62, 1.85] */
    prefMult: [0.62, 1.85],
    /** 负债上限（万元）：防止财富无限负增长（规格书 §46） */
    debtFloor: -60,
    /** 破产重组：财富低于该值时触发一次债务重置 */
    bankruptcyThreshold: -45,
    /** 破产后重置到的水平 */
    bankruptcyReset: 0.5,
    /** 两次债务重组之间的最短间隔（年），避免反复触发变成"每两年归零" */
    bankruptcyCooldown: 8,
    /** 有房后生活成本略降（房租转按揭） */
    housingRelief: 0.94,
  };

  /* ------------------------------------------------------------
   * 健康系统（规格书 §47.2）
   * ---------------------------------------------------------- */
  const HEALTH = {
    initRange: [58, 95],
    /**
     * 健康衰减标定（实测校正）：
     *   自然衰减 + 随机冲击约占一生 10 点，事件另占约 8~12 点，
     *   于是"一生平均健康"落在 60 上下，健康投入（0→1）能拉开约 12 点差距。
     * 之前参数过陡，导致 65 岁健康只剩 20 多，健康维度彻底失去区分度。
     */
    declineBase: 0.060,
    declinePerYear: 0.0035,
    /** 健康投入能抵消的比例上限 */
    priorityRelief: 0.62,
    /** 高压力职业的额外衰减 */
    stressPenalty: 0.55,
    /**
     * 年度随机冲击。健康的标准差主要由它和"健康事件"贡献：
     * 参数取太小会让健康几乎没有区分度（sd<5），太大又会把曲线打到 0。
     */
    shockProb: 0.030,
    shockSize: [3, 12],
    /** 健康下限 */
    minHealth: 0,
  };

  /* ------------------------------------------------------------
   * 关系与幸福（规格书 §47.1 / §47.3）
   * ---------------------------------------------------------- */
  const RELATIONSHIP = {
    initRange: [35, 72],
    socialGain: 3.4,        // 社交投入拉满时的年增长
    socialLoss: -1.5,       // 完全不社交时的年衰减
    workPressurePenalty: 0.9,
    decay: 0.55,
    range: [0, 100],
  };

  /** 幸福 = 各分项的加权和（权重和为 1），再叠加随机扰动 */
  const HAPPINESS = {
    weights: {
      wealthSecurity: 0.30,
      health: 0.22,
      relationship: 0.20,
      careerFit: 0.16,
      lowStress: 0.12,
    },
    /** 财富安全感的目标水位（万元）：达到该值该项接近满分 */
    wealthTarget: 1200,
    /** 幸福值的年际惯性（0=完全重算，1=完全不变） */
    inertia: 0.30,
    noise: 4.5,
    range: [0, 100],
  };

  /* ------------------------------------------------------------
   * 寿命（Gompertz 型风险，规格书 §8.6「最大寿命范围」）
   * ---------------------------------------------------------- */
  const LIFESPAN = {
    minAge: 18,
    baseline: 81,          // 基准寿命中位数（标定后约 81）
    gompertzB: 0.0885,     // 年龄风险增长速率
    /** 健康对寿命的影响权重（越大，健康越好越长寿的效应越明显） */
    healthWeight: 0.90,
    /**
     * Gompertz 基准风险。标定目标来自联合国《世界人口展望 2024》
     * 中国 2023 年生命表（转引自财新何亚福文章）：
     *   e0 = 77.95 岁；l(90) = 16,213/100,000（16.2%）；
     *   l(100) = 427/100,000（0.43%）。
     * 据此扫描后取 baselineHazard=0.00050、b=0.0885：
     * 中位寿命约 80，均值约 78.4，90 岁以上约 16%，100 岁以上约 0.4%
     * （加入 2026-10 的买房/父母生病/离婚/意外等事件后复核）。
     */
    baselineHazard: 0.00050,
    absoluteMax: 105,
  };

  /* ------------------------------------------------------------
   * 决策模型（规格书 §24.2：策略 60% / 状态 30% / 随机 10%）
   * ---------------------------------------------------------- */
  const DECISION = {
    strategyWeight: 0.60,
    stateWeight: 0.30,
    noiseWeight: 0.10,
    /** 决策概率的上下限，避免出现 0 或 1 导致"滑块没用/一定发生" */
    pFloor: 0.03,
    pCeiling: 0.97,
  };

  /* ------------------------------------------------------------
   * 事件系统（规格书 §23）
   * ---------------------------------------------------------- */
  const EVENT = {
    /** 普通模式下每年最多触发的重大事件数 */
    maxMajorPerYear: 1,
    /** 事件密度乘数（世界设置里可调） */
    density: 1.0,
    /**
     * 事件发生概率的上下限。
     * 注意：这**不能**沿用决策概率的 0.03 下限 —— 否则每个"稀有事件"
     * 都会被抬到 3%/年，在 35 年窗口里变成 65% 的人生都会遇到，
     * 稀有性彻底失效。这里留出足够低的下限让 rare 类事件真正稀有。
     */
    probFloor: 0.00005,
    probCeiling: 0.985,
    /** 稀有事件的额外上限，防止稀有事件被修正项推高（规格书 §23.1E） */
    rareCap: 0.02,
  };

  /* ------------------------------------------------------------
   * 表演节奏（规格书 §24.3）
   * ---------------------------------------------------------- */
  const PLAYBACK = {
    normalYear: 110,      // ms
    minorEvent: 300,
    majorEvent: 1100,
    speedPresets: { fast: 0.4, standard: 1.0, slow: 2.2 },
  };

  /* ------------------------------------------------------------
   * 世界预设（规格书 §8.6）
   * ---------------------------------------------------------- */
  const WORLD_PRESETS = {
    standard: {
      label: '标准世界', desc: '与现实大致相当的波动水平',
      economicVolatility: 1.0, laborStability: 1.0, marketVolatility: 1.0,
      healthRisk: 1.0, eventDensity: 1.0,
    },
    peaceful: {
      label: '温和世界', desc: '经济平稳、失业少，适合先熟悉玩法',
      economicVolatility: 0.55, laborStability: 1.45, marketVolatility: 0.6,
      healthRisk: 0.75, eventDensity: 0.85,
    },
    turbulent: {
      label: '动荡世界', desc: '衰退与危机频发，尾部风险显著',
      economicVolatility: 1.7, laborStability: 0.7, marketVolatility: 1.6,
      healthRisk: 1.25, eventDensity: 1.3,
    },
    golden: {
      label: '黄金时代', desc: '长期繁荣，机会远多于风险',
      economicVolatility: 0.7, laborStability: 1.6, marketVolatility: 0.8,
      healthRisk: 0.7, eventDensity: 1.15,
    },
  };

  /** 把一个预设转成实际可用的世界参数对象 */
  function makeWorldConfig(presetKey = 'standard', overrides = {}) {
    const base = WORLD_PRESETS[presetKey] || WORLD_PRESETS.standard;
    return {
      preset: presetKey,
      label: base.label,
      economicVolatility: base.economicVolatility,
      laborStability: base.laborStability,
      marketVolatility: base.marketVolatility,
      healthRisk: base.healthRisk,
      eventDensity: base.eventDensity,
      maxAge: LIFESPAN.absoluteMax,
      ...overrides,
    };
  }

  /* ------------------------------------------------------------
   * 策略维度定义（规格书 §8.3 的 6 个滑块）
   * ---------------------------------------------------------- */
  const STRATEGY_DIMS = [
    {
      key: 'careerRisk', label: '职业风险', icon: '💼',
      left: '稳定就业', right: '创业冒险',
      hint: '越靠右，越容易放弃稳定工作去创业、跳槽或做自由职业',
    },
    {
      key: 'educationPreference', label: '教育投入', icon: '🎓',
      left: '尽早工作', right: '长期深造',
      hint: '越靠右，越可能读到更高学历：前期少赚、后期收入分布整体右移',
    },
    {
      key: 'consumptionPreference', label: '消费倾向', icon: '🛍',
      left: '储蓄', right: '即时消费',
      hint: '越靠右，生活成本乘数越高，可用于投资的本金越少',
    },
    {
      key: 'investmentRisk', label: '投资风险', icon: '📈',
      left: '现金债券', right: '高风险资产',
      hint: '越靠右，投资期望收益更高，但结果分布明显变宽（方差陷阱）',
    },
    {
      key: 'healthPriority', label: '健康投入', icon: '❤️',
      left: '忽视', right: '高度重视',
      hint: '越靠右，健康衰减越慢、寿命更长，但会占用一部分收入',
    },
    {
      key: 'socialPreference', label: '社交投入', icon: '👥',
      left: '独立', right: '高社交',
      hint: '越靠右，关系值更高，能提升幸福并带来更多机会事件',
    },
  ];

  const STRATEGY_PRESETS = {
    balanced: {
      label: '均衡型', icon: '⚖️',
      desc: '各项都在中间，波动与收益都接近平均',
      values: { careerRisk: 0.5, educationPreference: 0.5, consumptionPreference: 0.5,
                investmentRisk: 0.5, healthPriority: 0.5, socialPreference: 0.5 },
    },
    steady: {
      label: '稳健保守', icon: '🛡',
      desc: '稳定工作 + 低风险投资，分布窄、下限高',
      values: { careerRisk: 0.15, educationPreference: 0.55, consumptionPreference: 0.35,
                investmentRisk: 0.12, healthPriority: 0.7, socialPreference: 0.55 },
    },
    aggressive: {
      label: '激进创业', icon: '🚀',
      desc: '高创业 + 高风险投资，均值高但左尾危险',
      values: { careerRisk: 0.9, educationPreference: 0.45, consumptionPreference: 0.6,
                investmentRisk: 0.92, healthPriority: 0.35, socialPreference: 0.65 },
    },
    scholar: {
      label: '学霸路线', icon: '📚',
      desc: '长期深造 + 健康优先，起步慢但后段更稳',
      values: { careerRisk: 0.28, educationPreference: 0.95, consumptionPreference: 0.34,
                investmentRisk: 0.38, healthPriority: 0.72, socialPreference: 0.42 },
    },
    hedonist: {
      label: '体验优先', icon: '🌴',
      desc: '高消费 + 高社交，幸福高但财富积累慢',
      values: { careerRisk: 0.45, educationPreference: 0.4, consumptionPreference: 0.88,
                investmentRisk: 0.45, healthPriority: 0.55, socialPreference: 0.88 },
    },
  };

  /* ------------------------------------------------------------
   * 家庭资源（规格书 §8.2）
   * ---------------------------------------------------------- */
  const FAMILY = [
    { key: 'poor', label: '困难', weight: 0.28, wealth: [0.2, 3.5], abilityBias: -4, eduBias: -0.10 },
    { key: 'normal', label: '普通', weight: 0.52, wealth: [2.5, 10], abilityBias: 0, eduBias: 0 },
    { key: 'rich', label: '优渥', weight: 0.20, wealth: [12, 65], abilityBias: 5, eduBias: 0.12 },
  ];

  /** 个性标签（规格书 §8.2「个性标签 1～2 个」） */
  const TRAITS = [
    { key: 'curious', label: '好奇', desc: '学习与转行相关的机会更容易出现', effect: { learn: 0.10 } },
    { key: 'adventurous', label: '冒险', desc: '更倾向于冒险决策', effect: { risk: 0.09 } },
    { key: 'steady', label: '沉稳', desc: '决策更保守，波动更小', effect: { risk: -0.08 } },
    { key: 'diligent', label: '勤奋', desc: '职业资本积累更快', effect: { capital: 0.18 } },
    { key: 'social', label: '善交际', desc: '关系值与机会事件更多', effect: { social: 0.12 } },
    { key: 'lucky', label: '好运体质', desc: '随机事件整体偏向有利', effect: { luck: 0.06 } },
    { key: 'resilient', label: '抗压', desc: '健康与幸福的衰减更慢', effect: { recover: 0.14 } },
    { key: 'ambitious', label: '野心', desc: '晋升更快，但压力更大', effect: { ambition: 0.16 } },
  ];

  LS.config = {
    ECONOMY_STATES, ECONOMY_P, ECONOMY_EFFECT,
    INVEST, TAX, CAREERS, CAREER_LABEL, CAREER_ICON, INCOME, CAREER_CAPITAL_GAIN,
    EDUCATION, EXPENSE, HEALTH, RELATIONSHIP, HAPPINESS, LIFESPAN,
    DECISION, EVENT, PLAYBACK, WORLD_PRESETS, makeWorldConfig,
    STRATEGY_DIMS, STRATEGY_PRESETS, FAMILY, TRAITS,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
