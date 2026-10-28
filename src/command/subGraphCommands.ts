import {
  connectSubGraphPort,
  createSubGraphNode,
  deleteSubNodeCascade,
  disconnectSubGraphPort,
  ensureActionGraph,
  getEvent,
  SubGraphPortSource
} from '../core/editOps';
import { applySubGraphDagLayout } from '../core/layout';
import { ActionGraphNodeUnion } from '../core/types';
import { CommandContext, SnapshotCommand } from './command';

export class AddSubNodeCommand extends SnapshotCommand {
  readonly name = 'AddSubNode';
  public createdNode?: ActionGraphNodeUnion;

  constructor(
    private readonly eventId: string,
    private readonly type: 'action' | 'selector' | 'choice',
    private readonly x: number,
    private readonly y: number,
    private readonly connectFrom?: SubGraphPortSource
  ) {
    super();
  }

  execute(ctx: CommandContext): boolean {
    const ev = getEvent(ctx.doc, this.eventId);
    if (!ev) return false;
    this.init(ctx);
    ensureActionGraph(ev);
    const node = createSubGraphNode(ev, this.type, this.x, this.y);
    ev.actionGraph.nodes.push(node);
    if (this.connectFrom) {
      connectSubGraphPort(ctx.doc, this.eventId, this.connectFrom, node.id);
    }
    ctx.session.selection = { kind: 'subnode', id: node.id, eventId: this.eventId };
    this.createdNode = node;
    return this.finish(ctx);
  }
}

export class DeleteSubNodeCommand extends SnapshotCommand {
  readonly name = 'DeleteSubNode';

  constructor(
    private readonly eventId: string,
    private readonly nodeId: string
  ) {
    super();
  }

  execute(ctx: CommandContext): boolean {
    this.init(ctx);
    if (!deleteSubNodeCascade(ctx.doc, this.eventId, this.nodeId)) return false;
    if (ctx.session.selection?.kind === 'subnode' && ctx.session.selection.id === this.nodeId) {
      ctx.session.selection = { kind: 'event', id: this.eventId };
    }
    return this.finish(ctx);
  }
}

export class ConnectSubGraphCommand extends SnapshotCommand {
  readonly name = 'ConnectSubGraph';

  constructor(
    private readonly eventId: string,
    private readonly src: SubGraphPortSource,
    private readonly targetNodeId: string
  ) {
    super();
  }

  execute(ctx: CommandContext): boolean {
    this.init(ctx);
    if (!connectSubGraphPort(ctx.doc, this.eventId, this.src, this.targetNodeId)) return false;
    return this.finish(ctx);
  }
}

export class DisconnectSubGraphCommand extends SnapshotCommand {
  readonly name = 'DisconnectSubGraph';

  constructor(
    private readonly eventId: string,
    private readonly src: SubGraphPortSource
  ) {
    super();
  }

  execute(ctx: CommandContext): boolean {
    this.init(ctx);
    if (!disconnectSubGraphPort(ctx.doc, this.eventId, this.src)) return false;
    return this.finish(ctx);
  }
}

export class ResetSubGraphLayoutCommand extends SnapshotCommand {
  readonly name = 'ResetSubGraphLayout';

  constructor(private readonly eventId: string) {
    super();
  }

  execute(ctx: CommandContext): boolean {
    this.init(ctx);
    if (!applySubGraphDagLayout(ctx.doc, this.eventId)) return false;
    return this.finish(ctx);
  }
}
