import {
  CmpCond,
  DialogConfig,
  EventDef,
  ProjectData,
  AtomicStep,
  ConditionCheck,
  ConditionDef,
  VarValue,
  WorldState,
  StartGraphNode
} from './types';

// ============================================================================
// 通用执行器：Condition 求值 + Event 状态与 Action Tree 执行
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

export function evalCondition(p: ProjectData, state: WorldState, t: ConditionDef): boolean {
  if (t.conds.length === 0) return false;
  return t.match === 'any'
    ? t.conds.some((c) => evalCond(p, state, c))
    : t.conds.every((c) => evalCond(p, state, c));
}

/** Action Tree 内部节点对所依赖 Condition 的判断规则 */
export function evalConditionCheck(p: ProjectData, state: WorldState, check: ConditionCheck): boolean {
  const cond = p.conditions.find((t) => t.id === check.conditionId);
  if (!cond) return false;

  // 自定义了比较符与比较值（如 金币 >= 100）
  if (check.op && check.value !== undefined) {
    const primaryVar = cond.conds[0]?.var;
    if (primaryVar) {
      return compare(getValue(p, state, primaryVar), check.op, check.value);
    }
  }

  // 指定了布尔判断（如 == true 或 == false）
  if (check.value !== undefined && typeof check.value === 'boolean') {
    return evalCondition(p, state, cond) === check.value;
  }

  // 默认直接执行 Condition 主规则求值
  return evalCondition(p, state, cond);
}

/** 评估事件当前预计执行的逻辑状态 (用于大图状态 Pill 展示) */
export function getEventStatus(
  p: ProjectData,
  state: WorldState,
  ev: EventDef
): { title: string; colorClass: string } {
  const graph = ev.actionGraph;
  if (!graph || !graph.nodes || graph.nodes.length === 0) {
    return { title: '未初始化', colorClass: 'status-grey' };
  }

  const startNode = graph.nodes.find((n) => n.type === 'start') as StartGraphNode | undefined;
  if (!startNode || !startNode.nextId) {
    return { title: '未连接', colorClass: 'status-grey' };
  }

  const firstNode = graph.nodes.find((n) => n.id === startNode.nextId);
  if (!firstNode) {
    return { title: '目标缺失', colorClass: 'status-red' };
  }

  let statusTitle = '正常';
  let colorClass = 'status-green';

  if (firstNode.type === 'selector') {
    let matched = false;
    for (const c of firstNode.cases) {
      if (c.checks.length > 0 && c.checks.every((chk) => evalConditionCheck(p, state, chk))) {
        statusTitle = c.title;
        matched = true;
        break;
      }
    }
    if (!matched) {
      statusTitle = firstNode.defaultTargetId ? '默认行为' : '无匹配分支';
      colorClass = firstNode.defaultTargetId ? 'status-green' : 'status-red';
    }
  } else if (firstNode.type === 'choice') {
    statusTitle = firstNode.title || '等待选择';
    colorClass = 'status-blue';
  } else if (firstNode.type === 'action') {
    statusTitle = firstNode.title || '执行动作';
    colorClass = 'status-green';
  }

  if (
    statusTitle.includes('拦截') ||
    statusTitle.includes('提醒') ||
    statusTitle.includes('远眺') ||
    statusTitle.includes('未出城')
  ) {
    colorClass = 'status-amber';
  } else if (
    statusTitle.includes('已') ||
    statusTitle.includes('通') ||
    statusTitle.includes('常驻') ||
    statusTitle.includes('通行')
  ) {
    colorClass = 'status-blue';
  }

  return { title: statusTitle, colorClass };
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

/** 原子步骤的一行摘要（面板展示用） */
export function describeAtomicStep(p: ProjectData, s: AtomicStep): string {
  const label = (key: string) => p.vars.find((v) => v.key === key)?.label || key;
  switch (s.type) {
    case 'say':
      return `💬 ${s.speaker}：${s.text}`;
    case 'set':
      return s.from ? `📝 ${label(s.var)} = ${label(s.from)}` : `📝 ${label(s.var)} = ${formatValue(s.value)}`;
    case 'add':
      return `➕ ${label(s.var)} ${s.amount >= 0 ? '+' : ''}${s.amount}`;
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

/** 执行一个 Event：直接运行其内部 Action Tree 有向流图 */
export function runEvent(ctx: RunContext, ev: EventDef): void {
  runActionGraph(ctx, ev);
}

/** 执行 Action Tree 子图流程 (支持顺序、合流、循环回跳与默认选项定位，具备单帧连续执行防死循环保护) */
export function runActionGraph(ctx: RunContext, ev: EventDef): void {
  const graph = ev.actionGraph;
  if (!graph || !graph.nodes || graph.nodes.length === 0) {
    ctx.log(`⚠️ [${ev.title}] Action Tree 节点列表为空`, true);
    return;
  }

  const startNode = graph.nodes.find((n) => n.type === 'start') as StartGraphNode | undefined;
  if (!startNode) {
    ctx.log(`⚠️ [${ev.title}] 内部子图缺失 Start 入口节点`, true);
    return;
  }

  ctx.log(`▶ [${ev.title}] → 启动 Action Tree 流程`);
  // 单帧连续执行保护计数器：只要有玩家交互操作（对话确认或选项点击）就立即归零重置
  let singleFrameStepsCount = 0;
  const MAX_CONSECUTIVE_STEPS = 500;

  const stepNext = (nodeId?: string, defaultOptionIndex = 0) => {
    if (!nodeId) {
      ctx.log(`⏹️ [${ev.title}] 事件流程结束。`);
      return;
    }

    singleFrameStepsCount++;
    if (singleFrameStepsCount > MAX_CONSECUTIVE_STEPS) {
      ctx.log(`⚠️ [${ev.title}] 单帧无交互连续执行超过 ${MAX_CONSECUTIVE_STEPS} 步，已触发防死循环熔断保护！`, true);
      return;
    }

    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) {
      ctx.log(`⚠️ [${ev.title}] 找不到目标节点 ID: ${nodeId}`, true);
      return;
    }

    const p = ctx.project;

    switch (node.type) {
      case 'start':
        stepNext(node.nextId, node.defaultOptionIndex ?? 0);
        return;

      case 'selector': {
        let matchedTargetId: string | undefined = undefined;
        let matchedOptionIdx: number | undefined = undefined;

        for (const c of node.cases) {
          const ok = c.checks.length > 0 && c.checks.every((chk) => evalConditionCheck(p, ctx.getState(), chk));
          if (ok) {
            matchedTargetId = c.targetId;
            matchedOptionIdx = c.defaultOptionIndex;
            ctx.log(`🔀 [${node.title || 'Selector'}] 命中分支「${c.title}」`);
            break;
          }
        }

        if (matchedTargetId === undefined) {
          matchedTargetId = node.defaultTargetId;
          matchedOptionIdx = node.defaultOptionIndex;
          ctx.log(`🔀 [${node.title || 'Selector'}] 命中 Default 保底`);
        }

        stepNext(matchedTargetId, matchedOptionIdx ?? 0);
        return;
      }

      case 'choice': {
        // 弹出玩家选项弹窗：等待玩家点击属于交互断点，单帧步数清零
        singleFrameStepsCount = 0;

        ctx.showDialog({
          speaker: node.speaker,
          speakerTitle: node.speakerTitle,
          avatar: node.avatar,
          text: interpolate(p, ctx.getState(), node.text),
          defaultOptionIndex: defaultOptionIndex,
          options: node.options.map((o) => {
            const ok =
              !o.checks ||
              o.checks.length === 0 ||
              o.checks.every((chk) => evalConditionCheck(p, ctx.getState(), chk));
            return {
              text: o.text,
              className: ok ? BTN_CLASS[o.style || 'primary'] : 'disabled-btn',
              disabled: !ok,
              onClick: () => {
                // 玩家点击选项：单帧步数归零，允许无限循环加点
                singleFrameStepsCount = 0;
                ctx.log(`💬 选择：[${o.text}]`);
                stepNext(o.targetId, o.defaultOptionIndex ?? 0);
              }
            };
          })
        });
        return;
      }

      case 'action': {
        runAtomicSteps(
          ctx,
          node.steps,
          () => {
            stepNext(node.nextId, node.defaultOptionIndex ?? 0);
          },
          () => {
            // 对话点击确认也是交互断点，重置单帧步数
            singleFrameStepsCount = 0;
          }
        );
        return;
      }
    }
  };

  stepNext(startNode.nextId, startNode.defaultOptionIndex ?? 0);
}

function runAtomicSteps(
  ctx: RunContext,
  steps: AtomicStep[],
  done: () => void,
  onInteractionBreak?: () => void,
  i = 0
): void {
  if (i >= steps.length) {
    done();
    return;
  }
  const s = steps[i];
  const next = () => runAtomicSteps(ctx, steps, done, onInteractionBreak, i + 1);
  const p = ctx.project;

  switch (s.type) {
    case 'say':
      ctx.showDialog({
        speaker: s.speaker,
        speakerTitle: s.speakerTitle,
        avatar: s.avatar,
        text: interpolate(p, ctx.getState(), s.text),
        confirmText: s.button || '继续',
        onConfirm: () => {
          if (onInteractionBreak) onInteractionBreak();
          next();
        }
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
