import { cloneDocument, documentsEqual, TaskDocument } from '../core/document';
import { EditorSession, selectionsEqual } from '../core/session';
import { Selection } from '../core/types';
import { DocumentChangeSource, TaskStudioEvents } from './events';

export const COALESCE_WINDOW_MS = 1500;

export interface CommandContext {
  doc: TaskDocument;
  session: EditorSession;
  events: Partial<TaskStudioEvents>;
  markDirty(): void;
}

export interface DocumentMemento {
  doc: TaskDocument;
  selection: Selection;
}

export function captureDocumentMemento(ctx: CommandContext): DocumentMemento {
  return {
    doc: cloneDocument(ctx.doc),
    selection: structuredClone(ctx.session.selection)
  };
}

export function applyDocumentMemento(ctx: CommandContext, memento: DocumentMemento): void {
  const cloned = cloneDocument(memento.doc);
  ctx.doc.version = cloned.version;
  ctx.doc.name = cloned.name;
  ctx.doc.vars = cloned.vars;
  ctx.doc.conditions = cloned.conditions;
  ctx.doc.events = cloned.events;
  ctx.doc.presets = cloned.presets;
  ctx.session.selection = structuredClone(memento.selection);
}

export function emitMementoDiff(
  ctx: CommandContext,
  prev: DocumentMemento,
  next: DocumentMemento,
  source: DocumentChangeSource
): boolean {
  const docChanged = !documentsEqual(prev.doc, next.doc);
  const selChanged = !selectionsEqual(prev.selection, next.selection);
  if (!docChanged && !selChanged) return false;

  if (docChanged) {
    ctx.events.onDocumentChanged?.(source);
  }
  if (selChanged) {
    ctx.events.onSessionChanged?.();
  }
  return docChanged;
}

export interface Command {
  readonly name: string;
  execute(ctx: CommandContext): boolean;
  undo(ctx: CommandContext): void;
  redo(ctx: CommandContext): void;
  mergeWith?(next: Command): boolean;
}

export abstract class SnapshotCommand implements Command {
  abstract readonly name: string;
  protected readonly changeSource: DocumentChangeSource = 'structure';
  protected readonly coalesceKey?: string;
  public readonly createdAt = Date.now();
  public before!: DocumentMemento;
  public after!: DocumentMemento;

  protected init(ctx: CommandContext): void {
    this.before = captureDocumentMemento(ctx);
  }

  protected finish(ctx: CommandContext): boolean {
    this.after = captureDocumentMemento(ctx);
    return emitMementoDiff(ctx, this.before, this.after, this.changeSource);
  }

  abstract execute(ctx: CommandContext): boolean;

  undo(ctx: CommandContext): void {
    const prev = captureDocumentMemento(ctx);
    applyDocumentMemento(ctx, this.before);
    emitMementoDiff(ctx, prev, this.before, 'history');
  }

  redo(ctx: CommandContext): void {
    const prev = captureDocumentMemento(ctx);
    applyDocumentMemento(ctx, this.after);
    emitMementoDiff(ctx, prev, this.after, 'history');
  }

  mergeWith(next: Command): boolean {
    if (
      next instanceof SnapshotCommand &&
      this.coalesceKey &&
      this.coalesceKey === next.coalesceKey &&
      next.createdAt - this.createdAt <= COALESCE_WINDOW_MS
    ) {
      this.after = next.after;
      return true;
    }
    return false;
  }
}
