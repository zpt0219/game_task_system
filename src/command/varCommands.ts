import { createVarDef, deleteVarCascade, renameVarCascade } from '../core/editOps';
import { VarDef } from '../core/types';
import { CommandContext, SnapshotCommand } from './command';

export class AddVarCommand extends SnapshotCommand {
  readonly name = 'AddVar';
  public createdVar?: VarDef;

  constructor(private readonly def?: Partial<VarDef>) {
    super();
  }

  execute(ctx: CommandContext): boolean {
    this.init(ctx);
    const v = createVarDef(ctx.doc, this.def);
    ctx.doc.vars.push(v);
    ctx.session.selection = { kind: 'var', id: v.key };
    this.createdVar = v;
    return this.finish(ctx);
  }
}

export class DeleteVarCommand extends SnapshotCommand {
  readonly name = 'DeleteVar';

  constructor(private readonly key: string) {
    super();
  }

  execute(ctx: CommandContext): boolean {
    this.init(ctx);
    if (!deleteVarCascade(ctx.doc, this.key)) return false;
    if (ctx.session.selection?.kind === 'var' && ctx.session.selection.id === this.key) {
      ctx.session.selection = null;
    }
    if (ctx.session.focalVarKey === this.key) {
      ctx.session.focalVarKey = null;
      ctx.session.viewMode = 'main';
    }
    return this.finish(ctx);
  }
}

export class RenameVarCommand extends SnapshotCommand {
  readonly name = 'RenameVar';

  constructor(
    private readonly oldKey: string,
    private readonly newKey: string
  ) {
    super();
  }

  execute(ctx: CommandContext): boolean {
    this.init(ctx);
    if (!renameVarCascade(ctx.doc, this.oldKey, this.newKey)) return false;
    if (ctx.session.selection?.kind === 'var' && ctx.session.selection.id === this.oldKey) {
      ctx.session.selection = { kind: 'var', id: this.newKey };
    }
    if (ctx.session.focalVarKey === this.oldKey) {
      ctx.session.focalVarKey = this.newKey;
    }
    return this.finish(ctx);
  }
}
