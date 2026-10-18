/* ============================================================
 * LifeSim · ui/components.js
 * 复用组件（规格书 §54）
 *
 * 原则（规格书 §54）：
 *   图表组件只接收数据，不直接执行模拟；
 *   模拟服务只输出结构化结果；页面只负责组织状态与交互。
 * ============================================================ */
(function (global) {
  'use strict';
  const LS = (global.LifeSim = global.LifeSim || {});
  const { h, mount } = LS.dom;
  const U = LS.util;

  /* ============================================================
   * 线性图标：只统一界面 chrome，事件 emoji 保留辨识度
   * ========================================================== */
  const ICON_DEFS = {
    home: [
      ['path', { d: 'M3 10.5 12 3l9 7.5' }],
      ['path', { d: 'M5.5 9.5V21h13V9.5M9.5 21v-6h5v6' }],
    ],
    sliders: [
      ['path', { d: 'M4 7h7M15 7h5M4 17h5M13 17h7' }],
      ['circle', { cx: 13, cy: 7, r: 2 }],
      ['circle', { cx: 10, cy: 17, r: 2 }],
    ],
    play: [['path', { d: 'M8 5v14l11-7z' }]],
    report: [
      ['path', { d: 'M6 3h9l3 3v15H6z' }],
      ['path', { d: 'M14 3v4h4M9 12h6M9 16h6' }],
    ],
    orbit: [
      ['circle', { cx: 12, cy: 12, r: 3 }],
      ['path', { d: 'M3 12c0-3.3 4-6 9-6s9 2.7 9 6-4 6-9 6-9-2.7-9-6z', transform: 'rotate(-25 12 12)' }],
    ],
    scale: [
      ['path', { d: 'M12 4v16M6 7h12M8 20h8' }],
      ['path', { d: 'M6 7 3.5 13h5L6 7zM18 7l-2.5 6h5L18 7z' }],
    ],
    archive: [
      ['path', { d: 'M4 7h16v13H4z' }],
      ['path', { d: 'M3 4h18v4H3zM9 12h6' }],
    ],
    book: [
      ['path', { d: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H12v18H6.5A2.5 2.5 0 0 0 4 23.5z' }],
      ['path', { d: 'M20 5.5A2.5 2.5 0 0 0 17.5 3H12v18h5.5A2.5 2.5 0 0 1 20 23.5z' }],
    ],
    settings: [
      ['circle', { cx: 12, cy: 12, r: 3.2 }],
      ['path', { d: 'M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1' }],
    ],
    menu: [['path', { d: 'M4 7h16M4 12h16M4 17h16' }]],
    spark: [['path', { d: 'M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z' }]],
    bolt: [['path', { d: 'M13 2 4 14h7l-1 8 9-12h-7z' }]],
    target: [
      ['circle', { cx: 12, cy: 12, r: 8 }],
      ['circle', { cx: 12, cy: 12, r: 4 }],
      ['circle', { cx: 12, cy: 12, r: 1.2 }],
    ],
  };

  function icon(name, size = 18) {
    const def = ICON_DEFS[name];
    if (!def) return null;
    return h('svg.ui-icon', {
      viewBox: '0 0 24 24',
      width: String(size),
      height: String(size),
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.7,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    }, def.map(([tag, props]) => h(tag, props)));
  }

  /* ============================================================
   * 人生阶段场景：原创 SVG，不依赖外部图片
   * ========================================================== */
  let sceneSeq = 0;
  const SCENE_META = {
    start: { label: '出发', range: '18–27 岁', note: '一张还没写完的简历' },
    family: { label: '成家', range: '28–42 岁', note: '日子开始有了别人的重量' },
    mid: { label: '中年', range: '43–60 岁', note: '上有老，下有小' },
    late: { label: '慢下来', range: '60 岁以后', note: '把时间还给自己' },
  };

  function stageOfAge(age) {
    if (age < 28) return 'start';
    if (age < 43) return 'family';
    if (age < 61) return 'mid';
    return 'late';
  }

  function lifeScene(stage, opts = {}) {
    const key = SCENE_META[stage] ? stage : 'start';
    const meta = SCENE_META[key];
    const compact = !!opts.compact;
    const id = 'sc' + (++sceneSeq);
    const palettes = {
      start: {
        bg1: '#08101f', bg2: '#0c1728', wall: '#172741', wallDark: '#0e1a2d',
        floor: '#111d32', floorLine: '#2a4262', wood: '#5a4030', woodDark: '#35241a',
        accent: '#7dd3fc', warm: '#fbbf24', green: '#4f8a70', fabric: '#334155',
        rug: '#172b4a', sofa: '#3b4a63', sofaDark: '#26344b', skin: '#c08457',
        text: '#dbeafe', frame: '#0a1322',
      },
      family: {
        bg1: '#160d0a', bg2: '#24130e', wall: '#3a241b', wallDark: '#22140e',
        floor: '#1b100b', floorLine: '#5a3728', wood: '#7a5136', woodDark: '#3d2418',
        accent: '#fbbf24', warm: '#f59e0b', green: '#6f8b4e', fabric: '#8b5a3c',
        rug: '#4a2c1c', sofa: '#8a5638', sofaDark: '#5c3624', skin: '#d8a06a',
        text: '#ffedd5', frame: '#1a0d08',
      },
      mid: {
        bg1: '#061318', bg2: '#0a1e24', wall: '#123137', wallDark: '#081b20',
        floor: '#0a1b20', floorLine: '#1e4b50', wood: '#5f4734', woodDark: '#32241b',
        accent: '#5eead4', warm: '#fbbf24', green: '#4f8a70', fabric: '#2f4f52',
        rug: '#103137', sofa: '#315c5a', sofaDark: '#1d3c3b', skin: '#c08457',
        text: '#ccfbf1', frame: '#061014',
      },
      late: {
        bg1: '#1c0e09', bg2: '#32180e', wall: '#4a2a1c', wallDark: '#2a160d',
        floor: '#21110b', floorLine: '#6b3c25', wood: '#7a5136', woodDark: '#3d2418',
        accent: '#fdba74', warm: '#fbbf24', green: '#6f8b4e', fabric: '#8f5a3b',
        rug: '#4f2c1a', sofa: '#9a6038', sofaDark: '#633a22', skin: '#d8a06a',
        text: '#ffedd5', frame: '#1a0d08',
      },
    };
    const p = palettes[key];
    const parts = [];
    const push = (el) => parts.push(el);
    const poly = (points, fill, opacity, extra) => push(h('polygon', Object.assign({
      points, fill, opacity: opacity == null ? 1 : opacity,
    }, extra || {})));
    const box = (x, y, w, hh, rx, fill, opacity, extra) => push(h('rect', Object.assign({
      x, y, width: w, height: hh, rx: rx || 0, fill, opacity: opacity == null ? 1 : opacity,
    }, extra || {})));
    const line = (d, stroke, width, opacity) => push(h('path', {
      d, fill: 'none', stroke, 'stroke-width': width || 1, 'stroke-opacity': opacity == null ? 1 : opacity,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));

    /* ---------- 背景 / 光 ---------- */
    push(h('defs', [
      h('linearGradient', { id: id + 'bg', x1: '0', y1: '0', x2: '0', y2: '1' }, [
        h('stop', { offset: '0%', 'stop-color': p.bg2 }),
        h('stop', { offset: '100%', 'stop-color': p.bg1 }),
      ]),
      h('linearGradient', { id: id + 'sky', x1: '0', y1: '0', x2: '0', y2: '1' }, [
        h('stop', { offset: '0%', 'stop-color': key === 'late' ? '#7c2d12' : key === 'family' ? '#7c4a1d' : key === 'mid' ? '#134e4a' : '#0b1b3a' }),
        h('stop', { offset: '100%', 'stop-color': key === 'late' ? '#fdba74' : key === 'family' ? '#fcd34d' : key === 'mid' ? '#2dd4bf' : '#334155' }),
      ]),
      h('linearGradient', { id: id + 'wall', x1: '0', y1: '0', x2: '0', y2: '1' }, [
        h('stop', { offset: '0%', 'stop-color': p.wall }),
        h('stop', { offset: '100%', 'stop-color': p.wallDark }),
      ]),
      h('linearGradient', { id: id + 'floor', x1: '0', y1: '0', x2: '0', y2: '1' }, [
        h('stop', { offset: '0%', 'stop-color': p.floorLine, 'stop-opacity': '0.5' }),
        h('stop', { offset: '100%', 'stop-color': p.floor }),
      ]),
      h('radialGradient', { id: id + 'glow', cx: '50%', cy: '50%', r: '50%' }, [
        h('stop', { offset: '0%', 'stop-color': p.accent, 'stop-opacity': '0.38' }),
        h('stop', { offset: '100%', 'stop-color': p.accent, 'stop-opacity': '0' }),
      ]),
      h('radialGradient', { id: id + 'warm', cx: '50%', cy: '50%', r: '50%' }, [
        h('stop', { offset: '0%', 'stop-color': p.warm, 'stop-opacity': '0.5' }),
        h('stop', { offset: '100%', 'stop-color': p.warm, 'stop-opacity': '0' }),
      ]),
    ]));
    box(0, 0, 960, 320, 0, 'url(#' + id + 'bg)');
    push(h('circle', { cx: 720, cy: 92, r: 210, fill: 'url(#' + id + 'glow)', opacity: 0.6 }));
    push(h('circle', { cx: 200, cy: 210, r: 230, fill: 'url(#' + id + 'warm)', opacity: 0.12 }));

    /* ---------- 房间：后墙 / 侧墙 / 地板 ---------- */
    poly('120,40 840,40 840,220 120,220', 'url(#' + id + 'wall)');
    poly('120,40 40,320 120,320 120,220', p.wallDark);
    poly('840,40 920,320 840,320 840,220', p.wallDark);
    poly('120,220 840,220 920,320 40,320', 'url(#' + id + 'floor)');
    // 墙板缝
    for (const x of [240, 360, 480, 600, 720]) line('M' + x + ' 40V220', p.floorLine, 1, 0.18);
    line('M120 220H840', p.floorLine, 2, 0.55);
    line('M120 230H840', p.floorLine, 1, 0.18);
    // 地板透视
    line('M120 220 40 320M270 220 190 320M420 220 340 320M570 220 490 320M720 220 640 320M840 220 840 320', p.floorLine, 1, 0.2);
    line('M120 260H840M120 292H840', p.floorLine, 1, 0.12);
    // 底座厚度
    poly('40,320 920,320 920,334 40,334', '#050b14');
    poly('120,220 840,220 840,228 120,228', p.frame, 0.45);

    /* ---------- 窗 ---------- */
    const winX = 150, winY = 64, winW = 310, winH = 140;
    box(winX - 10, winY - 10, winW + 20, winH + 20, 12, p.frame);
    box(winX, winY, winW, winH, 6, 'url(#' + id + 'sky)');
    push(h('circle', { cx: 410, cy: 104, r: 22, fill: p.warm, opacity: 0.9 }));
    push(h('circle', { cx: 410, cy: 104, r: 42, fill: p.warm, opacity: 0.12 }));
    // 窗外城市
    push(h('path', {
      d: 'M150 204V168h26v36M184 204V146h28v58M220 204V176h22v28M250 204V156h34v48M292 204V132h24v72M324 204V164h30v40M362 204V150h34v54M404 204V172h36v32M448 204V158h12v46',
      fill: p.bg2, opacity: 0.72,
    }));
    line('M150 204H460', p.accent, 1, 0.35);
    line('M305 64V204M150 134H460', p.frame, 4, 0.95);
    line('M305 64V204M150 134H460', p.accent, 1, 0.2);
    // 窗光落在地板上
    poly('150,204 460,204 600,320 0,320', p.accent, 0.035);
    // 窗帘
    poly('136,54 164,54 176,214 150,214', p.wallDark, 0.95);
    poly('464,54 496,54 486,214 456,214', p.wallDark, 0.95);

    /* ---------- 墙面装饰 ---------- */
    if (key === 'start') {
      box(620, 64, 118, 72, 6, p.frame);
      box(628, 72, 102, 56, 3, p.wallDark);
      push(h('circle', { cx: 660, cy: 100, r: 13, fill: p.warm, opacity: 0.65 }));
      poly('628,128 654,104 680,118 704,94 730,111 730,128', p.green, 0.45);
      line('M622 150H736', p.floorLine, 4, 0.8);
    } else if (key === 'family') {
      box(600, 62, 74, 58, 5, p.frame);
      box(608, 70, 58, 42, 3, p.wallDark);
      push(h('circle', { cx: 628, cy: 90, r: 8, fill: p.warm, opacity: 0.65 }));
      push(h('circle', { cx: 648, cy: 90, r: 7, fill: p.accent, opacity: 0.5 }));
      box(686, 70, 58, 46, 5, p.frame);
      box(694, 78, 42, 30, 3, p.wallDark);
      line('M700 98 714 86 728 93 736 84', p.green, 3, 0.75);
      box(752, 58, 76, 62, 5, p.frame);
      box(760, 66, 60, 46, 3, p.wallDark);
      push(h('path', { d: 'M772 104c8-16 22-16 30 0z', fill: p.warm, opacity: 0.55 }));
    } else if (key === 'mid') {
      box(620, 62, 120, 72, 6, p.frame);
      box(628, 70, 104, 56, 3, p.wallDark);
      push(h('circle', { cx: 682, cy: 100, r: 21, fill: p.accent, opacity: 0.14 }));
      push(h('circle', { cx: 682, cy: 100, r: 14, fill: 'none', stroke: p.accent, 'stroke-width': 2, opacity: 0.7 }));
      line('M682 100V91M682 100l8 5', p.accent, 2, 0.75);
      // 书架
      box(760, 70, 62, 86, 4, p.frame);
      for (let i = 0; i < 4; i++) {
        box(766, 78 + i * 19, 50, 4, 2, p.wood, 0.8);
        box(770, 82 + i * 19, 7 + (i % 2) * 5, 12, 1, i % 2 ? p.accent : p.warm, 0.55);
        box(782, 82 + i * 19, 8, 12, 1, p.green, 0.5);
      }
    } else {
      box(620, 66, 132, 78, 6, p.frame);
      box(628, 74, 116, 62, 3, p.wallDark);
      push(h('circle', { cx: 704, cy: 104, r: 24, fill: p.warm, opacity: 0.3 }));
      poly('628,132 658,108 682,120 706,96 736,112 744,136 628,136', p.green, 0.45);
      box(770, 84, 58, 74, 4, p.frame);
      box(778, 92, 42, 58, 2, p.wallDark);
      line('M784 140 796 118 808 128 816 110', p.warm, 2.5, 0.7);
    }

    /* ---------- 书桌（出发 / 中年） ---------- */
    if (key === 'start' || key === 'mid') {
      // 地毯
      push(h('ellipse', { cx: 700, cy: 300, rx: 240, ry: 24, fill: p.rug, opacity: 0.85 }));
      // 桌下阴影
      push(h('ellipse', { cx: 700, cy: 305, rx: 155, ry: 16, fill: '#000', opacity: 0.28 }));
      // 桌面
      poly('560,226 830,226 862,250 592,250', p.wood);
      poly('592,250 862,250 862,286 592,286', p.woodDark);
      poly('830,226 862,250 862,286 830,262', '#24160f');
      // 抽屉
      box(660, 258, 82, 20, 3, '#1c110b', 0.9);
      box(668, 264, 66, 3, 1, p.warm, 0.35);
      box(760, 258, 82, 20, 3, '#1c110b', 0.9);
      box(768, 264, 66, 3, 1, p.warm, 0.35);
      // 桌腿
      box(606, 286, 12, 30, 1, '#1c110b');
      box(828, 286, 12, 30, 1, '#1c110b');
      // 屏幕
      box(652, 160, 104, 60, 5, '#050a12', 1, { stroke: p.accent, 'stroke-opacity': 0.35 });
      box(660, 168, 88, 44, 3, p.accent, key === 'mid' ? 0.22 : 0.16);
      for (let i = 0; i < 3; i++) box(668, 176 + i * 10, 52 - i * 8, 3, 1, p.accent, 0.45);
      // 屏幕支架
      poly('696,220 728,220 734,230 690,230', '#050a12');
      // 键盘
      poly('636,232 742,232 756,242 650,242', '#1f2937');
      // 纸张
      poly('770,232 818,232 826,240 778,240', '#d6c7b0', 0.85);
      box(780, 236, 28, 2, 1, p.woodDark, 0.5);
      // 咖啡
      box(824, 228, 16, 14, 3, p.accent, 0.65);
      push(h('path', { d: 'M840 232h6a3 3 0 0 1 0 6h-6', fill: 'none', stroke: p.accent, 'stroke-width': 2 }));
      // 台灯
      line('M780 146V228', '#d9d2c3', 4, 1);
      poly('760,146 800,146 792,166 768,166', p.warm, 0.95);
      push(h('circle', { cx: 780, cy: 162, r: 30, fill: 'url(#' + id + 'warm)', opacity: 0.5 }));
      push(h('circle', { cx: 780, cy: 158, r: 5, fill: '#fff7d6' }));
      // 椅子
      box(610, 258, 74, 9, 4, '#111827');
      box(620, 266, 54, 34, 4, p.fabric, 0.9);
      box(626, 300, 8, 14, 2, '#111827');
      box(666, 300, 8, 14, 2, '#111827');
      // 植物
      poly('862,266 902,266 896,308 868,308', '#2b1c14');
      push(h('path', { d: 'M882 266c-18-20-10-38 2-48 10 16 18 30 2 48z', fill: p.green, opacity: 0.9 }));
      push(h('path', { d: 'M882 266c-22-8-32-22-30-38 18 4 28 18 30 38z', fill: p.green, opacity: 0.65 }));
      push(h('path', { d: 'M882 266c18-10 28-24 26-38-16 4-24 18-26 38z', fill: p.green, opacity: 0.55 }));
      // 背包（出发）
      if (key === 'start') {
        poly('180,250 238,250 238,296 230,304 188,304 180,296', p.fabric);
        push(h('path', { d: 'M198 250v-9a11 11 0 0 1 22 0v9', fill: 'none', stroke: p.accent, 'stroke-width': 4, opacity: 0.6 }));
        box(196, 268, 24, 4, 2, p.accent, 0.45);
        box(196, 280, 24, 4, 2, p.accent, 0.3);
        line('M180 280h-16M238 280h16', p.accent, 4, 0.45);
      }
    } else {
      /* ---------- 沙发 / 扶手椅（成家 / 慢下来） ---------- */
      push(h('ellipse', { cx: 700, cy: 304, rx: 250, ry: 22, fill: p.rug, opacity: 0.85 }));
      push(h('ellipse', { cx: 700, cy: 306, rx: 170, ry: 18, fill: '#000', opacity: 0.28 }));
      // 沙发背
      box(548, 190, 300, 54, 16, p.sofaDark);
      box(558, 198, 120, 40, 12, p.sofa);
      box(686, 198, 120, 40, 12, p.sofa);
      // 坐垫
      box(548, 232, 300, 46, 14, p.sofa);
      box(566, 240, 116, 28, 10, p.fabric, 0.7);
      box(700, 240, 116, 28, 10, p.fabric, 0.6);
      // 扶手
      box(536, 224, 30, 54, 12, p.sofaDark);
      box(850, 224, 30, 54, 12, p.sofaDark);
      // 腿
      box(562, 278, 12, 22, 2, '#1c110b');
      box(826, 278, 12, 22, 2, '#1c110b');
      // 边几
      poly('842,248 920,248 936,262 858,262', p.wood);
      box(858, 262, 78, 8, 2, p.woodDark);
      box(862, 270, 8, 32, 1, '#1c110b');
      box(922, 270, 8, 32, 1, '#1c110b');
      // 茶
      box(874, 238, 17, 14, 3, p.accent, 0.75);
      push(h('path', { d: 'M891 242h6a3 3 0 0 1 0 6h-6', fill: 'none', stroke: p.accent, 'stroke-width': 2 }));
      // 咖啡桌
      poly('640,268 792,268 810,282 658,282', p.wood);
      box(658, 282, 152, 6, 2, p.woodDark);
      box(664, 288, 8, 24, 1, '#1c110b');
      box(794, 288, 8, 24, 1, '#1c110b');
      // 茶几上的书和杯子
      box(688, 260, 34, 6, 2, p.accent, 0.55);
      box(694, 254, 28, 5, 2, p.warm, 0.6);
      box(748, 260, 14, 12, 3, p.accent, 0.7);
      // 家庭照片 / 猫
      if (key === 'family') {
        box(200, 250, 52, 40, 5, p.warm, 0.14);
        box(206, 256, 18, 18, 3, p.warm, 0.55);
        box(228, 256, 18, 18, 3, p.accent, 0.5);
        box(272, 272, 20, 20, 4, p.warm, 0.55);
        box(296, 282, 14, 14, 3, p.accent, 0.45);
      }
      if (key === 'late') {
        // 猫
        push(h('ellipse', { cx: 330, cy: 286, rx: 30, ry: 17, fill: p.warm, opacity: 0.9 }));
        push(h('path', { d: 'M310 278l-6-15 14 8M350 278l6-15-14 8', fill: p.warm, opacity: 0.9 }));
        push(h('path', { d: 'M360 282c18 5 22 20 9 27', fill: 'none', stroke: p.warm, 'stroke-width': 5, 'stroke-linecap': 'round', opacity: 0.85 }));
        push(h('circle', { cx: 324, cy: 283, r: 2, fill: '#111827' }));
        push(h('circle', { cx: 337, cy: 283, r: 2, fill: '#111827' }));
        // 书堆
        box(220, 250, 46, 8, 2, p.accent, 0.55);
        box(224, 242, 42, 8, 2, p.warm, 0.6);
        box(228, 234, 36, 8, 2, p.green, 0.55);
      }
    }

    /* ---------- 灯带 / 浮尘 ---------- */
    line('M120 40H840', p.frame, 6, 0.85);
    line('M120 41H840', p.accent, 1, 0.2);
    for (const [x, y, r] of [[100, 130, 2], [500, 72, 1.6], [560, 120, 1.4], [900, 180, 1.8], [300, 300, 1.5]]) {
      push(h('circle', { cx: x, cy: y, r, fill: p.accent, opacity: 0.35 }));
    }

    const svg = h('svg.scene-svg', {
      viewBox: '0 0 960 320',
      preserveAspectRatio: 'xMidYMid slice',
      role: 'img',
      'aria-label': meta.label + '的人生阶段插画',
    }, parts);

    return h('div.life-scene' + (compact ? '.compact' : ''), [
      svg,
      h('div.scene-caption', [
        h('span.scene-kicker', '人生阶段'),
        h('strong', meta.label),
        h('span.scene-range', meta.range + ' · ' + meta.note),
      ]),
    ]);
  }

  /* ============================================================
   * 基础容器
   * ========================================================== */

  function card(opts = {}) {
    const {
      title, sub, actions, body, className = '', tight, roomy, solid,
      hoverable, glow, onClick, headExtra,
    } = opts;
    const cls = ['card'];
    if (tight) cls.push('tight');
    if (roomy) cls.push('roomy');
    if (solid) cls.push('solid');
    if (hoverable) cls.push('hoverable');
    if (glow) cls.push('glow-' + glow);
    if (className) cls.push(className);

    const kids = [];
    if (title || sub || actions || headExtra) {
      kids.push(h('div.card-head', [
        h('div', [
          title ? h('div.card-title', title) : null,
          sub ? h('div.card-sub', sub) : null,
          headExtra || null,
        ]),
        actions ? h('div.card-actions', actions) : null,
      ]));
    }
    if (body) kids.push(...(Array.isArray(body) ? body : [body]));
    return h('div.' + cls.join('.'), { onclick: onClick }, kids);
  }

  /** 图表卡：统一顶部结构（规格书 §50.2） */
  function chartCard(opts = {}) {
    const {
      title, sub, actions, footer, className = '', minHeight,
      onMount, chartId, body,
    } = opts;
    // body 允许外部把一个已存在的容器（用于后续 mount 图表）放进卡片
    const host = body || h('div.chart-body', {
      id: chartId,
      style: minHeight ? { minHeight: minHeight + 'px' } : null,
    });
    if (body && minHeight && !body.style.minHeight) body.style.minHeight = minHeight + 'px';
    const kids = [];
    if (title || sub || actions) {
      kids.push(h('div.card-head', { style: { marginBottom: '10px' } }, [
        h('div', [
          title ? h('div.card-title', { style: { fontSize: '16px' } }, title) : null,
          sub ? h('div.card-sub', sub) : null,
        ]),
        actions ? h('div.card-actions', actions) : null,
      ]));
    }
    kids.push(host);
    if (footer) kids.push(footer);
    const el = h('div.card.chart-card' + (className ? '.' + className : ''), kids);
    if (onMount) requestAnimationFrame(() => onMount(host));
    return el;
  }

  /* ============================================================
   * 数值展示（规格书 §50.1：数字 + 语义）
   * ========================================================== */

  function metric(opts = {}) {
    const { label, value, note, tone, size, className = '', onClick } = opts;
    const cls = ['metric'];
    if (size) cls.push(size);
    if (className) cls.push(className);
    return h('div.' + cls.join('.'), { onclick: onClick }, [
      h('div.m-label', label),
      h('div.m-value' + (tone ? '.v-' + tone : ''), value),
      note ? h('div.m-note', note) : null,
    ]);
  }

  function heroNum(value, opts = {}) {
    const { gold, className = '', style } = opts;
    return h('div.hero-num' + (gold ? '.gold' : '') + (className ? '.' + className : ''),
      { style }, value);
  }

  /* ============================================================
   * 交互控件
   * ========================================================== */

  function button(label, opts = {}) {
    const {
      variant = '', size = '', icon, onClick, disabled, className = '',
      title, id,
    } = opts;
    const cls = ['btn'];
    if (variant) cls.push(variant);
    if (size) cls.push(size);
    if (className) cls.push(className);
    const kids = [];
    if (icon) kids.push(h('span', icon));
    if (label) kids.push(h('span', label));
    return h('button.' + cls.join('.'), {
      onclick: onClick, disabled, title, id, type: 'button',
    }, kids);
  }

  function iconButton(icon, opts = {}) {
    const { onClick, on, title, id } = opts;
    return h('button.btn-icon' + (on ? '.on' : ''), {
      onclick: onClick, title, id, type: 'button',
    }, icon);
  }

  function segmented(options, value, onChange, opts = {}) {
    return h('div.segmented', { id: opts.id }, options.map((o) =>
      h('button' + (o.value === value ? '.on' : ''), {
        type: 'button',
        title: o.title,
        onclick: () => onChange(o.value),
      }, o.label)));
  }

  function chip(text, tone) {
    return h('span.chip' + (tone ? '.' + tone : ''), text);
  }

  function fateBadge(seed, locked) {
    return h('span.fate-badge' + (locked ? '.locked' : ''), [
      h('span.lock', locked ? '🔒' : '🎲'),
      h('span', '世界编号 #' + seed),
      locked ? h('span.chip.teal', { style: { height: '18px', padding: '0 7px' } }, '锁住了') : null,
    ]);
  }

  /**
   * 策略滑块（规格书 §8.3）。
   * 注意：滑块改变的是"行为概率"，不是确定命令（§8.4），
   * 所以右侧数值显示的是倾向百分比而不是绝对承诺。
   */
  function slider(opts = {}) {
    const {
      name, icon, left, right, hint, value = 0.5, onChange, id,
      min = 0, max = 1, step = 0.01, fmt,
    } = opts;
    const valEl = h('span.slider-val', fmt ? fmt(value) : Math.round(value * 100) + '%');
    const input = h('input', {
      type: 'range', min, max, step, value,
      id,
      oninput: (e) => {
        const v = parseFloat(e.target.value);
        valEl.textContent = fmt ? fmt(v) : Math.round(v * 100) + '%';
        e.target.style.setProperty('--pct', ((v - min) / (max - min) * 100) + '%');
        if (onChange) onChange(v);
      },
    });
    input.style.setProperty('--pct', ((value - min) / (max - min) * 100) + '%');
    const wrap = h('div.slider-row', [
      h('div.slider-head', [
        h('div.slider-name', [icon ? h('span.ico', icon) : null, h('span', name)]),
        valEl,
      ]),
      input,
      (left || right) ? h('div.slider-ends', [h('span', left || ''), h('span', right || '')]) : null,
      hint ? h('div', { style: { fontSize: 'var(--f-xxs)', color: 'var(--t-4)', lineHeight: '1.45' } }, hint) : null,
    ]);
    wrap._input = input;
    wrap._valEl = valEl;
    return wrap;
  }

  function switchRow(opts = {}) {
    const { name, desc, checked, onChange, id } = opts;
    const input = h('input', {
      type: 'checkbox', checked, id,
      onchange: (e) => onChange && onChange(e.target.checked),
    });
    return h('label.switch', { style: desc ? { width: '100%' } : null }, [
      input, h('span.track'),
      h('span', [
        h('span', name),
        desc ? h('div', { style: { fontSize: 'var(--f-xxs)', color: 'var(--t-4)' } }, desc) : null,
      ]),
    ]);
  }

  function progressBar(value, opts = {}) {
    const { tone = '', thin, thick, marker } = opts;
    const cls = ['bar'];
    if (tone) cls.push(tone);
    if (thin) cls.push('thin');
    if (thick) cls.push('thick');
    const inner = h('i', { style: { width: Math.max(0, Math.min(1, value)) * 100 + '%' } });
    const kids = [inner];
    if (marker != null) {
      kids.push(h('span.marker', {
        style: { left: Math.max(0, Math.min(1, marker)) * 100 + '%' },
      }));
    }
    return h('div.' + cls.join('.'), kids);
  }

  /** 百分位尺（规格书 §12.3） */
  function percentileScale(p) {
    const pct = Math.max(0, Math.min(1, p));
    return h('div.percentile-scale', [
      h('div.p-track'),
      h('span.p-star', { style: { left: pct * 100 + '%' }, title: '你的位置' }, '★'),
      h('div.p-ticks', [
        h('span', '0%'), h('span', '25%'), h('span', '50%'), h('span', '75%'), h('span', '100%'),
      ]),
    ]);
  }

  function legend(items, opts = {}) {
    return h('div.legend', { style: opts.style }, items.map((it) =>
      h('div.lg-item', [
        h('span.swatch' + (it.dash ? '.dash' : it.line ? '.line' : ''), {
          style: it.dash
            ? { color: it.color, borderTopColor: it.color }
            : { background: it.color },
        }),
        h('span', it.label),
      ])));
  }

  /* ============================================================
   * 反馈
   * ========================================================== */

  function notice(text, tone = '', opts = {}) {
    const icons = { know: '💡', warn: '⚠️', bad: '⛔', ok: '✓' };
    return h('div.notice' + (tone ? '.' + tone : ''), { style: opts.style }, [
      tone && icons[tone] ? h('span', icons[tone]) : null,
      h('div.grow', typeof text === 'string' ? text : text),
    ]);
  }

  function emptyState(opts = {}) {
    const { icon = '🌌', title, desc, action } = opts;
    return h('div.empty', [
      h('div.e-ico', icon),
      h('div.h3', title || '这里还是空的'),
      desc ? h('div', { style: { maxWidth: '46ch', lineHeight: '1.6' } }, desc) : null,
      action || null,
    ]);
  }

  function toast(text, tone = '', ms = 3200) {
    let host = document.getElementById('toast-host');
    if (!host) {
      host = h('div.toast-host', { id: 'toast-host' });
      document.body.appendChild(host);
    }
    const icons = { ok: '✓', warn: '⚠', bad: '✕', fate: '✨' };
    const el = h('div.toast' + (tone ? '.' + tone : ''), [
      tone && icons[tone] ? h('span', icons[tone]) : null,
      h('span', text),
    ]);
    host.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s, transform .3s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(() => el.remove(), 320);
    }, ms);
    return el;
  }

  /** 浮出 chip（规格书 §9.6：自动决策时短暂出现） */
  function floatChip(host, text, tone) {
    if (!host) return;
    const r = host.getBoundingClientRect();
    const el = h('div.float-chip' + (tone ? '.v-' + tone : ''), {
      style: {
        left: (60 + Math.random() * Math.max(20, r.width - 220)) + 'px',
        top: (30 + Math.random() * Math.max(10, r.height - 90)) + 'px',
      },
    }, text);
    host.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  /* ============================================================
   * 模态框
   * ========================================================== */

  function modal(opts = {}) {
    const { title, sub, body, actions, size = '', onClose } = opts;
    const inner = h('div.modal' + (size ? '.' + size : ''), [
      (title || actions) ? h('div.card-head', [
        h('div', [
          title ? h('div.card-title', title) : null,
          sub ? h('div.card-sub', sub) : null,
        ]),
        h('div.card-actions', [
          ...(actions || []),
          iconButton('✕', { onClick: close, title: '关闭' }),
        ]),
      ]) : null,
      ...(Array.isArray(body) ? body : [body]),
    ]);
    const back = h('div.modal-back', {
      onclick: (e) => { if (e.target === back) close(); },
    }, inner);

    function close() {
      back.style.opacity = '0';
      setTimeout(() => back.remove(), 200);
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    return { close, el: back, inner };
  }

  /* ============================================================
   * 表格
   * ========================================================== */

  /**
   * @param {string[]} headers
   * @param {Array<Array>} rows
   * @param {object} opts { highlight: (rowIdx,colIdx)=>'win'|'lose'|'' }
   */
  function table(headers, rows, opts = {}) {
    const thead = h('thead', h('tr', headers.map((t, i) =>
      h('th', { style: opts.align ? { textAlign: opts.align[i] } : null }, t))));
    const tbody = h('tbody', rows.map((r, ri) =>
      h('tr', r.map((c, ci) => {
        const cls = opts.highlight ? opts.highlight(ri, ci) : '';
        return h('td' + (cls ? '.' + cls : ''), c);
      }))));
    return h('table.tbl', [thead, tbody]);
  }

  /* ============================================================
   * 概率条（含随机数位置标记）
   * ========================================================== */

  function probBar(p, opts = {}) {
    const { showPct = true, marker = null, tone = 'fate', label } = opts;
    return h('div.prob-bar', [
      label ? h('span', { style: { fontSize: 'var(--f-xs)', color: 'var(--t-3)', flex: '0 0 auto' } }, label) : null,
      h('div.track', [
        h('i', { style: { width: (p * 100) + '%' } }),
        marker != null ? h('span.marker', { style: { left: (marker * 100) + '%' } }) : null,
      ]),
      showPct ? h('span', {
        style: { fontFamily: 'var(--font-mono)', fontWeight: '700', flex: '0 0 auto', minWidth: '52px', textAlign: 'right' },
      }, U.pct(p, 1)) : null,
    ]);
  }

  /* ============================================================
   * 随机事件卡（规格书 §9.4）
   * ========================================================== */

  function eventCard(ev, opts = {}) {
    const { compact = false } = opts;
    const o = ev.outcome || {};
    const kids = [
      h('div.ev-head', [
        h('div.ev-ico', ev.icon || '✦'),
        h('div.grow', [
          h('div.ev-title', ev.title),
          h('div.ev-meta', [
            ev.age != null ? ev.age + ' 岁' : '',
            ev.probability != null ? ' · P = ' + U.pct(ev.probability, 1) : '',
          ].join('')),
        ]),
      ]),
    ];

    if (ev.probability != null) {
      kids.push(probBar(ev.probability, { marker: ev.randomDraw }));
    }

    // 概率拆解（规格书 §23.2：UI 展示"贡献拆解"）
    if (ev.factors && ev.factors.length && !compact) {
      const rows = [];
      if (ev.base != null) {
        rows.push(h('div.factor-row', [
          h('span.f-name', '基础概率'),
          h('span.f-val', U.pct(ev.base, 1)),
        ]));
      }
      for (const f of ev.factors) {
        rows.push(h('div.factor-row', [
          h('span.f-name', f.label),
          h('span.f-val' + (f.delta >= 0 ? '.pos' : '.neg'), U.signedPct(f.delta, 1)),
        ]));
      }
      rows.push(h('div.factor-divider'));
      rows.push(h('div.factor-row', [
        h('span.f-name', { style: { fontWeight: '700', color: 'var(--t-1)' } }, '最终概率'),
        h('span.f-val', { style: { color: 'var(--c-fate)' } }, U.pct(ev.probability, 1)),
      ]));
      kids.push(h('div.factor-list', rows));
    }

    if (o.narrative) {
      kids.push(h('div', {
        style: { fontSize: 'var(--f-sm)', color: 'var(--t-2)', lineHeight: '1.6' },
      }, o.narrative));
    }
    if (o.detail && o.detail.length) {
      kids.push(h('div.factor-list', o.detail.map((d) =>
        h('div.factor-row', [h('span.f-name', d.label), h('span.f-val', d.value)]))));
    }
    if (ev.distribution) {
      kids.push(h('div.notice.know', [
        h('div', [
          h('div', { style: { fontWeight: '700', fontFamily: 'var(--font-mono)' } },
            ev.distribution.name || ev.distribution.latex),
          ev.distribution.meaning
            ? h('div', { style: { fontSize: 'var(--f-xs)', marginTop: '3px', opacity: '0.85' } },
              ev.distribution.meaning)
            : null,
        ]),
      ]));
    }
    return h('div.event-card' + (ev.major ? '.major' : ''), kids);
  }

  /* ============================================================
   * 模拟进度（规格书 §38.1）
   * ========================================================== */

  function simulationProgress() {
    const pct = h('div.sp-pct', '0%');
    const label = h('div', { style: { fontSize: '14px', color: 'var(--t-2)' } },
      '正在生成平行人生……');
    const bar = progressBar(0, { thick: true });
    const list = h('div.discovery-list');
    const el = h('div.sim-progress', [
      h('div.sp-head', [label, pct]),
      bar,
      list,
    ]);
    return {
      el,
      update(p) {
        pct.textContent = Math.round(p.percent * 100) + '%';
        bar.firstChild.style.width = (p.percent * 100) + '%';
        if (p.discoveries) {
          const d = p.discoveries;
          const rows = [
            ['已发现破产人生', U.int(d.bankrupt) + ' 次'],
            ['千万级财富样本', U.int(d.millionaires) + ' 个'],
            ['创业尝试', U.int(d.startupFailures) + ' 次'],
            ['经历经济危机的人生', U.int(d.crises) + ' 个'],
          ];
          mount(list, rows.map(([a, b]) =>
            h('div.d-row', [h('span', a), h('b', b)])));
        }
        const speed = p.elapsedMs > 0
          ? ' · 已用 ' + (p.elapsedMs / 1000).toFixed(1) + 's'
          : '';
        label.textContent = `正在生成 ${U.int(p.total)} 个平行人生……${speed}`;
      },
    };
  }

  /* ============================================================
   * 模式卡（首页三入口，规格书 §7.2）
   * ========================================================== */

  function modeCard(opts) {
    const { icon, title, desc, tag, hint, glow, line, onClick } = opts;
    const glyph = icon ? (LS.ui.icon(icon, 30) || icon) : icon;
    const el = h('div.mode-card', { onclick: onClick }, [
      h('div.mc-ico', glyph),
      h('div.mc-title', title),
      h('div.mc-desc', desc),
      h('div.mc-tag', tag),
      hint ? h('div.mc-hint', hint) : null,
    ]);
    /* CSS 自定义属性必须用 setProperty 设置：
       Object.assign(el.style, { '--x': v }) 对 kebab-case / 自定义属性是静默失效的，
       所以不能让 h() 的 style 对象来干这件事。 */
    el.style.setProperty('--mc-glow', glow || 'rgba(124,92,255,0.24)');
    el.style.setProperty('--mc-line', line || 'rgba(167,139,250,0.45)');
    return el;
  }

  /* ============================================================
   * 人生状态面板
   * ========================================================== */

  function careerChip(career) {
    const C = LS.config;
    const label = C.CAREER_LABEL[career] || career;
    const tone = {
      student: 'know', junior: '', senior: 'teal', manager: 'ok',
      unemployed: 'bad', freelance: '', entrepreneur: 'fate', retired: 'ghost',
    }[career] || '';
    return chip((C.CAREER_ICON[career] || '') + ' ' + label, tone);
  }

  /** 世界环境带（规格书 §43.2） */
  function economyChip(stateName) {
    const tone = { 繁荣: 'ok', 正常: 'know', 衰退: 'warn', 危机: 'bad' }[stateName] || '';
    return chip('经济 · ' + stateName, tone);
  }

  /** 世界状态序列条（结果页/运行页用） */
  function economyStrip(history, width) {
    if (!history || !history.length) return h('div');
    const colors = { 繁荣: '#34d399', 正常: '#60a5fa', 衰退: '#fbbf24', 危机: '#f87171' };
    const segs = [];
    let cur = history[0].label;
    let start = 0;
    for (let i = 1; i <= history.length; i++) {
      const lbl = i < history.length ? history[i].label : null;
      if (lbl !== cur || i === history.length) {
        segs.push({ label: cur, from: history[start].age, to: history[i - 1].age });
        cur = lbl;
        start = i;
      }
    }
    const a0 = history[0].age;
    const a1 = history[history.length - 1].age;
    const span = Math.max(1, a1 - a0);
    return h('div', [
      h('div', { style: { display: 'flex', height: '8px', borderRadius: '999px', overflow: 'hidden' } },
        segs.map((s) => h('div', {
          title: `${s.label}（${s.from}–${s.to} 岁）`,
          style: {
            width: ((s.to - s.from + 1) / span * 100) + '%',
            background: colors[s.label] || '#666',
            opacity: '0.65',
          },
        }))),
      h('div', {
        style: {
          display: 'flex', justifyContent: 'space-between',
          fontSize: 'var(--f-xxs)', color: 'var(--t-4)', marginTop: '4px',
        },
      }, [h('span', a0 + ' 岁'), h('span', a1 + ' 岁')]),
    ]);
  }

  /* ============================================================
   * 区块与排版构件
   * 这些既被页面直接使用（views.*），也属于通用组件库（ui.*），
   * 两个命名空间都暴露，避免调用点记错位置。
   * ========================================================== */

  /** 页面头部（标题 + 说明 + 右侧动作） */
  function head(opts) {
    const { kicker, title, sub, actions, tight } = opts;
    return h('div.row.between.wrap', {
      style: { gap: 'var(--s-4)', marginBottom: tight ? 'var(--s-4)' : 'var(--s-6)' },
    }, [
      h('div', [
        kicker ? h('div.eyebrow', { style: { marginBottom: '6px' } }, kicker) : null,
        h('h1.h2', title),
        sub ? h('div.lead', { style: { marginTop: '8px', maxWidth: '78ch' } }, sub) : null,
      ]),
      actions ? h('div.row.gap-2.wrap', actions) : null,
    ]);
  }

  /** 区块标题 */
  function section(title, sub, actions) {
    return h('div.section-title', [
      h('div', [
        h('div.st-title', title),
        sub ? h('div.st-sub', sub) : null,
      ]),
      actions ? h('div.row.gap-2', actions) : null,
    ]);
  }

  /** 指标网格 */
  function metricGrid(items, cols) {
    return h('div.grid' + (cols ? '.g-' + cols : '.g-4'), items.filter(Boolean));
  }

  /** 一行「标签 + 数值」 */
  function defRow(label, value, tone) {
    return h('div.def-row', [
      h('span.dr-label', label),
      h('span.dr-value' + (tone ? '.v-' + tone : ''), value),
    ]);
  }

  function defList(rows) {
    return h('div.def-list', rows.filter(Boolean));
  }

  LS.ui = {
    card, chartCard, metric, heroNum,
    button, iconButton, segmented, chip, fateBadge, slider, switchRow,
    progressBar, percentileScale, legend, notice, emptyState, toast, floatChip,
    modal, table, probBar, eventCard, simulationProgress, modeCard,
    careerChip, economyChip, economyStrip, icon, lifeScene, stageOfAge,
    head, section, metricGrid, defRow, defList,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
