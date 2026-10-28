// ============================================================================
// 数据模型：两大节点（Event / Condition）+ 状态变量（Var）
// 所有内容均为纯 JSON 数据，存储在 data/castle.json，可在编辑器中增删改。
// ============================================================================

export type VarValue = boolean | number | string;

/** 状态变量分类：决定左侧栏分组展示 */
export type VarCategory = 'stat' | 'party' | 'item' | 'teleport' | 'achievement' | 'flag';

export type VarKind = 'bool' | 'number' | 'enum';

/** 状态变量：道具 / 同伴 / 传送点 / 成就 / 数值 / 标记 */
export interface VarDef {
  key: string; // 例：items.book
  label: string; // 例：冒险书
  icon: string;
  category: VarCategory;
  kind: VarKind;
  initial: VarValue;
  options?: string[]; // kind === 'enum' 时的可选值
  desc?: string;
}

export type CompareOp = '==' | '!=' | '>' | '>=' | '<' | '<=';

/** 单条比较条件：变量 op 值 */
export interface CmpCond {
  var: string;
  op: CompareOp;
  value: VarValue;
}

/** Condition 节点：只做状态条件判断，Event 节点可声明依赖哪些 Condition */
export interface ConditionDef {
  id: string;
  title: string;
  desc?: string;
  x: number;
  y: number;
  match: 'all' | 'any';
  conds: CmpCond[];
  portSide?: 'left' | 'right' | 'top' | 'bottom';
  portOffsetRatio?: number;
}

export type ButtonStyle = 'primary' | 'secondary' | 'danger';

/** 台词 */
export interface SayStep {
  type: 'say';
  speaker: string;
  speakerTitle?: string;
  avatar?: string;
  text: string;
  button?: string;
}

export interface ChoiceOption {
  text: string;
  style?: ButtonStyle;
  require?: CmpCond[]; // 不满足时按钮置灰（如金币不足）
  steps: Step[];
}

/** 选项 */
export interface ChoiceStep {
  type: 'choice';
  speaker: string;
  speakerTitle?: string;
  avatar?: string;
  text: string;
  options: ChoiceOption[];
}

/** 设置变量（状态改变发生在这里）。from 存在时表示复制另一个变量的值 */
export interface SetStep {
  type: 'set';
  var: string;
  value?: VarValue;
  from?: string;
}

/** 增减数值 */
export interface AddStep {
  type: 'add';
  var: string;
  amount: number;
}

export type Step = SayStep | ChoiceStep | SetStep | AddStep;
export type StepType = Step['type'];

/** 复合 Action 节点内的原子步骤（不含嵌套分支） */
export type AtomicStep = SayStep | SetStep | AddStep;

/** 内部节点对已依赖 Condition 的具体判断规则 */
export interface ConditionCheck {
  conditionId: string; // 必须属于当前 Event 所依赖的 incomingConditions
  op?: CompareOp;      // 比较符（如 '==', '!=', '>=', '<='），默认使用 Condition 主条件的比较符
  value?: VarValue;    // 比较阈值（如 true, false, 100, 10）
}

/** 1. 入口节点 (Start) */
export interface StartGraphNode {
  id: string;
  type: 'start';
  x: number;
  y: number;
  nextId?: string;             // Out 端口指向的节点 ID
  defaultOptionIndex?: number; // 若目标为 Choice 节点，指定默认选中的选项 index（默认 0，即最上面那个）
}

/** 2. 多路条件分支节点 (Selector) */
export interface SelectorCase {
  id: string;
  title: string;
  checks: ConditionCheck[];    // 全部满足时命中此分支
  targetId?: string;           // 该分支 Out 端口指向的节点 ID
  defaultOptionIndex?: number; // 若目标为 Choice 节点，指定默认选中的选项 index（默认 0）
}

export interface SelectorGraphNode {
  id: string;
  type: 'selector';
  title: string;
  x: number;
  y: number;
  cases: SelectorCase[];
  defaultTargetId?: string;    // Default 保底出口指向的节点 ID
  defaultOptionIndex?: number; // 若 Default 保底目标为 Choice 节点，指定默认选中的选项 index（默认 0）
}

/** 3. 玩家选项分流节点 (Choice) */
export interface ChoiceGraphOption {
  id: string;
  text: string;
  style?: ButtonStyle;
  checks?: ConditionCheck[];   // 选项可用前置条件（基于连入的 Condition，如 金币 >= 100）
  targetId?: string;           // 该选项 Out 端口指向的节点 ID
  defaultOptionIndex?: number; // 若目标为 Choice 节点，指定默认选中的选项 index（默认 0）
}

export interface ChoiceGraphNode {
  id: string;
  type: 'choice';
  title: string;
  x: number;
  y: number;
  speaker: string;
  speakerTitle?: string;
  avatar?: string;
  text: string;
  options: ChoiceGraphOption[];
}

/** 4. 复合动作序列节点 (Action) */
export interface ActionGraphNode {
  id: string;
  type: 'action';
  title: string;
  x: number;
  y: number;
  steps: AtomicStep[];         // 顺序执行的 Say / Set / Add 列表
  nextId?: string;             // Out 端口指向的节点 ID（可连向任意后续或前置节点）
  defaultOptionIndex?: number; // 若目标为 Choice 节点，指定默认选中的选项 index（默认 0）
}

export type ActionGraphNodeUnion =
  | StartGraphNode
  | SelectorGraphNode
  | ChoiceGraphNode
  | ActionGraphNode;

/** Event 内部子图结构 */
export interface ActionGraph {
  nodes: ActionGraphNodeUnion[];
}

/** Event 节点：玩家可触发；其描述依赖了哪些 Condition 前置条件，其内部由 Action Tree 有向流图控制 */
export interface EventDef {
  id: string;
  title: string;
  desc?: string;
  sourceRef?: string;
  x: number;
  y: number;
  incomingConditions?: string[]; // 连入此 Event 所依赖的 Condition ID 列表
  actionGraph: ActionGraph;      // 事件内部 Action Tree 有向流图
}

export interface PresetDef {
  id: string;
  name: string;
  values: Record<string, VarValue>; // 覆盖变量初始值
}

export interface ProjectData {
  version: number;
  name: string;
  vars: VarDef[];
  conditions: ConditionDef[];    // 全局 Condition 条件节点 (描述事件所依赖的前置条件)
  events: EventDef[];
  presets: PresetDef[];
}

/** 运行时世界状态：变量 key -> 当前值 */
export type WorldState = Record<string, VarValue>;

export type NodeKind = 'event' | 'condition';

/** 当前选中项 */
export type Selection =
  | { kind: 'event'; id: string }
  | { kind: 'condition'; id: string }
  | { kind: 'var'; id: string }
  | { kind: 'subnode'; id: string; eventId: string }
  | { kind: 'multi'; items: Array<{ kind: 'event' | 'condition' | 'subnode'; id: string; eventId?: string }> }
  | null;

export interface DialogOption {
  text: string;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
}

export interface DialogConfig {
  speaker: string;
  speakerTitle?: string;
  avatar?: string;
  text: string;
  confirmText?: string;
  onConfirm?: () => void;
  options?: DialogOption[];
  defaultOptionIndex?: number; // 默认高亮/聚焦的选项索引
}

export type EditorMode = 'play' | 'edit';
