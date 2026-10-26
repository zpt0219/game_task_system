import { EventDef, ProjectData, ConditionDef } from './types';

// ============================================================================
// 连线推导：连线不再手工维护，全部从节点内容与 Action Tree 计算得出
//   顶层大图：Condition ➔ Event（声明 Event 依赖哪些 Condition 前置条件）
//   变量专属图：Event ➔ 变量（Action 节点中 set/add 了它）；变量 ➔ Event（通过 Condition 或选项条件读取它）
// ============================================================================

export type EdgeKind = 'control' | 'writes' | 'reads';

export interface DerivedEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
}

/** 顶层大图连线：Condition ➔ Event (描述 Event 依赖了哪些 Condition) */
export function mainGraphEdges(p: ProjectData): DerivedEdge[] {
  const edges: DerivedEdge[] = [];
  const seen = new Set<string>();
  const condIds = new Set(p.conditions.map((t: ConditionDef) => t.id));

  p.events.forEach((ev) => {
    const incoming = ev.incomingConditions ?? [];
    incoming.forEach((cid) => {
      const id = `${cid}->${ev.id}`;
      if (!condIds.has(cid) || seen.has(id)) return;
      seen.add(id);
      edges.push({ id, from: cid, to: ev.id, kind: 'control' });
    });
  });
  return edges;
}

function eventWrites(ev: EventDef, key: string): boolean {
  if (ev.actionGraph?.nodes) {
    for (const node of ev.actionGraph.nodes) {
      if (node.type === 'action') {
        for (const s of node.steps) {
          if ((s.type === 'set' || s.type === 'add') && s.var === key) return true;
        }
      }
    }
  }
  return false;
}

function eventReads(ev: EventDef, key: string, condIds: Set<string>): boolean {
  const incoming = ev.incomingConditions ?? [];
  if (incoming.some((cid) => condIds.has(cid))) return true;

  if (ev.actionGraph?.nodes) {
    for (const node of ev.actionGraph.nodes) {
      if (node.type === 'action') {
        for (const s of node.steps) {
          if (s.type === 'set' && s.from === key) return true;
        }
      } else if (node.type === 'selector') {
        for (const c of node.cases) {
          if (c.checks.some((chk) => condIds.has(chk.conditionId))) return true;
        }
      } else if (node.type === 'choice') {
        for (const o of node.options) {
          if (o.checks?.some((chk) => condIds.has(chk.conditionId))) return true;
        }
      }
    }
  }
  return false;
}

/** 改变了该变量的 Event（专属图入边） */
export function varWriters(p: ProjectData, key: string): EventDef[] {
  return p.events.filter((ev) => eventWrites(ev, key));
}

/** 读取该变量的 Condition */
export function conditionsReadingVar(p: ProjectData, key: string): ConditionDef[] {
  return p.conditions.filter((t: ConditionDef) => t.conds.some((c) => c.var === key));
}

/** 受该变量影响的 Event（专属图出边）：经由 Condition 或选项条件 */
export function varReaders(p: ProjectData, key: string): EventDef[] {
  const condIds = new Set(conditionsReadingVar(p, key).map((t) => t.id));
  return p.events.filter((ev) => eventReads(ev, key, condIds));
}

/** 依赖某 Condition 的 Event */
export function eventsDependingOn(p: ProjectData, conditionId: string): EventDef[] {
  return p.events.filter((ev) => {
    const incoming = ev.incomingConditions ?? [];
    return incoming.includes(conditionId);
  });
}

/** 某 Event 改变的变量 key */
export function varsWrittenBy(p: ProjectData, ev: EventDef): string[] {
  const keys = new Set<string>();
  if (ev.actionGraph?.nodes) {
    for (const node of ev.actionGraph.nodes) {
      if (node.type === 'action') {
        for (const s of node.steps) {
          if (s.type === 'set' || s.type === 'add') keys.add(s.var);
        }
      }
    }
  }
  return p.vars.filter((v) => keys.has(v.key)).map((v) => v.key);
}
