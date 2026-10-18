/* ============================================================
 * LifeSim · sim/events.js
 * 事件系统（规格书 §23、§42、§23.2、§23.4）
 *
 * 每个事件包含：
 *   cond(ctx)        —— 是否可能出现
 *   base(ctx)        —— 基础概率
 *   modifiers(ctx)   —— 各项修正 [{label, delta, kind}]
 *   resolve(ctx,rng) —— 发生后的后果（含分布与叙事）
 *
 * 概率模型采用「加权修正」而不是 Logistic：
 *     p = clamp(base + Σ delta, floor, ceiling)
 * 原因是 UI 要把每一项贡献拆开给学生看（规格书 §23.2 的两种写法里，
 * 加权修正的那一种"更容易解释"）。这样界面上「各项之和 = 最终概率」
 * 永远对得上，不会出现"看起来加不起来"的困惑。
 *
 * 但事件**后果**仍然来自具体分布（§23.4）：成功也有不同程度。
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const C = LS.config;
  const D = LS.distributions;
  const { clamp, clamp01, norm01, sigmoid, fixed } = LS.util;

  /** 决策概率的上下限（滑块要"有感觉"，所以不能太贴近 0/1） */
  const P_FLOOR = C.DECISION.pFloor;
  const P_CEIL = C.DECISION.pCeiling;
  /** 事件发生概率的上下限（要让稀有事件真的稀有） */
  const EV_FLOOR = C.EVENT.probFloor;
  const EV_CEIL = C.EVENT.probCeiling;

  /** 对数正态抽样：给定期望中位数与对数标准差 */
  function lognorm(rng, median, sigma) {
    return Math.exp(Math.log(Math.max(median, 1e-6)) + sigma * rng.normal01());
  }

  /* ============================================================
   * 事件定义
   * ========================================================== */

  const EVENTS = [
    /* ---------------- A. 生命周期事件 ---------------- */
    {
      id: 'first_job',
      category: 'lifecycle',
      title: '第一次正式求职',
      icon: '💼',
      major: true,
      minAge: 20, maxAge: 30,
      cond: (c) => !c.flags.gotFirstJob && c.career === 'student',
      base: () => 0.55,
      modifiers: (c) => [
        { label: '学历', delta: 0.16 * c.education, kind: 'edu' },
        { label: '能力', delta: 0.14 * norm01(c.ability, 40, 95), kind: 'ability' },
        { label: '劳动力市场', delta: 0.20 * (c.world.jobFindMult - 1), kind: 'world' },
        { label: '年龄', delta: c.age <= 23 ? 0.06 : -0.03, kind: 'age' },
      ],
      resolve(c, rng) {
        // 面试成功率 -> 需要几轮面试（几何分布，规格书 §42.1）
        const pInterview = clamp(
          0.18 + 0.16 * c.education + 0.14 * norm01(c.ability, 40, 95) +
          0.12 * (c.world.jobFindMult - 1) + 0.04 * c.traitEff.luck, 0.06, 0.72);
        const rounds = D.geometric.sample(rng, { p: pInterview });
        const quality = clamp01(norm01(c.ability, 35, 95) * 0.6 + c.education * 0.4);
        const salary = lognorm(rng, C.INCOME.junior.median *
          (0.78 + 0.5 * quality) * c.world.salaryMult * c.educationIncomeMult, 0.26);
        return {
          flags: { gotFirstJob: true },
          career: 'junior',
          incomeBase: salary,
          narrative: `你投了 ${rounds} 次简历才拿到 Offer，起薪约 ${fixed(salary, 1)} 万/年。`,
          distribution: {
            name: `Geometric(p=${fixed(pInterview, 2)})`,
            latex: 'P(X=k)=(1-p)^{k-1}p',
            meaning: `单次面试成功概率 ${fixed(pInterview * 100, 1)}%，平均需要 ${fixed(1 / pInterview, 1)} 次面试`,
          },
          detail: [
            { label: '单次面试成功概率', value: fixed(pInterview * 100, 1) + '%' },
            { label: '实际面试次数', value: String(rounds) },
            { label: '起薪', value: fixed(salary, 1) + ' 万/年' },
          ],
          chip: `接受 Offer · P=${fixed(pInterview, 2)}`,
        };
      },
    },
    {
      id: 'graduation',
      category: 'lifecycle',
      title: '完成学业',
      icon: '🎓',
      major: true,
      minAge: 21, maxAge: 32,
      cond: (c) => !c.flags.graduated && c.education >= 0.5 && c.career === 'student',
      base: () => 0.8,
      modifiers: (c) => [
        { label: '学业进度', delta: 0.2 * c.education, kind: 'edu' },
      ],
      resolve(c) {
        return {
          flags: { graduated: true },
          narrative: `你以${c.educationLabel}学历毕业。`,
          detail: [{ label: '最终学历', value: c.educationLabel }],
          chip: '毕业',
        };
      },
    },
    {
      id: 'marriage',
      category: 'lifecycle',
      title: '结婚',
      icon: '💍',
      major: true,
      minAge: 24, maxAge: 45,
      cond: (c) => !c.flags.married && c.relationship >= 45,
      base: () => 0.05,
      modifiers: (c) => [
        { label: '关系值', delta: 0.14 * norm01(c.relationship, 40, 95), kind: 'social' },
        { label: '社交投入', delta: 0.06 * c.strategy.socialPreference, kind: 'strategy' },
        { label: '财富基础', delta: 0.05 * norm01(c.wealth, 0, 120), kind: 'wealth' },
      ],
      resolve(c, rng) {
        const cost = clamp(c.wealth * 0.12 + rng.uniform(3, 22), 3, 90);
        return {
          flags: { married: true },
          wealth: -cost,
          happiness: +8,
          health: +2,
          relationship: +10,
          narrative: `你结婚了，婚礼与安顿花掉约 ${fixed(cost, 1)} 万。`,
          detail: [{ label: '相关支出', value: '-' + fixed(cost, 1) + ' 万' },
                   { label: '幸福', value: '+8' },
                   { label: '关系', value: '+10' }],
          chip: '结婚',
        };
      },
    },
    {
      id: 'child',
      category: 'lifecycle',
      title: '成为父母',
      icon: '👶',
      major: true,
      minAge: 26, maxAge: 42,
      cond: (c) => c.flags.married && !c.flags.hasChild,
      base: () => 0.22,
      modifiers: (c) => [
        { label: '财富安全感', delta: 0.10 * norm01(c.wealth, 10, 200), kind: 'wealth' },
        { label: '年龄窗口', delta: c.age <= 36 ? 0.05 : -0.12, kind: 'age' },
      ],
      resolve() {
        return {
          flags: { hasChild: true },
          happiness: +7,
          relationship: +4,
          narrative: '你有了孩子。此后每年的生活成本明显上升，但家庭关系更紧密。',
          detail: [{ label: '生活成本', value: '永久 +35%' },
                   { label: '幸福', value: '+7' }],
          chip: '成为父母',
        };
      },
    },
    {
      id: 'retirement',
      category: 'lifecycle',
      title: '退休',
      icon: '🏖',
      major: true,
      minAge: 55, maxAge: 80,
      cond: (c) => !c.flags.retired && c.career !== 'retired' && c.age >= 55,
      base: (c) => 0.14 + (c.age - 55) * 0.075,
      modifiers: (c) => [
        { label: '健康', delta: 0.20 * (1 - norm01(c.health, 35, 95)), kind: 'health' },
        { label: '财富充裕', delta: 0.16 * norm01(c.wealth, 30, 500), kind: 'wealth' },
        { label: '事业心', delta: -0.10 * c.strategy.careerRisk, kind: 'strategy' },
      ],
      resolve() {
        return {
          flags: { retired: true },
          career: 'retired',
          happiness: +5,
          narrative: '你正式退休，收入转为养老金，生活节奏慢了下来。',
          detail: [{ label: '收入', value: '转为养老金' },
                   { label: '幸福', value: '+5' }],
          chip: '退休',
        };
      },
    },

    /* ---------------- B. 机会事件 ---------------- */
    {
      id: 'startup',
      category: 'opportunity',
      title: '创业机会',
      icon: '🚀',
      major: true,
      minAge: 24, maxAge: 56,
      cond: (c) => c.career !== 'entrepreneur' && c.career !== 'retired' && c.age >= 24,
      base: () => 0.032,
      modifiers: (c) => [
        { label: '创业倾向', delta: 0.30 * (c.strategy.careerRisk - 0.5), kind: 'strategy' },
        { label: '能力', delta: 0.15 * norm01(c.ability, 40, 95), kind: 'ability' },
        { label: '职业资本', delta: 0.13 * norm01(c.careerCapital, 0, 60), kind: 'capital' },
        { label: '启动资金', delta: 0.12 * norm01(c.wealth, 0, 150), kind: 'wealth' },
        { label: '社交网络', delta: 0.09 * c.strategy.socialPreference, kind: 'social' },
        { label: '经济环境', delta: 0.16 * (c.world.startupMult - 1), kind: 'world' },
        { label: '此前失败', delta: c.startupFailures > 0 ? -0.03 : 0.02, kind: 'history' },
      ],
      resolve(c, rng) {
        // 决策：是否真的去创业（策略为主，状态次之，随机兜底；§24.2）
        const pGo = clamp(
          clamp01(0.5 * c.strategy.careerRisk + 0.25 * norm01(c.wealth, 0, 150) +
                  0.15 * norm01(c.careerCapital, 0, 60) + 0.10 * rng.next()),
          P_FLOOR, P_CEIL);
        const go = rng.next() < pGo;
        if (!go) {
          return {
            narrative: '你评估后放弃了这次创业机会，继续留在原岗位。',
            detail: [{ label: '决定', value: '放弃' },
                     { label: '决策概率 P(去创业)', value: fixed(pGo, 3) }],
            chip: `放弃创业机会 · P=${fixed(1 - pGo, 2)}`,
            distribution: { name: `Bernoulli(p=${fixed(pGo, 2)})`, latex: 'X\\sim\\mathrm{Bern}(p)',
              meaning: '你是否会接受这个机会，本身就是一次伯努利试验' },
          };
        }
        // 成功率（事件自身的概率模型，规格书 §42.2）
        const pSuccess = clamp(
          0.20 + 0.26 * c.strategy.careerRisk + 0.14 * norm01(c.ability, 40, 95) +
          0.12 * norm01(c.careerCapital, 0, 60) + 0.10 * norm01(c.relationship, 20, 95) +
          0.20 * (c.world.startupMult - 1) + 0.05 * c.traitEff.luck,
          0.05, 0.82);
        const u = rng.next();
        const success = u < pSuccess;
        const invested = clamp(c.wealth * rng.uniform(0.35, 0.85), 2, 400);
        if (success) {
          // 成功收益服从对数正态：成功也有程度差别（§23.4）
          const gain = lognorm(rng, 180 * (0.6 + 0.9 * pSuccess), 0.85) *
            (1 + c.world.startupMult - 1);
          return {
            career: 'entrepreneur',
            flags: { startupSuccess: true },
            wealth: -invested + gain,
            careerCapital: +8,
            happiness: +10,
            health: -1.5,
            narrative: `你投入 ${fixed(invested, 1)} 万创业，这一次成功了，事业估值提升约 ${fixed(gain, 0)} 万。`,
            distribution: {
              name: 'LogNormal(μ,σ²)',
              latex: '\\mathrm{Return}\\sim\\mathrm{LogN}(\\mu,\\sigma^2)',
              meaning: '成功的回报规模是右偏的：多数项目一般，少数项目极高',
            },
            detail: [
              { label: '成功概率', value: fixed(pSuccess * 100, 1) + '%' },
              { label: '随机数 U', value: fixed(u, 3) },
              { label: '判定', value: `U < ${fixed(pSuccess, 3)} → 成功` },
              { label: '投入 / 回报', value: `-${fixed(invested, 0)} / +${fixed(gain, 0)} 万` },
            ],
            chip: `创业成功 · P=${fixed(pSuccess, 2)}`,
          };
        }
        return {
          career: 'unemployed',
          flags: { startupFailed: true },
          wealth: -invested,
          happiness: -9,
          health: -2,
          relationship: -3,
          startupFailures: 1,
          narrative: `你投入 ${fixed(invested, 1)} 万创业，但没有做成，只能先回到就业市场。`,
          distribution: {
            name: `Bernoulli(p=${fixed(pSuccess, 2)})`,
            latex: 'P(\\text{成功})=p',
            meaning: `这一次成功的概率是 ${fixed(pSuccess * 100, 1)}%，你落在了另外 ${fixed((1 - pSuccess) * 100, 1)}% 里`,
          },
          detail: [
            { label: '成功概率', value: fixed(pSuccess * 100, 1) + '%' },
            { label: '随机数 U', value: fixed(u, 3) },
            { label: '判定', value: `U ≥ ${fixed(pSuccess, 3)} → 失败` },
            { label: '损失', value: '-' + fixed(invested, 0) + ' 万' },
          ],
          chip: `创业失败 · P=${fixed(pSuccess, 2)}`,
        };
      },
    },
    {
      id: 'high_offer',
      category: 'opportunity',
      title: '高薪 Offer',
      icon: '💰',
      major: true,
      minAge: 24, maxAge: 58,
      cond: (c) => ['junior', 'senior', 'manager', 'freelance'].includes(c.career) && c.age >= 24,
      base: () => 0.05,
      modifiers: (c) => [
        { label: '能力', delta: 0.13 * norm01(c.ability, 45, 95), kind: 'ability' },
        { label: '职业资本', delta: 0.14 * norm01(c.careerCapital, 5, 60), kind: 'capital' },
        { label: '学历', delta: 0.09 * c.education, kind: 'edu' },
        { label: '社交网络', delta: 0.07 * c.strategy.socialPreference, kind: 'social' },
        { label: '经济环境', delta: 0.14 * (c.world.effect.order - 1), kind: 'world' },
      ],
      resolve(c, rng) {
        const bump = rng.uniform(1.22, 1.75) * c.world.salaryMult;
        const accept = clamp01(0.45 + 0.4 * c.strategy.careerRisk + 0.15 * rng.next());
        return {
          incomeMult: accept > 0.5 ? bump : 1,
          happiness: accept > 0.5 ? +4 : 0,
          careerCapital: accept > 0.5 ? +3 : 0,
          narrative: accept > 0.5
            ? `你拿到一份高薪 Offer，收入提高到原来的 ${fixed(bump, 2)} 倍。`
            : '你收到一份高薪 Offer，但权衡后没有接受。',
          detail: [
            { label: '收入倍率', value: accept > 0.5 ? '×' + fixed(bump, 2) : '未接受' },
            { label: '接受概率', value: fixed(accept * 100, 0) + '%' },
          ],
          chip: accept > 0.5 ? `跳槽加薪 ×${fixed(bump, 2)}` : '婉拒 Offer',
        };
      },
    },
    {
      id: 'investment_chance',
      category: 'opportunity',
      title: '投资机会',
      icon: '📈',
      major: false,
      minAge: 24, maxAge: 70,
      cond: (c) => c.wealth > 12,
      base: () => 0.10,
      modifiers: (c) => [
        { label: '可投资金', delta: 0.14 * norm01(c.wealth, 10, 300), kind: 'wealth' },
        { label: '投资风险偏好', delta: 0.12 * (c.strategy.investmentRisk - 0.5), kind: 'strategy' },
        { label: '经济环境', delta: 0.12 * (c.world.effect.order - 1), kind: 'world' },
      ],
      resolve(c, rng) {
        const size = clamp(c.wealth * rng.uniform(0.10, 0.40), 1, 300);
        const risk = c.strategy.investmentRisk;
        // 单次投资：期望为正但方差随风险偏好放大
        const mu = -0.02 + 0.16 * risk + c.world.effect.investMu * 0.5;
        const sigma = 0.10 + 0.55 * risk;
        const r = clamp(mu + sigma * rng.normal01(), -0.92, 2.6);
        return {
          wealth: size * r,
          happiness: r > 0 ? +2 : -3,
          narrative: r >= 0
            ? `你投入 ${fixed(size, 1)} 万的一次投资赚了 ${fixed(r * 100, 1)}%。`
            : `你投入 ${fixed(size, 1)} 万的一次投资亏了 ${fixed(-r * 100, 1)}%。`,
          distribution: {
            name: `Normal(μ=${fixed(mu * 100, 1)}%, σ=${fixed(sigma * 100, 1)}%)`,
            latex: 'R\\sim N(\\mu,\\sigma^2)',
            meaning: '收益率为正态（近似），风险偏好越高 σ 越大，两侧都更极端',
          },
          detail: [
            { label: '投入', value: fixed(size, 1) + ' 万' },
            { label: '收益率', value: (r >= 0 ? '+' : '') + fixed(r * 100, 1) + '%' },
            { label: '盈亏', value: (size * r >= 0 ? '+' : '') + fixed(size * r, 1) + ' 万' },
          ],
          chip: `投资 ${(r >= 0 ? '+' : '') + fixed(r * 100, 0)}%`,
        };
      },
    },
    {
      id: 'career_change',
      category: 'opportunity',
      title: '转行机会',
      icon: '🧭',
      major: false,
      minAge: 25, maxAge: 50,
      cond: (c) => ['junior', 'senior'].includes(c.career) && c.age <= 50,
      base: () => 0.045,
      modifiers: (c) => [
        { label: '好奇特质', delta: 0.08 * c.traitEff.learn * 5, kind: 'trait' },
        { label: '能力', delta: 0.10 * norm01(c.ability, 45, 95), kind: 'ability' },
        { label: '职业风险偏好', delta: 0.14 * (c.strategy.careerRisk - 0.5), kind: 'strategy' },
        { label: '年龄', delta: c.age > 38 ? -0.04 : 0.02, kind: 'age' },
      ],
      resolve(c, rng) {
        const gain = rng.uniform(1.05, 1.5);
        return {
          career: rng.next() < 0.6 ? 'freelance' : 'senior',
          incomeMult: gain,
          careerCapital: +4,
          happiness: +3,
          narrative: `你抓住机会转行，收入变为原来的 ${fixed(gain, 2)} 倍，职业资本重新积累。`,
          detail: [{ label: '收入倍率', value: '×' + fixed(gain, 2) },
                   { label: '新方向', value: '技能迁移' }],
          chip: '转行',
        };
      },
    },
    {
      id: 'overseas',
      category: 'opportunity',
      title: '海外深造机会',
      icon: '✈️',
      major: true,
      minAge: 21, maxAge: 35,
      cond: (c) => c.strategy.educationPreference > 0.45 && c.education < 0.92,
      base: () => 0.035,
      modifiers: (c) => [
        { label: '教育投入', delta: 0.22 * (c.strategy.educationPreference - 0.5), kind: 'strategy' },
        { label: '能力', delta: 0.16 * norm01(c.ability, 50, 95), kind: 'ability' },
        { label: '家庭资源', delta: 0.10 * (c.familyRich ? 1 : c.familyPoor ? -0.4 : 0), kind: 'family' },
      ],
      resolve(c, rng) {
        const cost = rng.uniform(18, 55);
        return {
          education: +0.18,
          wealth: -cost,
          career: 'student',
          careerCapital: +6,
          happiness: +4,
          narrative: `你获得海外深造机会，花掉 ${fixed(cost, 1)} 万，学历与视野都上了一个台阶。`,
          detail: [{ label: '支出', value: '-' + fixed(cost, 1) + ' 万' },
                   { label: '教育等级', value: '+0.18' }],
          chip: '海外深造',
        };
      },
    },

    /* ---------------- C. 风险事件 ---------------- */
    {
      id: 'layoff',
      category: 'risk',
      title: '失业',
      icon: '📉',
      major: true,
      minAge: 22, maxAge: 62,
      cond: (c) => ['junior', 'senior', 'manager', 'freelance'].includes(c.career),
      base: () => 0.028,
      modifiers: (c) => [
        { label: '经济环境', delta: 0.12 * (1 - c.world.jobFindMult), kind: 'world' },
        { label: '职业资本', delta: -0.06 * norm01(c.careerCapital, 5, 60), kind: 'capital' },
        { label: '学历保护', delta: -0.03 * c.education, kind: 'edu' },
        { label: '年龄', delta: c.age > 45 ? 0.03 : 0, kind: 'age' },
        { label: '职业风险', delta: 0.03 * c.strategy.careerRisk, kind: 'strategy' },
      ],
      resolve(c, rng) {
        // 再就业需要几次尝试（几何分布）
        const pFind = clamp(
          0.22 + 0.16 * norm01(c.ability, 40, 95) + 0.12 * c.education +
          0.20 * (c.world.jobFindMult - 1) - (c.age > 45 ? 0.08 : 0), 0.05, 0.75);
        const months = Math.min(48, D.geometric.sample(rng, { p: pFind }));
        return {
          career: 'unemployed',
          flags: { unemployedNow: true },
          incomeMult: 0,
          happiness: -10,
          health: -1,
          relationship: -2,
          narrative: `你被裁了。按当前条件，预计需要约 ${months} 个月才能重新找到工作。`,
          distribution: {
            name: `Geometric(p=${fixed(pFind, 2)})`,
            latex: 'P(X=k)=(1-p)^{k-1}p',
            meaning: `每次求职成功概率 ${fixed(pFind * 100, 1)}%，平均等 ${fixed(1 / pFind, 1)} 个"求职轮次"`,
          },
          detail: [
            { label: '再就业单次成功率', value: fixed(pFind * 100, 1) + '%' },
            { label: '预计空窗', value: months + ' 个月' },
          ],
          chip: `失业 · P(再就业)=${fixed(pFind, 2)}`,
        };
      },
    },
    {
      id: 'health_issue',
      category: 'risk',
      title: '健康事件',
      icon: '🏥',
      major: true,
      minAge: 26, maxAge: 100,
      cond: () => true,
      base: (c) => 0.010 + Math.max(0, c.age - 42) * 0.0018,
      modifiers: (c) => [
        { label: '健康投入', delta: -0.014 * c.strategy.healthPriority, kind: 'strategy' },
        { label: '当前健康', delta: -0.016 * norm01(c.health, 30, 95), kind: 'health' },
        { label: '工作压力', delta: 0.006 * (c.world.stressMult - 1), kind: 'world' },
        { label: '抗压特质', delta: -0.010 * (c.traitEff.recover > 0 ? 1 : 0), kind: 'trait' },
      ],
      resolve(c, rng) {
        const sev = clamp(rng.uniform(3, 10) * c.world.cfg.healthRisk *
          (1.4 - 0.6 * c.strategy.healthPriority), 2, 24);
        const cost = clamp(sev * rng.uniform(0.6, 3.2), 0.5, 90);
        return {
          health: -sev,
          wealth: -cost,
          happiness: -6,
          narrative: `你出现了一次较明显的健康问题，健康下降 ${fixed(sev, 1)}，相关支出 ${fixed(cost, 1)} 万。`,
          detail: [
            { label: '健康变化', value: '-' + fixed(sev, 1) },
            { label: '相关支出', value: '-' + fixed(cost, 1) + ' 万' },
          ],
          chip: `健康 -${fixed(sev, 0)}`,
        };
      },
    },
    {
      id: 'market_crash',
      category: 'risk',
      title: '市场大幅回撤',
      icon: '📉',
      major: true,
      minAge: 20, maxAge: 90,
      cond: (c) => c.wealth > 8 && c.world.stateName !== '繁荣',
      base: (c) => (c.world.stateName === '危机' ? 0.34 : c.world.stateName === '衰退' ? 0.18 : 0.04),
      modifiers: (c) => [
        { label: '持仓风险暴露', delta: 0.16 * c.strategy.investmentRisk, kind: 'strategy' },
        { label: '市场波动率', delta: 0.10 * (c.world.cfg.marketVolatility - 1), kind: 'world' },
        { label: '可投资金', delta: 0.06 * norm01(c.wealth, 20, 300), kind: 'wealth' },
      ],
      resolve(c, rng) {
        const drop = clamp(rng.uniform(0.14, 0.46) * (0.6 + c.strategy.investmentRisk),
          0.06, 0.72);
        const exposed = c.wealth * clamp(0.25 + 0.6 * c.strategy.investmentRisk, 0.1, 0.9);
        return {
          wealth: -exposed * drop,
          happiness: -7,
          health: -0.5,
          narrative: `市场大幅回撤，你的风险资产损失约 ${fixed(exposed * drop, 1)} 万。`,
          detail: [
            { label: '暴露资金', value: fixed(exposed, 1) + ' 万' },
            { label: '回撤幅度', value: '-' + fixed(drop * 100, 1) + '%' },
            { label: '实际损失', value: '-' + fixed(exposed * drop, 1) + ' 万' },
          ],
          chip: `市场 -${fixed(drop * 100, 0)}%`,
        };
      },
    },
    {
      id: 'industry_decline',
      category: 'risk',
      title: '行业衰退',
      icon: '🏭',
      major: false,
      minAge: 26, maxAge: 58,
      cond: (c) => ['junior', 'senior', 'manager'].includes(c.career),
      base: () => 0.03,
      modifiers: (c) => [
        { label: '经济环境', delta: 0.09 * (1 - c.world.effect.order), kind: 'world' },
        { label: '职业资本', delta: -0.04 * norm01(c.careerCapital, 5, 60), kind: 'capital' },
      ],
      resolve(c, rng) {
        const cut = rng.uniform(0.85, 0.97);
        return {
          incomeMult: cut,
          happiness: -4,
          careerCapital: -2,
          narrative: `所在行业进入下行周期，收入被压缩到原来的 ${fixed(cut * 100, 0)}%。`,
          detail: [{ label: '收入倍率', value: '×' + fixed(cut, 2) }],
          chip: `行业下行 ×${fixed(cut, 2)}`,
        };
      },
    },

    /* ---------------- E. 稀有事件 ---------------- */
    {
      id: 'extreme_success',
      category: 'rare',
      title: '极端成功',
      icon: '🌟',
      major: true,
      minAge: 25, maxAge: 60,
      cond: (c) => c.career === 'entrepreneur' || c.strategy.careerRisk > 0.6,
      /**
       * 稀有事件的年概率必须压得很低：一个 3%/年的"稀有"事件，
       * 在 35 年可触发窗口里会有 65% 的人生遇到，完全失去戏剧性。
       * 这里标定成激进策略一生约 6% 能碰到。
       */
      base: () => 0.0009,
      modifiers: (c) => [
        { label: '创业倾向', delta: 0.0050 * (c.strategy.careerRisk - 0.5), kind: 'strategy' },
        { label: '能力', delta: 0.0030 * norm01(c.ability, 55, 95), kind: 'ability' },
        { label: '好运特质', delta: 0.0025 * (c.traitEff.luck > 0 ? 1 : 0), kind: 'trait' },
      ],
      resolve(c, rng) {
        const gain = lognorm(rng, 2600, 0.9);
        return {
          wealth: +gain,
          happiness: +14,
          careerCapital: +14,
          narrative: `极小的概率发生了：你的事业被高价收购，一次性获得约 ${fixed(gain, 0)} 万。`,
          distribution: {
            name: 'LogNormal（极端右尾）',
            latex: '\\mathrm{Gain}\\sim\\mathrm{LogN}(\\mu,\\sigma^2)',
            meaning: '这类事件的收益是"长尾"的：概率极低，但一旦发生就远超平均值',
          },
          detail: [{ label: '一次性收入', value: '+' + fixed(gain, 0) + ' 万' }],
          chip: `极端成功 +${fixed(gain / 10000, 2)} 亿`,
        };
      },
    },
    {
      id: 'catastrophe',
      category: 'rare',
      title: '重大冲击',
      icon: '⚡',
      major: true,
      minAge: 20, maxAge: 95,
      cond: (c) => c.wealth > 5,
      base: () => 0.0018,
      modifiers: (c) => [
        { label: '风险暴露', delta: 0.0035 * c.strategy.investmentRisk, kind: 'strategy' },
        { label: '经济环境', delta: 0.0030 * (1 - c.world.effect.order), kind: 'world' },
      ],
      resolve(c, rng) {
        const frac = clamp(rng.uniform(0.25, 0.7), 0.15, 0.8);
        const loss = Math.max(0, c.wealth) * frac;
        return {
          wealth: -loss,
          health: -rng.uniform(1.5, 5),
          happiness: -11,
          narrative: `一场不可预期的冲击让你损失了约 ${fixed(loss, 1)} 万资产。`,
          detail: [
            { label: '损失比例', value: '-' + fixed(frac * 100, 0) + '%' },
            { label: '损失金额', value: '-' + fixed(loss, 1) + ' 万' },
          ],
          chip: `重大冲击 -${fixed(frac * 100, 0)}%`,
        };
      },
    },
    {
      id: 'windfall',
      category: 'rare',
      title: '意外之财',
      icon: '🍀',
      major: false,
      minAge: 20, maxAge: 90,
      cond: () => true,
      base: () => 0.0035,
      modifiers: (c) => [
        { label: '好运特质', delta: 0.0025 * (c.traitEff.luck > 0 ? 1 : 0), kind: 'trait' },
        { label: '社交网络', delta: 0.0015 * c.strategy.socialPreference, kind: 'social' },
      ],
      resolve(c, rng) {
        const gain = rng.uniform(2, 45);
        return {
          wealth: +gain,
          happiness: +5,
          narrative: `你得到一笔意外之财，约 ${fixed(gain, 1)} 万。`,
          detail: [{ label: '收入', value: '+' + fixed(gain, 1) + ' 万' }],
          chip: `意外之财 +${fixed(gain, 0)} 万`,
        };
      },
    },
  ];

  const BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
  /** id -> 下标。批量模拟用位掩码统计每局发生了哪些事件（规格书 §36.2） */
  const INDEX = Object.fromEntries(EVENTS.map((e, i) => [e.id, i]));

  /* ============================================================
   * 概率评估：把 base + modifiers 拆解出来，供 UI 展示
   * ========================================================== */

  /**
   * @returns {{p:number, base:number, factors:Array, u:number, occurred:boolean}}
   */
  function evaluate(ev, ctx, rng) {
    const base = clamp01(ev.base(ctx));
    const factors = (ev.modifiers ? ev.modifiers(ctx) : []).filter(
      (f) => f && isFinite(f.delta) && Math.abs(f.delta) > 1e-6
    );
    let p = base;
    for (const f of factors) p += f.delta;
    // 稀有事件额外压上限，保证"稀有"这个设定不被修正项吃掉
    const ceil = ev.category === 'rare'
      ? Math.min(EV_CEIL, C.EVENT.rareCap)
      : EV_CEIL;
    p = clamp(p, EV_FLOOR, ceil);
    const u = rng.next();
    return { p, base, factors, u, occurred: u < p };
  }

  /**
   * 抽取一批"候选事件"，并按概率判定。
   * 同一时间只允许一个重大事件（规格书 §24.3：默认重大事件 6～10 个）。
   */
  function roll(ctx, rng, opts = {}) {
    const density = (opts.density != null ? opts.density : ctx.world.cfg.eventDensity) || 1;
    const results = [];
    // 复制一份候选列表并打乱，避免定义顺序造成偏差
    const pool = rng.shuffle(EVENTS);
    let majorCount = 0;
    const maxMajor = opts.maxMajor != null ? opts.maxMajor : C.EVENT.maxMajorPerYear;

    for (const ev of pool) {
      if (ev.cond && !ev.cond(ctx)) continue;
      if (ev.minAge != null && ctx.age < ev.minAge) continue;
      if (ev.maxAge != null && ctx.age > ev.maxAge) continue;
      if (ev.major && majorCount >= maxMajor) continue;

      const r = evaluate(ev, ctx, rng);
      // 密度参数：只影响"发生概率"，不改判定逻辑
      const ceil = ev.category === 'rare'
        ? Math.min(EV_CEIL, C.EVENT.rareCap)
        : EV_CEIL;
      const pAdj = clamp(r.p * density, EV_FLOOR, ceil);
      const occurred = r.u < pAdj;
      if (!occurred) continue;

      let outcome = {};
      try {
        outcome = ev.resolve ? ev.resolve(ctx, rng) || {} : {};
      } catch (err) {
        outcome = { narrative: `（事件 ${ev.id} 结算异常已跳过：${err.message}）` };
      }
      results.push({
        id: ev.id,
        category: ev.category,
        title: ev.title,
        icon: ev.icon,
        major: !!ev.major,
        probability: pAdj,
        base: r.base,
        factors: r.factors,
        randomDraw: r.u,
        distribution: outcome.distribution || null,
        outcome,
      });
      if (ev.major) majorCount++;
    }
    // 重大事件优先展示
    results.sort((a, b) => (b.major ? 1 : 0) - (a.major ? 1 : 0));
    return results;
  }

  LS.events = {
    EVENTS,
    BY_ID,
    INDEX,
    byCategory: (cat) => EVENTS.filter((e) => e.category === cat),
    categories: () => [...new Set(EVENTS.map((e) => e.category))],
    evaluate,
    roll,
    P_FLOOR,
    P_CEIL,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
