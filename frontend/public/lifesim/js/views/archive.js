/* ============================================================
 * LifeSim · views/archive.js
 * 人生档案（规格书 §20）
 *
 * 档案的价值在于"对比"：单条人生是故事，多条人生才是分布。
 * 所以这里除了列表，还提供"选择 2–3 条一起看"。
 * ========================================================== */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const V = LS.views;
  const { h, mount } = LS.dom;
  const U = LS.util;
  const C = LS.config;

  const SORTS = [
    { value: 'time', label: '最近' },
    { value: 'wealth', label: '财富' },
    { value: 'lifespan', label: '寿命' },
    { value: 'happiness', label: '幸福' },
  ];

  const COLORS = ['#a78bfa', '#2dd4bf', '#f5c860'];

  function renderArchive() {
    const st = LS.store.state;
    let sort = 'time';
    let selected = [];
    const elList = h('div');
    const elCompare = h('div');

    function sortedLives() {
      const arr = st.lives.slice();
      switch (sort) {
        case 'wealth': return arr.sort((a, b) => b.result.finalWealth - a.result.finalWealth);
        case 'lifespan': return arr.sort((a, b) => b.result.lifespan - a.result.lifespan);
        case 'happiness': return arr.sort((a, b) => b.result.happiness - a.result.happiness);
        default: return arr;
      }
    }

    function rebuild() {
      mount(elList, [list()]);
      mount(elCompare, [comparePanel()]);
      LS.shell.refreshBadges();
      if (selected.length >= 2) requestAnimationFrame(drawCompareChart);
    }

    /** 对比曲线：多条人生叠加 */
    function drawCompareChart() {
      const host = document.getElementById('archive-chart');
      if (!host) return;
      const lives = selected.map((id) => LS.store.getLife(id)).filter(Boolean);
      if (lives.length < 2) return;
      const n = Math.min(...lives.map((l) => (l.states || []).length));
      if (!n) return;
      LS.charts.replace(host, 'timeseries', {
        ages: lives[0].states.slice(0, n).map((s) => s.age),
        series: lives.map((l, i) => ({
          key: 'w' + i,
          label: '#' + l.worldSeed,
          color: COLORS[i],
          values: l.states.slice(0, n).map((s) => s.wealth),
          fill: i === 0,
        })),
      });
    }

    function list() {
      const lives = sortedLives();
      if (!lives.length) {
        return h('div.card.roomy', [
          h('div.empty', [
            h('div.e-ico', '🗄️'),
            h('div.h3', '档案还是空的'),
            h('div', { style: { maxWidth: '48ch', lineHeight: '1.65' } },
              '每跑完一条人生，它都会自动保存在这里。档案保存在浏览器本地（localStorage），最多保留 40 条 —— 超出后会淘汰最早的记录。'),
            h('div.row.gap-3', { style: { marginTop: 'var(--s-3)' } }, [
              LS.ui.button('生成第一条人生', { variant: 'primary', onClick: () => LS.router.go('/create') }),
              LS.ui.button('先跑 1,000 次批量模拟', { variant: 'ghost', onClick: () => LS.router.go('/universe') }),
            ]),
          ]),
        ]);
      }

      return h('div.grid.g-4', lives.map((l) => {
        const isSel = selected.indexOf(l.id) >= 0;
        const card = V.lifeCard(l, {
          active: isSel,
          onClick: () => {
            st.currentLifeId = l.id;
            LS.store.saveNow();
            LS.router.go('/result');
          },
        });
        // 附加操作条
        card.appendChild(h('div.lc-actions', [
          LS.ui.button(isSel ? '取消对比' : '加入对比', {
            variant: 'ghost', size: 'xs',
            onClick: (e) => {
              e.stopPropagation();
              if (isSel) selected = selected.filter((x) => x !== l.id);
              else {
                if (selected.length >= 3) { LS.ui.toast('最多同时对比 3 条人生', 'warn'); return; }
                selected.push(l.id);
              }
              rebuild();
            },
          }),
          LS.ui.button('删除', {
            variant: 'ghost', size: 'xs',
            onClick: (e) => {
              e.stopPropagation();
              LS.ui.modal({
                title: '删除这条人生？',
                sub: '#' + l.worldSeed,
                size: 'narrow',
                body: [
                  h('p', { style: { color: 'var(--t-2)', lineHeight: '1.7' } },
                    `这条人生最终财富 ${U.money(l.result.finalWealth)}、寿命 ${l.result.lifespan} 岁。删除后无法恢复。`),
                  h('div.row.gap-3', { style: { marginTop: 'var(--s-4)' } }, [
                    LS.ui.button('确认删除', {
                      variant: 'danger',
                      onClick: () => {
                        LS.store.removeLife(l.id);
                        selected = selected.filter((x) => x !== l.id);
                        LS.ui.toast('已删除', 'ghost');
                        rebuild();
                      },
                    }),
                    LS.ui.button('保留', { variant: 'ghost' }),
                  ]),
                ],
              });
            },
          }),
        ]));
        return card;
      }));
    }

    function comparePanel() {
      if (selected.length < 2) {
        return LS.ui.card({
          title: '多条人生对比',
          sub: selected.length === 0 ? '从上面的卡片里挑 2～3 条人生' : '还需要至少 1 条',
          body: [
            LS.ui.notice('把多个人生叠在一起看，才能分清楚"哪些差异来自选择，哪些来自运气"。建议选择策略不同、但世界种子相同的两条人生。', 'know'),
          ],
        });
      }
      const lives = selected.map((id) => LS.store.getLife(id)).filter(Boolean);
      return LS.ui.card({
        title: '多条人生对比',
        sub: `${lives.length} 条人生叠在一起`,
        actions: [LS.ui.button('清空选择', { variant: 'ghost', size: 'sm', onClick: () => { selected = []; rebuild(); } })],
        body: [
          h('div', { style: { height: '300px' }, id: 'archive-chart' }),
          h('div', { style: { height: 'var(--s-4)' } }),
          LS.ui.table(
            ['维度', ...lives.map((l, i) => '#' + l.worldSeed)],
            [
              ['最终财富', ...lives.map((l) => U.money(l.result.finalWealth))],
              ['峰值财富', ...lives.map((l) => U.money(l.result.peakWealth))],
              ['寿命', ...lives.map((l) => l.result.lifespan + ' 岁')],
              ['健康', ...lives.map((l) => U.fixed(l.result.health, 1))],
              ['幸福', ...lives.map((l) => U.fixed(l.result.happiness, 1))],
              ['事业成就', ...lives.map((l) => U.fixed(l.result.achievement, 1))],
              ['社会关系', ...lives.map((l) => U.fixed(l.result.relationship, 1))],
              ['最终职业', ...lives.map((l) => C.CAREER_LABEL[l.result.finalCareer] || '—')],
              ['学历', ...lives.map((l) => l.result.educationLabel || '—')],
              ['重大事件数', ...lives.map((l) => String(l.result.majorEvents))],
              ['策略', ...lives.map((l) => LS.character.describeStrategy(l.strategy))],
            ],
            { align: ['left', ...lives.map(() => 'right')] },
          ),
        ],
      });
    }

    const page = V.render({ title: '人生档案', sub: '收藏 · 对比', fate: null }, [
      V.head({
        kicker: '档案馆',
        title: '你已经活过 ' + st.lives.length + ' 次',
        sub: '每一次模拟都会被保存下来。这里可以按财富、寿命、幸福排序，也可以把几条人生叠在一起比较。',
        tight: true,
        actions: [
          LS.ui.segmented(SORTS, sort, (v) => { sort = v; rebuild(); }),
          LS.ui.button('导出全部数据', {
            variant: 'ghost',
            onClick: () => download(LS.store.exportJSON()),
          }),
          st.lives.length ? LS.ui.button('清空档案', {
            variant: 'ghost',
            onClick: () => LS.ui.modal({
              title: '清空全部档案？',
              sub: '共 ' + st.lives.length + ' 条人生',
              size: 'narrow',
              body: [
                h('p', { style: { color: 'var(--t-2)', lineHeight: '1.7' } },
                  '这会删除所有已保存的人生记录（成就与图鉴进度会保留）。建议先导出备份。'),
                h('div.row.gap-3', { style: { marginTop: 'var(--s-4)' } }, [
                  LS.ui.button('确认清空', {
                    variant: 'danger',
                    onClick: () => { LS.store.clearLives(); selected = []; rebuild(); LS.ui.toast('档案已清空', 'ghost'); },
                  }),
                  LS.ui.button('取消', { variant: 'ghost' }),
                ]),
              ],
            }),
          }) : null,
        ].filter(Boolean),
      }),
      elList,
      h('div', { style: { height: 'var(--s-5)' } }),
      elCompare,
    ]);

    rebuild();
    return page;
  }

  function download(text, filename) {
    try {
      const name = filename || ('lifesim-backup-' + new Date().toISOString().slice(0, 10) + '.json');
      const blob = new Blob([text], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
      LS.ui.toast('已导出 ' + name, 'ok');
    } catch (e) {
      // file:// 下部分浏览器限制下载，退化为复制
      LS.ui.modal({
        title: '导出数据',
        sub: '浏览器阻止了自动下载，请手动复制下面的内容',
        size: 'lg',
        body: [h('textarea', { style: { width: '100%', height: '300px', fontFamily: 'var(--font-mono)', fontSize: '11px' } }, text)],
      });
    }
  }

  LS.views.archive = { render: renderArchive, download };
  LS.router.register('/archive', renderArchive);
})(typeof globalThis !== 'undefined' ? globalThis : this);
