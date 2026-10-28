import { WorldState, EditorMode, Selection, VarValue, ProjectData } from './types';

export interface StateChangeMeta {
  prevState: WorldState;
  changedVars: string[];
  sourceEventId?: string | null;
}

export type StateListener = (state: WorldState, meta?: StateChangeMeta) => void;
export type ModeListener = (mode: EditorMode) => void;
export type SelectionListener = (sel: Selection) => void;
export type FocalListener = (varKey: string | null) => void;
export type SubGraphListener = (eventId: string | null) => void;
export type LogListener = (message: string, isHighlight: boolean) => void;

/** 根据项目变量定义生成初始世界状态，可叠加预设覆盖值 */
export function buildInitialState(p: ProjectData, overrides: Record<string, VarValue> = {}): WorldState {
  const s: WorldState = {};
  p.vars.forEach((v) => (s[v.key] = v.initial));
  Object.assign(s, overrides);
  return s;
}

/** 运行时状态：世界变量、模式、选中项、专属图焦点 */
class AppState {
  private state: WorldState = {};
  private mode: EditorMode = 'play';
  private selection: Selection = null;
  private focalVar: string | null = null;
  private subGraphEventId: string | null = null;
  private currentRunningEventId: string | null = null;

  private stateListeners = new Set<StateListener>();
  private modeListeners = new Set<ModeListener>();
  private selectionListeners = new Set<SelectionListener>();
  private focalListeners = new Set<FocalListener>();
  private subGraphListeners = new Set<SubGraphListener>();
  private logListeners = new Set<LogListener>();

  public setRunningEventId(id: string | null): void {
    this.currentRunningEventId = id;
  }

  public getRunningEventId(): string | null {
    return this.currentRunningEventId;
  }

  public getState(): WorldState {
    return this.state;
  }

  public setState(s: WorldState): void {
    const prevState = { ...this.state };
    this.state = s;
    const allKeys = new Set([...Object.keys(prevState), ...Object.keys(this.state)]);
    const changedVars: string[] = [];
    allKeys.forEach((k) => {
      if (prevState[k] !== this.state[k]) changedVars.push(k);
    });
    const meta: StateChangeMeta = {
      prevState,
      changedVars,
      sourceEventId: this.currentRunningEventId
    };
    this.stateListeners.forEach((fn) => fn(this.state, meta));
  }

  public mutate(fn: (draft: WorldState) => void): void {
    const prevState = { ...this.state };
    fn(this.state);
    const allKeys = new Set([...Object.keys(prevState), ...Object.keys(this.state)]);
    const changedVars: string[] = [];
    allKeys.forEach((k) => {
      if (prevState[k] !== this.state[k]) changedVars.push(k);
    });
    const meta: StateChangeMeta = {
      prevState,
      changedVars,
      sourceEventId: this.currentRunningEventId
    };
    this.stateListeners.forEach((l) => l(this.state, meta));
  }

  public getMode(): EditorMode {
    return this.mode;
  }

  public setMode(mode: EditorMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.modeListeners.forEach((fn) => fn(mode));
    this.log(mode === 'play' ? '🎮 切换为 [Play 模式]：点击 Event 节点触发剧情' : '🛠 切换为 [编辑模式]：可增删改节点', true);
  }

  public getSelection(): Selection {
    return this.selection;
  }

  public select(sel: Selection): void {
    this.selection = sel;
    this.selectionListeners.forEach((fn) => fn(sel));
  }

  public selectMulti(items: Array<{ kind: 'event' | 'condition' | 'subnode'; id: string; eventId?: string }>): void {
    if (items.length === 0) {
      this.select(null);
    } else if (items.length === 1) {
      const it = items[0];
      if (it.kind === 'subnode') {
        this.select({ kind: 'subnode', id: it.id, eventId: it.eventId || '' });
      } else {
        this.select({ kind: it.kind, id: it.id });
      }
    } else {
      this.select({ kind: 'multi', items });
    }
  }

  public getSelectedNodeIds(): string[] {
    if (!this.selection) return [];
    if (this.selection.kind === 'multi') {
      return this.selection.items.map((i) => i.id);
    }
    if ('id' in this.selection && this.selection.id) {
      return [this.selection.id];
    }
    return [];
  }

  public isNodeSelected(id: string): boolean {
    if (!this.selection) return false;
    if (this.selection.kind === 'multi') {
      return this.selection.items.some((it) => it.id === id);
    }
    return 'id' in this.selection && this.selection.id === id;
  }

  public getFocalVar(): string | null {
    return this.focalVar;
  }

  public setFocalVar(key: string | null): void {
    if (this.focalVar === key) return;
    this.focalVar = key;
    this.focalListeners.forEach((fn) => fn(key));
  }

  public getSubGraphEventId(): string | null {
    return this.subGraphEventId;
  }

  public setSubGraphEventId(id: string | null): void {
    if (this.subGraphEventId === id) return;
    this.subGraphEventId = id;
    this.subGraphListeners.forEach((fn) => fn(id));
  }

  public log(message: string, isHighlight = false): void {
    this.logListeners.forEach((fn) => fn(message, isHighlight));
  }

  public onStateChange(fn: StateListener): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  public onModeChange(fn: ModeListener): () => void {
    this.modeListeners.add(fn);
    return () => this.modeListeners.delete(fn);
  }

  public onSelectionChange(fn: SelectionListener): () => void {
    this.selectionListeners.add(fn);
    return () => this.selectionListeners.delete(fn);
  }

  public onFocalChange(fn: FocalListener): () => void {
    this.focalListeners.add(fn);
    return () => this.focalListeners.delete(fn);
  }

  public onSubGraphChange(fn: SubGraphListener): () => void {
    this.subGraphListeners.add(fn);
    return () => this.subGraphListeners.delete(fn);
  }

  public onLog(fn: LogListener): () => void {
    this.logListeners.add(fn);
    return () => this.logListeners.delete(fn);
  }
}

export const appState = new AppState();
