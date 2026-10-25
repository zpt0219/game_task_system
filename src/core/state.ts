import { WorldState, EditorMode, AnyGraphNode } from './types';
import { INITIAL_WORLD_STATE } from './castleData';

export type StateListener = (state: WorldState) => void;
export type ModeListener = (mode: EditorMode) => void;
export type SelectedNodeListener = (node: AnyGraphNode | null) => void;
export type FocalEntityListener = (entityId: string | null) => void;
export type LogListener = (message: string, isHighlight: boolean) => void;
export type ResetListener = () => void;

class StateManager {
  private state: WorldState;
  private mode: EditorMode = 'play';
  private selectedNode: AnyGraphNode | null = null;
  private focalEntityId: string | null = null;

  private stateListeners: Set<StateListener> = new Set();
  private modeListeners: Set<ModeListener> = new Set();
  private selectedNodeListeners: Set<SelectedNodeListener> = new Set();
  private focalEntityListeners: Set<FocalEntityListener> = new Set();
  private logListeners: Set<LogListener> = new Set();
  private resetListeners: Set<ResetListener> = new Set();

  constructor() {
    this.state = JSON.parse(JSON.stringify(INITIAL_WORLD_STATE));
  }

  public getState(): WorldState {
    return this.state;
  }

  public getMode(): EditorMode {
    return this.mode;
  }

  public getSelectedNode(): AnyGraphNode | null {
    return this.selectedNode;
  }

  public getFocalEntityId(): string | null {
    return this.focalEntityId;
  }

  public setFocalEntity(entityId: string | null): void {
    if (this.focalEntityId === entityId) return;
    this.focalEntityId = entityId;
    this.notifyFocalEntity();
  }

  public setMode(mode: EditorMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.notifyMode();
    this.log(
      mode === 'play'
        ? '🎮 切换为 [Play 模式]：点击事件节点可触发剧情对话与状态模拟'
        : '🛠 切换为 [普通编辑模式]：点击任意节点可检视与编辑结构/台词'
    );
  }

  public setSelectedNode(node: AnyGraphNode | null): void {
    this.selectedNode = node;
    this.notifySelectedNode();
  }

  public mutate(fn: (draft: WorldState) => void): void {
    fn(this.state);
    this.notifyState();
  }

  public reset(): void {
    this.state = JSON.parse(JSON.stringify(INITIAL_WORLD_STATE));
    this.focalEntityId = null;
    this.notifyFocalEntity();
    this.notifyState();
    this.resetListeners.forEach((fn) => fn());
    this.log('🔄 已重置所有世界与主角状态为初始状态！', true);
  }

  public loadPreset(presetState: WorldState, presetName: string): void {
    this.state = JSON.parse(JSON.stringify(presetState));
    this.focalEntityId = null;
    this.notifyFocalEntity();
    this.notifyState();
    this.resetListeners.forEach((fn) => fn());
    this.log(`⚡ 加载预设快照：[${presetName}]`, true);
  }

  public log(message: string, isHighlight = false): void {
    this.logListeners.forEach((fn) => fn(message, isHighlight));
  }

  public onReset(listener: ResetListener): () => void {
    this.resetListeners.add(listener);
    return () => this.resetListeners.delete(listener);
  }

  public onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  public onModeChange(listener: ModeListener): () => void {
    this.modeListeners.add(listener);
    return () => this.modeListeners.delete(listener);
  }

  public onSelectedNodeChange(listener: SelectedNodeListener): () => void {
    this.selectedNodeListeners.add(listener);
    return () => this.selectedNodeListeners.delete(listener);
  }

  public onFocalEntityChange(listener: FocalEntityListener): () => void {
    this.focalEntityListeners.add(listener);
    return () => this.focalEntityListeners.delete(listener);
  }

  public onLog(listener: LogListener): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  private notifyState(): void {
    this.stateListeners.forEach((fn) => fn(this.state));
  }

  private notifyMode(): void {
    this.modeListeners.forEach((fn) => fn(this.mode));
  }

  private notifySelectedNode(): void {
    this.selectedNodeListeners.forEach((fn) => fn(this.selectedNode));
  }

  private notifyFocalEntity(): void {
    this.focalEntityListeners.forEach((fn) => fn(this.focalEntityId));
  }
}

export const appState = new StateManager();
