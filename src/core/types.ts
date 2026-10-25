export type AchievementStatus = 'active' | 'failed' | 'success';

export interface HeroAttributes {
  hp: number;
  maxHp: number;
  attack: number;
  defence: number;
  gold: number;
}

export interface PartyState {
  princess: boolean;
}

export interface ItemsState {
  book: boolean;
  map: boolean;
  hp_gem: boolean;
}

export interface TeleportsState {
  castle: boolean;
}

export interface AchievementsState {
  no_use_princess: AchievementStatus;
  no_use_bed: AchievementStatus;
  no_use_money: AchievementStatus;
}

export interface RegionsState {
  castle_exited: boolean;
}

export interface WorldState {
  hero: HeroAttributes;
  party: PartyState;
  items: ItemsState;
  teleports: TeleportsState;
  achievements: AchievementsState;
  regions: RegionsState;
}

export type ConditionSubType = 'item' | 'character' | 'map' | 'achievement';
export type EventSubType = 'dialog' | 'interaction' | 'gate' | 'service' | 'info';
export type RegionSubType = 'region';

export interface ConditionNode {
  id: string;
  type: 'condition';
  subType: ConditionSubType;
  icon: string;
  title: string;
  desc: string;
  x: number;
  y: number;
  stateKey: string;
  showOnMainGraph?: boolean;
  evaluate: (state: WorldState) => boolean;
  toggle: (state: WorldState) => void;
}

export interface ActionCell {
  type: string;
  text?: string;
  action?: string;
  speaker?: string;
  speakerTitle?: string;
  condition?: string;
  stat?: string;
  cost10?: string;
  cost100?: string;
  [key: string]: unknown;
}

export interface DialogOption {
  text: string;
  className?: string;
  cost?: number;
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

export type ShowDialogFn = (config: DialogConfig) => void;
export type LogFn = (message: string, isHighlight?: boolean) => void;

export interface EventNode {
  id: string;
  type: 'event';
  subType: EventSubType;
  title: string;
  sourceRef: string;
  x: number;
  y: number;
  desc: string;
  isAvailable: (state: WorldState) => boolean;
  statusLabel: (state: WorldState) => string;
  cells: ActionCell[];
  execute: (state: WorldState, showDialog: ShowDialogFn, log: LogFn) => void;
}

export interface RegionNode {
  id: string;
  type: 'region';
  subType: RegionSubType;
  icon: string;
  title: string;
  desc: string;
  x: number;
  y: number;
  isAvailable: (state: WorldState) => boolean;
  statusLabel: (state: WorldState) => string;
  execute: (state: WorldState, showDialog: ShowDialogFn, log: LogFn) => void;
}

export type AnyGraphNode = ConditionNode | EventNode | RegionNode;

export type EdgeType = 'precondition' | 'effect' | 'soft_gate';

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  label: string;
  isInverted?: boolean;
  gateIndex?: number;
  showOnMainGraph?: boolean;
  checkActive: (state: WorldState) => boolean;
}

export interface PresetState {
  id: string;
  name: string;
  state: WorldState;
}

export type EditorMode = 'play' | 'edit';
