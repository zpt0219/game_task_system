import { EventDef, ProjectData, Step, TriggerDef } from './types';
import { walkSteps } from './project';

// ============================================================================
// 连线推导：连线不再手工维护，全部从节点内容计算得出
//   顶层大图：Trigger ➔ Event（Event 某分支的 when 引用了该 Trigger）
//   变量专属图：Event ➔ 变量（步骤中 set/add 了它）；变量 ➔ Event（通过 Trigger 或选项条件读取它）
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
    const incoming = ev.incomingTriggers ?? Array.from(new Set(ev.branches.flatMap((b) => b.when)));
    incoming.forEach((tid) => {
      const id = `${tid}->${ev.id}`;
      if (!trigIds.has(tid) || seen.has(id)) return;
      seen.add(id);
      edges.push({ id, from: tid, to: ev.id, kind: 'control' });
    });
  });
  return edges;
}

function stepsWrite(steps: Step[], key: string): boolean {
  let found = false;
  walkSteps(steps, (s) => {
    if ((s.type === 'set' || s.type === 'add') && s.var === key) found = true;
  });
  return found;
}

function stepsRead(steps: Step[], key: string): boolean {
  let found = false;
  walkSteps(steps, (s) => {
    if (s.type === 'set' && s.from === key) found = true;
    if (s.type === 'choice' && s.options.some((o) => (o.require || []).some((c) => c.var === key))) found = true;
  });
  return found;
}

/** 改变了该变量的 Event（专属图入边） */
export function varWriters(p: ProjectData, key: string): EventDef[] {
  return p.events.filter((ev) => ev.branches.some((b) => stepsWrite(b.steps, key)));
}

/** 读取该变量的 Trigger */
export function triggersReadingVar(p: ProjectData, key: string): TriggerDef[] {
  return p.triggers.filter((t) => t.conds.some((c) => c.var === key));
}

/** 受该变量影响的 Event（专属图出边）：经由 Trigger 或选项条件 */
export function varReaders(p: ProjectData, key: string): EventDef[] {
  const trigIds = new Set(triggersReadingVar(p, key).map((t) => t.id));
  return p.events.filter((ev) =>
    ev.branches.some((b) => b.when.some((w) => trigIds.has(w)) || stepsRead(b.steps, key))
  );
}

/** 某 Trigger 控制的 Event */
export function eventsControlledBy(p: ProjectData, triggerId: string): EventDef[] {
  return p.events.filter((ev) => ev.branches.some((b) => b.when.includes(triggerId)));
}

/** 某 Event 改变的变量 key */
export function varsWrittenBy(p: ProjectData, ev: EventDef): string[] {
  const keys = new Set<string>();
  ev.branches.forEach((b) =>
    walkSteps(b.steps, (s) => {
      if (s.type === 'set' || s.type === 'add') keys.add(s.var);
    })
  );
  return p.vars.filter((v) => keys.has(v.key)).map((v) => v.key);
}
