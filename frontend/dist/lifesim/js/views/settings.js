/* ============================================================
 * LifeSim · views/settings.js
 * 设置（规格书 §35）
 *
 * 原则：所有设置都要说明"它会影响什么"，而不是只给一个开关。
 * 数据全部保存在本地，所以要给用户完整的导出 / 导入 / 清空能力。
 * ========================================================== */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const V = LS.views;
  const { h, mount, $ } = LS.dom;
  const U = LS.util;
  const C = LS.config;

  function renderSettings() {
    const st = LS.store.state;
    const elBody = h('div');

    function set(patch) {
      Object.assign(st.settings, patch);
      LS.store.saveNow();
      if (patch.sound !== undefined) LS.audio.setEnabled(patch.sound);
      rebuild();
    }

    function rebuild() {
      mount(elBody, [content()]);
      LS.shell.refreshBadges();
    }

    function row(name, desc, control) {
      return h('div.setting-row', [
        h('div.sr-info', [
          h('div.sr-name', name),
          h('div.sr-desc', desc),
        ]),
        h('div.row.gap-2', control),
      ]);
    }

    function content() {
      const s = st.settings;
      return h('div', [
        /* ---------------- 体验 ---------------- */
        LS.ui.card({
          title: '体验',
          sub: '这些设置只影响界面，不改变模型结果',
          body: [
            row('音效', '年份推进、事件出现、成就解锁时的轻量提示音。默认关闭，避免突然发声。',
              LS.ui.switchRow({
                name: '', checked: s.sound,
                onChange: (v) => set({ sound: v }),
              })),
            row('减少动效', '关闭图表入场动画与粒子背景。适合低性能设备，也适合对动效敏感的用户。',
              LS.ui.switchRow({
                name: '', checked: s.reduceMotion,
                onChange: (v) => set({ reduceMotion: v }),
              })),
            row('显示人生阶段插画', '运行页会随年龄切换一张场景插画。关掉后只保留数据，适合低性能设备。',
              LS.ui.switchRow({
                name: '', checked: s.showScenes !== false,
                onChange: (v) => set({ showScenes: v }),
              })),
            row('默认打开“看细节”', '运行人生时自动显示每年的可能性面板。想看的时候开着，不想看就关掉，保持沉浸。',
              LS.ui.switchRow({
                name: '', checked: s.lens,
                onChange: (v) => set({ lens: v }),
              })),
            row('路径云样本数', '批量模拟时保留多少条完整轨迹用于画"路径云"。越大越好看，但占用更多内存。',
              LS.ui.segmented([100, 300, 600, 1000].map((v) => ({ value: v, label: String(v) })),
                s.pathSamples, (v) => set({ pathSamples: v }))),
          ],
        }),
        h('div', { style: { height: 'var(--s-5)' } }),

        /* ---------------- 数据 ---------------- */
        LS.ui.card({
          title: '数据',
          sub: '所有数据都保存在这台设备的浏览器里（localStorage），不会上传到任何服务器',
          body: [
            h('div.grid.g-3', [
              dataCell('人生档案', st.lives.length + ' / ' + LS.store.MAX_LIVES, '条'),
              dataCell('累计模拟', U.int(st.stats.totalSimulated || 0), '次人生'),
              dataCell('最大单次样本', U.int(st.stats.maxSample || 0), '次'),
            ]),
            h('div', { style: { height: 'var(--s-4)' } }),
            h('div.row.gap-3.wrap', [
              LS.ui.button('导出全部数据（JSON）', {
                variant: 'primary',
                onClick: () => V.archive.download(LS.store.exportJSON()),
              }),
              LS.ui.button('导入数据', {
                variant: 'ghost',
                onClick: () => importDialog(),
              }),
              LS.ui.button('清空全部数据', {
                variant: 'danger',
                onClick: () => confirmReset(),
              }),
            ]),
            h('div', { style: { height: 'var(--s-3)' } }),
            LS.ui.notice('导出文件包含人生档案、成就、图鉴进度与设置。换设备时用它迁移即可。', 'know'),
          ],
        }),
        h('div', { style: { height: 'var(--s-5)' } }),

        /* ---------------- 模型 ---------------- */
        LS.ui.card({
          title: '模型参数（只读）',
          sub: '规格书 §61 要求所有模型参数集中配置，这里把它们显式列出来，方便核对与讨论',
          body: [
            h('div.grid.g-2', [
              LS.ui.table(['参数', '值'], [
                ['经济状态数', C.ECONOMY_STATES.length + ' 个（' + C.ECONOMY_STATES.join(' / ') + '）'],
                ['职业状态数', String(C.CAREERS.length)],
                ['教育等级数', String(C.EDUCATION.levels.length)],
                ['健康衰减基准', U.fixed(C.HEALTH.declineBase, 3) + ' / 年'],
                ['健康冲击概率', U.pct(C.HEALTH.shockProb, 1) + ' / 年'],
                ['破产阈值', U.money(C.EXPENSE.bankruptcyThreshold)],
                ['破产冷却', C.EXPENSE.bankruptcyCooldown + ' 年'],
                ['一次最多重大事件', C.EVENT.maxMajorPerYear + ' 个 / 年'],
                ['事件概率下限', C.EVENT.probFloor.toExponential(1)],
                ['稀有事件上限', U.pct(C.EVENT.rareCap, 1)],
                ['寿命基线风险', C.LIFESPAN.baselineHazard.toExponential(1)],
                ['Gompertz 系数', U.fixed(C.LIFESPAN.gompertzB, 3)],
                ['决策概率区间', U.pct(C.DECISION.pFloor, 0) + ' ~ ' + U.pct(C.DECISION.pCeiling, 0)],
                ['随机事件总数', LS.events.EVENTS.length + ' 个'],
                ['策略维度', C.STRATEGY_DIMS.length + ' 个'],
              ], { align: ['left', 'right'] }),
              h('div.col.gap-3', [
                LS.ui.notice([
                  h('b', '五维指标的定义（重要）：'),
                  h('br'),
                  '健康 = 65 岁前平均（度量"健康维护水平"）',
                  h('br'),
                  '幸福 / 关系 = 一生平均',
                  h('br'),
                  '事业成就 = 峰值型（职业层级 + 峰值收入 + 职业资本 + 创业成功）',
                  h('br'),
                  h('br'),
                  '同一个指标，换个算法，结论就可能翻个面。比如把健康改成“临终值”，健康与寿命的关系会从负变正——所以别太信一个数字。',
                ], 'know'),
                LS.ui.chartCard({
                  title: '经济周期转移矩阵',
                  sub: '每行之和为 1',
                  minHeight: 220,
                  onMount: (host) => {
                    LS.charts.replace(host, 'markov', {
                      labels: C.ECONOMY_STATES,
                      matrix: C.ECONOMY_P,
                      stationary: new LS.markov.Chain(C.ECONOMY_STATES, C.ECONOMY_P).stationary(),
                    });
                  },
                }),
              ]),
            ]),
          ],
        }),
        h('div', { style: { height: 'var(--s-5)' } }),

        /* ---------------- 快捷键 & 关于 ---------------- */
        h('div.grid.g-2', [
          LS.ui.card({
            title: '键盘快捷键',
            body: LS.ui.table(['按键', '作用'], [
              ['空格', '运行页：播放 / 暂停'],
              ['→', '运行页：单步推进一年'],
              ['F', '切换沉浸模式（隐藏侧栏）'],
              ['1 – 8', '快速跳转到各页面'],
              ['Esc', '关闭弹窗 / 收起移动端导航'],
            ], { align: ['left', 'left'] }),
          }),
          LS.ui.card({
            title: '关于与边界',
            body: [
              h('p', { style: { fontSize: 'var(--f-sm)', color: 'var(--t-2)', lineHeight: '1.75' } },
                'LifeSim 是一个关于选择与运气的小游戏，不是人生预测器。它把不同选择下的很多种可能各演一遍。'),
              h('p', { style: { fontSize: 'var(--f-sm)', color: 'var(--t-2)', lineHeight: '1.75', marginTop: '8px' } },
                '它当然简化了现实：家庭、行业、地域、身体……都没有被完全建模。所以别把任何一次结果当成真实决定的唯一依据。'),
              h('p', { style: { fontSize: 'var(--f-sm)', color: 'var(--t-2)', lineHeight: '1.75', marginTop: '8px' } }, [
                '它的用处，是让你看见几种',
                h('b', '权衡'),
                '：上限与下限、当下与长期、稳一点与赌一把。',
              ]),
              h('div', { style: { marginTop: 'var(--s-4)' } },
                h('div.row.gap-2.wrap', [
                  LS.ui.button('重新跑一次新手路径', {
                    variant: 'ghost', size: 'sm',
                    onClick: () => LS.router.go('/'),
                  }),
                ])),
            ],
          }),
        ]),
      ]);
    }

    function dataCell(label, value, unit) {
      return h('div.risk-cell', [
        h('div.rc-label', label),
        h('div.rc-val', value),
        h('div', { style: { fontSize: 'var(--f-xxs)', color: 'var(--t-4)' } }, unit),
      ]);
    }

    function importDialog() {
      const ta = h('textarea', {
        placeholder: '把之前导出的 JSON 粘贴到这里……',
        style: {
          width: '100%', height: '220px', fontFamily: 'var(--font-mono)',
          fontSize: '11px', background: 'rgba(0,0,0,0.25)', color: 'var(--t-1)',
          border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: 'var(--s-3)',
        },
      });
      LS.ui.modal({
        title: '导入数据',
        sub: '会覆盖当前的人生档案与进度',
        size: 'lg',
        body: [
          ta,
          h('div', { style: { height: 'var(--s-3)' } }),
          h('div.row.gap-3', [
            LS.ui.button('开始导入', {
              variant: 'primary',
              onClick: () => {
                const ok = LS.store.importJSON(ta.value);
                if (ok) {
                  LS.audio.syncFromSettings();
                  LS.ui.toast('导入成功', 'ok');
                  rebuild();
                } else {
                  LS.ui.toast('导入失败：不是有效的导出文件', 'bad');
                }
              },
            }),
            LS.ui.button('取消', { variant: 'ghost' }),
          ]),
        ],
      });
    }

    function confirmReset() {
      LS.ui.modal({
        title: '清空全部数据？',
        sub: '这个操作不可撤销',
        size: 'narrow',
        body: [
          h('p', { style: { color: 'var(--t-2)', lineHeight: '1.7' } },
            '将会删除：全部人生档案、成就进度、图鉴解锁记录、累计模拟统计与所有设置。'),
          h('p', { style: { color: 'var(--c-warn)', lineHeight: '1.7', marginTop: '8px' } },
            '建议先导出备份。'),
          h('div.row.gap-3', { style: { marginTop: 'var(--s-4)' } }, [
            LS.ui.button('确认清空', {
              variant: 'danger',
              onClick: () => {
                LS.store.reset();
                LS.audio.syncFromSettings();
                LS.ui.toast('已恢复到初始状态', 'ghost');
                rebuild();
              },
            }),
            LS.ui.button('取消', { variant: 'ghost' }),
          ]),
        ],
      });
    }

    const page = V.render({ title: '设置', sub: '体验 · 数据 · 模型', fate: null }, [
      V.head({
        kicker: '设置',
        title: '把软件调成适合你的样子',
        sub: '所有设置都只影响呈现方式与性能，不会改变模型本身的结果 —— 这一点很重要：模型的输出不应该被 UI 设置影响。',
        tight: true,
      }),
      elBody,
    ]);

    rebuild();
    return page;
  }

  LS.views.settings = { render: renderSettings };
  LS.router.register('/settings', renderSettings);
})(typeof globalThis !== 'undefined' ? globalThis : this);
