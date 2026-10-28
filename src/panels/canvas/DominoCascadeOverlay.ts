import { TaskDocument } from '../../core/document';
import { getVar } from '../../core/editOps';
import { evalCondition, getEventStatus } from '../../core/engine';
import { StateChangeMeta } from '../../core/session';
import { ConditionDef, WorldState } from '../../core/types';

export class DominoCascadeOverlay {
  constructor(
    private readonly getSvgEdges: () => SVGSVGElement,
    private readonly clientToCanvasPos: (clientX: number, clientY: number) => { x: number; y: number },
    private readonly onLog: (msg: string, isHighlight?: boolean) => void
  ) {}

  public trigger(doc: TaskDocument, state: WorldState, meta: StateChangeMeta): void {
    if (!meta.changedVars || meta.changedVars.length === 0) return;
    const sourceEvId = meta.sourceEventId;
    const sourceEl = sourceEvId ? document.getElementById(`node-${sourceEvId}`) : null;

    // 1. Stage 1: 来源 Event 节点爆发光环与产出气泡
    if (sourceEl) {
      sourceEl.classList.remove('source-pulse');
      void sourceEl.offsetWidth;
      sourceEl.classList.add('source-pulse');
      setTimeout(() => sourceEl.classList.remove('source-pulse'), 1400);

      const toastItems: string[] = [];
      meta.changedVars.forEach((varKey) => {
        const v = getVar(doc, varKey);
        const oldVal = meta.prevState[varKey];
        const newVal = state[varKey];
        if (typeof newVal === 'boolean') {
          if (newVal && !oldVal) {
            toastItems.push(`✨ 获得：${v?.icon || '📦'} ${v?.label || varKey}`);
          } else if (!newVal && oldVal) {
            toastItems.push(`📤 失去：${v?.icon || '📦'} ${v?.label || varKey}`);
          }
        } else if (typeof newVal === 'number' && typeof oldVal === 'number') {
          const diff = newVal - oldVal;
          if (diff !== 0) {
            toastItems.push(
              `${diff > 0 ? '➕' : '➖'} ${v?.icon || '💎'} ${v?.label || varKey} ${
                diff > 0 ? `+${diff}` : diff
              }`
            );
          }
        } else if (newVal !== oldVal) {
          toastItems.push(`📝 ${v?.icon || '🏷️'} ${v?.label || varKey}: ${newVal}`);
        }
      });

      if (toastItems.length > 0) {
        this.showNodeToast(sourceEl, toastItems.join(' · '), 'source-toast');
      }
    }

    // 2. Stage 2: 查找受影响的 Condition 节点
    const affectedConds = doc.conditions.filter((cond) =>
      cond.conds.some((chk) => meta.changedVars.includes(chk.var))
    );

    const newlySatisfiedConds: ConditionDef[] = [];
    affectedConds.forEach((cond) => {
      const wasOk = evalCondition(doc, meta.prevState, cond);
      const isOk = evalCondition(doc, state, cond);
      if (!wasOk && isOk) {
        newlySatisfiedConds.push(cond);
      }
    });

    newlySatisfiedConds.forEach((cond, condIdx) => {
      const condEl = document.getElementById(`node-${cond.id}`);
      if (!condEl) return;

      const condDelay = sourceEl ? 350 + condIdx * 120 : condIdx * 120;

      if (sourceEl) {
        this.animateEnergyParticleBetweenNodes(sourceEl, condEl, 400);
      }

      setTimeout(() => {
        condEl.classList.remove('cond-satisfied-pop');
        void condEl.offsetWidth;
        condEl.classList.add('cond-satisfied-pop');
        setTimeout(() => condEl.classList.remove('cond-satisfied-pop'), 1400);

        this.showNodeToast(
          condEl,
          `✅ 条件达成：${cond.title.replace(/^🔍 condition: /, '')}`,
          'cond-toast'
        );

        // 3. Stage 3 & 4: 沿连线流向后继 Event
        const downstreamEvents = doc.events.filter((ev) =>
          ev.incomingConditions?.includes(cond.id)
        );

        downstreamEvents.forEach((downEv, evIdx) => {
          const downEvEl = document.getElementById(`node-${downEv.id}`);
          if (!downEvEl) return;

          const wasAvailable =
            getEventStatus(doc, meta.prevState, downEv).colorClass !== 'status-red';
          const isAvailableNow =
            getEventStatus(doc, state, downEv).colorClass !== 'status-red';

          const svgEdges = this.getSvgEdges();
          const edgePath = svgEdges.querySelector(
            `path.edge-path[data-from="${cond.id}"][data-to="${downEv.id}"]`
          ) as SVGPathElement | null;
          if (edgePath) {
            this.animateBeamAlongPath(edgePath, 500);
          }

          if (!wasAvailable && isAvailableNow) {
            const unlockDelay = 450 + evIdx * 100;
            setTimeout(() => {
              downEvEl.classList.remove('unlock-shake');
              void downEvEl.offsetWidth;
              downEvEl.classList.add('unlock-shake');
              setTimeout(() => downEvEl.classList.remove('unlock-shake'), 1400);

              this.createUnlockBurstRing(downEvEl);

              const pill = downEvEl.querySelector('.status-pill') as HTMLElement | null;
              if (pill) {
                pill.classList.add('pill-unlocked-glow');
                setTimeout(() => pill.classList.remove('pill-unlocked-glow'), 1400);
              }

              this.showNodeToast(downEvEl, `🔓 剧情解锁：${downEv.title}`, 'unlock-toast');

              this.onLog(
                `🎉 多米诺因果连锁：【${downEv.title}】 前置条件已全部达成，剧情现已解锁！`,
                true
              );
            }, unlockDelay);
          }
        });
      }, condDelay);
    });
  }

  private getNodeEdgeCanvasPos(
    fromEl: HTMLElement,
    toEl: HTMLElement
  ): { start: { x: number; y: number }; end: { x: number; y: number } } {
    const r1 = fromEl.getBoundingClientRect();
    const r2 = toEl.getBoundingClientRect();
    let sx = r1.right;
    let ex = r2.left;
    if (r2.left < r1.right) {
      sx = r1.left;
      ex = r2.right;
    }
    const sy = r1.top + r1.height / 2;
    const ey = r2.top + r2.height / 2;
    return {
      start: this.clientToCanvasPos(sx, sy),
      end: this.clientToCanvasPos(ex, ey)
    };
  }

  private showNodeToast(
    targetEl: HTMLElement,
    text: string,
    toastType: 'source-toast' | 'cond-toast' | 'unlock-toast'
  ): void {
    const toast = document.createElement('div');
    toast.className = `domino-toast ${toastType}`;
    toast.innerHTML = text;
    targetEl.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 2200);
  }

  private createUnlockBurstRing(targetEl: HTMLElement): void {
    const ring = document.createElement('div');
    ring.className = 'unlock-burst-ring';
    targetEl.appendChild(ring);
    setTimeout(() => {
      ring.remove();
    }, 1000);
  }

  private animateEnergyParticleBetweenNodes(
    fromEl: HTMLElement,
    toEl: HTMLElement,
    durationMs = 400
  ): void {
    const { start: p1, end: p2 } = this.getNodeEdgeCanvasPos(fromEl, toEl);
    const cpX = (p1.x + p2.x) / 2;
    const cpY = Math.min(p1.y, p2.y) - 35;
    const d = `M ${p1.x} ${p1.y} Q ${cpX} ${cpY} ${p2.x} ${p2.y}`;

    const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tempPath.setAttribute('d', d);
    const len = tempPath.getTotalLength();
    if (len <= 0) return;

    const beam = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    beam.setAttribute('d', d);
    beam.setAttribute('class', 'domino-edge-beam source-to-cond-beam');
    beam.style.strokeDasharray = `50 ${len}`;
    beam.style.strokeDashoffset = `50`;
    this.getSvgEdges().appendChild(beam);

    const startTime = performance.now();
    const frame = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const ease =
        progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
      const offset = 50 - (len + 50) * ease;
      beam.style.strokeDashoffset = `${offset}`;
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        beam.remove();
      }
    };
    requestAnimationFrame(frame);
  }

  private animateBeamAlongPath(edgePath: SVGPathElement, durationMs = 500): void {
    const d = edgePath.getAttribute('d');
    if (!d) return;
    const len = edgePath.getTotalLength();
    if (len <= 0) return;

    const beam = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    beam.setAttribute('d', d);
    beam.setAttribute('class', 'domino-edge-beam');
    beam.style.strokeDasharray = `50 ${len}`;
    beam.style.strokeDashoffset = `50`;
    this.getSvgEdges().appendChild(beam);

    const startTime = performance.now();
    const frame = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const ease =
        progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
      const offset = 50 - (len + 50) * ease;
      beam.style.strokeDashoffset = `${offset}`;
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        beam.remove();
      }
    };
    requestAnimationFrame(frame);
  }
}
