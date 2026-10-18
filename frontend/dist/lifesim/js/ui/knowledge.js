/* ============================================================
 * LifeSim · ui/knowledge.js
 * 三层知识解释系统（规格书 §30）
 *
 *   第一层 · 直觉比喻 —— 用生活经验理解概念
 *   第二层 · 数学定义 —— 给出可验证的正式定义与公式
 *   第三层 · 简化解释 —— 用本次模拟的具体数字说明
 *
 * 交互要求（§30.3）：默认只显示第一层，用户主动点击才展开。
 * "不要一上来就抛出公式" —— 学习负担会让人直接关闭页面。
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});

  /* ============================================================
   * 概念库
   * ========================================================== */
  const CONCEPTS = {

    /* ---------- 基础 ---------- */
    expected_value: {
      name: '期望值',
      ico: '⚖️',
      metaphor: '期望值不是"你大概会得到的数"，而是"如果把这条人生重演一万次，把所有结果加起来除以一万"。它可能是一个你永远不会真正经历的数字——比如子女数的期望是 1.2 个。',
      formal: 'E[X] = Σ xᵢ·P(X=xᵢ)（离散）或 ∫ x·f(x)dx（连续）。期望是线性算子：E[aX+bY] = aE[X] + bE[Y]，且不需要 X、Y 独立。',
      simple: '把每个可能结果乘以它的概率，再加起来。注意：期望值不一定是"可能值"（掷骰子期望 3.5），也不代表最可能发生的结果。',
    },

    variance: {
      name: '方差与标准差',
      ico: '📏',
      metaphor: '两个人均资产都是 500 万：一个人每年稳定 20 万，另一个人九年亏损最后一年翻盘。期望值一样，但"人生的晃动幅度"完全不同。方差衡量的就是这种晃动。',
      formal: 'Var(X) = E[(X−μ)²] = E[X²] − μ²，标准差 σ = √Var(X)。切比雪夫不等式：P(|X−μ| ≥ kσ) ≤ 1/k²。',
      simple: '方差是"离平均值的距离平方的平均"。因为平方了，极端值的影响被放大。标准差是它的平方根，单位和原始数据相同，所以更好读。',
    },

    law_of_large_numbers: {
      name: '大数定律',
      ico: '📚',
      metaphor: '抛 10 次硬币可能出现 8 次正面，你会觉得"硬币有问题"。抛 10,000 次，正面比例几乎必然贴近 50%。单次人生可以极端，但大量平行人生会收敛到真实概率。',
      formal: '弱大数定律：对独立同分布且 E|X| < ∞ 的序列，∀ε>0，P(|X̄ₙ − μ| > ε) → 0（n→∞）。收敛速度典型为 O(1/√n)。',
      simple: '样本越多，样本平均越接近真实期望。所以本软件重演次数越多，结论越稳定——这不是软件变准了，是你在做更可信的实验。',
    },

    monte_carlo: {
      name: '蒙特卡洛方法',
      ico: '🎲',
      metaphor: '想知道一个不规则池塘的面积？往里随机扔一万颗石子，数有多少颗落在池塘里，乘以总面积。我们不知道人生的解析解，但可以扔很多次骰子。',
      formal: '用样本均值估计期望：μ̂ = (1/N)ΣXᵢ，标准误 SE = σ/√N。估计误差随 N 增大按 1/√N 下降。',
      simple: '当问题复杂到写不出公式（比如"35 岁失业又遇到经济危机"的联合概率），就用大量随机模拟来逼近答案。',
    },

    /* ---------- 分布 ---------- */
    normal: {
      name: '正态分布',
      ico: '🔔',
      metaphor: '全班身高：大多数人中等，特别高和特别矮的都很少，画出来是钟形。很多"多个小因素叠加"的量都近似正态。',
      formal: 'f(x) = 1/(σ√(2π)) · exp(−(x−μ)²/(2σ²))，记作 X ~ N(μ, σ²)。68% 落在 μ±σ，95% 落在 μ±2σ。',
      simple: '由均值 μ 和标准差 σ 决定。人生中的能力、健康基线这类"多因素合成量"常用它描述。',
    },

    lognormal: {
      name: '对数正态分布',
      ico: '📈',
      metaphor: '收入、房价、公司估值都有一个共同点：下限被 0 挡住，但上限可以非常高。所以分布是"右偏"的——大多数人集中在中低区间，极少数人高得离谱。',
      formal: '若 ln X ~ N(μ, σ²)，则 X ~ LogNormal(μ, σ²)。E[X] = e^(μ+σ²/2)，中位数 = e^μ。注意 E[X] > 中位数，σ 越大差距越大。',
      simple: '取对数后是正态分布。关键含义：财富的均值和中位数会差很远，"平均收入"高于"典型收入"。所以本软件同时报告两者。',
    },

    heavy_tail: {
      name: '厚尾与极端事件',
      ico: '🦢',
      metaphor: '如果人生是正态分布，那"白手起家成为亿万富翁"应该几乎不会发生。但现实中它确实发生——因为创业收益是厚尾的：绝大多数归零，极小概率获得极大回报。',
      formal: '厚尾分布（如幂律）：P(X > x) ~ x^(−α)。当 α 较小时方差可能不存在或极大，中心极限定理收敛极慢。',
      simple: '厚尾意味着"罕见事件"对整体结果的贡献不可忽略。这就是为什么期望值由极少数样本决定，也是为什么必须做大量模拟才能看到它们。',
    },

    /* ---------- 概率逻辑 ---------- */
    probability_vs_outcome: {
      name: '概率 ≠ 结果',
      ico: '🎯',
      metaphor: '天气预报说"70% 下雨"，结果没下雨。预报错了吗？没有。70% 的意思是：同样的天气条件下，十次里有七次会下雨。概率描述的是过程，不是单次结局。',
      formal: '频率解释：P(A) = lim_{n→∞} n_A/n。单次试验结果与 P(A) 不矛盾，只要它落在概率为正的结果集合里。',
      simple: '30% 的成功率失败了，不代表决策错了。评价决策要看"在同样信息下重复一万次"，而不是看这一次的结果。这正是本软件存在的意义。',
    },

    independence: {
      name: '独立性',
      ico: '🔗',
      metaphor: '抛两枚硬币，第一枚的结果不会"告诉"你第二枚。但如果第一枚是"下雨"，第二枚是"带伞"，那就不独立了。',
      formal: 'A 与 B 独立 ⟺ P(A∩B) = P(A)·P(B) ⟺ P(A|B) = P(A)。n 个事件相互独立要求所有子集都满足乘法法则。',
      simple: '独立时概率可以直接相乘。但真实人生中很多事件是相关的（失业和收入下降），所以本软件用条件概率而不是简单相乘。',
    },

    conditional_probability: {
      name: '条件概率',
      ico: '❓',
      metaphor: '"我会成功吗？"这个问题的答案取决于你问的是谁。问全体人是一个数，问"已经创业成功的人"完全是另一个数。条件改变了样本空间。',
      formal: 'P(A|B) = P(A∩B)/P(B)，要求 P(B) > 0。乘法法则：P(A∩B) = P(B)·P(A|B)。',
      simple: '"在已知 B 发生的条件下 A 发生的概率"。本软件的多因素联动（如失业 → 收入下降）就是条件概率的串联。',
    },

    bayes: {
      name: '贝叶斯更新',
      ico: '🔄',
      metaphor: '医生看到检查阳性，不会立刻断定你有病——因为这种病本身很罕见。他会先看"这个人群得病的基础概率"，再用检查结果去修正它。这就是贝叶斯思维：先验 + 证据 = 后验。',
      formal: 'P(H|E) = P(E|H)·P(H) / P(E) = P(E|H)P(H) / [P(E|H)P(H) + P(E|¬H)P(¬H)]。',
      simple: '新证据不会凭空产生结论，它只是在修正你原来的信念。如果先验极小，即使证据很强，后验也可能不高——这是"假阳性悖论"的本质。',
    },

    markov: {
      name: '马尔可夫链',
      ico: '⛓️',
      metaphor: '经济明年好不好，主要看今年是什么状态——繁荣更可能继续繁荣，衰退更可能继续衰退。你不需要知道过去二十年的全部历史，只需要知道"现在在哪"。',
      formal: '满足马尔可夫性：P(X_{n+1}=j | X_n=i, X_{n−1}, …) = P(X_{n+1}=j | X_n=i)。转移矩阵 P 满足每行和为 1。n 步分布：π_n = π_0 P^n。',
      simple: '一种"只看当前状态决定下一步"的随机过程。无记忆性既是它的简化，也是它好用的原因。',
    },

    stationary: {
      name: '平稳分布',
      ico: '🌊',
      metaphor: '反复洗牌，无论你从什么顺序开始，洗够多次后牌的顺序分布都会趋于同一种"完全随机"。平稳分布就是这个"洗到最后的样子"。',
      formal: '若 πP = π 且 Σπᵢ = 1，则 π 为平稳分布。不可约、非周期、正常返的链必存在唯一平稳分布，且 π_n → π。',
      simple: '长期来看，系统停留在每个状态的时间比例。本软件用它计算"人生中大约多少比例的时间处于经济危机"。',
    },

    /* ---------- 统计推断 ---------- */
    percentile: {
      name: '百分位',
      ico: '📊',
      metaphor: '"你在同龄人中排前 10%"比"你的收入是 47.3 万"有用得多。百分位把绝对数字翻译成相对位置。',
      formal: '第 p 百分位 = 使至少 p% 的观测值 ≤ 该值的最小值。等价于累积分布函数的反函数：q_p = F⁻¹(p)。',
      simple: '把全体平行人生从低到高排队，你在第几个。p05 表示"有 5% 的人生比这更差"。',
    },

    confidence_interval: {
      name: '置信区间',
      ico: '📐',
      metaphor: '你量了十次身高得到平均值 175，但你知道再量十次会得到 174.8。所以报"175 ± 0.5"比只报 175 更诚实。',
      formal: 'μ̂ ± z_{1−α/2} · σ/√N。95% 置信区间的含义是：重复抽样构造的区间中约 95% 会覆盖真值（不是说真值有 95% 概率落在本区间内）。',
      simple: '模拟次数越多，区间越窄。所以本软件在结果页给出不确定度——避免你过度解读 1000 次模拟的差异。',
    },

    selection_bias: {
      name: '幸存者偏差',
      ico: '🕳️',
      metaphor: '统计"成功创业者有什么共同点"时，你只看到了活下来的公司，没看到用同样方法失败的一万家。样本从产生那一刻就被筛选过了。',
      formal: '设 S 为"被观测到"事件。观测样本服从 P(·|S)，而非 P(·)。若 S 与结果相关，则样本估计有偏。',
      simple: '当样本只包含"幸存下来的"，结论就会系统性偏乐观。本软件包含失败人生，所以能看到完整的分布——包括 3.4% 的破产者。',
    },

    regression_to_mean: {
      name: '均值回归',
      ico: '↩️',
      metaphor: '今年业绩最差的部门，明年大概率会"改善"——不是因为他们努力了，而是因为极端本来就难持续。',
      formal: '若 X、Y 为同一分布下两次测量，相关系数 ρ < 1，则 E[Y | X = x] = μ + ρ(x − μ)。x 极端的样本，Y 的条件期望更靠近 μ。',
      simple: '极端结果之后通常会回到接近平均的水平，这是统计效应，不是因果。评估任何干预效果时都要警惕它。',
    },

    /* ---------- 风险 ---------- */
    var_cvar: {
      name: 'VaR 与 CVaR',
      ico: '🚨',
      metaphor: 'VaR 回答"最差的 5% 从哪个数开始"，CVaR 回答"如果真掉进那最差的 5%，平均会有多惨"。前者是门槛，后者是深度。',
      formal: 'VaR_α = inf{x : P(L > x) ≤ 1−α}（损失分布的上分位点）。CVaR_α = E[L | L ≥ VaR_α]，即尾部条件期望。CVaR 是一致风险度量，VaR 不是（不满足次可加性）。',
      simple: '只看最坏值会被单个极端样本误导，所以要看尾部平均值。本软件的风险页同时给出两者。',
    },

    ruin: {
      name: '破产风险',
      ico: '💀',
      metaphor: '一个胜率 51% 的游戏，只要下注比例过大，长期仍必然破产——因为你的本金有限，而亏损会剥夺你继续下注的能力。',
      formal: '经典赌徒破产问题：公平游戏下，起始资金 i、目标 N 的破产概率为 1 − i/N。带吸收壁的随机游走中，P(到达 0) 随步数增加趋于 1（若不设正向吸收壁）。',
      simple: '有吸收边界（本金归零就出局）时，期望值不再是唯一重要的东西——存活概率本身就是关键指标。这是本软件把"破产"单列为结局的原因。',
    },

    correlation: {
      name: '相关性',
      ico: '🧲',
      metaphor: '冰淇淋销量和溺水人数高度相关——不是因为冰淇淋导致溺水，而是因为两者都随夏天上升。相关不等于因果。',
      formal: 'Pearson r = Cov(X,Y)/(σ_X σ_Y) ∈ [−1,1]，只度量线性关系。Spearman ρ 基于秩，度量单调关系，对异常值更稳健。',
      simple: 'r 接近 0 不代表无关，可能只是非线性；r 很大也不代表因果。本软件同时给 Pearson 与 Spearman，并在热力图里标注这一点。',
    },

    sensitivity: {
      name: '参数敏感性',
      ico: '🎛️',
      metaphor: '一道菜同时加盐和加糖，咸味主要被盐控制。如果一个参数怎么调结果都差不多，它就不值得你纠结。',
      formal: '局部敏感度 S = ∂E[Y]/∂θ ≈ [E[Y|θ+Δ] − E[Y|θ−Δ]] / (2Δ)。标准化后可用弹性 ∂lnE[Y]/∂lnθ 比较不同量纲的参数。',
      simple: '一次只动一个参数，看结果变多少。本软件用热力图展示两个参数同时变化的联合影响，帮你找到"最值得改变的杠杆"。',
    },

    sampling: {
      name: '抽样与代表性',
      ico: '🧪',
      metaphor: '想了解一锅汤的味道，搅匀后尝一勺就够。但如果你只尝了表面的油，得到的结论就是错的。',
      formal: '简单随机抽样是无偏的：E[X̄] = μ。分层抽样可降低方差；有偏抽样（如只取极端样本）则产生系统误差。',
      simple: '本软件的"平行人生"就是随机抽样。结果页允许你浏览具体样本，但要记住：单个样本永远不能代表总体。',
    },

    /* ---------- 人生模型专属 ---------- */
    compounding: {
      name: '复利与路径依赖',
      ico: '🌱',
      metaphor: '25 岁存下的 10 万，到 60 岁可能变成 100 万；35 岁存下的同样 10 万，可能只有 40 万。时间本身就是一种资本。',
      formal: '终值 FV = PV·(1+r)^n。连续情形 FV = PV·e^(rn)。路径依赖：结果不仅取决于终点状态，还取决于到达路径。',
      simple: '早期的小差异会被时间指数放大。这也是"早开始"在人生模型中收益极高的原因，也解释了为什么本模型里初始几年的决策权重特别大。',
    },

    decision_theory: {
      name: '不确定性下的决策',
      ico: '🧭',
      metaphor: '过马路时你不会等"绝对安全"再走，也不会闭眼冲过去。你评估风险、收益和时间成本，然后选一个"足够好"的行动。人生决策也是这样。',
      formal: '最大化期望效用：argmax_a E[U(X_a)]。风险厌恶对应凹效用函数（詹森不等式：E[U(X)] < U(E[X])）。风险中性取 U(x)=x。',
      simple: '理性决策不是"追求确定的好结果"，而是在不知道结果的情况下选择期望效用最高的行动。不同人对同一结果的效用不同——这就是性格参数的意义。',
    },

    survivorship_life: {
      name: '平行人生与反事实',
      ico: '🌌',
      metaphor: '我们只能活一次，所以永远无法知道"当年如果选了另一条路会怎样"。平行人生是把这个反事实问题变成可计算的问题。',
      formal: '反事实推断：在相同随机种子下只改变处理变量 T，则 Y(1) − Y(0) 为个体处理效应；其期望 ATE = E[Y(1) − Y(0)]。',
      simple: '本软件允许你"锁定命运种子，改变选择"——保留所有随机事件，只换策略。这样两次模拟的差异就纯粹来自你的选择，而不是运气。',
    },
  };

  /* ============================================================
   * 组件：知识卡（三层折叠）
   * ========================================================== */

  const LEVELS = [
    { key: 'metaphor', icon: '💬', title: '直觉比喻', sub: '先感受一下' },
    { key: 'formal', icon: '∑', title: '数学定义', sub: '正式表述' },
    { key: 'simple', icon: '🧩', title: '简化解释', sub: '说人话' },
  ];

  /**
   * 内联知识卡。默认只展示第一层的摘要，点击标题展开。
   * @param {string} id 概念 id
   * @param {object} opts { defaultOpen: 0|1|2|'all'|false, compact: boolean }
   */
  function knowledgeCard(id, opts = {}) {
    const c = CONCEPTS[id];
    if (!c) return LS.dom.h('div');
    const { compact, defaultOpen = false } = opts;
    const body = LS.dom.h('div.k-levels');

    const items = LEVELS.map((lv, i) => {
      const isOpen = defaultOpen === 'all' || defaultOpen === i;
      const content = LS.dom.h('div.k-body', { style: { display: isOpen ? 'block' : 'none' } }, [
        LS.dom.h('div.k-formal', c[lv.key]),
      ]);
      const row = LS.dom.h('div.k-level', [
        LS.dom.h('button.k-head', {
          type: 'button',
          onclick: () => {
            const open = content.style.display !== 'none';
            content.style.display = open ? 'none' : 'block';
            row.classList.toggle('open', !open);
          },
        }, [
          LS.dom.h('span.k-ico', lv.icon),
          LS.dom.h('span.k-title', lv.title),
          LS.dom.h('span.k-sub', lv.sub),
          LS.dom.h('span.k-arrow', '▾'),
        ]),
        content,
      ]);
      if (isOpen) row.classList.add('open');
      return row;
    });
    body.appendChild(LS.dom.h('div.k-level-list', items));

    if (LS.store) LS.store.seeCodex('concept:' + id);

    return LS.dom.h('div.knowledge' + (compact ? '.compact' : ''), [
      LS.dom.h('div.k-top', [
        LS.dom.h('span.k-icon', c.ico),
        LS.dom.h('span.k-name', c.name),
        LS.dom.h('span.chip.know', '知识'),
      ]),
      LS.dom.h('div.k-lead', c.metaphor),
      body,
    ]);
  }

  /** 概念弹层：结果页"为什么会这样？"的落点 */
  function explain(id, opts = {}) {
    const c = CONCEPTS[id];
    if (!c) return null;
    return LS.ui.modal({
      title: (c.ico || '') + ' ' + c.name,
      sub: '三层解释 · 规格书 §30',
      size: 'lg',
      body: [
        LS.dom.h('div.knowledge', [
          LS.dom.h('div.k-levels', [
            LS.dom.h('div.k-level-list', LEVELS.map((lv) => LS.dom.h('div.k-level.open', [
              LS.dom.h('div.k-head', { style: { cursor: 'default' } }, [
                LS.dom.h('span.k-ico', lv.icon),
                LS.dom.h('span.k-title', lv.title),
                LS.dom.h('span.k-sub', lv.sub),
              ]),
              LS.dom.h('div.k-body', { style: { display: 'block' } },
                LS.dom.h('div.k-formal', c[lv.key])),
            ]))),
          ]),
        ]),
        opts.extra || null,
      ].filter(Boolean),
    });
  }

  /** 极简提示（用于 hover / 角落） */
  function hint(id, text) {
    const c = CONCEPTS[id];
    return LS.dom.h('span.k-hint', {
      title: c ? c.name + '：' + c.metaphor.slice(0, 60) + '…' : (text || ''),
      onclick: () => explain(id),
    }, LS.dom.h('span', '?'));
  }

  /** 术语小注：正文里出现的名词，点一下看解释 */
  function term(id) {
    const c = CONCEPTS[id];
    if (!c) return id;
    return LS.dom.h('span.k-term', { onclick: () => explain(id) }, c.name);
  }

  function list() {
    return Object.keys(CONCEPTS).map((k) => ({ id: k, ...CONCEPTS[k] }));
  }

  function get(id) { return CONCEPTS[id]; }

  /** 根据当前模拟结果挑选"最该解释"的概念（结果页用） */
  function relevant(result) {
    const out = ['expected_value', 'law_of_large_numbers'];
    if (!result) return out;
    if (result.metrics) {
      if (result.metrics.wealth && result.metrics.wealth.sd > result.metrics.wealth.mean * 0.8) {
        out.push('lognormal', 'heavy_tail');
      }
      if (result.metrics.bankruptcyRate > 0.01) out.push('ruin');
    }
    out.push('percentile', 'probability_vs_outcome');
    return Array.from(new Set(out));
  }

  LS.knowledge = {
    CONCEPTS, LEVELS, card: knowledgeCard, explain, hint, term, list, get, relevant,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
