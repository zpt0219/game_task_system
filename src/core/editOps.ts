import { TaskDocument, uid } from './document';
import {
  ActionGraph,
  ActionGraphNodeUnion,
  ConditionDef,
  EventDef,
  VarDef
} from './types';

export interface SubGraphPortSource {
  nodeId: string;
  caseId?: string;
  isDefault?: boolean;
  optId?: string;
}

export function getEvent(doc: TaskDocument, id: string): EventDef | undefined {
  return doc.events.find((e) => e.id === id);
}

export function getCondition(doc: TaskDocument, id: string): ConditionDef | undefined {
  return doc.conditions.find((c) => c.id === id);
}

export function getVar(doc: TaskDocument, key: string): VarDef | undefined {
  return doc.vars.find((v) => v.key === key);
}

export function getSubGraphNode(
  doc: TaskDocument,
  eventId: string,
  nodeId: string
): ActionGraphNodeUnion | undefined {
  const ev = getEvent(doc, eventId);
  return ev?.actionGraph?.nodes.find((n) => n.id === nodeId);
}

export function ensureActionGraph(ev: EventDef): ActionGraph {
  if (!ev.actionGraph || !ev.actionGraph.nodes || ev.actionGraph.nodes.length === 0) {
    const startId = uid('start');
    const actId = uid('act');
    ev.actionGraph = {
      nodes: [
        { id: startId, type: 'start', x: 60, y: 120, nextId: actId, defaultOptionIndex: 0 },
        {
          id: actId,
          type: 'action',
          title: '🎬 动作执行',
          x: 280,
          y: 110,
          steps: [{ type: 'say', speaker: '旁白', avatar: '💬', text: '在此编写台词...', button: '继续' }]
        }
      ]
    };
  }
  return ev.actionGraph;
}

export function createEventDef(x: number, y: number): EventDef {
  const startId = uid('start');
  const actId = uid('act');
  return {
    id: uid('evt'),
    title: '💬 新事件',
    desc: '',
    sourceRef: '',
    x: Math.round(x),
    y: Math.round(y),
    incomingConditions: [],
    actionGraph: {
      nodes: [
        { id: startId, type: 'start', x: 60, y: 120, nextId: actId, defaultOptionIndex: 0 },
        {
          id: actId,
          type: 'action',
          title: '🎬 动作执行',
          x: 280,
          y: 110,
          steps: [{ type: 'say', speaker: '旁白', avatar: '💬', text: '在这里编写台词……', button: '继续' }]
        }
      ]
    }
  };
}

export function createConditionDef(doc: TaskDocument, x: number, y: number): ConditionDef {
  const firstBool = doc.vars.find((v) => v.kind === 'bool') || doc.vars[0];
  return {
    id: uid('cond'),
    title: '🔍 condition: 新条件',
    desc: '',
    x: Math.round(x),
    y: Math.round(y),
    match: 'all',
    conds: firstBool
      ? [{ var: firstBool.key, op: '==', value: firstBool.kind === 'bool' ? true : firstBool.initial }]
      : []
  };
}

export function createSubGraphNode(
  ev: EventDef,
  type: 'action' | 'selector' | 'choice',
  x: number,
  y: number
): ActionGraphNodeUnion {
  if (type === 'action') {
    return {
      id: uid('act'),
      type: 'action',
      title: '🎬 新复合动作',
      x: Math.round(x),
      y: Math.round(y),
      steps: [{ type: 'say', speaker: '旁白', avatar: '💬', text: '台词文本...', button: '确认' }]
    };
  }
  if (type === 'selector') {
    return {
      id: uid('sel'),
      type: 'selector',
      title: '🔀 条件判断',
      x: Math.round(x),
      y: Math.round(y),
      cases: [
        {
          id: uid('case'),
          title: '分支 1',
          checks:
            ev.incomingConditions && ev.incomingConditions.length > 0
              ? [{ conditionId: ev.incomingConditions[0] }]
              : []
        }
      ]
    };
  }
  return {
    id: uid('choice'),
    type: 'choice',
    title: '💬 玩家选项',
    x: Math.round(x),
    y: Math.round(y),
    speaker: 'NPC',
    speakerTitle: '王城人物',
    avatar: '💬',
    text: '请做出选择：',
    options: [
      { id: uid('opt'), text: '选项 1', style: 'primary' },
      { id: uid('opt'), text: '选项 2', style: 'secondary' }
    ]
  };
}

export function createVarDef(doc: TaskDocument, def?: Partial<VarDef>): VarDef {
  let key = def?.key;
  if (!key) {
    const prefix =
      def?.category === 'party'
        ? 'party.'
        : def?.category === 'item'
        ? 'items.'
        : def?.category === 'teleport'
        ? 'teleports.'
        : def?.category === 'achievement'
        ? 'achievements.'
        : 'flags.';
    let n = 1;
    while (getVar(doc, `${prefix}new_${n}`)) n++;
    key = `${prefix}new_${n}`;
  }
  return {
    key,
    label: def?.label || '新变量',
    icon:
      def?.icon ||
      (def?.category === 'party'
        ? '👸'
        : def?.category === 'teleport'
        ? '🗽'
        : def?.category === 'achievement'
        ? '🏆'
        : '🎒'),
    category: def?.category || 'item',
    kind: def?.kind || (def?.category === 'achievement' ? 'enum' : 'bool'),
    initial: def?.initial !== undefined ? def.initial : def?.category === 'achievement' ? 'active' : false,
    desc: def?.desc || '',
    options: def?.options || (def?.category === 'achievement' ? ['active', 'failed'] : undefined)
  };
}

export function deleteEventCascade(doc: TaskDocument, eventId: string): boolean {
  const beforeLen = doc.events.length;
  doc.events = doc.events.filter((e) => e.id !== eventId);
  return doc.events.length !== beforeLen;
}

/** 清理某个 Event 内部所有对指定 Condition ID 的引用 */
export function removeConditionRefsFromEvent(ev: EventDef, conditionId: string): void {
  if (ev.incomingConditions) {
    ev.incomingConditions = ev.incomingConditions.filter((id) => id !== conditionId);
  }
  if (ev.actionGraph?.nodes) {
    ev.actionGraph.nodes.forEach((n) => {
      if (n.type === 'selector') {
        n.cases.forEach((c) => {
          c.checks = c.checks.filter((chk) => chk.conditionId !== conditionId);
        });
      } else if (n.type === 'choice') {
        n.options.forEach((o) => {
          if (o.checks) {
            o.checks = o.checks.filter((chk) => chk.conditionId !== conditionId);
          }
        });
      }
    });
  }
}

export function deleteConditionCascade(doc: TaskDocument, conditionId: string): boolean {
  const beforeLen = doc.conditions.length;
  doc.conditions = doc.conditions.filter((c) => c.id !== conditionId);
  doc.events.forEach((ev) => removeConditionRefsFromEvent(ev, conditionId));
  return doc.conditions.length !== beforeLen;
}

export function disconnectConditionFromEvent(
  doc: TaskDocument,
  eventId: string,
  conditionId: string
): boolean {
  const ev = getEvent(doc, eventId);
  if (!ev) return false;
  removeConditionRefsFromEvent(ev, conditionId);
  return true;
}

export function connectConditionToEvent(
  doc: TaskDocument,
  eventId: string,
  conditionId: string
): boolean {
  const ev = getEvent(doc, eventId);
  const cond = getCondition(doc, conditionId);
  if (!ev || !cond) return false;
  if (!ev.incomingConditions) ev.incomingConditions = [];
  if (ev.incomingConditions.includes(conditionId)) return false;
  ev.incomingConditions.push(conditionId);
  return true;
}

export function deleteSubNodeCascade(doc: TaskDocument, eventId: string, nodeId: string): boolean {
  const ev = getEvent(doc, eventId);
  if (!ev || !ev.actionGraph) return false;
  const target = ev.actionGraph.nodes.find((n) => n.id === nodeId);
  if (!target || target.type === 'start') return false;

  ev.actionGraph.nodes = ev.actionGraph.nodes.filter((n) => n.id !== nodeId);
  ev.actionGraph.nodes.forEach((n) => {
    if (n.type === 'start' && n.nextId === nodeId) {
      delete n.nextId;
      delete n.defaultOptionIndex;
    } else if (n.type === 'action' && n.nextId === nodeId) {
      delete n.nextId;
      delete n.defaultOptionIndex;
    } else if (n.type === 'selector') {
      if (n.defaultTargetId === nodeId) {
        delete n.defaultTargetId;
        delete n.defaultOptionIndex;
      }
      n.cases.forEach((c) => {
        if (c.targetId === nodeId) {
          delete c.targetId;
          delete c.defaultOptionIndex;
        }
      });
    } else if (n.type === 'choice') {
      n.options.forEach((o) => {
        if (o.targetId === nodeId) {
          delete o.targetId;
          delete o.defaultOptionIndex;
        }
      });
    }
  });
  return true;
}

export function deleteNodesBatch(
  doc: TaskDocument,
  items: Array<{ kind: 'event' | 'condition' | 'subnode'; id: string; eventId?: string }>
): number {
  let deletedCount = 0;
  for (const item of items) {
    if (item.kind === 'event') {
      if (deleteEventCascade(doc, item.id)) deletedCount++;
    } else if (item.kind === 'condition') {
      if (deleteConditionCascade(doc, item.id)) deletedCount++;
    } else if (item.kind === 'subnode' && item.eventId) {
      if (deleteSubNodeCascade(doc, item.eventId, item.id)) deletedCount++;
    }
  }
  return deletedCount;
}

export function connectSubGraphPort(
  doc: TaskDocument,
  eventId: string,
  src: SubGraphPortSource,
  targetNodeId: string
): boolean {
  const ev = getEvent(doc, eventId);
  if (!ev || !ev.actionGraph) return false;
  const sourceNode = ev.actionGraph.nodes.find((n) => n.id === src.nodeId);
  const targetNode = ev.actionGraph.nodes.find((n) => n.id === targetNodeId);
  if (!sourceNode || !targetNode || targetNode.type === 'start') return false;

  const defaultOptionIndex = targetNode.type === 'choice' ? 0 : undefined;

  if (sourceNode.type === 'start' || sourceNode.type === 'action') {
    sourceNode.nextId = targetNodeId;
    if (defaultOptionIndex !== undefined) sourceNode.defaultOptionIndex = defaultOptionIndex;
    else delete sourceNode.defaultOptionIndex;
    return true;
  }
  if (sourceNode.type === 'selector') {
    if (src.isDefault) {
      sourceNode.defaultTargetId = targetNodeId;
      if (defaultOptionIndex !== undefined) sourceNode.defaultOptionIndex = defaultOptionIndex;
      else delete sourceNode.defaultOptionIndex;
      return true;
    }
    if (src.caseId) {
      const c = sourceNode.cases.find((x) => x.id === src.caseId);
      if (!c) return false;
      c.targetId = targetNodeId;
      if (defaultOptionIndex !== undefined) c.defaultOptionIndex = defaultOptionIndex;
      else delete c.defaultOptionIndex;
      return true;
    }
  }
  if (sourceNode.type === 'choice' && src.optId) {
    const o = sourceNode.options.find((x) => x.id === src.optId);
    if (!o) return false;
    o.targetId = targetNodeId;
    if (defaultOptionIndex !== undefined) o.defaultOptionIndex = defaultOptionIndex;
    else delete o.defaultOptionIndex;
    return true;
  }
  return false;
}

export function disconnectSubGraphPort(
  doc: TaskDocument,
  eventId: string,
  src: SubGraphPortSource
): boolean {
  const ev = getEvent(doc, eventId);
  if (!ev || !ev.actionGraph) return false;
  const sourceNode = ev.actionGraph.nodes.find((n) => n.id === src.nodeId);
  if (!sourceNode) return false;

  if (sourceNode.type === 'start' || sourceNode.type === 'action') {
    delete sourceNode.nextId;
    delete sourceNode.defaultOptionIndex;
    return true;
  }
  if (sourceNode.type === 'selector') {
    if (src.isDefault) {
      delete sourceNode.defaultTargetId;
      delete sourceNode.defaultOptionIndex;
      return true;
    }
    if (src.caseId) {
      const c = sourceNode.cases.find((x) => x.id === src.caseId);
      if (!c) return false;
      delete c.targetId;
      delete c.defaultOptionIndex;
      return true;
    }
  }
  if (sourceNode.type === 'choice' && src.optId) {
    const o = sourceNode.options.find((x) => x.id === src.optId);
    if (!o) return false;
    delete o.targetId;
    delete o.defaultOptionIndex;
    return true;
  }
  return false;
}

/** 依赖了该 Condition 的事件 */
export function findConditionRefs(doc: TaskDocument, id: string): { event: EventDef }[] {
  const refs: { event: EventDef }[] = [];
  doc.events.forEach((event) => {
    let used = false;
    if (event.incomingConditions?.includes(id)) used = true;
    if (event.actionGraph?.nodes) {
      event.actionGraph.nodes.forEach((n) => {
        if (n.type === 'selector' && n.cases.some((c) => c.checks.some((chk) => chk.conditionId === id))) {
          used = true;
        }
        if (n.type === 'choice' && n.options.some((o) => o.checks?.some((chk) => chk.conditionId === id))) {
          used = true;
        }
      });
    }
    if (used) refs.push({ event });
  });
  return refs;
}

/** 变量被引用的位置描述（用于删除前提示） */
export function findVarRefs(doc: TaskDocument, key: string): string[] {
  const refs: string[] = [];
  doc.conditions.forEach((t) => {
    if (t.conds.some((c) => c.var === key)) refs.push(`Condition「${t.title}」`);
  });
  doc.events.forEach((e) => {
    let used = false;
    e.actionGraph?.nodes?.forEach((n) => {
      if (n.type === 'action') {
        n.steps.forEach((s) => {
          if ((s.type === 'set' || s.type === 'add') && s.var === key) used = true;
          if (s.type === 'set' && s.from === key) used = true;
        });
      }
    });
    if (used) refs.push(`Event「${e.title}」`);
  });
  return refs;
}

export function deleteVarCascade(doc: TaskDocument, key: string): boolean {
  const beforeLen = doc.vars.length;
  doc.vars = doc.vars.filter((v) => v.key !== key);
  if (doc.vars.length === beforeLen) return false;

  doc.conditions.forEach((t) => {
    t.conds = t.conds.filter((c) => c.var !== key);
  });
  doc.events.forEach((e) => {
    e.actionGraph?.nodes?.forEach((n) => {
      if (n.type === 'action') {
        n.steps = n.steps.filter((s) => {
          if ((s.type === 'set' || s.type === 'add') && s.var === key) return false;
          if (s.type === 'set' && s.from === key) return false;
          return true;
        });
      }
    });
  });
  doc.presets.forEach((p) => delete p.values[key]);
  return true;
}

export function renameVarCascade(doc: TaskDocument, oldKey: string, newKey: string): boolean {
  if (!newKey || oldKey === newKey || getVar(doc, newKey)) return false;
  const v = getVar(doc, oldKey);
  if (!v) return false;
  v.key = newKey;
  doc.conditions.forEach((t) => {
    t.conds.forEach((c) => {
      if (c.var === oldKey) c.var = newKey;
    });
  });
  doc.events.forEach((e) => {
    e.actionGraph?.nodes?.forEach((n) => {
      if (n.type === 'action') {
        n.steps.forEach((s) => {
          if ((s.type === 'set' || s.type === 'add') && s.var === oldKey) s.var = newKey;
          if (s.type === 'set' && s.from === oldKey) s.from = newKey;
        });
      }
    });
  });
  doc.presets.forEach((p) => {
    if (oldKey in p.values) {
      p.values[newKey] = p.values[oldKey];
      delete p.values[oldKey];
    }
  });
  return true;
}
