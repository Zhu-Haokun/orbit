import { useMemo } from "react";

import {
  forceCollide,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";

import { daysSince } from "@/lib/format";
import { fallbackAngle, groupAngle, nodeBrightness, nodeRadius, seededUnit } from "@/lib/hash";
import type { Group, PersonSummary } from "@/types";

/**
 * 规范 §14.6 星图位置算法。
 *
 * d3-force 只负责计算坐标，完全不接触 DOM —— React 负责渲染（§14.6 / §0.4）。
 * 稳定性（强制）：所有初始抖动都来自 personId 的 hash（seededUnit → mulberry32），
 * 代码里不出现 Math.random()，因此同一批数据每次得到完全相同的位置。
 * 计算使用固定 tick 预算后冻结，不做持续动画（§11 禁止大面积旋转 / 自动持续缩放）。
 */

/** 中心“自己”节点的固定 id —— 规范 §14.6: 当前用户节点固定在中心。 */
export const SELF_NODE_ID = "orbit-self";

export interface GalaxyNode {
  id: string;
  person: PersonSummary;
  x: number;
  y: number;
  /** 视觉半径 6–11px，规范 §14.3。 */
  r: number;
  /** 亮度 0.34–1，规范 §56: 最近是否有新的记录。 */
  brightness: number;
  groupId: string | null;
}

export type GalaxyLinkKind = "center" | "group";

export interface GalaxyLink {
  id: string;
  source: string;
  target: string;
  kind: GalaxyLinkKind;
}

export interface GalaxyBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GalaxyLayoutInput {
  people: PersonSummary[];
  groups: Group[];
  width: number;
  height: number;
  /** 当前星系筛选，null = 全部（规范 §16）。 */
  groupId: string | null;
  /**
   * 当前搜索词（规范 §15）。搜索只改变高亮 / 透明度，**不重新排布**，
   * 否则每敲一个字星图都会抖动，违反 §14.6 的稳定性要求。
   * 匹配逻辑见 GalaxySearch 的 galaxySearchMatch。
   */
  query?: string;
}

export interface GalaxyLayoutResult {
  nodes: GalaxyNode[];
  links: GalaxyLink[];
  bounds: GalaxyBounds;
  /** 每个人被分配到的目标点。调试与测试用：可以直接对比"想放哪"和"实际放哪"。 */
  targets: Map<string, { x: number; y: number }>;
}

const TICKS = 300;
const SELF_RADIUS = 18;
const FOCUS_RADIUS_FACTOR = 0.22;
const MIN_EXTENT = 320;
const OUTER_SPREAD = 1.18;

/* ------------------------------------------------------------------ *
 * 距离编码：多久没联系
 *
 * 方向仍然由星系决定（§14.4 的聚类不能丢），半径改成表达"上次联系有多久"：
 * 最近有记录的人靠近中心，越久没联系越往外扩散。
 * 圈层是用户自己的选择，所以仍然会对距离产生一个偏移；
 * 核心圈 = 特别关注，不受时间影响，永远待在最近的一圈。
 * ------------------------------------------------------------------ */

/** 最近有记录的人落在哪一圈。 */
const NEAR_RADIUS_FACTOR = 0.16;
/** 很久没联系的人落在哪一圈。 */
const FAR_RADIUS_FACTOR = 0.44;
/** 超过这么多天就算"很久没联系"，直接放到最外圈。 */
const STALE_DAYS = 180;
/** 同一星系内每个人的角度间隔（弧度），用来把成员摊成扇形。 */
const GROUP_FAN_STEP = 0.4;
/** 圈层带来的向内/向外偏移。核心圈单独处理。 */
const CIRCLE_BIAS: Record<string, number> = {
  frequent: -0.18,
  normal: 0,
  occasional: 0.18,
};

/** 0（刚联系过）→ 1（很久没联系 / 从来没有记录）。 */
export function recencyFactor(person: PersonSummary, today: Date): number {
  const days = daysSince(person.lastInteractionAt, today);
  if (days === null) return 1;
  const clamped = Math.max(0, Math.min(days / STALE_DAYS, 1));
  // 幂次 < 1：让"最近"的差别更明显，一周内的人明显更靠内。
  return Math.pow(clamped, 0.62);
}

/** d3 只使用这几个字段；写成本地结构类型，避免额外依赖 d3 的类型包。 */
interface SimNode {
  id: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  index?: number;
  radius: number;
}

/** 规范 §14.4: 一个人归入第一个星系，作为它的主星系。 */
function primaryGroupId(person: PersonSummary): string | null {
  return person.groups[0]?.id ?? null;
}

function pointOnRing(cx: number, cy: number, angle: number, radius: number) {
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

export function computeGalaxyLayout(input: GalaxyLayoutInput): GalaxyLayoutResult {
  const { people, groups, groupId } = input;
  const width = input.width > 0 ? input.width : 900;
  const height = input.height > 0 ? input.height : 600;
  const cx = width / 2;
  const cy = height / 2;
  const extent = Math.max(Math.min(width, height), MIN_EXTENT);
  const groupSlots = Math.max(groups.length, 1);
  const today = new Date();

  const groupIndex = new Map<string, number>();
  groups.forEach((group, index) => groupIndex.set(group.id, index));

  // 规范 §16: 筛选时当前星系重新居中，其它节点被推到外圈。
  const focused = groupId ? people.filter((person) => person.groups.some((g) => g.id === groupId)) : [];
  const seatOf = new Map<string, number>();
  focused.forEach((person, index) => seatOf.set(person.id, index));

  /*
   * 同一个星系的人排成一个扇形，而不是全部叠在同一根辐条上。
   * 否则同组的两个人（例如爸爸和妈妈）会落在几乎同一个坐标，
   * 碰撞力只能沿径向把他们推开 —— 其中一个就会被挤出"最近的一圈"。
   */
  const groupMembers = new Map<string, string[]>();
  for (const person of people) {
    const gid = primaryGroupId(person);
    if (!gid || !groupIndex.has(gid)) continue;
    const list = groupMembers.get(gid) ?? [];
    list.push(person.id);
    groupMembers.set(gid, list);
  }
  const seatInGroup = new Map<string, { index: number; total: number }>();
  for (const ids of groupMembers.values()) {
    const ordered = [...ids].sort();
    ordered.forEach((id, index) => seatInGroup.set(id, { index, total: ordered.length }));
  }

  // 核心圈的人再单独排一次：同组内的核心圈成员要等距分布在最内圈。
  const coreMembers = new Map<string, string[]>();
  for (const person of people) {
    if (person.circleLevel !== "core") continue;
    const gid = primaryGroupId(person) ?? `solo:${person.id}`;
    const list = coreMembers.get(gid) ?? [];
    list.push(person.id);
    coreMembers.set(gid, list);
  }
  const coreSeat = new Map<string, { index: number; total: number }>();
  for (const ids of coreMembers.values()) {
    const ordered = [...ids].sort();
    ordered.forEach((id, index) => coreSeat.set(id, { index, total: ordered.length }));
  }

  const targetOf = (person: PersonSummary) => {
    if (groupId && seatOf.has(person.id)) {
      const angle = groupAngle(seatOf.get(person.id) ?? 0, Math.max(focused.length, 1));
      // 筛选后仍然保留一点距离感，但整体是"当前星系重新居中"。
      const base = extent * FOCUS_RADIUS_FACTOR;
      return pointOnRing(cx, cy, angle, base * (0.82 + recencyFactor(person, today) * 0.36));
    }

    const gid = primaryGroupId(person);
    const spread = groupId ? OUTER_SPREAD : 1;

    // §14.4: 星系决定方向。
    const baseAngle =
      gid && groupIndex.has(gid)
        ? groupAngle(groupIndex.get(gid) ?? 0, groupSlots)
        : fallbackAngle(person.id);
    // 组内扇形展开 + 一点点抖动，既分开又不会显得机械。
    const seat = seatInGroup.get(person.id);
    const fan = seat ? (seat.index - (seat.total - 1) / 2) * GROUP_FAN_STEP : 0;
    const angle = baseAngle + fan + (seededUnit(person.id, 9) - 0.5) * 0.06;

    const inner = extent * NEAR_RADIUS_FACTOR;
    const outer = extent * FAR_RADIUS_FACTOR;

    // 核心圈 = 特别关注：不受时间影响，始终待在最近的一圈。
    // 同一星系里可能有好几个核心圈的人（例如爸爸和妈妈），
    // 所以半径按"组内第几个"等距分配，而不是随机 —— 随机会让两个人撞在一起，
    // 碰撞力只能把他们沿径向推开，其中一个就跑到圈外去了。
    if (person.circleLevel === "core") {
      const slot = coreSeat.get(person.id);
      const t = slot ? (slot.index + 1) / (slot.total + 1) : 0.5;
      return pointOnRing(cx, cy, angle, inner * (0.72 + t * 0.58) * spread);
    }

    const bias = CIRCLE_BIAS[person.circleLevel] ?? 0;
    const t = Math.max(0, Math.min(recencyFactor(person, today) + bias, 1));
    // 起始半径留在核心圈之外，这样"特别关注"才看得出来是一圈。
    const nearEdge = inner * 1.5;
    return pointOnRing(cx, cy, angle, (nearEdge + (outer - nearEdge) * t) * spread);
  };

  const personById = new Map(people.map((person) => [person.id, person]));
  const targets = new Map<string, { x: number; y: number }>();
  const simNodes: SimNode[] = people.map((person) => {
    const target = targetOf(person);
    targets.set(person.id, target);
    const angle = seededUnit(person.id, 6) * Math.PI * 2;
    const jitter = 18 + seededUnit(person.id, 5) * 30;
    return {
      id: person.id,
      x: target.x + Math.cos(angle) * jitter,
      y: target.y + Math.sin(angle) * jitter,
      radius: nodeRadius(person.circleLevel, person.interactionCount),
    };
  });

  // 连线（规范 §14.5）：中心 → 人物，以及星系内部的稀疏链，绝不是全连接网。
  const links: GalaxyLink[] = [];
  for (const id of personById.keys()) {
    links.push({ id: `center:${id}`, source: SELF_NODE_ID, target: id, kind: "center" });
  }

  const buckets = new Map<string, string[]>();
  for (const person of people) {
    const gid = primaryGroupId(person);
    if (!gid) continue;
    const bucket = buckets.get(gid);
    if (bucket) bucket.push(person.id);
    else buckets.set(gid, [person.id]);
  }
  for (const [gid, memberIds] of buckets) {
    // 按各自围绕星系中心的极角排序，链只连接相邻成员，形成局部弧而不是网。
    const ordered = [...memberIds].sort((a, b) => seededUnit(a, 6) - seededUnit(b, 6));
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      links.push({ id: `group:${gid}:${previous}-${current}`, source: previous, target: current, kind: "group" });
    }
  }

  /*
   * 自己节点固定在中心，不进入 simulation：
   * forceCenter 不随 alpha 衰减，若把一个固定的 fx/fy 节点放进同一套力里，
   * 每 tick 都会产生一次恒定位移并累积，整张星图会持续漂移。
   * 中心节点由 Canvas 直接画在 (cx, cy)，效果与 §14.6 的 fx/fy = center 一致。
   */
  const simulation = forceSimulation<SimNode>(simNodes)
    /*
     * 这里刻意不用 forceCenter。
     * 它是直接改坐标（不走速度）的，而 x/y 只改速度，于是整张图会被它
     * 平移掉一个固定距离 —— 实测每个人都被推离目标点 (-38, +1)，
     * 距离编码整体失真。targets 本来就是绕 (cx, cy) 分布的，不需要再居中。
     */
    .force("charge", forceManyBody<SimNode>().strength(-10).distanceMax(extent * 1.1))
    .force(
      "collide",
      forceCollide<SimNode>((node) => node.radius + 13)
        .strength(0.9)
        .iterations(2),
    )
    /*
     * 目标引力必须明显强于内部的排斥力。
     * 实测：strength 0.12/0.32 时，斥力会把节点从目标点顶开 30–40px，
     * 所有人的半径一起向中间收缩，"最近=靠内"就完全读不出来了。
     */
    .force("x", forceX<SimNode>((node) => targets.get(node.id)?.x ?? cx).strength(0.75))
    .force("y", forceY<SimNode>((node) => targets.get(node.id)?.y ?? cy).strength(0.75))
    // 刻意不加 forceLink：连线现在只用于"看得出来是一伙的"，不该参与布局。
    // 组内连线会把成员拉到固定间距，导致同一星系的人互相挤位
    //（实测高中那条线上，阿杰和李楠会直接换位），"最近的人靠内"就不成立了。
    .alpha(1)
    .alphaDecay(0.02)
    .stop();

  for (let index = 0; index < TICKS; index += 1) simulation.tick();

  let minX = cx - SELF_RADIUS;
  let maxX = cx + SELF_RADIUS;
  let minY = cy - SELF_RADIUS;
  let maxY = cy + SELF_RADIUS;

  const nodes: GalaxyNode[] = [];
  for (const simNode of simNodes) {
    const person = personById.get(simNode.id);
    if (!person) continue;
    const x = Number.isFinite(simNode.x) ? simNode.x : cx;
    const y = Number.isFinite(simNode.y) ? simNode.y : cy;
    nodes.push({
      id: person.id,
      person,
      x,
      y,
      r: simNode.radius,
      brightness: nodeBrightness(daysSince(person.lastInteractionAt)),
      groupId: primaryGroupId(person),
    });
    minX = Math.min(minX, x - simNode.radius);
    maxX = Math.max(maxX, x + simNode.radius);
    minY = Math.min(minY, y - simNode.radius);
    maxY = Math.max(maxY, y + simNode.radius);
  }

  return { nodes, links, bounds: { minX, minY, maxX, maxY }, targets };
}

/* ------------------------------------------------------------------ *
 * 派生几何：背景星点与星系云层。
 * 放在模型层，Canvas 只负责把它们画出来（规范 §14.2 / §14.4）。
 * ------------------------------------------------------------------ */

/** 规范 §14.2: 背景静态小点 50–90 个，位置 / 大小 / 明暗全部来自 hash，永不闪烁。 */
/**
 * 规范 §14.2 背景星点：确定性、不可交互、每屏 50–90 颗。
 *
 * 分三层做出景深（远/中/近），每颗星有自己的「最暗→最亮」区间与呼吸周期：
 * 大小不一、快慢不一、相位不一，整片才会像夜空在呼吸。
 *
 * 注意：这是**一块**（视口大小）的星点。画布会把这一块平铺 4 份并做视差偏移，
 * 所以 DOM 里的元素是这里的 4 倍，但屏幕上看到的密度就是这里的数量。
 */
const DOT_LAYERS = [
  {
    key: "far",
    count: 32,
    rMin: 0.7,
    rMax: 1.4,
    floorMin: 0.03,
    floorMax: 0.1,
    ceilMin: 0.3,
    ceilMax: 0.5,
    durMin: 2.2,
    durMax: 6.5,
    bloom: 0,
  },
  {
    key: "mid",
    count: 24,
    rMin: 1.4,
    rMax: 2.4,
    floorMin: 0.06,
    floorMax: 0.16,
    ceilMin: 0.45,
    ceilMax: 0.72,
    durMin: 1.8,
    durMax: 5.5,
    bloom: 0.4,
  },
  {
    key: "near",
    count: 8,
    rMin: 2.4,
    rMax: 3.8,
    floorMin: 0.12,
    floorMax: 0.24,
    ceilMin: 0.7,
    ceilMax: 1,
    durMin: 1.6,
    durMax: 4.5,
    bloom: 1,
  },
] as const;

export const GALAXY_DOT_COUNT = DOT_LAYERS.reduce((sum, layer) => sum + layer.count, 0);

export interface GalaxyDot {
  key: string;
  x: number;
  y: number;
  r: number;
  /** 呼吸的最暗值。 */
  floor: number;
  /** 呼吸的最亮值。 */
  ceil: number;
  /** 呼吸周期（秒）：1.6–6.5 秒，每颗都不一样。 */
  duration: number;
  /** 负延迟 —— 让每颗星天然处在周期的不同位置，不会整片一起亮。 */
  delay: number;
  /** 带一层柔光，看起来才像星星而不是色块。 */
  bloom: boolean;
  accent: boolean;
}

export function galaxyBackgroundDots(width: number, height: number): GalaxyDot[] {
  if (width <= 0 || height <= 0) return [];

  const dots: GalaxyDot[] = [];
  let index = 0;

  for (const layer of DOT_LAYERS) {
    for (let i = 0; i < layer.count; i += 1) {
      const salt = `star-${layer.key}-${i}`;
      const floor =
        layer.floorMin + seededUnit(`${salt}-floor`, index) * (layer.floorMax - layer.floorMin);
      const ceil = layer.ceilMin + seededUnit(`${salt}-ceil`, index) * (layer.ceilMax - layer.ceilMin);

      dots.push({
        key: salt,
        x: seededUnit(`${salt}-x`, index) * width,
        y: seededUnit(`${salt}-y`, index) * height,
        r: layer.rMin + seededUnit(`${salt}-r`, index) * (layer.rMax - layer.rMin),
        floor,
        // 保证明暗对比足够，否则又回到"看不出来"。
        ceil: Math.max(ceil, floor + 0.18),
        duration: layer.durMin + seededUnit(`${salt}-dur`, index) * (layer.durMax - layer.durMin),
        delay: -seededUnit(`${salt}-delay`, index) * 8,
        bloom: seededUnit(`${salt}-bloom`, index) < layer.bloom,
        accent: layer.key === "near" && seededUnit(`${salt}-accent`, index) < 0.3,
      });
      index += 1;
    }
  }

  return dots;
}

/** 规范 §14.4: 星系用聚类 + 极淡云层表达，而不是画大圆。 */
export interface GalaxyCloud {
  id: string;
  name: string;
  x: number;
  y: number;
  r: number;
}

export function buildGalaxyClouds(nodes: GalaxyNode[], groups: Group[]): GalaxyCloud[] {
  const buckets = new Map<string, GalaxyNode[]>();
  for (const node of nodes) {
    if (!node.groupId) continue;
    const bucket = buckets.get(node.groupId);
    if (bucket) bucket.push(node);
    else buckets.set(node.groupId, [node]);
  }

  const clouds: GalaxyCloud[] = [];
  for (const group of groups) {
    const members = buckets.get(group.id);
    if (!members || members.length === 0) continue;
    let sumX = 0;
    let sumY = 0;
    for (const member of members) {
      sumX += member.x;
      sumY += member.y;
    }
    const x = sumX / members.length;
    const y = sumY / members.length;
    let r = 90;
    for (const member of members) r = Math.max(r, Math.hypot(member.x - x, member.y - y) + 44);
    clouds.push({ id: group.id, name: group.name, x, y, r: Math.min(r, 320) });
  }
  return clouds;
}

/* ------------------------------------------------------------------ *
 * 标签：规范 §14.3 默认核心圈 / Hover / Selected / 搜索命中；
 * §42 手机标签更少；§61 超过 100 个节点时只保留必要的标签。
 * ------------------------------------------------------------------ */

export const GALAXY_CROWDED_NODES = 100;

const LABEL_BUDGET_DESKTOP = 20;
const LABEL_BUDGET_MOBILE = 6;
const ZOOMED_IN_SCALE = 1.4;
const CIRCLE_RANK: Record<string, number> = { core: 3, frequent: 2, normal: 1, occasional: 0 };

export interface GalaxyLabelInput {
  nodes: GalaxyNode[];
  selectedPersonId: string | null;
  hoveredPersonId: string | null;
  matchedIds: ReadonlySet<string> | null;
  /** 手机端：标签更少（规范 §42）。 */
  compact: boolean;
  scale: number;
}

export function selectGalaxyLabelIds(input: GalaxyLabelInput): Set<string> {
  const { nodes, selectedPersonId, hoveredPersonId, matchedIds, compact, scale } = input;

  const forced = new Set<string>();
  for (const node of nodes) {
    if (node.id === selectedPersonId || node.id === hoveredPersonId || matchedIds?.has(node.id)) {
      forced.add(node.id);
    }
  }

  // 规范 §61: 节点过多时只保留强制显示的标签。
  if (nodes.length > GALAXY_CROWDED_NODES) return forced;

  const budget = compact ? LABEL_BUDGET_MOBILE : LABEL_BUDGET_DESKTOP;
  const pool = nodes
    .filter((node) => !forced.has(node.id))
    .filter((node) => node.person.circleLevel === "core" || scale >= ZOOMED_IN_SCALE)
    .sort((a, b) => {
      const rankA = (CIRCLE_RANK[a.person.circleLevel] ?? 0) * 10 + a.brightness;
      const rankB = (CIRCLE_RANK[b.person.circleLevel] ?? 0) * 10 + b.brightness;
      return rankB - rankA || a.id.localeCompare(b.id);
    })
    .slice(0, budget)
    .map((node) => node.id);

  return new Set([...forced, ...pool]);
}

export function useGalaxyLayout(input: GalaxyLayoutInput): GalaxyLayoutResult {
  const { people, groups, width, height, groupId } = input;
  return useMemo(
    () => computeGalaxyLayout({ people, groups, width, height, groupId }),
    [people, groups, width, height, groupId],
  );
}
