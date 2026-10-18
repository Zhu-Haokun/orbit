/* ============================================================
 * LifeSim · sim/life.js
 * 单次人生模拟（规格书 §22 状态模型、§24 自动决策、§46 财富系统）
 *
 *   S_{t+1} = F(S_t, D_t, Z_t, ε_t)
 *
 * S = 状态向量（年龄/教育/财富/健康/职业/关系/幸福/职业资本）
 * D = 决策（由策略向量决定的概率）
 * Z = 宏观世界状态
 * ε = 不可控随机扰动
 *
 * 三种运行方式共用同一套「年度推进」逻辑：
 *   runLife()        —— 完整记录（极速人生 / 关键人生）
 *   simulateLight()  —— 只保留最终指标（蒙特卡洛大批量）
 *   streamLife()     —— 生成器版本，在关键决策处暂停（关键人生模式）
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const C = LS.config;
  const D = LS.distributions;
  const { clamp, clamp01, norm01, uid } = LS.util;

  /* ------------------------------------------------------------
   * 教育等级换算
   * ---------------------------------------------------------- */
  function educationLabel(level) {
    let label = C.EDUCATION.levels[0].label;
    for (const l of C.EDUCATION.levels) if (level >= l.min) label = l.label;
    return label;
  }

  function educationInfo(level) {
    let info = C.EDUCATION.levels[0];
    for (const l of C.EDUCATION.levels) if (level >= l.min) info = l;
    return info;
  }

  /**
   * 简化税负：工资收入按“年收入 → 有效负担率”的单调曲线扣税，
   * 养老金、失业补助、学生收入不扣。标定依据见 config.TAX。
   */
  function effectiveTaxRate(income) {
    const brackets = C.TAX && C.TAX.brackets;
    if (!brackets || !brackets.length) return 0;
    for (const b of brackets) if (income <= b.upTo) return b.rate;
    return brackets[brackets.length - 1].rate;
  }

  /** 职业层级 0..1，用于"事业成就"维度与晋升判定 */
  const CAREER_TIER = {
    student: 0.10, unemployed: 0.05, retired: 0.30,
    junior: 0.35, freelance: 0.42, senior: 0.62,
    entrepreneur: 0.72, manager: 0.88,
  };

  /**
   * 单次人生的模拟器。把一年一步的逻辑收敛在这里，
   * 让"完整记录 / 轻量批量 / 可暂停"三种驱动方式复用同一套规则。
   */
  class Simulator {
    constructor(params) {
      const {
        character, strategy, worldSeed, agentSeed, worldConfig,
        mode = 'fast', decisions = {}, light = false,
      } = params;

      this.character = character;
      this.strategy = strategy;
      this.mode = mode;
      this.light = light;
      /** 玩家在关键节点的选择：{ decisionId: optionId }（规格书 §13.3） */
      this.decisions = decisions || {};
      this.decisionLog = [];

      this.worldSeed = worldSeed >>> 0;
      this.agentSeed = (agentSeed != null ? agentSeed : worldSeed) >>> 0;

      // 三条独立随机流（规格书 §13.2）
      this.rngWorld = new LS.rng.Rng(LS.rng.derive(this.worldSeed, 'world'));
      this.rngAgent = new LS.rng.Rng(LS.rng.derive(this.agentSeed, 'agent'));
      this.rngEvent = new LS.rng.Rng(LS.rng.derive(this.worldSeed, 'event'));

      this.world = new LS.world.World(this.rngWorld, worldConfig || C.makeWorldConfig('standard'));
      this.traitEff = LS.character.traitEffects(character);

      const eduInfo = educationInfo(character.educationSeed);
      this.state = {
        age: character.age,
        wealth: character.initialWealth,
        health: character.health,
        happiness: 62,
        relationship: this.rngAgent.uniform(C.RELATIONSHIP.initRange[0], C.RELATIONSHIP.initRange[1]),
        career: 'student',
        education: clamp01(character.educationSeed),
        careerCapital: 4,
        income: 0,
        /** 收入基准（万元）与收入乘数分离，事件只改乘数不会破坏基准 */
        incomeBase: 0,
        incomeMult: 1,
        alive: true,
      };

      this.flags = {
        gotFirstJob: false, graduated: false, married: false, hasChild: false,
        retired: false, startupSuccess: false, startupFailed: false,
        houseOwned: false, unemployedNow: false,
        hasPet: false, lateBloom: false, hasSideHustle: false,
        childSchool: false, parentIllness: false, divorced: false,
        hadAccident: false, scammed: false, burnout: false,
      };
      this.startupFailures = 0;
      this.startupAttempts = 0;
      /** 本局发生过哪些事件（位掩码），批量模拟用它做尾部事件频率分析 */
      this.eventMask = 0;
      this.peakWealth = character.initialWealth;
      this.peakIncome = 0;
      this.wealthHistory = [];
      this.states = [];
      this.events = [];
      this.deathCause = null;
      this.chips = [];
      /* 终身累计量。
         健康用"前半生（至 65 岁）平均"而不是"一生平均"：
         如果统计到临终，活得越久的人被计入的"低健康晚年"越多，
         会让健康与寿命呈现人为的负相关，看起来像"活得久更不健康"。
         限定在 65 岁前的窗口，健康就恢复成"健康维护水平"的度量，
         与寿命正相关，也符合直觉。幸福与关系则取一生平均。 */
      this.sumHealth = 0;
      this.yearsHealth = 0;
      this.sumHappiness = 0;
      this.sumRelationship = 0;
      this.yearsLived = 0;
      this.healthWindow = 65;
      this.lastBankruptcyAge = -999;

      this.familyPoor = character.familyResource === 'poor';
      this.familyRich = character.familyResource === 'rich';
      this.eduInfo = eduInfo;
    }

    /** 事件系统需要的上下文快照 */
    context() {
      const s = this.state;
      return {
        age: s.age,
        wealth: s.wealth,
        health: s.health,
        happiness: s.happiness,
        relationship: s.relationship,
        career: s.career,
        careerCapital: s.careerCapital,
        education: s.education,
        educationLabel: educationLabel(s.education),
        income: s.income,
        // 角色的**静态**属性也必须放进上下文，否则事件的修正项会算出 NaN
        ability: this.character.ability,
        strategy: this.strategy,
        character: this.character,
        traitEff: this.traitEff,
        world: this.world,
        flags: this.flags,
        startupFailures: this.startupFailures,
        familyPoor: this.familyPoor,
        familyRich: this.familyRich,
        // 供事件读取：教育带来的收入倍率
        educationIncomeMult: this.eduInfo.incomeMult,
      };
    }

    /* ==========================================================
     * 一年推进
     * ======================================================== */
    step() {
      const s = this.state;
      const strat = this.strategy;
      const rngA = this.rngAgent;
      const rngE = this.rngEvent;

      // ---- 1. 世界推进 ----
      this.world.step(s.age);

      // ---- 2. 教育推进：学生身份会按投入自动延长学制 ----
      if (s.career === 'student') {
        const target = clamp01(
          0.30 + 0.62 * strat.educationPreference + 0.10 * this.traitEff.learn * 5
        );
        const gap = target - s.education;
        if (gap > 0) s.education = clamp01(s.education + Math.min(0.085, gap * 0.4));
        this.eduInfo = educationInfo(s.education);
        // 学费
        if (s.age >= 19) {
          s.wealth -= C.EDUCATION.tuitionPerYear * (0.4 + strat.educationPreference);
        }
      }

      // ---- 3. 职业转移 ----
      this._careerTransition(rngA);

      // ---- 4. 收入 ----
      const inc = this._computeIncome(rngA);
      s.income = inc;
      // 财富方程（规格书 §46）：
      //   W_{t+1} = W_t + Income_t − Expense_t + InvestmentReturn_t + EventImpact_t
      s.wealth += inc;

      // ---- 5. 支出 ----
      const expense = this._computeExpense();
      s.wealth -= expense;
      this._lastExpense = expense;

      // ---- 6. 投资 ----
      const investReturn = this._invest(rngA);
      s.wealth += investReturn;

      // ---- 7. 健康 ----
      this._healthStep(rngA);

      // ---- 8. 关系 ----
      this._relationshipStep(rngA);

      // ---- 9. 事件 ----
      const evs = LS.events.roll(this.context(), rngE, {
        density: this.world.cfg.eventDensity,
      });
      for (const ev of evs) this._applyEvent(ev);
      if (this.world.stateName === '危机' && rngE.next() < 0.5) {
        this.chips.push({ age: s.age, text: `经济${this.world.stateName}`, tone: 'bad' });
      }

      // ---- 10. 幸福 ----
      this._happinessStep(rngA);

      // ---- 11. 破产保护（规格书 §46：避免财富无限负增长） ----
      if (s.wealth < C.EXPENSE.bankruptcyThreshold &&
          s.age - this.lastBankruptcyAge >= C.EXPENSE.bankruptcyCooldown) {
        this.lastBankruptcyAge = s.age;
        this.events.push({
          id: 'bankruptcy', category: 'risk', title: '债务重组', icon: '🧾',
          major: true, probability: null, base: null, factors: [],
          randomDraw: null, distribution: null, age: s.age,
          narrative: '负债超过承受能力，你进行了债务重组，净资产被重置。',
          outcome: {
            narrative: '债务重组后，你从几乎归零的资产重新开始。',
            detail: [{ label: '净资产', value: '重置为 0' }],
            chip: '债务重组',
          },
        });
        s.wealth = C.EXPENSE.bankruptcyReset;
        s.happiness = clamp(s.happiness - 8, 0, 100);
      }
      if (s.wealth < C.EXPENSE.debtFloor) s.wealth = C.EXPENSE.debtFloor;

      // ---- 12. 统计与生死 ----
      this.peakWealth = Math.max(this.peakWealth, s.wealth);
      this.peakIncome = Math.max(this.peakIncome, inc);
      this.wealthHistory.push(s.wealth);
      // 健康只在"前半生窗口"内累计，与分母 yearsHealth 严格对应
      if (s.age <= this.healthWindow) {
        this.sumHealth += s.health;
        this.yearsHealth++;
      }
      this.sumHappiness += s.happiness;
      this.sumRelationship += s.relationship;
      this.yearsLived++;

      if (!this.light) {
        this.states.push({
          age: s.age, wealth: s.wealth, health: s.health, happiness: s.happiness,
          relationship: s.relationship, career: s.career, education: s.education,
          careerCapital: s.careerCapital, income: inc, expense,
          economy: this.world.stateName,
        });
      }

      const dead = this._deathCheck(rngA);
      if (dead) {
        s.alive = false;
        const cause = dead.cause || { label: '身体原因', note: '没有留下更多解释' };
        this.deathCause = cause;
        if (!this.light) {
          this.events.push({
            id: 'death', category: 'lifecycle', title: '生命终点', icon: '🕯',
            major: true, probability: null, base: null, factors: [],
            randomDraw: dead.p, distribution: null, age: s.age,
            narrative: `你在 ${s.age} 岁离世，原因是${cause.label}。${cause.note}。`,
            outcome: {
              narrative: `你在 ${s.age} 岁离世，原因是${cause.label}。${cause.note}。`,
              detail: [
                { label: '年龄', value: s.age + ' 岁' },
                { label: '原因', value: cause.label },
              ],
              chip: cause.label,
            },
          });
        }
      }
      s.age++;
      return evs;
    }

    /* ---------------- 职业转移 ---------------- */

    _careerTransition(rng) {
      const s = this.state;
      const prevCareer = s.career;
      this._careerTransitionInner(rng);
      // 职业一旦变化，"事件造成的收入乘数"就归零，
      // 否则乘数会跨岗位累积成指数增长
      if (s.career !== prevCareer) s.incomeMult = 1;
    }

    _careerTransitionInner(rng) {
      const s = this.state;
      const strat = this.strategy;
      const w = this.world;

      // 退休后不再转移
      if (s.career === 'retired') return;

      if (s.career === 'student') {
        // 学生 -> 就业 / 继续深造：由教育目标与年龄决定
        const targetEdu = clamp01(0.30 + 0.62 * strat.educationPreference);
        const yearsNeeded = s.education < targetEdu ? (targetEdu - s.education) / 0.085 : 0;
        const minAge = 18 + C.EDUCATION.yearsByLevel[educationInfo(s.education).min != null
          ? C.EDUCATION.levels.indexOf(educationInfo(s.education)) : 2];
        const canLeave = s.age >= Math.min(30, minAge + 2);
        if (s.age >= 30 || (canLeave && yearsNeeded < 0.8) || s.age >= 26) {
          // 是否继续深造（教育投入 + 能力）
          const pStay = clamp01(
            0.55 * strat.educationPreference +
            0.25 * norm01(this.character.ability, 50, 95) -
            0.05 * (s.age - 22)
          );
          if (rng.next() < pStay && s.education < 0.95 && s.age < 32) {
            return; // 继续读
          }
          s.career = 'junior';
          s.incomeBase = D.lognormal.sample(rng, {
            mu: Math.log(C.INCOME.junior.median * (0.8 + 0.45 * norm01(this.character.ability, 35, 95))),
            sigma: C.INCOME.junior.sigma,
          });
        }
        return;
      }

      if (s.career === 'unemployed') {
        // 再就业：由劳动力市场与能力决定
        const pFind = clamp(
          0.30 + 0.16 * norm01(this.character.ability, 40, 95) + 0.12 * s.education +
          0.22 * (w.jobFindMult - 1) - (s.age > 45 ? 0.08 : 0), 0.05, 0.8);
        if (rng.next() < pFind) {
          s.career = s.careerCapital > 28 ? 'senior' : 'junior';
          s.incomeBase = this._baseIncomeFor(s.career, rng);
          s.incomeMult = 1;
        }
        return;
      }

      // 在职：晋升 / 转自由职业 / 转创业（后者主要由创业事件驱动）
      const tier = CAREER_TIER[s.career] || 0.3;
      if (s.career === 'junior' || s.career === 'freelance') {
        const pPromo = clamp01(
          0.06 + 0.14 * norm01(s.careerCapital, 8, 55) + 0.08 * (strat.careerRisk - 0.5) +
          0.05 * this.traitEff.ambition * 5 + 0.04 * (w.salaryMult - 1)
        );
        if (rng.next() < pPromo) {
          s.career = 'senior';
          s.incomeBase = this._baseIncomeFor('senior', rng);
          this.chips.push({ age: s.age, text: `晋升 → ${C.CAREER_LABEL.senior}`, tone: 'ok' });
        }
      } else if (s.career === 'senior' || s.career === 'manager') {
        const pPromo = clamp01(
          0.035 + 0.12 * norm01(s.careerCapital, 25, 70) + 0.07 * (strat.careerRisk - 0.5) +
          0.05 * this.traitEff.ambition * 5
        );
        if (rng.next() < pPromo && s.career === 'senior') {
          s.career = 'manager';
          s.incomeBase = this._baseIncomeFor('manager', rng);
          this.chips.push({ age: s.age, text: `晋升 → ${C.CAREER_LABEL.manager}`, tone: 'ok' });
        }
      } else if (s.career === 'entrepreneur') {
        // 创业若干年后趋于稳定，转为资深职员或继续创业
        const pMature = 0.10 + 0.10 * norm01(s.careerCapital, 20, 80);
        if (rng.next() < pMature) {
          const keepGoing = rng.next() < 0.4 + 0.4 * strat.careerRisk;
          if (!keepGoing) {
            s.career = 'manager';
            s.incomeBase = this._baseIncomeFor('manager', rng);
          }
        }
      }
    }

    _baseIncomeFor(career, rng) {
      const p = C.INCOME[career] || C.INCOME.junior;
      const abilityMult = 0.75 + 0.55 * norm01(this.character.ability, 35, 95);
      const eduMult = this.eduInfo.incomeMult;
      return D.lognormal.sample(rng, {
        mu: Math.log(Math.max(0.1, p.median * abilityMult * eduMult)),
        sigma: p.sigma,
      });
    }

    _computeIncome(rng) {
      const s = this.state;
      if (!isFinite(s.incomeBase) || s.incomeBase <= 0) {
        s.incomeBase = this._baseIncomeFor(s.career, rng);
      }
      if (!isFinite(s.incomeMult) || s.incomeMult < 0) s.incomeMult = 1;
      // 每年在基准上叠加小幅波动 + 世界薪资乘数
      const yearFactor = Math.exp(rng.normal01() * 0.09) * this.world.salaryMult;
      let inc = s.incomeBase * yearFactor * s.incomeMult;
      // 退休后转为养老金
      if (s.career === 'retired') inc = Math.max(inc, C.INCOME.retired.median);
      // 失业时只有临时收入
      if (s.career === 'unemployed') inc = C.INCOME.unemployed.median * Math.exp(rng.normal01() * 0.3);
      // 健康差会压低收入
      inc *= 0.7 + 0.3 * norm01(s.health, 25, 95);
      // 税与社保：只对工资/经营类收入扣；养老金、失业补助、学生收入不计。
      if (['junior', 'senior', 'manager', 'freelance', 'entrepreneur'].includes(s.career)) {
        inc *= 1 - effectiveTaxRate(inc);
      }
      return isFinite(inc) ? Math.max(0, inc) : 0;
    }

    _computeExpense() {
      const s = this.state;
      const table = C.EXPENSE.baseByAge;
      let base = table[0].v;
      for (const row of table) if (s.age >= row.age) base = row.v;
      const pref = C.EXPENSE.prefMult;
      const mult = pref[0] + (pref[1] - pref[0]) * this.strategy.consumptionPreference;
      let e = base * mult;
      // 子女成本只发生在抚养期；孩子成年后（父母约 58 岁起）不再按 1.35 倍计算。
      // 旧版把 hasChild 乘到临终，退休后支出被高估，很多人被“拖”成负资产。
      if (this.flags.hasChild && s.age < 58) e *= 1.35;
      if (this.flags.married) e *= 1.18;
      if (this.flags.houseOwned) e *= C.EXPENSE.housingRelief;
      // 高收入家庭生活水平自然上移，但比例低于收入增长（否则永远存不下钱）
      e *= 1 + 0.22 * norm01(s.income, 0, 80);
      return e;
    }

    _invest(rng) {
      const s = this.state;
      if (s.wealth <= 1) return 0;
      const base = LS.character.investParams(this.strategy.investmentRisk, 1);
      const p = this.world.investParams(base.mu, base.sigma);
      // 可投资比例：财富越多、风险偏好越高，投入越多
      const frac = clamp(0.25 + 0.6 * this.strategy.investmentRisk, 0.1, 0.9);
      const principal = Math.max(0, s.wealth * frac);
      const r = clamp(p.mu + p.sigma * rng.normal01(), C.INVEST.floor, C.INVEST.ceiling);
      this._lastReturn = r;
      return principal * r;
    }

    _healthStep(rng) {
      const s = this.state;
      const H = C.HEALTH;
      // 基础衰减：30 岁后随年龄加速
      let dec = H.declineBase;
      if (s.age > 30) dec += (s.age - 30) * H.declinePerYear;
      // 健康投入的抵消
      dec *= 1 - H.priorityRelief * this.strategy.healthPriority;
      // 工作压力
      const stressCareers = ['manager', 'entrepreneur'];
      if (stressCareers.includes(s.career)) dec *= 1 + H.stressPenalty * 0.5;
      dec *= this.world.stressMult;
      dec *= clamp(this.world.cfg.healthRisk, 0.4, 2.0);
      // 抗压特质
      dec *= 1 - 0.35 * clamp01(this.traitEff.recover * 5);
      // 随机冲击
      let shock = 0;
      if (rng.next() < H.shockProb * clamp(this.world.cfg.healthRisk, 0.4, 2.0)) {
        shock = rng.uniform(H.shockSize[0], H.shockSize[1]) * (1 - 0.5 * this.strategy.healthPriority);
      }
      s.health = clamp(s.health - dec - shock, H.minHealth, 100);
    }

    _relationshipStep(rng) {
      const s = this.state;
      const R = C.RELATIONSHIP;
      const sp = this.strategy.socialPreference;
      let delta = R.socialLoss + (R.socialGain - R.socialLoss) * sp - R.decay;
      // 高压力职业与差健康会侵蚀关系
      if (['manager', 'entrepreneur'].includes(s.career)) delta -= R.workPressurePenalty * this.world.stressMult;
      if (s.health < 50) delta -= (50 - s.health) * 0.02;
      delta += this.traitEff.social * 8;
      delta += rng.normal01() * 1.6;
      if (this.flags.married) delta += 0.8;
      if (this.flags.hasChild) delta += 0.4;
      s.relationship = clamp(s.relationship + delta, R.range[0], R.range[1]);
    }

    _happinessStep(rng) {
      const s = this.state;
      const H = C.HAPPINESS;
      const w = H.weights;
      // 财富安全感：对数刻度，避免"钱越多边际幸福无限大"
      const ws = clamp01(Math.log10(Math.max(s.wealth, 0) + 1) / Math.log10(H.wealthTarget + 1));
      // 职业契合度：职业层级 × 与偏好的匹配
      const tier = CAREER_TIER[s.career] || 0.3;
      const fit = clamp01(tier * (0.6 + 0.4 * (1 - Math.abs(this.strategy.careerRisk - tier))));
      const lowStress = clamp01(1 - (this.world.effect.stress - 0.85) / 0.9);
      const target =
        100 *
        (w.wealthSecurity * ws +
          w.health * (s.health / 100) +
          w.relationship * (s.relationship / 100) +
          w.careerFit * fit +
          w.lowStress * lowStress);
      const inertia = H.inertia;
      let h = s.happiness * inertia + target * (1 - inertia);
      h += rng.normal01() * H.noise;
      s.happiness = clamp(h, H.range[0], H.range[1]);
    }

    /** 应用事件后果 */
    _applyEvent(ev) {
      const s = this.state;
      const o = ev.outcome || {};
      // 所有数值型后果都过一遍 isFinite 保护：
      // 一个事件的公式写错不该把整局人生变成 NaN（这类 bug 极难定位）
      const fin = (v) => (isFinite(v) ? v : 0);
      if (o.wealth) s.wealth += fin(o.wealth);
      if (o.health) s.health = clamp(s.health + fin(o.health), 0, 100);
      if (o.happiness) s.happiness = clamp(s.happiness + fin(o.happiness), 0, 100);
      if (o.relationship) s.relationship = clamp(s.relationship + fin(o.relationship), 0, 100);
      if (o.careerCapital) s.careerCapital = Math.max(0, s.careerCapital + fin(o.careerCapital));
      if (o.education) s.education = clamp01(s.education + fin(o.education));
      if (o.incomeMult && isFinite(o.incomeMult) && o.incomeMult >= 0) {
        // 收入乘数必须封顶：否则反复触发"高薪 Offer"会让收入指数级膨胀
        s.incomeMult = Math.min(3.2, s.incomeMult * o.incomeMult);
      }
      if (o.incomeBase && isFinite(o.incomeBase) && o.incomeBase > 0) s.incomeBase = o.incomeBase;
      if (o.career) s.career = o.career;
      if (o.startupFailures) this.startupFailures += fin(o.startupFailures);
      if (o.flags) Object.assign(this.flags, o.flags);
      // 事件位掩码（轻量模式下也要记，供批量尾部分析）
      const evIdx = LS.events.INDEX[ev.id];
      if (evIdx != null) this.eventMask |= 1 << evIdx;
      // 职业资本年度增长
      const gain = (C.CAREER_CAPITAL_GAIN[s.career] || 0) * (1 + this.traitEff.capital);
      s.careerCapital = Math.max(0, s.careerCapital + gain);

      if (!this.light) {
        this.events.push({
          id: ev.id, category: ev.category, title: ev.title, icon: ev.icon,
          major: ev.major, age: s.age, probability: ev.probability,
          base: ev.base, factors: ev.factors, randomDraw: ev.randomDraw,
          distribution: ev.distribution, outcome: o,
        });
        if (o.chip) this.chips.push({ age: s.age, text: o.chip, tone: ev.major ? 'fate' : 'know' });
      }
    }

    /**
     * 生死判定：Gompertz 风险，健康差等价于"生理年龄更大"。
     * 返回 false 或 {p, cause}。
     */
    _deathCheck(rng) {
      const s = this.state;
      const L = C.LIFESPAN;
      const effAge = s.age + (100 - s.health) * L.healthWeight * 0.35;
      const p = L.baselineHazard * Math.exp(L.gompertzB * (effAge - 40));
      const pp = clamp(p, 0, 0.62);
      if (s.age >= L.absoluteMax) return { p: 1, cause: this._deathCause(rng, true) };
      if (s.age >= L.minAge && rng.next() < pp) return { p: pp, cause: this._deathCause(rng, false) };
      return false;
    }

    /**
     * 死亡原因：按年龄给出一个可信的、带一点叙事的原因。
     * 不是"47 岁被系统随机停掉"，而是具体的疾病或意外。
     */
    _deathCause(rng, natural) {
      if (natural) {
        return { key: 'aging', label: '自然衰老', note: '身体各项机能慢慢走到了尽头' };
      }
      const hadHealth = this.events.some((e) => e.id === 'health_issue');
      const hadCatastrophe = this.events.some((e) => e.id === 'catastrophe');
      const roll = rng.next();
      if (hadCatastrophe && roll < 0.5) {
        return { key: 'accident', label: '意外事故', note: '一场没有预兆的意外，来得很快' };
      }
      if (hadHealth && roll < 0.65) {
        return { key: 'illness', label: '长期疾病', note: '身体长期透支，最后没有撑住' };
      }
      const age = this.state.age;
      let pool;
      if (age < 40) {
        pool = [
          ['accident', '意外事故', '一场没有预兆的意外，来得很快', 30],
          ['cancer', '恶性肿瘤', '发现时已经太晚', 22],
          ['cardio', '心脑血管疾病', '突发心梗或脑卒中', 18],
          ['infection', '急性感染', '一场来得很快的重病', 15],
          ['other', '其他疾病', '身体突然出了状况', 15],
        ];
      } else if (age < 60) {
        pool = [
          ['cancer', '恶性肿瘤', '发现时已经太晚', 30],
          ['cardio', '心脑血管疾病', '突发心梗或脑卒中', 30],
          ['accident', '意外事故', '一场没有预兆的意外，来得很快', 15],
          ['illness', '长期疾病', '身体长期透支，最后没有撑住', 15],
          ['other', '其他疾病', '身体突然出了状况', 10],
        ];
      } else if (age < 80) {
        pool = [
          ['cardio', '心脑血管疾病', '突发心梗或脑卒中', 32],
          ['cancer', '恶性肿瘤', '发现时已经太晚', 28],
          ['illness', '长期疾病', '身体长期透支，最后没有撑住', 18],
          ['infection', '急性感染', '一场来得很快的重病', 12],
          ['organ', '器官衰竭', '身体慢慢走到了尽头', 10],
        ];
      } else {
        pool = [
          ['organ', '器官衰竭', '身体慢慢走到了尽头', 32],
          ['cardio', '心脑血管疾病', '心脏先一步停了下来', 26],
          ['cancer', '恶性肿瘤', '和病痛相处了很久', 18],
          ['infection', '急性感染', '一场来得很快的重病', 14],
          ['aging', '自然衰老', '像一盏灯慢慢熄灭', 10],
        ];
      }
      const total = pool.reduce((sum, x) => sum + x[3], 0);
      let pick = rng.next() * total;
      for (const [key, label, note, weight] of pool) {
        pick -= weight;
        if (pick <= 0) return { key, label, note };
      }
      const last = pool[pool.length - 1];
      return { key: last[0], label: last[1], note: last[2] };
    }

    /** 生成结果（五维 + 时间序列摘要） */
    result() {
      const s = this.state;
      const tier = CAREER_TIER[s.career] || 0.3;
      const achievement = clamp(
        100 *
          (0.30 * norm01(s.careerCapital, 0, 70) +
            0.28 * tier +
            0.22 * norm01(this.peakIncome, 0, 120) +
            0.20 * (this.flags.startupSuccess ? 1 : 0)),
        0, 100
      );
      const yrs = Math.max(1, this.yearsLived);
      const hYrs = Math.max(1, this.yearsHealth);
      const ws = this.world.summary();
      return {
        finalWealth: s.wealth,
        peakWealth: this.peakWealth,
        /* 五维：
             健康     = 65 岁前平均（健康维护水平，与寿命正相关）
             幸福     = 一生平均
             关系     = 一生平均
             事业成就 = 峰值型（职业层级 + 峰值收入 + 职业资本） */
        health: this.sumHealth / hYrs,
        happiness: this.sumHappiness / yrs,
        achievement,
        relationship: this.sumRelationship / yrs,
        /* 同时保留临终值，供时间序列与 hover 使用 */
        finalHealth: s.health,
        finalHappiness: s.happiness,
        finalRelationship: s.relationship,
        lifespan: s.age,
        deathCause: this.deathCause || null,
        finalCareer: s.career,
        careerLabel: C.CAREER_LABEL[s.career] || s.career,
        educationLabel: educationLabel(s.education),
        peakIncome: this.peakIncome,
        startupAttempts: this.startupAttempts,
        worldSummary: ws,
        majorEvents: this.events.filter((e) => e.major).length,
        bankruptcyCount: this.events.filter((e) => e.id === 'bankruptcy').length,
      };
    }
  }

  /* ============================================================
   * 驱动方式
   * ========================================================== */

  /** 完整记录版：极速人生 / 关键人生 */
  function runLife(params) {
    const sim = new Simulator({ ...params, light: false });
    const maxAge = (params.worldConfig && params.worldConfig.maxAge) || C.LIFESPAN.absoluteMax;
    let guard = 0;
    while (sim.state.alive && sim.state.age < maxAge && guard++ < 200) sim.step();
    return {
      id: params.id || uid('life'),
      worldSeed: sim.worldSeed,
      agentSeed: sim.agentSeed,
      character: sim.character,
      strategy: sim.strategy,
      mode: params.mode || 'fast',
      decisions: sim.decisions,
      states: sim.states,
      events: sim.events,
      chips: sim.chips,
      result: sim.result(),
      worldSummary: sim.world.summary(),
    };
  }

  /** 轻量版：只返回最终指标（供 10 万次批量模拟使用，规格书 §36.2） */
  function simulateLight(params) {
    const sim = new Simulator({ ...params, light: true });
    const maxAge = (params.worldConfig && params.worldConfig.maxAge) || C.LIFESPAN.absoluteMax;
    let guard = 0;
    while (sim.state.alive && sim.state.age < maxAge && guard++ < 200) sim.step();
    const r = sim.result();
    return {
      wealth: r.finalWealth,
      health: r.health,
      happiness: r.happiness,
      achievement: r.achievement,
      relationship: r.relationship,
      lifespan: r.lifespan,
      peakWealth: r.peakWealth,
      peakIncome: r.peakIncome,
      startupAttempts: r.startupAttempts,
      majorEvents: r.majorEvents,
      crisisYears: r.worldSummary ? r.worldSummary.crisisYears : 0,
      boomYears: r.worldSummary ? r.worldSummary.boomYears : 0,
      finalCareer: r.finalCareer,
      eventMask: sim.eventMask,
    };
  }

  LS.life = { Simulator, runLife, simulateLight, educationLabel, educationInfo, CAREER_TIER };
})(typeof globalThis !== 'undefined' ? globalThis : this);
