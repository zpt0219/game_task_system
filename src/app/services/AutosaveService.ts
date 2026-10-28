import { SaveStatus } from '../../command/events';
import { TaskDocument } from '../../core/document';
import { documentToProjectData } from '../../core/projectData';
import { ProjectData } from '../../core/types';
import { ProjectStoragePort } from '../ports';

export const DEFAULT_SAVE_DELAY_MS = 500;

const unavailableProjectStorage: ProjectStoragePort = {
  async loadProject(): Promise<ProjectData> {
    throw new Error('工程存储服务未配置');
  },
  async saveProject(): Promise<void> {
    throw new Error('工程存储服务未配置');
  }
};

export class AutosaveService {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving = false;
  private pendingDoc: TaskDocument | null = null;
  private status: SaveStatus = 'saved';
  private disposed = false;

  constructor(
    private readonly storage: ProjectStoragePort = unavailableProjectStorage,
    private readonly onStatusChange?: (status: SaveStatus, error?: string) => void,
    private readonly delayMs: number = DEFAULT_SAVE_DELAY_MS
  ) {}

  public getStatus(): SaveStatus {
    return this.status;
  }

  public setStatus(status: SaveStatus, error?: string): void {
    this.status = status;
    this.onStatusChange?.(status, error);
  }

  public async load(): Promise<ProjectData> {
    const data = await this.storage.loadProject();
    this.cancel();
    this.setStatus('saved');
    return data;
  }

  public scheduleSave(doc: TaskDocument): void {
    if (this.disposed) return;
    this.pendingDoc = doc;
    this.setStatus('dirty');
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      const docToSave = this.pendingDoc;
      this.pendingDoc = null;
      if (docToSave) {
        void this.saveNow(docToSave);
      }
    }, this.delayMs);
  }

  public async saveNow(doc: TaskDocument): Promise<void> {
    if (this.disposed) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.saving) {
      this.pendingDoc = doc;
      return;
    }
    this.saving = true;
    this.setStatus('saving');
    try {
      await this.storage.saveProject(documentToProjectData(doc));
      this.setStatus('saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus('dirty', msg || '静态演示模式：修改保存在当前浏览器内存中');
    } finally {
      this.saving = false;
      if (this.pendingDoc && !this.disposed) {
        const nextDoc = this.pendingDoc;
        this.pendingDoc = null;
        void this.saveNow(nextDoc);
      }
    }
  }

  public cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pendingDoc = null;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;
  }
}
