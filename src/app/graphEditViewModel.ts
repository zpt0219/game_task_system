import { CommandContext } from '../command/command';
import { DocumentChangeSource } from '../command/events';
import {
  AddConditionCommand,
  AddEventCommand,
  ConnectConditionCommand,
  DeleteBatchCommand,
  DeleteConditionCommand,
  DeleteEventCommand,
  DisconnectConditionCommand,
  MoveNodesGestureCommand,
  MutateDocumentCommand,
  NodeMovePosition,
  ReconnectConditionCommand,
  ResetMainLayoutCommand,
  UpdateConditionPortCommand
} from '../command/nodeCommands';
import {
  AddSubNodeCommand,
  ConnectSubGraphCommand,
  DeleteSubNodeCommand,
  DisconnectSubGraphCommand,
  ResetSubGraphLayoutCommand
} from '../command/subGraphCommands';
import { AddVarCommand, DeleteVarCommand, RenameVarCommand } from '../command/varCommands';
import { TaskDocument } from '../core/document';
import {
  findVarRefs,
  getCondition,
  getEvent,
  getSubGraphNode,
  getVar,
  SubGraphPortSource
} from '../core/editOps';
import { ActionGraphNodeUnion, ConditionDef, EventDef, VarDef } from '../core/types';
import { StudioContext } from './subViewModel';

export class GraphEditViewModel {
  private activeMoveCmd: MoveNodesGestureCommand | null = null;

  constructor(
    private readonly ctx: StudioContext,
    private readonly cmdCtx: CommandContext
  ) {}

  public addEvent(x: number, y: number, incomingConditionId?: string): EventDef | undefined {
    if (this.ctx.session.mode !== 'edit') {
      this.ctx.patchSession({ mode: 'edit' });
    }
    const cmd = new AddEventCommand(x, y, incomingConditionId);
    if (this.ctx.execute(cmd)) {
      return cmd.createdEvent;
    }
    return undefined;
  }

  public addCondition(x: number, y: number): ConditionDef | undefined {
    if (this.ctx.session.mode !== 'edit') {
      this.ctx.patchSession({ mode: 'edit' });
    }
    const cmd = new AddConditionCommand(x, y);
    if (this.ctx.execute(cmd)) {
      return cmd.createdCondition;
    }
    return undefined;
  }

  public addSubNode(
    eventId: string,
    type: 'action' | 'selector' | 'choice',
    x: number,
    y: number,
    connectFrom?: SubGraphPortSource
  ): ActionGraphNodeUnion | undefined {
    if (this.ctx.session.mode !== 'edit') {
      this.ctx.patchSession({ mode: 'edit' });
    }
    const cmd = new AddSubNodeCommand(eventId, type, x, y, connectFrom);
    if (this.ctx.execute(cmd)) {
      return cmd.createdNode;
    }
    return undefined;
  }

  public deleteEvent(id: string): boolean {
    const ev = getEvent(this.ctx.doc, id);
    const title = ev?.title || id;
    const ok = this.ctx.execute(new DeleteEventCommand(id));
    if (ok) {
      this.ctx.log(`🗑 已删除 Event：${title}（Ctrl+Z 可撤销）`);
    }
    return ok;
  }

  public deleteCondition(id: string): boolean {
    const cond = getCondition(this.ctx.doc, id);
    const title = cond?.title || id;
    const ok = this.ctx.execute(new DeleteConditionCommand(id));
    if (ok) {
      this.ctx.log(`🗑 已删除 Condition：${title}（Ctrl+Z 可撤销）`);
    }
    return ok;
  }

  public deleteSubNode(eventId: string, nodeId: string): boolean {
    const node = getSubGraphNode(this.ctx.doc, eventId, nodeId);
    if (!node || node.type === 'start') return false;
    const title = node.title || node.id;
    const ok = this.ctx.execute(new DeleteSubNodeCommand(eventId, nodeId));
    if (ok) {
      this.ctx.log(`🗑 已删除子节点：${title}（Ctrl+Z 可撤销）`);
    }
    return ok;
  }

  public deleteItems(
    items: Array<{ kind: 'event' | 'condition' | 'subnode'; id: string; eventId?: string }>
  ): number {
    const cmd = new DeleteBatchCommand(items);
    if (this.ctx.execute(cmd)) {
      this.ctx.log(`🗑 已批量删除 ${cmd.deletedCount} 个节点（Ctrl+Z 可撤销）`, true);
      return cmd.deletedCount;
    }
    return 0;
  }

  public deleteSelection(): boolean {
    const sel = this.ctx.session.selection;
    if (!sel) return false;
    if (sel.kind === 'event') return this.deleteEvent(sel.id);
    if (sel.kind === 'condition') return this.deleteCondition(sel.id);
    if (sel.kind === 'subnode') return this.deleteSubNode(sel.eventId, sel.id);
    if (sel.kind === 'multi') return this.deleteItems(sel.items) > 0;
    return false;
  }

  public connectCondition(eventId: string, conditionId: string): boolean {
    return this.ctx.execute(new ConnectConditionCommand(eventId, conditionId));
  }

  public disconnectCondition(eventId: string, conditionId: string): boolean {
    return this.ctx.execute(new DisconnectConditionCommand(eventId, conditionId));
  }

  public reconnectCondition(fromEventId: string, toEventId: string, conditionId: string): boolean {
    return this.ctx.execute(new ReconnectConditionCommand(fromEventId, toEventId, conditionId));
  }

  public updateConditionPort(
    conditionId: string,
    side: 'left' | 'right' | 'top' | 'bottom',
    ratio: number
  ): boolean {
    return this.ctx.execute(new UpdateConditionPortCommand(conditionId, side, ratio));
  }

  public connectSubGraph(
    eventId: string,
    src: SubGraphPortSource,
    targetNodeId: string
  ): boolean {
    return this.ctx.execute(new ConnectSubGraphCommand(eventId, src, targetNodeId));
  }

  public disconnectSubGraph(eventId: string, src: SubGraphPortSource): boolean {
    return this.ctx.execute(new DisconnectSubGraphCommand(eventId, src));
  }

  // ------------------------------------------------------------------ 节点拖拽手势闭环

  public beginNodeMove(): void {
    const cmd = new MoveNodesGestureCommand();
    cmd.begin(this.cmdCtx);
    this.activeMoveCmd = cmd;
  }

  public moveNodesTo(positions: NodeMovePosition[]): void {
    if (!this.activeMoveCmd) {
      this.beginNodeMove();
    }
    this.activeMoveCmd!.moveTo(this.cmdCtx, positions);
  }

  public endNodeMove(): boolean {
    const cmd = this.activeMoveCmd;
    this.activeMoveCmd = null;
    if (!cmd) return false;
    if (cmd.end(this.cmdCtx)) {
      this.ctx.handler.commitExecuted(cmd);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ 布局与变量

  public resetMainLayout(): boolean {
    return this.ctx.execute(new ResetMainLayoutCommand());
  }

  public resetSubGraphLayout(eventId: string): boolean {
    return this.ctx.execute(new ResetSubGraphLayoutCommand(eventId));
  }

  public addVar(def?: Partial<VarDef>): VarDef | undefined {
    const cmd = new AddVarCommand(def);
    if (this.ctx.execute(cmd)) {
      return cmd.createdVar;
    }
    return undefined;
  }

  public async deleteVar(key: string): Promise<boolean> {
    const v = getVar(this.ctx.doc, key);
    if (!v) return false;
    const refs = findVarRefs(this.ctx.doc, key);
    if (refs.length > 0) {
      const ok = await this.ctx.prompts.confirm(
        `变量「${v.label} (${key})」已被以下节点引用：\n• ${refs.join('\n• ')}\n\n确定要删除并清理这些引用吗？`,
        '确认删除'
      );
      if (!ok) return false;
    }
    const deleted = this.ctx.execute(new DeleteVarCommand(key));
    if (deleted) {
      this.ctx.log(`🗑 已删除变量：${v.label} (${key})（Ctrl+Z 可撤销）`, true);
    }
    return deleted;
  }

  public renameVar(oldKey: string, newKey: string): boolean {
    return this.ctx.execute(new RenameVarCommand(oldKey, newKey));
  }

  public mutateDocument(
    name: string,
    mutator: (doc: TaskDocument) => void,
    source: DocumentChangeSource = 'structure',
    coalesceKey?: string
  ): boolean {
    return this.ctx.execute(new MutateDocumentCommand(name, mutator, source, coalesceKey));
  }
}
