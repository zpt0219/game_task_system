import { WorldState, EditorMode, Selection, VarValue, ProjectData } from './types';

export type StateListener = (state: WorldState) => void;
export type ModeListener = (mode: EditorMode) => void;
export type SelectionListener = (sel: Selection) => void;
export type FocalListener = (varKey: string | null) => void;
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

  private stateListeners = new Set<StateListener>();
  private modeListeners = new Set<ModeListener>();
  private selectionListeners = new Set<SelectionListener>();
  private focalListeners = new Set<FocalListener>();
  private logListeners = new Set<LogListener>();

  public getState(): WorldState {
    return this.state;
  }

  public setState(s: WorldState): void {
    this.state = s;
    this.stateListeners.forEach((fn) => fn(this.state));
  }

  public mutate(fn: (draft: WorldState) => void): void {
    fn(this.state);
    this.stateListeners.forEach((l) => l(this.state));
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

  public getFocalVar(): string | null {
    return this.focalVar;
  }

  public setFocalVar(key: string | null): void {
    if (this.focalVar === key) return;
    this.focalVar = key;
    this.focalListeners.forEach((fn) => fn(key));
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

  public onLog(fn: LogListener): () => void {
    this.logListeners.add(fn);
    return () => this.logListeners.delete(fn);
  }
}

export const appState = new AppState();
