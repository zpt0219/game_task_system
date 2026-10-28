import { getEvent, getVar } from '../core/editOps';
import { formatValue, getValue, runEvent } from '../core/engine';
import { buildInitialState, StateChangeMeta } from '../core/session';
import { WorldState } from '../core/types';
import { StudioContext } from './subViewModel';

export class PlayRuntimeViewModel {
  constructor(private readonly ctx: StudioContext) {}

  public applyPreset(presetId: string): void {
    const p = this.ctx.doc;
    if (presetId === '__initial__') {
      this.ctx.patchSession({ activePresetId: '__initial__' });
      this.setWorldState(buildInitialState(p), null);
      this.ctx.log('🔄 状态已重置为「初始进城」', true);
      return;
    }
    const preset = p.presets.find((x) => x.id === presetId);
    if (!preset) return;
    this.ctx.patchSession({ activePresetId: presetId });
    this.setWorldState(buildInitialState(p, preset.values), null);
    this.ctx.log(`⚡ 已切换预设：「${preset.name}」`, true);
  }

  public resetToActivePreset(): void {
    const presetId = this.ctx.session.activePresetId;
    const p = this.ctx.doc;
    const preset = p.presets.find((x) => x.id === presetId);
    this.setWorldState(buildInitialState(p, preset?.values || {}), null);
    this.ctx.log('🔄 状态已重置为当前预设初始态', true);
  }

  public setWorldState(nextState: WorldState, sourceEventId?: string | null): void {
    const prevState = { ...this.ctx.session.worldState };
    const nextCopy = { ...nextState };
    const allKeys = new Set([...Object.keys(prevState), ...Object.keys(nextCopy)]);
    const changedVars: string[] = [];
    allKeys.forEach((k) => {
      if (prevState[k] !== nextCopy[k]) changedVars.push(k);
    });
    const meta: StateChangeMeta = {
      prevState,
      changedVars,
      sourceEventId: sourceEventId !== undefined ? sourceEventId : this.ctx.session.runningEventId
    };
    this.ctx.updateWorldState(nextCopy, meta);
  }

  public mutateWorldState(fn: (draft: WorldState) => void, sourceEventId?: string | null): void {
    const draft = { ...this.ctx.session.worldState };
    fn(draft);
    this.setWorldState(draft, sourceEventId);
  }

  public adjustStatVar(varKey: string, delta: number, min = 0): void {
    const v = getVar(this.ctx.doc, varKey);
    const cur = Number(getValue(this.ctx.doc, this.ctx.session.worldState, varKey) ?? 0);
    const nextVal = Math.max(min, cur + delta);
    this.mutateWorldState((s) => {
      s[varKey] = nextVal;
    }, null);
    this.ctx.log(
      `[手动调节] ${v?.label || varKey}: ${delta >= 0 ? '+' : ''}${delta} → ${nextVal}`
    );
  }

  public toggleBoolVar(varKey: string): void {
    const v = getVar(this.ctx.doc, varKey);
    const cur = Boolean(getValue(this.ctx.doc, this.ctx.session.worldState, varKey));
    const nextVal = !cur;
    this.mutateWorldState((s) => {
      s[varKey] = nextVal;
    }, null);
    this.ctx.log(`[手动切换] ${v?.label || varKey} = ${formatValue(nextVal)}`);
  }

  public cycleEnumVar(varKey: string): void {
    const v = getVar(this.ctx.doc, varKey);
    if (!v) return;
    const opts = v.options && v.options.length > 0 ? v.options : ['active', 'failed'];
    const cur = String(getValue(this.ctx.doc, this.ctx.session.worldState, varKey) ?? v.initial);
    const nextVal = opts[(opts.indexOf(cur) + 1) % opts.length];
    this.mutateWorldState((s) => {
      s[varKey] = nextVal;
    }, null);
    this.ctx.log(`[手动切换] ${v.label} = ${nextVal}`);
  }

  public playEvent(eventId: string): void {
    const ev = getEvent(this.ctx.doc, eventId);
    if (!ev) return;
    this.ctx.session.runningEventId = eventId;
    runEvent(
      {
        project: this.ctx.doc,
        getState: () => this.ctx.session.worldState,
        mutate: (fn) => {
          this.ctx.session.runningEventId = eventId;
          this.mutateWorldState(fn, eventId);
        },
        showDialog: (cfg) => {
          const origConfirm = cfg.onConfirm;
          cfg.onConfirm = () => {
            this.ctx.session.runningEventId = eventId;
            if (origConfirm) origConfirm();
          };
          this.ctx.prompts.showRpgDialog(cfg);
        },
        log: (msg, hl) => this.ctx.log(msg, hl)
      },
      ev
    );
  }
}
