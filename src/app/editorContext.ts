import { LogEntry } from '../command/events';
import { VarCategory } from '../core/types';

const MAX_LOG_ENTRIES = 200;

export class EditorContext {
  public logs: LogEntry[] = [];
  public registerVarModalOpen = false;
  public registerVarDefaultCategory: VarCategory = 'item';
  public canvasDragReceiving = false;
  private nextLogId = 1;

  constructor(
    private readonly onContextChanged: () => void,
    private readonly onLogAdded: (entry: LogEntry) => void
  ) {}

  public appendLog(message: string, isHighlight = false): LogEntry {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const entry: LogEntry = {
      id: this.nextLogId++,
      time,
      message,
      isHighlight
    };
    this.logs.push(entry);
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs.shift();
    }
    this.onLogAdded(entry);
    return entry;
  }

  public clearLogs(): void {
    this.logs = [];
    this.onContextChanged();
  }

  public setRegisterVarModalOpen(open: boolean, defaultCategory?: VarCategory): void {
    if (defaultCategory) {
      this.registerVarDefaultCategory = defaultCategory;
    }
    if (this.registerVarModalOpen === open && !defaultCategory) return;
    this.registerVarModalOpen = open;
    this.onContextChanged();
  }

  public setCanvasDragReceiving(active: boolean): void {
    if (this.canvasDragReceiving === active) return;
    this.canvasDragReceiving = active;
    this.onContextChanged();
  }
}
