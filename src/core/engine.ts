import {
  Branch,
  CmpCond,
  DialogConfig,
  EventDef,
  ProjectData,
  Step,
  TriggerDef,
  VarValue,
  WorldState
} from './types';

// ============================================================================
// 通用执行器：Trigger 求值 + Event 分支匹配 + 步骤执行
// ============================================================================

export function getValue(p: ProjectData, state: WorldState, key: string): VarValue | undefined {
  if (key in state) return state[key];
  return p.vars.find((v) => v.key === key)?.initial;
}

function compare(a: VarValue | undefined, op: CmpCond['op'], b: VarValue): boolean {
  if (typeof a === 'number' || typeof b === 'number') {
    const x = Number(a);
    const y = Number(b);
    switch (op) {
      case '==': return x === y;
      case '!=': return x !== y;
      case '>': return x > y;
      case '>=': return x >= y;
      case '<': return x < y;
      case '<=': return x <= y;
    }
  }
  switch (op) {
    case '==': return a === b;
    case '!=': return a !== b;
    default: return false; // 非数值不支持大小比较
  }
}

export function evalCond(p: ProjectData, state: WorldState, c: CmpCond): boolean {
  return compare(getValue(p, state, c.var), c.op, c.value);
}

export function evalConds(p: ProjectData, state: WorldState, conds: CmpCond[] | undefined): boolean {
  return (conds || []).every((c) => evalCond(p, state, c));
}

export function evalTrigger(p: ProjectData, state: WorldState, t: TriggerDef): boolean {
  if (t.conds.length === 0) return false;
  return t.match === 'any'
    ? t.conds.some((c) => evalCond(p, state, c))
    : t.conds.every((c) => evalCond(p, state, c));
}

export function isBranchSatisfied(p: ProjectData, state: WorldState, b: Branch): boolean {
  return b.when.every((id) => {
    const t = p.triggers.find((x) => x.id === id);
    return !!t && evalTrigger(p, state, t);
  });
}

/** 从上到下匹配第一个满足的分支 */
export function matchBranch(p: ProjectData, state: WorldState, ev: EventDef): Branch | null {
  return ev.branches.find((b) => isBranchSatisfied(p, state, b)) || null;
}

/** 文本插值：{hero.gold} -> 当前值 */
export function interpolate(p: ProjectData, state: WorldState, text: string): string {
  return text.replace(/\{([\w.]+)\}/g, (m, key: string) => {
    const v = getValue(p, state, key);
    return v === undefined ? m : String(v);
  });
}

export function formatValue(v: VarValue | undefined): string {
  if (v === true) return 'true';
  if (v === false) return 'false';
  return v === undefined ? '∅' : String(v);
}

/** 步骤的一行摘要（面板展示用） */
export function describeStep(p: ProjectData, s: Step): string {
  const label = (key: string) => p.vars.find((v) => v.key === key)?.label || key;
  switch (s.type) {
    case 'say': return `💬 ${s.speaker}：${s.text}`;
    case 'choice': return `🔀 ${s.speaker}：${s.text}`;
    case 'set': return s.from ? `📝 ${label(s.var)} = ${label(s.from)}` : `📝 ${label(s.var)} = ${formatValue(s.value)}`;
    case 'add': return `➕ ${label(s.var)} ${s.amount >= 0 ? '+' : ''}${s.amount}`;
  }
}

export interface RunContext {
  project: ProjectData;
  getState: () => WorldState;
  mutate: (fn: (s: WorldState) => void) => void;
  showDialog: (config: DialogConfig) => void;
  log: (msg: string, highlight?: boolean) => void;
}

const BTN_CLASS: Record<string, string> = {
  primary: 'primary-btn',
  secondary: 'secondary-btn',
  danger: 'danger-btn'
};

/** 执行一个 Event：匹配分支后按顺序执行步骤 */
export function runEvent(ctx: RunContext, ev: EventDef): void {
  const branch = matchBranch(ctx.project, ctx.getState(), ev);
  if (!branch) {
    ctx.log(`⚠️ [${ev.title}] 没有满足条件的分支（建议添加一个无条件的默认分支）`, true);
    return;
  }
  ctx.log(`▶ [${ev.title}] → 分支「${branch.title}」`);
  runSteps(ctx, branch.steps, () => {});
}

function runSteps(ctx: RunContext, steps: Step[], done: () => void, i = 0): void {
  if (i >= steps.length) {
    done();
    return;
  }
  const s = steps[i];
  const next = () => runSteps(ctx, steps, done, i + 1);
  const p = ctx.project;

  switch (s.type) {
    case 'say':
      ctx.showDialog({
        speaker: s.speaker,
        speakerTitle: s.speakerTitle,
        avatar: s.avatar,
        text: interpolate(p, ctx.getState(), s.text),
        confirmText: s.button || '继续',
        onConfirm: next
      });
      return;

    case 'choice':
      ctx.showDialog({
        speaker: s.speaker,
        speakerTitle: s.speakerTitle,
        avatar: s.avatar,
        text: interpolate(p, ctx.getState(), s.text),
        options: s.options.map((o) => {
          const ok = evalConds(p, ctx.getState(), o.require);
          return {
            text: o.text,
            className: ok ? BTN_CLASS[o.style || 'primary'] : 'disabled-btn',
            disabled: !ok,
            onClick: () => runSteps(ctx, o.steps, next)
          };
        })
      });
      return;

    case 'set': {
      const value = s.from ? getValue(p, ctx.getState(), s.from) : s.value;
      if (value !== undefined) {
        ctx.mutate((st) => (st[s.var] = value));
        ctx.log(`📝 ${labelOf(p, s.var)} = ${formatValue(value)}`, true);
      }
      next();
      return;
    }

    case 'add': {
      ctx.mutate((st) => (st[s.var] = Number(getValue(p, st, s.var) ?? 0) + s.amount));
      ctx.log(`➕ ${labelOf(p, s.var)} ${s.amount >= 0 ? '+' : ''}${s.amount} → ${formatValue(ctx.getState()[s.var])}`);
      next();
      return;
    }
  }
}

function labelOf(p: ProjectData, key: string): string {
  return p.vars.find((v) => v.key === key)?.label || key;
}
