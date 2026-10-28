import { Command, CommandContext } from '../command/command';
import { CommandHandler } from '../command/commandHandler';
import { DocumentChangeSource, LogEntry, SaveStatus, TaskStudioEvents } from '../command/events';
import { createDefaultDocument, TaskDocument } from '../core/document';
import { getCondition, getEvent, getSubGraphNode, getVar } from '../core/editOps';
import {
  buildInitialState,
  createDefaultSession,
  EditorSession,
  normalizeMultiSelection,
  selectionsEqual,
  StateChangeMeta
} from '../core/session';
import { validateProjectData } from '../core/projectData';
import {
  ActionGraphNodeUnion,
  ConditionDef,
  EditorMode,
  EventDef,
  ProjectData,
  Selection,
  VarCategory,
  VarDef,
  WorldState
} from '../core/types';
import { EditorContext } from './editorContext';
import { GraphEditViewModel } from './graphEditViewModel';
import { PlayRuntimeViewModel } from './playRuntimeViewModel';
import { ProjectStoragePort, StudioPrompts } from './ports';
import { AutosaveService } from './services/AutosaveService';
import { StudioContext } from './subViewModel';

const defaultPrompts: StudioPrompts = {
  async confirm(): Promise<boolean> {
    return true;
  },
  async alert(): Promise<void> {},
  showRpgDialog(): void {}
};

export interface ViewModelDeps {
  storage?: ProjectStoragePort;
  prompts?: Partial<StudioPrompts>;
  saveDelayMs?: number;
}

export class ViewModel implements StudioContext {
  public doc: TaskDocument = createDefaultDocument();
  public session: EditorSession = createDefaultSession();
  public readonly context: EditorContext;
  public readonly handler: CommandHandler;
  public readonly autosave: AutosaveService;
  public readonly prompts: StudioPrompts;
  public readonly edit: GraphEditViewModel;
  public readonly play: PlayRuntimeViewModel;

  private listeners: Partial<TaskStudioEvents>[] = [];
  public readonly events: TaskStudioEvents;
  private readonly cmdCtx: CommandContext;

  constructor(deps: ViewModelDeps = {}) {
    this.prompts = { ...defaultPrompts, ...deps.prompts };

    const fanOut = <K extends keyof TaskStudioEvents>(
      key: K,
      ...args: Parameters<TaskStudioEvents[K]>
    ) => {
      for (const l of [...this.listeners]) {
        const fn = l[key] as ((...a: Parameters<TaskStudioEvents[K]>) => void) | undefined;
        fn?.(...args);
      }
    };

    this.events = {
      onProjectLoaded: () => fanOut('onProjectLoaded'),
      onDocumentChanged: (source: DocumentChangeSource) => fanOut('onDocumentChanged', source),
      onSessionChanged: () => fanOut('onSessionChanged'),
      onWorldStateChanged: (state: WorldState, meta?: StateChangeMeta) =>
        fanOut('onWorldStateChanged', state, meta),
      onContextChanged: () => fanOut('onContextChanged'),
      onHistoryChanged: (canUndo: boolean, canRedo: boolean) =>
        fanOut('onHistoryChanged', canUndo, canRedo),
      onSaveStatus: (status: SaveStatus, error?: string) => fanOut('onSaveStatus', status, error),
      onLogAdded: (entry: LogEntry) => fanOut('onLogAdded', entry)
    };

    this.context = new EditorContext(
      () => this.events.onContextChanged(),
      (entry) => this.events.onLogAdded(entry)
    );

    this.autosave = new AutosaveService(
      deps.storage,
      (status, error) => this.events.onSaveStatus(status, error),
      deps.saveDelayMs
    );

    this.cmdCtx = {
      doc: this.doc,
      session: this.session,
      events: this.events,
      markDirty: () => {
        if (this.session.isLoaded) {
          this.autosave.scheduleSave(this.doc);
        }
      }
    };

    this.handler = new CommandHandler(this.cmdCtx);
    this.edit = new GraphEditViewModel(this, this.cmdCtx);
    this.play = new PlayRuntimeViewModel(this);
  }

  public registerListener(listener: Partial<TaskStudioEvents>): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public setPrompts(prompts: Partial<StudioPrompts>): void {
    Object.assign(this.prompts, prompts);
  }

  // ------------------------------------------------------------------ 工程加载与保存

  public async loadFromStorage(): Promise<void> {
    const data = await this.autosave.load();
    this.loadProjectData(data);
  }

  public loadProjectData(raw: ProjectData): void {
    const validated = validateProjectData(raw);
    this.doc.version = validated.version;
    this.doc.name = validated.name;
    this.doc.vars = validated.vars;
    this.doc.conditions = validated.conditions;
    this.doc.events = validated.events;
    this.doc.presets = validated.presets;

    this.handler.clear();
    this.session.isLoaded = true;
    this.session.selection = null;
    this.session.focalVarKey = null;
    this.session.subGraphEventId = null;
    this.session.viewMode = 'main';
    this.session.activePresetId = '__initial__';
    this.session.worldState = buildInitialState(this.doc);
    this.session.runningEventId = null;

    this.events.onProjectLoaded();
    this.events.onDocumentChanged('load');
    this.events.onSessionChanged();
    this.events.onWorldStateChanged(this.session.worldState);
  }

  public async saveNow(): Promise<void> {
    await this.autosave.saveNow(this.doc);
  }

  // ------------------------------------------------------------------ 命令与历史

  public execute(cmd: Command): boolean {
    return this.handler.execute(cmd);
  }

  public undo(): boolean {
    const ok = this.handler.undo();
    if (ok) {
      this.log('↩ 已撤销上一步修改', true);
    }
    return ok;
  }

  public redo(): boolean {
    const ok = this.handler.redo();
    if (ok) {
      this.log('↪ 已重做修改', true);
    }
    return ok;
  }

  public get canUndo(): boolean {
    return this.handler.canUndo;
  }

  public get canRedo(): boolean {
    return this.handler.canRedo;
  }

  // ------------------------------------------------------------------ Session 状态与视图导航

  public patchSession(patch: Partial<EditorSession>): void {
    let changed = false;
    for (const key of Object.keys(patch) as (keyof EditorSession)[]) {
      if (key === 'selection') {
        const nextSel = patch.selection ?? null;
        if (!selectionsEqual(this.session.selection, nextSel)) {
          this.session.selection = nextSel;
          changed = true;
        }
      } else if (this.session[key] !== patch[key]) {
        (this.session as unknown as Record<string, unknown>)[key] = patch[key];
        changed = true;
      }
    }
    if (changed) {
      this.events.onSessionChanged();
    }
  }

  public updateWorldState(nextState: WorldState, meta?: StateChangeMeta): void {
    this.session.worldState = nextState;
    this.events.onWorldStateChanged(this.session.worldState, meta);
  }

  public setMode(mode: EditorMode): void {
    if (this.session.mode === mode) return;
    this.patchSession({ mode });
    this.log(
      mode === 'play'
        ? '🎮 切换为 [Play 模式]：点击 Event 节点触发剧情'
        : '🛠 切换为 [编辑模式]：可增删改节点',
      true
    );
  }

  public select(sel: Selection): void {
    this.patchSession({ selection: sel });
  }

  public selectMulti(
    items: Array<{ kind: 'event' | 'condition' | 'subnode'; id: string; eventId?: string }>
  ): void {
    this.select(normalizeMultiSelection(items));
  }

  public setFocalVar(varKey: string | null): void {
    if (this.session.focalVarKey === varKey) return;
    if (varKey) {
      this.patchSession({
        focalVarKey: varKey,
        subGraphEventId: null,
        viewMode: 'focal'
      });
    } else {
      this.patchSession({
        focalVarKey: null,
        viewMode: this.session.subGraphEventId ? 'subgraph' : 'main'
      });
    }
  }

  public setSubGraphEventId(eventId: string | null): void {
    if (this.session.subGraphEventId === eventId) return;
    if (eventId) {
      this.patchSession({
        subGraphEventId: eventId,
        focalVarKey: null,
        viewMode: 'subgraph',
        mode: 'edit',
        selection: { kind: 'event', id: eventId }
      });
    } else {
      const prevId = this.session.subGraphEventId;
      this.patchSession({
        subGraphEventId: null,
        viewMode: 'main',
        selection: prevId ? { kind: 'event', id: prevId } : null
      });
    }
  }

  public showMainGraph(): void {
    this.patchSession({
      focalVarKey: null,
      subGraphEventId: null,
      viewMode: 'main'
    });
  }

  public openRegisterVarModal(defaultCategory: VarCategory = 'item'): void {
    this.context.setRegisterVarModalOpen(true, defaultCategory);
  }

  public closeRegisterVarModal(): void {
    this.context.setRegisterVarModalOpen(false);
  }

  public setCanvasDragReceiving(active: boolean): void {
    this.context.setCanvasDragReceiving(active);
  }

  public getEvent(id: string): EventDef | undefined {
    return getEvent(this.doc, id);
  }

  public getCondition(id: string): ConditionDef | undefined {
    return getCondition(this.doc, id);
  }

  public getVar(key: string): VarDef | undefined {
    return getVar(this.doc, key);
  }

  public getSubNode(eventId: string, nodeId: string): ActionGraphNodeUnion | undefined {
    return getSubGraphNode(this.doc, eventId, nodeId);
  }

  public applyPreset(presetId: string): void {
    this.setFocalVar(null);
    this.play.applyPreset(presetId);
  }

  public resetWorldState(): void {
    this.setFocalVar(null);
    this.play.applyPreset('__initial__');
  }

  public mutateWorldState(fn: (draft: WorldState) => void, sourceEventId?: string | null): void {
    this.play.mutateWorldState(fn, sourceEventId);
  }

  public log(message: string, isHighlight = false): void {
    this.context.appendLog(message, isHighlight);
  }

  public dispose(): void {
    this.autosave.dispose();
    this.listeners = [];
  }
}
