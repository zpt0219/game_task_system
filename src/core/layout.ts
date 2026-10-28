import { TaskDocument } from './document';
import { getEvent } from './editOps';
import { ActionGraphNodeUnion, ConditionDef } from './types';

/**
 * 恢复顶层大图标准三栏布局：
 * - 左栏：无前置 Condition 的起始 Event
 * - 中栏：所有 Condition 条件节点
 * - 右栏：有前置 Condition 的受控 Event
 */
export function applyMainGraphLayout(doc: TaskDocument): void {
  let evLeftIdx = 0;
  let evRightIdx = 0;
  let condIdx = 0;

  doc.conditions.forEach((t: ConditionDef) => {
    t.x = 460;
    t.y = 100 + condIdx * 140;
    condIdx++;
  });

  doc.events.forEach((e) => {
    const inConds = e.incomingConditions ?? [];
    const hasInputs = inConds.length > 0;
    if (hasInputs) {
      e.x = 860;
      e.y = 120 + evRightIdx * 120;
      evRightIdx++;
    } else {
      e.x = 60;
      e.y = 100 + evLeftIdx * 130;
      evLeftIdx++;
    }
  });
}

function getSubNodeHeight(n: ActionGraphNodeUnion): number {
  switch (n.type) {
    case 'start':
      return 50;
    case 'action':
      return 55 + (n.steps?.length || 0) * 28;
    case 'selector':
      return 55 + (n.cases?.length || 0) * 36 + 36;
    case 'choice':
      return 95 + (n.options?.length || 0) * 36;
    default:
      return 80;
  }
}

function getSubNodeWidth(n: ActionGraphNodeUnion): number {
  if (n.type === 'start') return 140;
  if (n.type === 'choice') return 280;
  return 260;
}

/**
 * 将指定 Event 内部的 Action Tree 子图按流程图 (DAG Flowchart) 算法自动排列：
 * 1. DFS 环路检测，区分前向依赖与后向回跳 (Back-edges)
 * 2. 拓扑分层 (Ranks / Columns) 确定横向 X 坐标
 * 3. 沿父端口分支序排列每列节点，前后向中心对齐与碰撞间隙推移 (minGap=50px) 确定纵向 Y 坐标
 */
export function applySubGraphDagLayout(doc: TaskDocument, eventId: string): boolean {
  const ev = getEvent(doc, eventId);
  if (!ev || !ev.actionGraph || !ev.actionGraph.nodes || ev.actionGraph.nodes.length === 0) {
    return false;
  }

  const nodes = ev.actionGraph.nodes;
  const nodeMap = new Map<string, ActionGraphNodeUnion>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  const adj = new Map<string, string[]>();
  const inEdges = new Map<string, string[]>();
  nodes.forEach((n) => {
    adj.set(n.id, []);
    inEdges.set(n.id, []);
  });

  nodes.forEach((n) => {
    const targets: string[] = [];
    if (n.type === 'start' || n.type === 'action') {
      if (n.nextId && nodeMap.has(n.nextId)) targets.push(n.nextId);
    } else if (n.type === 'selector') {
      n.cases.forEach((c) => {
        if (c.targetId && nodeMap.has(c.targetId)) targets.push(c.targetId);
      });
      if (n.defaultTargetId && nodeMap.has(n.defaultTargetId)) {
        targets.push(n.defaultTargetId);
      }
    } else if (n.type === 'choice') {
      n.options.forEach((opt) => {
        if (opt.targetId && nodeMap.has(opt.targetId)) targets.push(opt.targetId);
      });
    }
    adj.set(n.id, targets);
    targets.forEach((t) => inEdges.get(t)?.push(n.id));
  });

  // 1. DFS 环路检测，识别后向回跳 (back-edges)
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const backEdges = new Set<string>();
  const forwardAdj = new Map<string, string[]>();
  nodes.forEach((n) => forwardAdj.set(n.id, []));

  const dfs = (u: string) => {
    visited.add(u);
    inStack.add(u);
    const targets = adj.get(u) || [];
    for (const v of targets) {
      if (inStack.has(v)) {
        backEdges.add(`${u}->${v}`);
      } else {
        forwardAdj.get(u)?.push(v);
        if (!visited.has(v)) {
          dfs(v);
        }
      }
    }
    inStack.delete(u);
  };

  const startNodes = nodes.filter((n) => n.type === 'start').map((n) => n.id);
  const roots = startNodes.length > 0 ? startNodes : nodes[0] ? [nodes[0].id] : [];
  roots.forEach((sn) => {
    if (!visited.has(sn)) dfs(sn);
  });
  nodes.forEach((n) => {
    if (!visited.has(n.id)) dfs(n.id);
  });

  // 2. 拓扑分层 (Ranks) 计算
  const ranks = new Map<string, number>();
  nodes.forEach((n) => ranks.set(n.id, 0));

  const inDegree = new Map<string, number>();
  nodes.forEach((n) => inDegree.set(n.id, 0));
  forwardAdj.forEach((targets) => {
    targets.forEach((v) => {
      inDegree.set(v, (inDegree.get(v) || 0) + 1);
    });
  });

  const queue: string[] = [];
  roots.forEach((sn) => {
    if ((inDegree.get(sn) || 0) === 0) queue.push(sn);
  });
  nodes.forEach((n) => {
    if ((inDegree.get(n.id) || 0) === 0 && !queue.includes(n.id)) {
      queue.push(n.id);
    }
  });

  while (queue.length > 0) {
    const u = queue.shift()!;
    const curR = ranks.get(u) || 0;
    const targets = forwardAdj.get(u) || [];
    for (const v of targets) {
      ranks.set(v, Math.max(ranks.get(v) || 0, curR + 1));
      const deg = (inDegree.get(v) || 0) - 1;
      inDegree.set(v, deg);
      if (deg === 0) {
        queue.push(v);
      }
    }
  }

  // 3. 按列组织节点并依据父节点分支端口次序排序
  const rankGroups = new Map<number, string[]>();
  nodes.forEach((n) => {
    const r = ranks.get(n.id) || 0;
    if (!rankGroups.has(r)) rankGroups.set(r, []);
    rankGroups.get(r)!.push(n.id);
  });

  const maxRank = Math.max(...Array.from(rankGroups.keys()), 0);
  const rankOrder = new Map<number, string[]>();

  for (let r = 0; r <= maxRank; r++) {
    if (r === 0) {
      rankOrder.set(0, rankGroups.get(0) || []);
    } else {
      const ordered: string[] = [];
      const seen = new Set<string>();
      const prevNodes = rankOrder.get(r - 1) || [];
      for (const p of prevNodes) {
        const children = forwardAdj.get(p) || [];
        for (const c of children) {
          if (ranks.get(c) === r && !seen.has(c)) {
            seen.add(c);
            ordered.push(c);
          }
        }
      }
      (rankGroups.get(r) || []).forEach((nid) => {
        if (!seen.has(nid)) {
          seen.add(nid);
          ordered.push(nid);
        }
      });
      rankOrder.set(r, ordered);
    }
  }

  // 4. 计算列 X 坐标
  const colX = new Map<number, number>();
  let curX = 40;
  for (let r = 0; r <= maxRank; r++) {
    colX.set(r, curX);
    const rNodes = rankOrder.get(r) || [];
    let maxW = 260;
    rNodes.forEach((nid) => {
      const n = nodeMap.get(nid);
      if (n) maxW = Math.max(maxW, getSubNodeWidth(n));
    });
    const gap = maxW >= 280 ? 50 : 60;
    curX += maxW + gap;
  }

  // 5. 纵向排列并计算 Y 坐标
  const positions = new Map<string, { x: number; y: number }>();
  const minGap = 50;

  let yCursor = 100;
  (rankOrder.get(0) || []).forEach((nid) => {
    const n = nodeMap.get(nid)!;
    positions.set(nid, { x: colX.get(0) || 40, y: yCursor });
    yCursor += getSubNodeHeight(n) + minGap;
  });

  for (let r = 1; r <= maxRank; r++) {
    const nodesInRank = rankOrder.get(r) || [];
    const targetYs = new Map<string, number>();

    nodesInRank.forEach((nid) => {
      const n = nodeMap.get(nid)!;
      const parents = (inEdges.get(nid) || []).filter(
        (p) => positions.has(p) && !backEdges.has(`${p}->${nid}`)
      );
      if (parents.length > 0) {
        const sumY = parents.reduce((acc, p) => {
          const pNode = nodeMap.get(p)!;
          const pPos = positions.get(p)!;
          return acc + pPos.y + getSubNodeHeight(pNode) / 2;
        }, 0);
        targetYs.set(nid, sumY / parents.length - getSubNodeHeight(n) / 2);
      } else {
        targetYs.set(nid, 100);
      }
    });

    let prevBottom = -999999;
    nodesInRank.forEach((nid) => {
      const n = nodeMap.get(nid)!;
      const h = getSubNodeHeight(n);
      const desiredY = targetYs.get(nid) ?? 100;
      const actualY = Math.max(desiredY, prevBottom + minGap);
      positions.set(nid, { x: colX.get(r) || 40, y: actualY });
      prevBottom = actualY + h;
    });
  }

  // Pass 2: 后向居中父节点
  for (let r = maxRank - 1; r >= 0; r--) {
    const nodesInRank = rankOrder.get(r) || [];
    nodesInRank.forEach((nid) => {
      const n = nodeMap.get(nid)!;
      const children = (forwardAdj.get(nid) || []).filter((c) => positions.has(c));
      if (children.length > 0) {
        const firstC = children[0];
        const lastC = children[children.length - 1];
        const firstPos = positions.get(firstC)!;
        const lastPos = positions.get(lastC)!;
        const lastNode = nodeMap.get(lastC)!;
        const childrenCenter = (firstPos.y + lastPos.y + getSubNodeHeight(lastNode)) / 2;
        const h = getSubNodeHeight(n);
        positions.get(nid)!.y = childrenCenter - h / 2;
      }
    });

    let prevBottom = -999999;
    nodesInRank.forEach((nid) => {
      const n = nodeMap.get(nid)!;
      const h = getSubNodeHeight(n);
      const pos = positions.get(nid)!;
      if (pos.y < prevBottom + minGap) {
        pos.y = prevBottom + minGap;
      }
      prevBottom = pos.y + h;
    });
  }

  // Pass 3: 归一化 Y 偏移，使顶部节点从 y=60 开始
  let minY = Infinity;
  positions.forEach((pos) => {
    minY = Math.min(minY, pos.y);
  });
  const yShift = 60 - (isFinite(minY) ? minY : 60);

  nodes.forEach((node) => {
    const pos = positions.get(node.id);
    if (pos) {
      node.x = pos.x;
      node.y = Math.round(pos.y + yShift);
    }
  });
  return true;
}
