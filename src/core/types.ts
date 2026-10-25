// ============================================================================
// 数据模型：两大节点（Event / Trigger）+ 状态变量（Var）
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

/** Trigger 节点：只做判断，用来改变 Event 的行为 */
export interface TriggerDef {
  id: string;
  title: string;
  desc?: string;
  x: number;
  y: number;
  match: 'all' | 'any';
  conds: CmpCond[];
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

/** 分支：when 中所有 Trigger 都满足时匹配；when 为空表示默认行为 */
export interface Branch {
  id: string;
  title: string;
  when: string[];
  steps: Step[];
}

/** Event 节点：玩家可触发；从上到下匹配第一个满足的分支 */
export interface EventDef {
  id: string;
  title: string;
  desc?: string;
  sourceRef?: string;
  x: number;
  y: number;
  incomingTriggers?: string[]; // 连入此 Event 的 Trigger ID 列表 (输入信号)
  branches: Branch[];
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
  triggers: TriggerDef[];
  events: EventDef[];
  presets: PresetDef[];
}

/** 运行时世界状态：变量 key -> 当前值 */
export type WorldState = Record<string, VarValue>;

export type NodeKind = 'event' | 'trigger';

/** 当前选中项 */
export type Selection =
  | { kind: 'event'; id: string }
  | { kind: 'trigger'; id: string }
  | { kind: 'var'; id: string }
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
}

export type EditorMode = 'play' | 'edit';
