import {
  ProjectData,
  EventDef,
  TriggerDef,
  VarDef,
  Step,
  CmpCond,
  Branch
} from './types';

/** 变更来源：决定各面板是否需要整体重绘 */
export type ChangeSource = 'load' | 'structure' | 'field' | 'drag' | 'history';
export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

type ChangeListener = (source: ChangeSource) => void;
type SaveListener = (status: SaveStatus, error?: string) => void;

const API_URL = '/api/project';
const MAX_HISTORY = 200;
const COALESCE_MS = 1500;
const SAVE_DELAY_MS = 500;

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 递归遍历步骤（包括选项内的嵌套步骤） */
export function walkSteps(steps: Step[], fn: (step: Step) => void): void {
  steps.forEach((s) => {
    fn(s);
    if (s.type === 'choice') {
      s.options.forEach((o) => walkSteps(o.steps, fn));
    }
  });
}

/** 遍历选项上的金币等 require 条件 */
function walkRequires(steps: Step[], fn: (c: CmpCond) => void): void {
  walkSteps(steps, (s) => {
    if (s.type === 'choice') s.options.forEach((o) => (o.require || []).forEach(fn));
  });
}

class ProjectStore {
  private data: ProjectData = { version: 1, name: '', vars: [], triggers: [], events: [], presets: [] };
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private lastCoalesceKey: string | null = null;
  private lastCoalesceAt = 0;

  private changeListeners = new Set<ChangeListener>();
  private saveListeners = new Set<SaveListener>();
  private saveTimer: number | undefined;
  private saveStatus: SaveStatus = 'saved';
  private saving = false;
  private pendingSave = false;

  // ------------------------------------------------------------------ 加载 / 保存

  public async load(): Promise<void> {
    let res: Response | null = null;
    try {
      res = await fetch(API_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.data = (await res.json()) as ProjectData;
    } catch (err) {
      // 降级尝试加载相对静态资源 data/castle.json (用于生产静态托管环境)
      try {
        const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '') + '/';
        const staticUrl = `${base}data/castle.json`;
        res = await fetch(staticUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(`静态数据读取失败：HTTP ${res.status}`);
        this.data = (await res.json()) as ProjectData;
      } catch (fallbackErr) {
        throw new Error(`读取 project 数据失败：API 失败 (${err}), 静态降级失败 (${fallbackErr})`);
      }
    }
    this.undoStack = [];
    this.redoStack = [];
    this.lastCoalesceKey = null;
    this.setSaveStatus('saved');
    this.emit('load');
  }

  private scheduleSave(): void {
    this.setSaveStatus('dirty');
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.saveNow(), SAVE_DELAY_MS);
  }

  public async saveNow(): Promise<void> {
    window.clearTimeout(this.saveTimer);
    if (this.saving) {
      this.pendingSave = true;
      return;
    }
    this.saving = true;
    this.setSaveStatus('saving');
    try {
      const res = await fetch(API_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.data)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.setSaveStatus('saved');
    } catch (err) {
      this.setSaveStatus('dirty', '静态演示模式：修改保存在当前浏览器内存中');
    } finally {
      this.saving = false;
      if (this.pendingSave) {
        this.pendingSave = false;
        void this.saveNow();
      }
    }
  }

  private setSaveStatus(status: SaveStatus, error?: string): void {
    this.saveStatus = status;
    this.saveListeners.forEach((fn) => fn(status, error));
  }

  public getSaveStatus(): SaveStatus {
    return this.saveStatus;
  }

  // ------------------------------------------------------------------ 读取

  public get(): ProjectData {
    return this.data;
  }

  public getEvent(id: string): EventDef | undefined {
    return this.data.events.find((e) => e.id === id);
  }

  public getTrigger(id: string): TriggerDef | undefined {
    return this.data.triggers.find((t) => t.id === id);
  }

  public getVar(key: string): VarDef | undefined {
    return this.data.vars.find((v) => v.key === key);
  }

  // ------------------------------------------------------------------ 修改 & 撤销

  /**
   * 所有修改都走这里：先记录快照（用于撤销），再执行修改、通知、自动保存。
   * coalesceKey：连续输入同一字段时合并为一次撤销记录。
   */
  public change(mutator: (d: ProjectData) => void, source: ChangeSource, coalesceKey?: string): void {
    const now = Date.now();
    const coalesce =
      !!coalesceKey && coalesceKey === this.lastCoalesceKey && now - this.lastCoalesceAt < COALESCE_MS;
    if (!coalesce) {
      this.undoStack.push(JSON.stringify(this.data));
      if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
      this.redoStack = [];
    }
    this.lastCoalesceKey = coalesceKey ?? null;
    this.lastCoalesceAt = now;

    mutator(this.data);
    this.emit(source);
    this.scheduleSave();
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push(JSON.stringify(this.data));
    this.data = JSON.parse(prev);
    this.lastCoalesceKey = null;
    this.emit('history');
    this.scheduleSave();
    return true;
  }

  public redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(JSON.stringify(this.data));
    this.data = JSON.parse(next);
    this.lastCoalesceKey = null;
    this.emit('history');
    this.scheduleSave();
    return true;
  }

  // ------------------------------------------------------------------ 节点增删

  public addEvent(x: number, y: number): EventDef {
    const ev: EventDef = {
      id: uid('evt'),
      title: '💬 新事件',
      desc: '',
      sourceRef: '',
      x: Math.round(x),
      y: Math.round(y),
      branches: [
        {
          id: uid('b'),
          title: '默认行为',
          when: [],
          steps: [{ type: 'say', speaker: '旁白', avatar: '💬', text: '在这里编写台词……', button: '继续' }]
        }
      ]
    };
    this.change((d) => d.events.push(ev), 'structure');
    return ev;
  }

  public addTrigger(x: number, y: number): TriggerDef {
    const firstBool = this.data.vars.find((v) => v.kind === 'bool') || this.data.vars[0];
    const trig: TriggerDef = {
      id: uid('trig'),
      title: '⚡ trigger: 新条件',
      desc: '',
      x: Math.round(x),
      y: Math.round(y),
      match: 'all',
      conds: firstBool ? [{ var: firstBool.key, op: '==', value: firstBool.kind === 'bool' ? true : firstBool.initial }] : []
    };
    this.change((d) => d.triggers.push(trig), 'structure');
    return trig;
  }

  public deleteEvent(id: string): void {
    this.change((d) => {
      d.events = d.events.filter((e) => e.id !== id);
    }, 'structure');
  }

  /** 删除 Trigger，同时清理所有分支中对它的引用 */
  public deleteTrigger(id: string): void {
    this.change((d) => {
      d.triggers = d.triggers.filter((t) => t.id !== id);
      d.events.forEach((e) => e.branches.forEach((b) => (b.when = b.when.filter((w) => w !== id))));
    }, 'structure');
  }

  /** 引用了该 Trigger 的分支 */
  public findTriggerRefs(id: string): { event: EventDef; branch: Branch }[] {
    const refs: { event: EventDef; branch: Branch }[] = [];
    this.data.events.forEach((event) =>
      event.branches.forEach((branch) => {
        if (branch.when.includes(id)) refs.push({ event, branch });
      })
    );
    return refs;
  }

  // ------------------------------------------------------------------ 变量

  public addVar(): VarDef {
    let n = 1;
    while (this.getVar(`flags.new_${n}`)) n++;
    const v: VarDef = {
      key: `flags.new_${n}`,
      label: `新变量 ${n}`,
      icon: '🔹',
      category: 'item',
      kind: 'bool',
      initial: false,
      desc: ''
    };
    this.change((d) => d.vars.push(v), 'structure');
    return v;
  }

  /** 变量被引用的位置描述（用于删除前提示） */
  public findVarRefs(key: string): string[] {
    const refs: string[] = [];
    this.data.triggers.forEach((t) => {
      if (t.conds.some((c) => c.var === key)) refs.push(`Trigger「${t.title}」`);
    });
    this.data.events.forEach((e) =>
      e.branches.forEach((b) => {
        let used = false;
        walkSteps(b.steps, (s) => {
          if ((s.type === 'set' || s.type === 'add') && s.var === key) used = true;
          if (s.type === 'set' && s.from === key) used = true;
        });
        walkRequires(b.steps, (c) => {
          if (c.var === key) used = true;
        });
        if (used) refs.push(`Event「${e.title}」分支「${b.title}」`);
      })
    );
    return refs;
  }

  public deleteVar(key: string): void {
    this.change((d) => {
      d.vars = d.vars.filter((v) => v.key !== key);
      d.presets.forEach((p) => delete p.values[key]);
    }, 'structure');
  }

  /** 修改变量 key，并同步更新所有引用 */
  public renameVar(oldKey: string, newKey: string): boolean {
    if (!newKey || oldKey === newKey || this.getVar(newKey)) return false;
    this.change((d) => {
      const v = d.vars.find((x) => x.key === oldKey);
      if (v) v.key = newKey;
      d.triggers.forEach((t) => t.conds.forEach((c) => c.var === oldKey && (c.var = newKey)));
      d.events.forEach((e) =>
        e.branches.forEach((b) => {
          walkSteps(b.steps, (s) => {
            if ((s.type === 'set' || s.type === 'add') && s.var === oldKey) s.var = newKey;
            if (s.type === 'set' && s.from === oldKey) s.from = newKey;
          });
          walkRequires(b.steps, (c) => c.var === oldKey && (c.var = newKey));
        })
      );
      d.presets.forEach((p) => {
        if (oldKey in p.values) {
          p.values[newKey] = p.values[oldKey];
          delete p.values[oldKey];
        }
      });
    }, 'structure');
    return true;
  }

  // ------------------------------------------------------------------ 订阅

  public onChange(fn: ChangeListener): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }

  public onSaveStatus(fn: SaveListener): () => void {
    this.saveListeners.add(fn);
    return () => this.saveListeners.delete(fn);
  }

  private emit(source: ChangeSource): void {
    this.changeListeners.forEach((fn) => fn(source));
  }
}

export const project = new ProjectStore();
