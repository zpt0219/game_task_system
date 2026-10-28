import { Command, CommandContext } from './command';

export const UNDO_LIMIT = 100;

export class CommandHandler {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  constructor(private readonly ctx: CommandContext) {}

  execute(cmd: Command): boolean {
    if (!cmd.execute(this.ctx)) return false;
    this.commitExecuted(cmd);
    return true;
  }

  commitExecuted(cmd: Command): void {
    const top = this.undoStack[this.undoStack.length - 1];
    if (!top?.mergeWith?.(cmd)) {
      this.undoStack.push(cmd);
      if (this.undoStack.length > UNDO_LIMIT) {
        this.undoStack.shift();
      }
    }
    this.redoStack = [];
    this.ctx.markDirty();
    this.emitHistory();
  }

  undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo(this.ctx);
    this.redoStack.push(cmd);
    this.ctx.markDirty();
    this.emitHistory();
    return true;
  }

  redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.redo(this.ctx);
    this.undoStack.push(cmd);
    this.ctx.markDirty();
    this.emitHistory();
    return true;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.emitHistory();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private emitHistory(): void {
    this.ctx.events.onHistoryChanged?.(this.canUndo, this.canRedo);
  }
}
