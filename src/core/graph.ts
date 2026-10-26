import { EventDef, ProjectData, TriggerDef } from './types';

// ============================================================================
// 连线推导：连线不再手工维护，全部从节点内容与 Action Tree 计算得出
//   顶层大图：Trigger ➔ Event（连入的 Trigger ID 列表 incomingTriggers）
//   变量专属图：Event ➔ 变量（Action 节点中 set/add 了它）；变量 ➔ Event（通过 Trigger 或选项条件读取它）
// ============================================================================

export type EdgeKind = 'control' | 'writes' | 'reads';

export interface DerivedEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
}

/** 顶层大图连线：Trigger ➔ Event */
export function mainGraphEdges(p: ProjectData): DerivedEdge[] {
  const edges: DerivedEdge[] = [];
  const seen = new Set<string>();
  const trigIds = new Set(p.triggers.map((t) => t.id));
  p.events.forEach((ev) => {
    const incoming = ev.incomingTriggers ?? [];
    incoming.forEach((tid) => {
      const id = `${tid}->${ev.id}`;
      if (!trigIds.has(tid) || seen.has(id)) return;
      seen.add(id);
      edges.push({ id, from: tid, to: ev.id, kind: 'control' });
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

function eventReads(ev: EventDef, key: string, trigIds: Set<string>): boolean {
  const incoming = ev.incomingTriggers ?? [];
  if (incoming.some((tid) => trigIds.has(tid))) return true;

  if (ev.actionGraph?.nodes) {
    for (const node of ev.actionGraph.nodes) {
      if (node.type === 'action') {
        for (const s of node.steps) {
          if (s.type === 'set' && s.from === key) return true;
        }
      } else if (node.type === 'selector') {
        for (const c of node.cases) {
          if (c.checks.some((chk) => trigIds.has(chk.triggerId))) return true;
        }
      } else if (node.type === 'choice') {
        for (const o of node.options) {
          if (o.checks?.some((chk) => trigIds.has(chk.triggerId))) return true;
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

/** 读取该变量的 Trigger */
export function triggersReadingVar(p: ProjectData, key: string): TriggerDef[] {
  return p.triggers.filter((t) => t.conds.some((c) => c.var === key));
}

/** 受该变量影响的 Event（专属图出边）：经由 Trigger 或选项条件 */
export function varReaders(p: ProjectData, key: string): EventDef[] {
  const trigIds = new Set(triggersReadingVar(p, key).map((t) => t.id));
  return p.events.filter((ev) => eventReads(ev, key, trigIds));
}

/** 某 Trigger 控制的 Event */
export function eventsControlledBy(p: ProjectData, triggerId: string): EventDef[] {
  return p.events.filter((ev) => {
    const incoming = ev.incomingTriggers ?? [];
    return incoming.includes(triggerId);
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
