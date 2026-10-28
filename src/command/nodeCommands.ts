import { TaskDocument } from '../core/document';
import {
  connectConditionToEvent,
  createConditionDef,
  createEventDef,
  deleteConditionCascade,
  deleteEventCascade,
  deleteNodesBatch,
  disconnectConditionFromEvent,
  getCondition,
  getEvent,
  getSubGraphNode
} from '../core/editOps';
import { applyMainGraphLayout } from '../core/layout';
import { ConditionDef, EventDef } from '../core/types';
import { CommandContext, SnapshotCommand } from './command';
import { DocumentChangeSource } from './events';

export class AddEventCommand extends SnapshotCommand {
  readonly name = 'AddEvent';
  public createdEvent?: EventDef;

  constructor(
    private readonly x: number,
    private readonly y: number,
    private readonly incomingConditionId?: string
  ) {
    super();
  }

  execute(ctx: CommandContext): boolean {
    this.init(ctx);
    const ev = createEventDef(this.x, this.y);
    if (this.incomingConditionId && getCondition(ctx.doc, this.incomingConditionId)) {
      ev.incomingConditions = [this.incomingConditionId];
    }
    ctx.doc.events.push(ev);
    ctx.session.selection = { kind: 'event', id: ev.id };
    this.createdEvent = ev;
    return this.finish(ctx);
  }
}

export class AddConditionCommand extends SnapshotCommand {
  readonly name = 'AddCondition';
  public createdCondition?: ConditionDef;

  constructor(
    private readonly x: number,
    private readonly y: number
  ) {
    super();
  }

  execute(ctx: CommandContext): boolean {
    this.init(ctx);
    const cond = createConditionDef(ctx.doc, this.x, this.y);
    ctx.doc.conditions.push(cond);
    ctx.session.selection = { kind: 'condition', id: cond.id };
    this.createdCondition = cond;
    return this.finish(ctx);
  }
}

export class DeleteEventCommand extends SnapshotCommand {
  readonly name = 'DeleteEvent';

  constructor(private readonly eventId: string) {
    super();
  }

  execute(ctx: CommandContext): boolean {
    this.init(ctx);
    if (!deleteEventCascade(ctx.doc, this.eventId)) return false;
    if (ctx.session.selection?.kind === 'event' && ctx.session.selection.id === this.eventId) {
      ctx.session.selection = null;
    }
    return this.finish(ctx);
  }
}

export class DeleteConditionCommand extends SnapshotCommand {
  readonly name = 'DeleteCondition';

  constructor(private readonly conditionId: string) {
    super();
  }

  execute(ctx: CommandContext): boolean {
    this.init(ctx);
    if (!deleteConditionCascade(ctx.doc, this.conditionId)) return false;
    if (ctx.session.selection?.kind === 'condition' && ctx.session.selection.id === this.conditionId) {
      ctx.session.selection = null;
    }
    return this.finish(ctx);
  }
}

export class DeleteBatchCommand extends SnapshotCommand {
  readonly name = 'DeleteBatch';
  public deletedCount = 0;

  constructor(
    private readonly items: Array<{ kind: 'event' | 'condition' | 'subnode'; id: string; eventId?: string }>
  ) {
    super();
  }

  execute(ctx: CommandContext): boolean {
    this.init(ctx);
    this.deletedCount = deleteNodesBatch(ctx.doc, this.items);
    if (this.deletedCount === 0) return false;
    ctx.session.selection = null;
    return this.finish(ctx);
  }
}

export class ConnectConditionCommand extends SnapshotCommand {
  readonly name = 'ConnectCondition';

  constructor(
    private readonly eventId: string,
    private readonly conditionId: string
  ) {
    super();
  }

  execute(ctx: CommandContext): boolean {
    this.init(ctx);
    if (!connectConditionToEvent(ctx.doc, this.eventId, this.conditionId)) return false;
    return this.finish(ctx);
  }
}

export class DisconnectConditionCommand extends SnapshotCommand {
  readonly name = 'DisconnectCondition';

  constructor(
    private readonly eventId: string,
    private readonly conditionId: string
  ) {
    super();
  }

  execute(ctx: CommandContext): boolean {
    this.init(ctx);
    if (!disconnectConditionFromEvent(ctx.doc, this.eventId, this.conditionId)) return false;
    return this.finish(ctx);
  }
}

export class ReconnectConditionCommand extends SnapshotCommand {
  readonly name = 'ReconnectCondition';

  constructor(
    private readonly fromEventId: string,
    private readonly toEventId: string,
    private readonly conditionId: string
  ) {
    super();
  }

  execute(ctx: CommandContext): boolean {
    this.init(ctx);
    disconnectConditionFromEvent(ctx.doc, this.fromEventId, this.conditionId);
    connectConditionToEvent(ctx.doc, this.toEventId, this.conditionId);
    return this.finish(ctx);
  }
}

export class UpdateConditionPortCommand extends SnapshotCommand {
  readonly name = 'UpdateConditionPort';

  constructor(
    private readonly conditionId: string,
    private readonly portSide: 'left' | 'right' | 'top' | 'bottom',
    private readonly portOffsetRatio: number
  ) {
    super();
  }

  execute(ctx: CommandContext): boolean {
    this.init(ctx);
    const cond = getCondition(ctx.doc, this.conditionId);
    if (!cond) return false;
    cond.portSide = this.portSide;
    cond.portOffsetRatio = this.portOffsetRatio;
    return this.finish(ctx);
  }
}

export interface NodeMovePosition {
  kind: 'event' | 'condition' | 'subnode';
  id: string;
  eventId?: string;
  x: number;
  y: number;
}

export class MoveNodesGestureCommand extends SnapshotCommand {
  readonly name = 'MoveNodes';
  protected override readonly changeSource: DocumentChangeSource = 'drag';

  begin(ctx: CommandContext): void {
    this.init(ctx);
  }

  moveTo(ctx: CommandContext, positions: NodeMovePosition[]): void {
    for (const pos of positions) {
      const rx = Math.round(pos.x);
      const ry = Math.round(pos.y);
      if (pos.kind === 'event') {
        const ev = getEvent(ctx.doc, pos.id);
        if (ev) {
          ev.x = rx;
          ev.y = ry;
        }
      } else if (pos.kind === 'condition') {
        const cond = getCondition(ctx.doc, pos.id);
        if (cond) {
          cond.x = rx;
          cond.y = ry;
        }
      } else if (pos.kind === 'subnode' && pos.eventId) {
        const sub = getSubGraphNode(ctx.doc, pos.eventId, pos.id);
        if (sub) {
          sub.x = rx;
          sub.y = ry;
        }
      }
    }
    ctx.events.onDocumentChanged?.('drag');
  }

  end(ctx: CommandContext): boolean {
    return this.finish(ctx);
  }

  execute(ctx: CommandContext): boolean {
    return this.finish(ctx);
  }
}

export class ResetMainLayoutCommand extends SnapshotCommand {
  readonly name = 'ResetMainLayout';

  execute(ctx: CommandContext): boolean {
    this.init(ctx);
    applyMainGraphLayout(ctx.doc);
    return this.finish(ctx);
  }
}

export class MutateDocumentCommand extends SnapshotCommand {
  readonly name: string;
  protected override readonly changeSource: DocumentChangeSource;
  protected override readonly coalesceKey?: string;

  constructor(
    name: string,
    private readonly mutator: (doc: TaskDocument) => void,
    changeSource: DocumentChangeSource = 'structure',
    coalesceKey?: string
  ) {
    super();
    this.name = name;
    this.changeSource = changeSource;
    this.coalesceKey = coalesceKey;
  }

  execute(ctx: CommandContext): boolean {
    this.init(ctx);
    this.mutator(ctx.doc);
    return this.finish(ctx);
  }
}
