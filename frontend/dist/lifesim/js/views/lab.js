/* ============================================================
 * LifeSim · views/lab.js
 * 概率实验室（规格书 §15 ~ §19）
 *
 * 五个子实验室，每个都只教一件事，并且都做到"可以动手验证"：
 *   /lab/law          大数定律 —— 样本量如何战胜随机性
 *   /lab/bayes        贝叶斯   —— 先验 + 证据 = 后验
 *   /lab/markov       马尔可夫 —— 无记忆过程与平稳分布
 *   /lab/sensitivity  敏感性   —— 哪个参数才是真正的杠杆
 *   /lab/dist         分布百科 —— 九种分布的形态与用途
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const V = LS.views;
  const { h, mount } = LS.dom;
  const U = LS.util;
  const C = LS.config;
  const D = LS.distributions;

  function gap(x) { return h('div', { style: { height: x || 'var(--s-5)' } }); }

  /* ============================================================
   * 实验室首页
   * ========================================================== */
  const LABS = [
    {
      path: '/lab/law', icon: '📉', title: '大数定律',
      desc: '为什么"多跑几次"真的有用？亲手看样本均值收敛到真实概率的过程。',
      tag: '约 20 秒',
      glow: 'rgba(124,92,255,0.26)', line: 'rgba(167,139,250,0.5)',
    },
    {
      path: '/lab/bayes', icon: '🔄', title: '贝叶斯更新',
      desc: '检测阳性就真的患病了吗？亲手算一遍"基础比率谬误"。',
      tag: '即时出结果',
      glow: 'rgba(45,212,191,0.22)', line: 'rgba(45,212,191,0.5)',
    },
    {
      path: '/lab/markov', icon: '⛓️', title: '马尔可夫链',
      desc: '只看当前状态就够了吗？观察经济周期如何收敛到平稳分布。',
      tag: '约 5 秒',
      glow: 'rgba(96,165,250,0.22)', line: 'rgba(96,165,250,0.5)',
    },
    {
      path: '/lab/sensitivity', icon: '🎛️', title: '参数敏感性',
      desc: '哪个滑块才是真正的杠杆？用热力图扫描两个参数的全部组合。',
      tag: '约 15 秒',
      glow: 'rgba(245,200,96,0.22)', line: 'rgba(245,200,96,0.5)',
    },
    {
      path: '/lab/dist', icon: '🧮', title: '分布百科',
      desc: '九种概率分布的形态、公式与适用场景，附带随机抽样直观对照。',
      tag: '交互式',
      glow: 'rgba(192,132,252,0.22)', line: 'rgba(192,132,252,0.5)',
    },
  ];

  function renderHub() {
    const opened = LS.store.state.stats.distributionsOpened || 0;
    return V.render({ title: '概率实验室', sub: '实验 · 验证 · 理解', fate: null }, [
      V.head({
        kicker: '实验室',
        title: '把概率论从公式变成可以动手的东西',
        sub: '这里的每一个实验都可以反复重做。你不需要相信我说的结论 —— 你可以自己验证它。',
        tight: true,
      }),
      h('div.mode-grid', LABS.map((l) => LS.ui.modeCard({
        ...l,
        hint: '进入实验 →',
        onClick: () => LS.router.go(l.path),
      }))),
      gap(),
      h('div.grid.g-3', ['law_of_large_numbers', 'bayes', 'markov', 'sensitivity', 'monte_carlo', 'expected_value']
        .map((id) => LS.knowledge.card(id, { compact: true }))),
      gap(),
      h('div.card', [
        h('div.row.between.wrap', [
          h('div', [
            h('div.card-title', '实验室进度'),
            h('div.card-sub', '每完成一个实验都会提升对概率的直觉 —— 也会解锁成就'),
          ]),
          LS.ui.chip('已查看 ' + opened + ' / 9 种分布', opened >= 9 ? 'ok' : 'ghost'),
        ]),
        h('div', { style: { marginTop: 'var(--s-4)' } },
          h('div.ach-grid', LS.meta.byTier().bronze.filter((a) =>
            /converge|bayes|markov_walk|sensitivity|dist_all/.test(a.id)).map((a) =>
            h('div.ach-item' + (a.got ? '.done' : ''), [
              h('span.ai-ico', a.got ? a.icon : '🔒'),
              h('div', [
                h('div.ai-name', a.name),
                h('div.ai-desc', a.desc),
              ]),
            ])))),
      ]),
    ]);
  }

  /* ============================================================
   * 1. 大数定律
   * ========================================================== */
  function renderLaw() {
    let p = 0.5;
    let maxN = 10000;
    let seed = 20240101;
    let result = null;

    const elChart = h('div');
    const elBody = h('div');

    function compute() {
      const rng0 = new LS.rng.Rng(seed);
      const experiments = [0, 1, 2].map((k) => {
        const rng = new LS.rng.Rng(LS.rng.derive(seed, 'exp' + k));
        const points = [];
        const checkpoints = new Set();
        const k1 = Math.round(maxN / 240);
        for (let i = 1; i <= maxN; i *= 1.06) checkpoints.add(Math.max(1, Math.round(i)));
        for (let i = k1; i <= maxN; i += k1) checkpoints.add(i);
        checkpoints.add(maxN);
        const list = Array.from(checkpoints).sort((a, b) => a - b);
        let sum = 0, si = 0;
        for (let i = 1; i <= maxN; i++) {
          if (rng.next() < p) sum++;
          if (si < list.length && i === list[si]) {
            const mean = sum / i;
            const se = Math.sqrt(Math.max(1e-12, mean * (1 - mean)) / i);
            points.push({ n: i, mean, lo: mean - 1.96 * se, hi: mean + 1.96 * se });
            si++;
          }
        }
        return { label: '第 ' + (k + 1) + ' 次实验', color: ['#a78bfa', '#2dd4bf', '#f5c860'][k], points };
      });
      // 最后一次的抽样结果（用于表格）
      const last = experiments[experiments.length - 1].points;
      const finalMean = last[last.length - 1].mean;
      return {
        experiments,
        finalMean,
        points: last,
        truth: p,
        se: Math.sqrt(Math.max(1e-12, finalMean * (1 - finalMean)) / maxN),
      };
    }

    function rebuild() {
      result = compute();
      mount(elChart, []);
      mount(elBody, [body()]);
      requestAnimationFrame(() => {
        LS.charts.replace(elChart, 'convergence', {
          series: result.experiments,
          truth: p,
          truthLabel: '真实概率 p = ' + U.fixed(p, 2),
          yFmt: (v) => U.fixed(v, 2),
          showBand: true,
        });
      });
      LS.shell.refreshBadges();
    }

    function body() {
      const r = result;
      const rows = [10, 100, 1000, 10000, 100000].filter((n) => n <= maxN).map((n) => {
        // 找到最接近 n 的检查点
        let best = r.points[0];
        for (const q of r.points) if (Math.abs(q.n - n) < Math.abs(best.n - n)) best = q;
        const err = Math.abs(best.mean - p);
        const bound = 1 / Math.sqrt(best.n);
        return [
          U.int(best.n),
          U.fixed(best.mean, 4),
          U.fixed(err, 4),
          U.fixed(bound, 4),
          err < bound ? '✓ 在界内' : '✗ 超出',
        ];
      });
      return h('div', [
        h('div.grid.g-3', [
          LS.ui.metric({
            label: '真实概率 p', value: U.fixed(p, 2), size: 'lg', tone: 'gold',
            note: '这就是我们要估计的目标',
          }),
          LS.ui.metric({
            label: '实验结果', value: U.fixed(r.finalMean, 4), size: 'lg', tone: 'fate',
            note: maxN.toLocaleString() + ' 次抽样后的频率',
          }),
          LS.ui.metric({
            label: '绝对误差', value: U.fixed(Math.abs(r.finalMean - p), 4), size: 'lg',
            tone: Math.abs(r.finalMean - p) < 0.02 ? 'ok' : 'warn',
            note: '理论误差界 ≈ 1/√n = ' + U.fixed(1 / Math.sqrt(maxN), 4),
          }),
        ]),
        gap('var(--s-4)'),
        LS.ui.card({
          title: '误差收敛表',
          sub: '统计里最实用的一个经验：误差按 1/√n 缩小',
          body: [
            LS.ui.table(
              ['样本量 n', '样本频率', '与真实值的差', '1/√n 上界', '是否满足'],
              rows,
              { align: ['right', 'right', 'right', 'right', 'left'] },
            ),
            h('div', { style: { height: 'var(--s-3)' } }),
            LS.ui.notice([
              '注意最后一列：每次都是"在界内"吗？不一定。',
              h('br'),
              '1/√n 只是一个尺度参考，不是硬保证。真正严格的界来自切比雪夫不等式，它更宽松（1/(nε²)）。',
            ], 'know'),
            h('div', { style: { marginTop: 'var(--s-3)' } }),
            h('div.row.gap-2.wrap', [
              LS.ui.button('为什么会 1/√n 收敛？', {
                variant: 'ghost', size: 'sm',
                onClick: () => LS.knowledge.explain('law_of_large_numbers'),
              }),
              LS.ui.button('什么是标准误', {
                variant: 'ghost', size: 'sm',
                onClick: () => LS.knowledge.explain('confidence_interval'),
              }),
            ]),
          ],
        }),
        gap('var(--s-4)'),
        LS.ui.card({
          title: '三件值得注意的事',
          body: [
            h('div.grid.g-3', [
              explain('早期非常不稳', 'n=10 时频率可能离 0.5 很远，甚至出现 0.8。这不代表硬币有问题 —— 小样本本来就噪声大。'),
              explain('三条曲线各走各的', '三次实验在早期差异明显，但都在收敛。这就是"单次结果不可靠，多次平均才可靠"。'),
              explain('尾部仍然有波动', '即使在 n=10,000，频率仍会在 0.5 附近小幅摆动。收敛是"趋于"，不是"到达"。'),
            ]),
          ],
        }),
      ]);
    }

    function explain(title, text) {
      return h('div', [
        h('div.card-title', { style: { fontSize: '13.5px' } }, title),
        h('p', { style: { fontSize: 'var(--f-sm)', color: 'var(--t-2)', lineHeight: '1.7', marginTop: '6px' } }, text),
      ]);
    }

    const page = V.render({ title: '大数定律', sub: '实验室 · 大数定律', fate: null }, [
      V.head({
        kicker: '实验一 · 大数定律',
        title: '样本越多，随机性就越听话',
        sub: '我们在这里做的是一次"伯努利试验"：每次以概率 p 成功。你会看到样本频率如何一步步逼近真实概率 p。',
        tight: true,
        actions: [LS.ui.button('← 返回实验室', { variant: 'ghost', size: 'sm', onClick: () => LS.router.go('/lab') })],
      }),
      LS.ui.card({
        title: '实验参数',
        body: [
          h('div.grid.g-3', [
            h('div', [LS.ui.slider({
              name: '真实概率 p', icon: '🎯', left: '0.05', right: '0.95',
              min: 0.05, max: 0.95, step: 0.05, value: p,
              fmt: (v) => U.fixed(v, 2),
              onChange: (v) => { p = v; rebuild(); },
            })]),
            h('div', [
              h('div', { style: { fontSize: 'var(--f-xs)', color: 'var(--t-3)', marginBottom: '8px' } }, '最大样本量'),
              LS.ui.segmented(
                [{ value: 1000, label: '1,000' }, { value: 10000, label: '10,000' }, { value: 100000, label: '100,000' }],
                maxN, (v) => { maxN = v; rebuild(); }),
            ]),
            h('div.row.gap-2', { style: { alignItems: 'flex-end' } }, [
              LS.ui.button('换一组随机数', {
                variant: 'ghost',
                onClick: () => { seed = (Math.floor(Math.random() * 899999) + 100000) >>> 0; rebuild(); },
              }),
            ]),
          ]),
        ],
      }),
      gap('var(--s-4)'),
      LS.ui.chartCard({
        title: '样本频率的收敛过程',
        sub: '横轴为模拟次数（对数轴）· 阴影为 95% 置信带 · 金色虚线是真实概率',
        minHeight: 360,
        body: elChart,
      }),
      gap(),
      elBody,
      gap(),
      LS.ui.card({
        title: '这一页涉及的概念',
        body: h('div.grid.g-3', ['law_of_large_numbers', 'sampling', 'confidence_interval']
          .map((id) => LS.knowledge.card(id, { compact: true }))),
      }),
    ]);

    rebuild();
    LS.meta.evaluateAndToast({ kind: 'law', state: LS.store.state });
    return page;
  }

  /* ============================================================
   * 2. 贝叶斯
   *   (a) 离散贝叶斯：基础比率谬误
   *   (b) 共轭先验：Beta–Bernoulli 更新（规格书 §52.2）
   *
   * 数值部分（Beta 分位数）在 core/distributions.js 里，视图只负责呈现。
   * ========================================================== */
  const betaQuantile = (a, b, q) => D.betaQuantile(a, b, q);

  function renderBayes() {
    let prior = 0.001;        // 患病率
    let sensitivity = 0.99;   // 检出率 P(阳性|患病)
    let falsePositive = 0.05; // 假阳性 P(阳性|健康)
    let tests = 1;
    // Beta–Bernoulli 部分
    let alpha0 = 2, beta0 = 2;   // 先验 Beta(α, β)
    let successes = 7, trials = 10; // 观测：10 次里成功 7 次

    const elChart = h('div');
    const elBody = h('div');
    const elPrior = h('div');
    const elPost = h('div');
    const elBeta = h('div');

    function posteriorFor(pr, se, fp, times) {
      let post = pr;
      for (let i = 0; i < times; i++) {
        const pE = se * post + fp * (1 - post);
        post = (se * post) / (pE || 1e-12);
      }
      return post;
    }

    function rebuild() {
      const post = posteriorFor(prior, sensitivity, falsePositive, tests);
      const pE = sensitivity * prior + falsePositive * (1 - prior);
      mount(elChart, []);
      mount(elBody, [body(post, pE)]);
      requestAnimationFrame(() => {
        LS.charts.replace(elChart, 'bayes', {
          prior, sensitivity, falsePositive, posterior: post,
          population: 1000,
        });
      });
      rebuildBeta();
    }

    /* ---------- Beta–Bernoulli 共轭更新 ---------- */
    function rebuildBeta() {
      const a0 = alpha0, b0 = beta0;
      const a1 = a0 + successes, b1 = b0 + (trials - successes);
      const priorDist = D.beta;
      const mk = (host, a, b, color, label) => {
        mount(host, []);
        requestAnimationFrame(() => {
          LS.charts.replace(host, 'density', {
            dist: priorDist,
            params: { a, b },
            mode: 'pdf',
            color,
            marks: [
              { value: a / (a + b), label: label + ' 均值 ' + U.fixed(a / (a + b), 3), color: '#f5c860' },
              { value: betaQuantile(a, b, 0.025), label: '2.5%', color: '#93c5fd' },
              { value: betaQuantile(a, b, 0.975), label: '97.5%', color: '#93c5fd' },
            ],
          });
        });
      };
      mk(elPrior, a0, b0, '#60a5fa', '先验');
      mk(elPost, a1, b1, '#2dd4bf', '后验');

      const meanPrior = a0 / (a0 + b0);
      const meanPost = a1 / (a1 + b1);
      const lo = betaQuantile(a1, b1, 0.025);
      const hi = betaQuantile(a1, b1, 0.975);
      const mle = trials > 0 ? successes / trials : 0;

      mount(elBeta, [
        LS.ui.card({
          title: '共轭先验：Beta–Bernoulli 更新',
          sub: '当先验是 Beta、观测是伯努利试验时，后验仍然是 Beta —— 这就是"共轭"',
          body: [
            h('div.grid.g-3', [
              LS.ui.slider({
                name: '先验 α', icon: '𝛼', left: '0.5', right: '20',
                min: 0.5, max: 20, step: 0.5, value: a0,
                fmt: (v) => U.fixed(v, 1),
                onChange: (v) => { alpha0 = v; rebuildBeta(); },
              }),
              LS.ui.slider({
                name: '先验 β', icon: '𝛽', left: '0.5', right: '20',
                min: 0.5, max: 20, step: 0.5, value: b0,
                fmt: (v) => U.fixed(v, 1),
                onChange: (v) => { beta0 = v; rebuildBeta(); },
              }),
              h('div', [
                h('div', { style: { fontSize: 'var(--f-xs)', color: 'var(--t-3)', marginBottom: '8px' } },
                  '看直播式的 A/B 测试'),
                LS.ui.slider({
                  name: '观测次数 n（成功 ' + successes + ' 次）', icon: '🧪',
                  left: '0', right: '200', min: 0, max: 200, step: 1, value: trials,
                  fmt: (v) => U.fixed(v, 0) + ' 次',
                  onChange: (v) => {
                    trials = Math.round(v);
                    if (successes > trials) successes = trials;
                    rebuildBeta();
                  },
                }),
                h('div', { style: { marginTop: '8px' } },
                  LS.ui.slider({
                    name: '其中成功次数 k', icon: '✅', left: '0', right: '200',
                    min: 0, max: 200, step: 1, value: successes,
                    fmt: (v) => U.fixed(v, 0) + ' 次',
                    onChange: (v) => {
                      successes = Math.min(Math.round(v), trials);
                      rebuildBeta();
                    },
                  })),
              ]),
            ]),
            gap('var(--s-4)'),
            h('div.card', [
              h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: '15px', lineHeight: '1.9' } }, [
                '先验  Beta(' + U.fixed(a0, 1) + ', ' + U.fixed(b0, 1) + ')',
                h('br'),
                '观测  n = ' + trials + '，k = ' + successes
                  + '（失败 ' + (trials - successes) + ' 次）',
                h('br'),
                h('b', { style: { color: 'var(--c-teal)' } },
                  '后验  Beta(' + U.fixed(a1, 1) + ', ' + U.fixed(b1, 1) + ')'
                  + '   ← α+k, β+(n−k)'),
              ]),
            ]),
            gap('var(--s-4)'),
            h('div.grid.g-4', [
              LS.ui.metric({ label: '先验均值', value: U.fixed(meanPrior, 3), size: 'lg', tone: 'know', note: 'α/(α+β)' }),
              LS.ui.metric({ label: '后验均值', value: U.fixed(meanPost, 3), size: 'lg', tone: 'fate', note: '贝叶斯点估计' }),
              LS.ui.metric({ label: '频率派估计 k/n', value: trials ? U.fixed(mle, 3) : '—', size: 'lg', tone: 'ghost', note: '不含先验信息' }),
              LS.ui.metric({
                label: '95% 可信区间', value: U.fixed(lo, 2) + ' – ' + U.fixed(hi, 2), size: 'md', tone: 'teal',
                note: '后验分布的 2.5% ~ 97.5% 分位',
              }),
            ]),
            gap('var(--s-4)'),
            h('div.split-37', [
              LS.ui.chartCard({
                title: '先验 Beta(' + U.fixed(a0, 1) + ', ' + U.fixed(b0, 1) + ')',
                sub: '在看到任何数据之前的信念',
                minHeight: 260,
                body: elPrior,
              }),
              LS.ui.chartCard({
                title: '后验 Beta(' + U.fixed(a1, 1) + ', ' + U.fixed(b1, 1) + ')',
                sub: '观测之后被修正的信念',
                minHeight: 260,
                body: elPost,
              }),
            ]),
            gap('var(--s-3)'),
            betaNarrative(a0, b0, a1, b1, meanPrior, meanPost, mle, trials, lo, hi),
          ],
        }),
      ]);
    }

    function betaNarrative(a0, b0, a1, b1, meanPrior, meanPost, mle, n, lo, hi) {
      const parts = [];
      const conf = (a1 + b1) < 12;
      parts.push(
        '先验参数 (α, β) 可以理解成"假想的成功与失败次数"：'
        + `Beta(${U.fixed(a0, 1)}, ${U.fixed(b0, 1)}) 相当于在看数据之前，你已经见过 `
        + `${U.fixed(a0, 1)} 次成功和 ${U.fixed(b0, 1)} 次失败。`);
      if (n === 0) {
        parts.push('当前没有观测，后验 = 先验。');
      } else if (n < 15) {
        parts.push(
          `样本很少（n=${n}），所以后验还在先验与数据之间：后验均值 ${U.fixed(meanPost, 3)} `
          + `位于先验 ${U.fixed(meanPrior, 3)} 与频率 ${U.fixed(mle, 3)} 之间。`);
      } else {
        parts.push(
          `样本已经有 ${n} 次，数据开始压倒先验：后验均值 ${U.fixed(meanPost, 3)} `
          + `明显靠近频率 ${U.fixed(mle, 3)}。`);
      }
      if (conf) parts.push(`但注意可信区间还很宽（${U.fixed(lo, 2)} – ${U.fixed(hi, 2)}），说明结论仍不稳定。`);
      return LS.ui.notice(parts, 'know');
    }

    function body(post, pE) {
      const priorPct = prior * 100;
      const postPct = post * 100;
      const ratio = post / prior;
      return h('div', [
        h('div.grid.g-4', [
          LS.ui.metric({ label: '先验 P(患病)', value: prior < 0.01 ? U.pct(prior, 3) : U.pct(prior, 2), size: 'lg', tone: 'know', note: '检测之前你认为的概率' }),
          LS.ui.metric({ label: '阳性总概率 P(+)', value: U.pct(pE, 4), size: 'lg', note: '真阳性 + 假阳性' }),
          LS.ui.metric({ label: '后验 P(患病|+)', value: postPct < 10 ? U.fixed(postPct, 2) + '%' : U.pct(post, 2), size: 'lg', tone: post > 0.5 ? 'bad' : 'warn', note: '这才是你真正想要的答案' }),
          LS.ui.metric({ label: '信念变化倍数', value: U.fixed(ratio, 1) + '×', size: 'lg', tone: 'gold', note: '后验 ÷ 先验' }),
        ]),
        gap('var(--s-4)'),
        LS.ui.notice([
          '关键洞察：检测"准确率 99%" 描述的是 P(阳性|患病)，而你想知道的是 P(患病|阳性)。',
          h('br'),
          '这两个数完全不同 —— 前者是似然，后者是后验。把它们搞混，就是"基础比率谬误"。',
        ], 'warn'),
        gap('var(--s-4)'),
        LS.ui.card({
          title: '自然频率：换成"人话"再算一遍',
          sub: '把概率换成"1,000 个人里有几个"，多数人立刻就懂了',
          body: [
            h('div.freq-table', freqRows()),
            gap('var(--s-3)'),
            LS.ui.notice(naturalSentence(), 'know'),
          ],
        }),
        gap('var(--s-4)'),
        h('div.grid.g-2', [
          LS.ui.card({
            title: '为什么阳性不代表患病',
            body: [
              h('p', { style: { fontSize: 'var(--f-sm)', color: 'var(--t-2)', lineHeight: '1.75' } }, [
                `假设 10 万人来检测。患病的有 ${U.int(100000 * prior)} 人，其中约 `,
                h('b', U.int(100000 * prior * sensitivity)),
                ' 人会被检出阳性。而健康的有 ',
                U.int(100000 * (1 - prior)),
                ' 人，其中约 ',
                h('b', U.int(100000 * (1 - prior) * falsePositive)),
                ' 人会因为假阳性被误报。',
              ]),
              h('p', { style: { fontSize: 'var(--f-sm)', color: 'var(--t-2)', lineHeight: '1.75', marginTop: '8px' } }, [
                '所以阳性人群里，真正的患者只占 ',
                h('b', { style: { color: 'var(--c-fate)' } }, U.pct(post, 2)),
                '。健康人的绝对数量太大，把假阳性的"量"抬了上来。',
              ]),
            ],
          }),
          LS.ui.card({
            title: '重复检测会怎样？',
            sub: '贝叶斯更新是"序贯"的：上一次的后验，就是下一次的先验',
            body: [
              LS.ui.segmented(
                [{ value: 1, label: '测 1 次' }, { value: 2, label: '测 2 次' }, { value: 3, label: '测 3 次' }],
                tests, (v) => { tests = v; rebuild(); }),
              gap('var(--s-3)'),
              h('div.def-list', [1, 2, 3].map((k) =>
                V.defRow('连续 ' + k + ' 次阳性 → 患病概率',
                  U.pct(posteriorFor(prior, sensitivity, falsePositive, k), 2),
                  k === tests ? 'fate' : ''))),
              gap('var(--s-3)'),
              LS.ui.notice('第二次检测的"先验"不再是人群患病率，而是第一次检测后的后验。这就是贝叶斯学习：证据不断累积，信念不断修正。', 'know'),
            ],
          }),
        ]),
        gap('var(--s-4)'),
        LS.ui.card({
          title: '这一页涉及的概念',
          body: h('div.grid.g-3', ['bayes', 'conditional_probability', 'independence']
            .map((id) => LS.knowledge.card(id, { compact: true }))),
        }),
      ]);
    }

    function freqRows() {
      const N = 100000;
      const sick = N * prior;
      const healthy = N - sick;
      const tp = sick * sensitivity;
      const fnr = sick * (1 - sensitivity);
      const fp = healthy * falsePositive;
      const tn = healthy * (1 - falsePositive);
      return LS.ui.table(
        ['', '患病', '健康', '合计'],
        [
          ['检测阳性', U.int(tp), U.int(fp), U.int(tp + fp)],
          ['检测阴性', U.int(fnr), U.int(tn), U.int(fnr + tn)],
          ['合计', U.int(sick), U.int(healthy), U.int(N)],
        ],
        { align: ['left', 'right', 'right', 'right'] },
      );
    }

    function naturalSentence() {
      const N = 100000;
      const tp = N * prior * sensitivity;
      const fp = N * (1 - prior) * falsePositive;
      return `10 万人中，阳性的共约 ${U.int(tp + fp)} 人，其中真患者约 ${U.int(tp)} 人。${U.int(tp)} ÷ ${U.int(tp + fp)} ≈ ${U.pct(tp / (tp + fp || 1), 2)}。`;
    }

    const page = V.render({ title: '贝叶斯更新', sub: '实验室 · 贝叶斯', fate: null }, [
      V.head({
        kicker: '实验二 · 贝叶斯',
        title: '当证据遇上先验',
        sub: '贝叶斯定理不是一条需要背下来的公式，而是一种思考方式：新的证据不会凭空产生结论，它只是在修正你原有的信念。',
        tight: true,
        actions: [LS.ui.button('← 返回实验室', { variant: 'ghost', size: 'sm', onClick: () => LS.router.go('/lab') })],
      }),
      LS.ui.card({
        title: '实验参数',
        body: [
          h('div.grid.g-3', [
            LS.ui.slider({
              name: '先验患病率', icon: '🦠', left: '极罕见 0.1%', right: '常见 30%',
              min: 0.0005, max: 0.3, step: 0.0005, value: prior,
              fmt: (v) => v < 0.01 ? U.pct(v, 2) : U.pct(v, 1),
              onChange: (v) => { prior = v; rebuild(); },
            }),
            LS.ui.slider({
              name: '灵敏度 P(+|患病)', icon: '🎯', left: '0.5', right: '0.999',
              min: 0.5, max: 0.999, step: 0.001, value: sensitivity,
              fmt: (v) => U.fixed(v, 3),
              onChange: (v) => { sensitivity = v; rebuild(); },
            }),
            LS.ui.slider({
              name: '假阳性率 P(+|健康)', icon: '⚠️', left: '0.001', right: '0.3',
              min: 0.001, max: 0.3, step: 0.001, value: falsePositive,
              fmt: (v) => U.fixed(v * 100, 1) + '%',
              onChange: (v) => { falsePositive = v; rebuild(); },
            }),
          ]),
        ],
      }),
      gap('var(--s-4)'),
      LS.ui.chartCard({
        title: '先验 → 证据 → 后验',
        sub: '上面的方阵表示 1,000 个随机抽取的人：紫色是真阳性，黄色是假阳性',
        minHeight: 340,
        body: elChart,
      }),
      gap(),
      elBody,
      gap('var(--s-6)'),
      elBeta,
      gap('var(--s-5)'),
      LS.ui.card({
        title: '两种贝叶斯问题，一个共同点',
        body: [
          h('div.grid.g-2', [
            h('div', [
              h('div.card-title', { style: { fontSize: '14px' } }, '① 上面的离散情形'),
              h('p', { style: { fontSize: 'var(--f-sm)', color: 'var(--t-2)', lineHeight: '1.7' } },
                '假设只有"患病 / 健康"两种可能，用一次检测把先验翻新成后验。'
                + '它教给你的核心是：先验极小的时候，即使证据很强，后验也可能不高。'),
            ]),
            h('div', [
              h('div.card-title', { style: { fontSize: '14px' } }, '② 下面的连续情形（Beta–Bernoulli）'),
              h('p', { style: { fontSize: 'var(--f-sm)', color: 'var(--t-2)', lineHeight: '1.7' } },
                '当你不知道"成功概率到底是多少"，就用一个分布去描述这个不确定性。'
                + '观测到 k 次成功后，后验只是把 α 加上 k、β 加上 n−k —— 计算量几乎为零，'
                + '这就是共轭先验在工程上如此受欢迎的原因。'),
            ]),
          ]),
          gap('var(--s-3)'),
          LS.ui.notice([
            h('b', '为什么要在人生模拟里讲这个？'),
            h('br'),
            '因为"我对某条路的成功率只有模糊的判断"正是真实决策的常态。'
            + 'Beta 先验 + 观测更新，是把"模糊判断"变成"可计算信念"的标准做法。',
          ], 'know'),
        ],
      }),
    ]);

    rebuild();
    LS.meta.evaluateAndToast({ kind: 'bayes', state: LS.store.state });
    return page;
  }

  /* ============================================================
   * 3. 马尔可夫
   * ========================================================== */
  function renderMarkov() {
    const states = C.ECONOMY_STATES;
    const chain = new LS.markov.Chain(states, C.ECONOMY_P);
    const stat = chain.stationary();
    const returns = chain.meanReturnTimes();

    let startIdx = 0;
    let years = 1000;
    let walk = null;

    const elDiagram = h('div');
    const elChart = h('div');
    const elBody = h('div');

    function runWalk() {
      const rng = new LS.rng.Rng(20240101);
      const idx = (LS.store.state.lastSeed || 20240101) >>> 0;
      const r = new LS.rng.Rng(LS.rng.derive(idx, 'markov'));
      let cur = startIdx;
      const visits = states.map(() => 0);
      const checkpoints = [];
      const marks = new Set();
      for (let i = 1; i <= years; i *= 1.08) marks.add(Math.max(1, Math.round(i)));
      for (let i = 1; i <= years; i += Math.max(1, Math.round(years / 200))) marks.add(i);
      marks.add(years);
      const list = Array.from(marks).sort((a, b) => a - b);
      let mi = 0;
      const occupancy = states.map(() => []);
      for (let t = 1; t <= years; t++) {
        visits[cur]++;
        if (mi < list.length && t === list[mi]) {
          states.forEach((_, k) => occupancy[k].push({ n: t, mean: visits[k] / t }));
          mi++;
        }
        cur = chain.next(cur, r);
      }
      return { visits, occupancy, years };
    }

    function rebuild() {
      walk = runWalk();
      mount(elDiagram, []);
      mount(elChart, []);
      mount(elBody, [body()]);
      requestAnimationFrame(() => {
        LS.charts.replace(elDiagram, 'markov', {
          labels: states,
          matrix: C.ECONOMY_P,
          stationary: stat,
          highlight: startIdx,
        });
        LS.charts.replace(elChart, 'convergence', {
          series: states.map((s, k) => ({
            label: s,
            color: ['#34d399', '#60a5fa', '#fbbf24', '#f87171'][k],
            points: walk.occupancy[k],
          })).concat([{
            label: '危机 · 平稳分布 π',
            color: '#c084fc',
            points: walk.occupancy[0].map((q) => ({ n: q.n, mean: stat[3] })),
          }]),
          yFmt: (v) => U.fixed(v * 100, 0) + '%',
          truth: null,
          showBand: false,
        });
      });
    }

    function body() {
      const rows = states.map((s, i) => [
        s,
        U.pct(stat[i], 1),
        U.fixed(returns[i], 1) + ' 年',
        U.pct(walk.visits[i] / walk.years, 1),
        U.pct(chain.P[i][i], 0),
      ]);
      return h('div', [
        h('div.grid.g-3', [
          LS.ui.metric({
            label: '稳态下的"危机"时间占比', value: U.pct(stat[3], 1), size: 'lg', tone: 'bad',
            note: '长期来看，约每 ' + U.fixed(returns[3], 0) + ' 年遇到一次',
          }),
          LS.ui.metric({
            label: '稳态下的"繁荣"时间占比', value: U.pct(stat[0], 1), size: 'lg', tone: 'ok',
            note: '从任意状态出发都会收敛到这里',
          }),
          LS.ui.metric({
            label: '本次游走年数', value: U.int(walk.years), size: 'lg', note: '从「' + states[startIdx] + '」出发',
          }),
        ]),
        gap('var(--s-4)'),
        LS.ui.card({
          title: '状态统计',
          sub: '理论值来自解 πP = π；实测值来自本次随机游走',
          body: [
            LS.ui.table(
              ['状态', '平稳分布 π', '平均返回时间', '本次游走占比', '保持原状态概率'],
              rows,
              { align: ['left', 'right', 'right', 'right', 'right'] },
            ),
            gap('var(--s-3)'),
            LS.ui.notice([
              '平稳分布不依赖起点。你可以把"出发状态"换成危机，等一等，占比仍然会收敛到同样的数字 —— ',
              '这正是马尔可夫链最漂亮的性质：',
              h('b', '长期行为与初始条件无关'),
              '。',
            ], 'know'),
          ],
        }),
        gap('var(--s-4)'),
        LS.ui.card({
          title: '转移矩阵',
          sub: 'P[i][j] = 从状态 i 转移到状态 j 的概率 · 每一行之和为 1',
          body: [
            LS.ui.table(
              ['从 \\ 到', ...states, '行和'],
              states.map((s, i) => [
                s,
                ...C.ECONOMY_P[i].map((v) => U.pct(v, 1)),
                U.fixed(C.ECONOMY_P[i].reduce((a, b) => a + b, 0), 3),
              ]),
              { align: ['left', 'right', 'right', 'right', 'right', 'right'] },
            ),
            gap('var(--s-3)'),
            LS.ui.notice('矩阵的对角线就是"惯性"：每次状态有很高概率保持原样。经济周期之所以看起来"有趋势"，本质上就是这条对角线。', 'know'),
          ],
        }),
      ]);
    }

    const page = V.render({ title: '马尔可夫链', sub: '实验室 · 马尔可夫', fate: null }, [
      V.head({
        kicker: '实验三 · 马尔可夫链',
        title: '只看现在，就能预测未来吗？',
        sub: '马尔可夫性说的是：给定当前状态，过去的全部历史都不再提供额外信息。这既是简化，也是它好用的原因。',
        tight: true,
        actions: [LS.ui.button('← 返回实验室', { variant: 'ghost', size: 'sm', onClick: () => LS.router.go('/lab') })],
      }),
      LS.ui.card({
        title: '实验参数',
        body: [
          h('div.grid.g-3', [
            h('div', [
              h('div', { style: { fontSize: 'var(--f-xs)', color: 'var(--t-3)', marginBottom: '8px' } }, '起始状态'),
              LS.ui.segmented(states.map((s, i) => ({ value: i, label: s })), startIdx,
                (v) => { startIdx = v; rebuild(); }),
            ]),
            h('div', [
              h('div', { style: { fontSize: 'var(--f-xs)', color: 'var(--t-3)', marginBottom: '8px' } }, '游走年数'),
              LS.ui.segmented(
                [{ value: 100, label: '100' }, { value: 1000, label: '1,000' }, { value: 20000, label: '20,000' }],
                years, (v) => { years = v; rebuild(); }),
            ]),
            h('div.row.gap-2', { style: { alignItems: 'flex-end' } }, [
              LS.ui.button('重新游走', { variant: 'ghost', onClick: rebuild }),
            ]),
          ]),
        ],
      }),
      gap('var(--s-4)'),
      h('div.split-63', [
        LS.ui.chartCard({
          title: '状态转移图',
          sub: '弧的粗细表示转移概率 · 节点外的金色弧表示平稳分布占比',
          minHeight: 380,
          body: elDiagram,
        }),
        LS.ui.card({
          title: '平稳分布',
          sub: '长期停留比例',
          body: [
            h('div.def-list', states.map((s, i) => V.defRow(s, U.pct(stat[i], 1), i === 3 ? 'bad' : ''))),
            gap('var(--s-3)'),
            LS.ui.notice('这四个数字与起点无关，也与走多久无关（只要足够久）。它们由转移矩阵唯一决定。', 'know'),
          ],
        }),
      ]),
      gap(),
      LS.ui.chartCard({
        title: '占比的收敛过程',
        sub: '横轴为年数（对数轴）· 实线为本次游走的实际占比 · 紫色虚线为平稳分布理论值',
        minHeight: 340,
        body: elChart,
      }),
      gap(),
      elBody,
      gap(),
      LS.ui.card({
        title: '这一页涉及的概念',
        body: h('div.grid.g-3', ['markov', 'stationary', 'law_of_large_numbers']
          .map((id) => LS.knowledge.card(id, { compact: true }))),
      }),
    ]);

    rebuild();
    LS.meta.evaluateAndToast({ kind: 'markov', state: LS.store.state });
    return page;
  }

  /* ============================================================
   * 4. 参数敏感性
   * ========================================================== */
  const SENS_METRICS = [
    { key: 'mean', label: '平均财富' },
    { key: 'median', label: '中位财富' },
    { key: 'p05', label: 'P05（下限）' },
    { key: 'ruin', label: '破产概率' },
    { key: 'happiness', label: '平均幸福' },
    { key: 'health', label: '平均健康' },
  ];

  function renderSensitivity() {
    const st = LS.store.state;
    const dims = C.STRATEGY_DIMS;
    let xKey = 'investmentRisk';
    let yKey = 'careerRisk';
    let metric = 'mean';
    let sampleSize = 600;
    let grid = null;
    let busy = false;

    const elHeat = h('div');
    const elBody = h('div');
    const elProgress = h('div');

    const VALUES = [0, 0.25, 0.5, 0.75, 1];

    function strategyAt(over) {
      const s = { ...(st.strategy || LS.character.defaultStrategy()) };
      Object.assign(s, over);
      return s;
    }

    function metricOf(res) {
      const sm = res.summary;
      switch (metric) {
        case 'mean': return sm.wealth.mean;
        case 'median': return sm.wealth.median;
        case 'p05': return sm.wealth.q05;
        case 'ruin': return sm.wealth.probabilityOfLoss;
        case 'happiness': return sm.happiness.mean;
        case 'health': return sm.health.mean;
        default: return sm.wealth.mean;
      }
    }

    async function runScan() {
      if (busy) return;
      busy = true;
      LS.audio.play('click');
      const btn = document.getElementById('run-sens');
      if (btn) { btn.disabled = true; btn.textContent = '扫描中……'; }
      const total = VALUES.length * VALUES.length;
      const prog = LS.ui.simulationProgress();
      mount(elProgress, [h('div', { style: { marginTop: 'var(--s-4)' } }, prog.el)]);

      const worldSeed = st.lastSeed || 20240101;
      const values = [];
      let done = 0;
      try {
        for (const yv of VALUES) {
          const row = [];
          for (const xv of VALUES) {
            const over = {};
            over[xKey] = xv;
            over[yKey] = yv;
            const res = await MCrun(strategyAt(over), worldSeed);
            row.push(metricOf(res));
            done++;
            prog.update({
              done, total, percent: done / total,
              elapsedMs: 0,
              discoveries: {
                bankrupt: 0, millionaires: 0, startupFailures: 0, crises: 0,
              },
            });
            // 让浏览器有机会重绘
            await new Promise((r) => setTimeout(r, 0));
          }
          values.push(row);
        }
        grid = {
          values,
          xKey, yKey, metric, sampleSize,
          currentX: nearestIndex(VALUES, (st.strategy || {})[xKey] || 0),
          currentY: nearestIndex(VALUES, (st.strategy || {})[yKey] || 0),
        };
        LS.audio.play('done');
        LS.meta.evaluateAndToast({ kind: 'sensitivity', state: LS.store.state });
        mount(elProgress, []);
        renderResults();
      } catch (e) {
        console.error(e);
        mount(elProgress, [LS.ui.notice('扫描失败：' + e.message, 'bad')]);
      } finally {
        busy = false;
        if (btn) { btn.disabled = false; btn.textContent = '开始扫描（' + U.int(total * sampleSize) + ' 条人生）'; }
      }
    }

    async function MCrun(strategy, worldSeed) {
      return LS.montecarlo.runMonteCarlo({
        character: st.character,
        strategy,
        worldSeed,
        lockWorldSeed: true,
        sampleSize,
        pathSamples: 2,
        worldConfig: C.makeWorldConfig(st.worldPreset || 'standard', st.worldOverrides || {}),
      });
    }

    function nearestIndex(arr, v) {
      let bi = 0, bd = Infinity;
      arr.forEach((a, i) => { const d = Math.abs(a - v); if (d < bd) { bd = d; bi = i; } });
      return bi;
    }

    function fmtMetric(v) {
      if (metric === 'ruin') return U.pct(v, 2);
      if (metric === 'mean' || metric === 'median' || metric === 'p05') return U.money(v);
      return U.fixed(v, 1);
    }

    function renderResults() {
      mount(elHeat, []);
      mount(elBody, [body()]);
      requestAnimationFrame(() => {
        LS.charts.replace(elHeat, 'heatmap', {
          xLabels: VALUES.map((v) => U.pct(v, 0)),
          yLabels: VALUES.map((v) => U.pct(v, 0)),
          values: grid.values,
          xTitle: labelOf(xKey) + ' →',
          yTitle: '↑ ' + labelOf(yKey),
          fmt: fmtMetric,
          valueLabel: SENS_METRICS.find((m) => m.key === metric).label,
          mark: { x: grid.currentX, y: grid.currentY },
        });
      });
    }

    function labelOf(key) {
      const d = dims.find((x) => x.key === key);
      return d ? d.label : key;
    }

    function body() {
      if (!grid) {
        return LS.ui.notice('点上面的按钮开始扫描。每个格子会真实运行 ' + U.int(sampleSize)
          + ' 条人生 —— 这不是一次估算，而是 25 次独立的完整模拟。', 'know');
      }

      const flat = grid.values.flat().filter(isFinite);
      const lo = Math.min(...flat), hi = Math.max(...flat);
      const loPos = findPos(lo), hiPos = findPos(hi);
      const range = hi - lo;
      const base = grid.values[grid.currentY][grid.currentX];
      const best = metric === 'ruin' ? lo : hi;
      const bestPos = metric === 'ruin' ? loPos : hiPos;

      // 每个参数单独的平均影响（主效应）
      const xEffect = VALUES.map((_, xi) => ({
        v: VALUES[xi],
        mean: grid.values.reduce((a, row) => a + row[xi], 0) / grid.values.length,
      }));
      const yEffect = VALUES.map((_, yi) => ({
        v: VALUES[yi],
        mean: grid.values[yi].reduce((a, b) => a + b, 0) / grid.values[yi].length,
      }));
      const xSwing = Math.max(...xEffect.map((e) => e.mean)) - Math.min(...xEffect.map((e) => e.mean));
      const ySwing = Math.max(...yEffect.map((e) => e.mean)) - Math.min(...yEffect.map((e) => e.mean));

      return h('div', [
        h('div.grid.g-4', [
          LS.ui.metric({ label: '你当前的设置', value: fmtMetric(base), size: 'lg', tone: 'fate', note: `${labelOf(xKey)} ${U.pct(VALUES[grid.currentX], 0)} · ${labelOf(yKey)} ${U.pct(VALUES[grid.currentY], 0)}` }),
          LS.ui.metric({ label: '最优格子', value: fmtMetric(best), size: 'lg', tone: metric === 'ruin' ? 'ok' : 'gold', note: `${labelOf(xKey)} ${U.pct(VALUES[bestPos.x], 0)} · ${labelOf(yKey)} ${U.pct(VALUES[bestPos.y], 0)}` }),
          LS.ui.metric({ label: '最好与最差之差', value: fmtMetric(hi) + ' / ' + fmtMetric(lo), size: 'md', note: '整个参数空间的跨度', tone: 'know' }),
          LS.ui.metric({ label: '更敏感的杠杆', value: xSwing >= ySwing ? labelOf(xKey) : labelOf(yKey), size: 'md', tone: 'warn', note: `主效应幅度 ${(xSwing >= ySwing ? xSwing : ySwing) > 0 ? '' : ''}${fmtMetric(Math.max(xSwing, ySwing))}` }),
        ]),
        gap('var(--s-4)'),
        /* 注意：热力图容器 elHeat 只在页面顶层挂一次（见下面 chartCard）。
           这里再包一层同样的卡片会把同一个 DOM 节点抢过去，
           顶层的卡片就变成永远空白的重复标题。 */
        h('div.split-63', [
          LS.ui.card({
            title: '主效应对比',
            sub: '固定另一个参数，看单个参数从 0 拉到 1 的平均效果',
            body: [
              h('div', { style: { marginBottom: 'var(--s-4)' } }, [
                h('div.card-title', { style: { fontSize: '13.5px' } }, labelOf(xKey)),
                LS.ui.progressBar(xSwing > 0 ? 0.4 + 0.6 * (xSwing / Math.max(xSwing, ySwing)) : 0, { tone: 'fate' }),
                h('div', { style: { fontSize: 'var(--f-xs)', color: 'var(--t-3)', marginTop: '4px' } },
                  '从 ' + fmtMetric(Math.min(...xEffect.map((e) => e.mean))) + ' 到 ' + fmtMetric(Math.max(...xEffect.map((e) => e.mean)))),
              ]),
              h('div', { style: { marginBottom: 'var(--s-4)' } }, [
                h('div.card-title', { style: { fontSize: '13.5px' } }, labelOf(yKey)),
                LS.ui.progressBar(ySwing > 0 ? 0.4 + 0.6 * (ySwing / Math.max(xSwing, ySwing)) : 0, { tone: 'teal' }),
                h('div', { style: { fontSize: 'var(--f-xs)', color: 'var(--t-3)', marginTop: '4px' } },
                  '从 ' + fmtMetric(Math.min(...yEffect.map((e) => e.mean))) + ' 到 ' + fmtMetric(Math.max(...yEffect.map((e) => e.mean)))),
              ]),
              LS.ui.notice([
                '如果某个参数的"主效应"很小，那么无论你怎么调它，结果都差不多 —— ',
                '那就不是你的杠杆。把精力放在敏感的参数上，才是有效决策。',
              ], 'know'),
            ],
          }),
          LS.ui.card({
            title: '怎么读这张图',
            body: h('div.col.gap-4', [
              readTip('亮区是"好"的方向', '颜色最亮的格子表示该指标最高。如果要最大化财富，就往亮区走。'),
              readTip('注意交互作用', '如果亮度变化不是平滑的，而是某个角落突然很亮/很暗，说明两个参数之间存在交互作用 —— 单独调一个看不出来。'),
              readTip('小心过拟合', `每个格子只有 ${U.int(sampleSize)} 条人生，误差大约 ±${U.fixed(100 / Math.sqrt(sampleSize), 1)}%。相邻格子的差异可能只是噪声。`),
            ]),
          }),
        ]),
      ]);
    }

    function readTip(title, text) {
      return h('div', [
        h('div.card-title', { style: { fontSize: '13.5px' } }, title),
        h('p', { style: { fontSize: 'var(--f-sm)', color: 'var(--t-2)', lineHeight: '1.7', marginTop: '6px' } }, text),
      ]);
    }

    function findPos(v) {
      for (let y = 0; y < grid.values.length; y++) {
        for (let x = 0; x < grid.values[y].length; x++) {
          if (grid.values[y][x] === v) return { x, y };
        }
      }
      return { x: 0, y: 0 };
    }

    const page = V.render({ title: '参数敏感性', sub: '实验室 · 敏感性', fate: null }, [
      V.head({
        kicker: '实验四 · 参数敏感性',
        title: '哪个滑块才是真正的杠杆？',
        sub: '一次只动一个参数看不出交互作用。这里把两个参数的所有组合都跑一遍，用热力图把"杠杆"可视化。',
        tight: true,
        actions: [LS.ui.button('← 返回实验室', { variant: 'ghost', size: 'sm', onClick: () => LS.router.go('/lab') })],
      }),
      LS.ui.card({
        title: '实验参数',
        body: [
          h('div.grid.g-2', [
            h('div', [
              h('div', { style: { fontSize: 'var(--f-xs)', color: 'var(--t-3)', marginBottom: '8px' } }, '横轴参数'),
              LS.ui.segmented(dims.map((d) => ({ value: d.key, label: d.label })), xKey,
                (v) => { xKey = v; if (v === yKey) yKey = dims.find((d) => d.key !== v).key; rebuild(); }),
            ]),
            h('div', [
              h('div', { style: { fontSize: 'var(--f-xs)', color: 'var(--t-3)', marginBottom: '8px' } }, '纵轴参数'),
              LS.ui.segmented(dims.map((d) => ({ value: d.key, label: d.label })), yKey,
                (v) => { yKey = v; if (v === xKey) xKey = dims.find((d) => d.key !== v).key; rebuild(); }),
            ]),
          ]),
          gap('var(--s-3)'),
          h('div.grid.g-2', [
            h('div', [
              h('div', { style: { fontSize: 'var(--f-xs)', color: 'var(--t-3)', marginBottom: '8px' } }, '观察指标'),
              LS.ui.segmented(SENS_METRICS.map((m) => ({ value: m.key, label: m.label })), metric,
                (v) => { metric = v; rebuild(); }),
            ]),
            h('div', [
              h('div', { style: { fontSize: 'var(--f-xs)', color: 'var(--t-3)', marginBottom: '8px' } }, '每格样本量'),
              LS.ui.segmented([300, 600, 1200].map((v) => ({ value: v, label: U.int(v) })), sampleSize,
                (v) => { sampleSize = v; rebuild(); }),
            ]),
          ]),
          gap('var(--s-3)'),
          h('div.row.gap-3.wrap', [
            LS.ui.button('开始扫描（' + U.int(25 * sampleSize) + ' 条人生）', {
              variant: 'primary', size: 'lg', id: 'run-sens',
              onClick: runScan,
            }),
            h('span', { style: { fontSize: 'var(--f-xs)', color: 'var(--t-4)' } },
              '5×5 = 25 个格子，每格独立运行，全部锁定同一个世界种子'),
          ]),
          elProgress,
        ],
      }),
      gap('var(--s-4)'),
      LS.ui.chartCard({
        title: '参数空间热力图',
        sub: '白框是你当前的位置 · 颜色越亮表示该指标越高 · 每格独立运行同一种子的样本',
        minHeight: 340,
        body: elHeat,
      }),
      gap(),
      elBody,
    ]);

    function rebuild() {
      mount(elBody, [body()]);
    }
    rebuild();

    /* 调试 / 自动化句柄 */
    page.__lsScan = runScan;
    return page;
  }

  /* ============================================================
   * 5. 分布百科
   * ========================================================== */
  const DIST_INFO = {
    uniform: { usage: '没有任何偏好的"完全随机"，是其他随机数生成器的起点。', where: '随机抽样、随机初始化' },
    bernoulli: { usage: '一次成败判定：成功概率 p，失败 1−p。', where: '每一次随机事件判定' },
    binomial: { usage: 'n 次独立伯努利试验的成功总次数。', where: '「10 次创业能成功几次」' },
    geometric: { usage: '第一次成功之前要等多久。', where: '「多久能找到工作」' },
    poisson: { usage: '固定时间内事件发生的次数，事件彼此独立且发生率恒定。', where: '「一年遇到几个机会」' },
    normal: { usage: '大量微小独立因素叠加的结果（中心极限定理）。', where: '能力、健康基线' },
    lognormal: { usage: '取对数后服从正态 —— 有下限、长右尾。', where: '收入、房价、公司估值' },
    exponential: { usage: '无记忆的等待时间，是泊松过程的间隔。', where: '「还要等多久」' },
    beta: { usage: '定义在 [0,1] 上的连续分布，适合描述"比例"或"概率的信念"。', where: '贝叶斯先验、比例参数' },
  };

  /* 每种分布的参数滑块范围（集中声明，避免用参数名猜范围） */
  const PARAM_RANGES = {
    uniform: { a: { min: -5, max: 5, step: 0.1 }, b: { min: -5, max: 10, step: 0.1 } },
    bernoulli: { p: { min: 0.02, max: 0.98, step: 0.01 } },
    binomial: { n: { min: 1, max: 60, step: 1 }, p: { min: 0.02, max: 0.98, step: 0.01 } },
    geometric: { p: { min: 0.02, max: 0.98, step: 0.01 } },
    poisson: { lambda: { min: 0.2, max: 20, step: 0.1 } },
    normal: { mu: { min: -5, max: 5, step: 0.1 }, sigma: { min: 0.1, max: 3, step: 0.05 } },
    lognormal: { mu: { min: -2, max: 3, step: 0.05 }, sigma: { min: 0.05, max: 1.6, step: 0.01 } },
    exponential: { lambda: { min: 0.05, max: 5, step: 0.05 } },
    beta: { a: { min: 0.2, max: 8, step: 0.1 }, b: { min: 0.2, max: 12, step: 0.1 } },
  };

  function renderDist(route) {
    const keys = Object.keys(D.ALL);
    let key = (route && route.query && route.query.d) || 'normal';
    if (keys.indexOf(key) < 0) key = 'normal';
    let params = { ...D.ALL[key].params };
    let mode = 'pdf';
    let data = null;

    const elChart = h('div');
    const elBody = h('div');
    const elParams = h('div');

    function sample() {
      const rng = new LS.rng.Rng((Date.now() & 0xffffffff) >>> 0);
      const n = 3000;
      const out = new Array(n);
      for (let i = 0; i < n; i++) out[i] = D.ALL[key].sample(rng, params);
      data = out;
      const st = LS.store.state.stats;
      st.distSeen = st.distSeen || {};
      st.distSeen[key] = true;
      st.distributionsOpened = Object.keys(st.distSeen).length;
      LS.store.save();
    }

    function rebuild(re) {
      if (re || !data) sample();
      const d = D.ALL[key];
      mount(elParams, [paramSliders()]);
      mount(elChart, []);
      mount(elBody, [body()]);
      drawChart();
      LS.meta.evaluateAndToast({ state: LS.store.state });
    }

    function drawChart() {
      const d = D.ALL[key];
      mount(elChart, []);
      requestAnimationFrame(() => {
        LS.charts.replace(elChart, 'density', {
          dist: d,
          params,
          data,
          mode,
          marks: [
            { value: d.mean(params), label: '均值 ' + U.fixed(d.mean(params), 2), color: '#f5c860' },
            { value: d.mean(params) + Math.sqrt(d.variance(params)), label: '+σ', color: '#93c5fd' },
            { value: d.mean(params) - Math.sqrt(d.variance(params)), label: '−σ', color: '#93c5fd' },
          ],
        });
      });
    }

    /** 保证参数合法（例如 beta 的 a、b 必须为正，uniform 的 a < b） */
    function clampParams() {
      if (key === 'uniform') {
        if (params.b <= params.a + 0.2) params.b = params.a + 0.2;
      }
      if (key === 'beta') {
        params.a = Math.max(0.2, params.a);
        params.b = Math.max(0.2, params.b);
      }
      if (key === 'normal' || key === 'lognormal') params.sigma = Math.max(0.02, params.sigma);
    }

    function paramSliders() {
      const d = D.ALL[key];
      const ranges = PARAM_RANGES[key] || {};
      return h('div.grid.g-2', Object.keys(d.params).map((k) => {
        const r = ranges[k] || { min: 0, max: 10, step: 0.1 };
        return LS.ui.slider({
          name: '参数 ' + k, icon: '⚙️',
          min: r.min, max: r.max, step: r.step,
          value: params[k] != null ? params[k] : d.params[k],
          fmt: (v) => (r.step < 1 ? U.fixed(v, 2) : U.fixed(v, 0)),
          onChange: (v) => {
            params[k] = v;
            clampParams();
            sample();
            drawChart();
            mount(elBody, [body()]);
          },
        });
      }));
    }

    function body() {
      const d = D.ALL[key];
      const info = DIST_INFO[key] || {};
      const m = d.mean(params), v = d.variance(params), sd = Math.sqrt(v);
      const s = LS.stats.sorted(data);
      const sup = d.support(params);
      const discrete = ['bernoulli', 'binomial', 'geometric', 'poisson'].indexOf(key) >= 0;
      return h('div', [
        h('div.grid.g-4', [
          LS.ui.metric({ label: '理论均值 E[X]', value: U.fixed(m, 3), size: 'lg', tone: 'fate' }),
          LS.ui.metric({ label: '理论方差 Var(X)', value: U.fixed(v, 3), size: 'lg', tone: 'know' }),
          LS.ui.metric({ label: '标准差 σ', value: U.fixed(sd, 3), size: 'lg', tone: 'teal' }),
          LS.ui.metric({
            label: '样本均值（3,000 次抽样）', value: U.fixed(LS.stats.mean(s), 3), size: 'lg',
            tone: 'gold', note: '应该接近理论均值',
          }),
        ]),
        gap('var(--s-4)'),
        h('div.split-63', [
          LS.ui.card({
            title: '这个分布用在哪里',
            body: [
              h('p', { style: { fontSize: 'var(--f-sm)', color: 'var(--t-2)', lineHeight: '1.75' } }, info.usage || ''),
              gap('var(--s-3)'),
              LS.ui.defList([
                V.defRow('数学记号', d.latex),
                V.defRow('类型', discrete ? '离散' : '连续'),
                V.defRow('取值范围', '[' + U.fixed(sup[0], 2) + ', ' + (isFinite(sup[1]) ? U.fixed(sup[1], 2) : '∞') + ']'),
                V.defRow('在 LifeSim 中', info.where || '—'),
              ]),
            ],
          }),
          LS.ui.card({
            title: '分位数（来自 3,000 次抽样）',
            body: [
              LS.ui.table(
                ['分位', '值', '理论 CDF 校验'],
                [0.05, 0.25, 0.5, 0.75, 0.95].map((q) => {
                  const x = LS.stats.quantileSorted(s, q);
                  return [
                    U.pct(q, 0),
                    U.fixed(x, 3),
                    U.fixed(d.cdf(x, params), 3),
                  ];
                }),
                { align: ['left', 'right', 'right'] },
              ),
              gap('var(--s-3)'),
              LS.ui.notice('最后一列是"理论 CDF 在样本分位处的取值"。它应该接近第一列 —— 如果不接近，说明抽样次数还不够，或者参数设置有问题。', 'know'),
            ],
          }),
        ]),
      ]);
    }

    const page = V.render({ title: '分布百科', sub: '实验室 · 分布', fate: null }, [
      V.head({
        kicker: '实验五 · 分布百科',
        title: '九种分布，九种描述世界的方式',
        sub: '选择一种分布，调整它的参数，然后抽 3,000 个样本，用经验分布去对照理论曲线。',
        tight: true,
        actions: [LS.ui.button('← 返回实验室', { variant: 'ghost', size: 'sm', onClick: () => LS.router.go('/lab') })],
      }),
      LS.ui.card({
        title: '选择分布',
        body: [
          h('div.row.gap-2.wrap', keys.map((k) =>
            h('button.preset-chip' + (k === key ? '.on' : ''), {
              type: 'button',
              onclick: () => {
                key = k;
                params = { ...D.ALL[k].params };
                data = null;
                rebuild(true);
              },
            }, [h('span', D.ALL[k].label)]))),
          gap('var(--s-3)'),
          h('div.row.between.wrap', [
            h('div.row.gap-2', [
              h('span', { style: { fontSize: 'var(--f-xs)', color: 'var(--t-3)' } }, '显示'),
              LS.ui.segmented([{ value: 'pdf', label: 'PDF / PMF' }, { value: 'cdf', label: 'CDF' }], mode,
                (v) => { mode = v; rebuild(false); }),
            ]),
            LS.ui.button('重新抽 3,000 个样本', { variant: 'ghost', size: 'sm', onClick: () => rebuild(true) }),
          ]),
        ],
      }),
      gap('var(--s-4)'),
      LS.ui.card({
        title: '参数',
        body: [elParams],
      }),
      gap('var(--s-4)'),
      LS.ui.chartCard({
        title: D.ALL[key].label,
        sub: '青色为理论曲线，蓝色柱为 3,000 个样本的经验分布',
        minHeight: 360,
        body: elChart,
      }),
      gap(),
      elBody,
      gap(),
      LS.ui.card({
        title: '相关的概率概念',
        body: h('div.grid.g-3', ['normal', 'lognormal', 'heavy_tail']
          .map((id) => LS.knowledge.card(id, { compact: true }))),
      }),
    ]);

    rebuild(true);
    return page;
  }

  LS.router.register('/lab', renderHub);
  LS.router.register('/lab/:sub', (route) => {
    switch (route.params.sub) {
      case 'law': return renderLaw(route);
      case 'bayes': return renderBayes(route);
      case 'markov': return renderMarkov(route);
      case 'sensitivity': return renderSensitivity(route);
      case 'dist': return renderDist(route);
      default: return renderHub(route);
    }
  });

  LS.views.lab = {
    render: renderHub,
    renderHub, renderLaw, renderBayes, renderMarkov, renderSensitivity, renderDist, LABS,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
