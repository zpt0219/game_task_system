import { TaskDocument } from '../../core/document';
import { getCondition, getEvent } from '../../core/editOps';
import { ConditionDef } from '../../core/types';

export type PortSide = 'left' | 'right' | 'top' | 'bottom';

/** 计算某个 Condition 相对于 Event 的相对侧边 (left / right / top / bottom) */
export function getEventPortSide(
  evX: number,
  evY: number,
  condX: number,
  condY: number,
  evW = 200,
  condW = 180
): PortSide {
  if (condX >= evX + evW - 30) {
    return 'right';
  }
  if (condX + condW <= evX + 30) {
    return 'left';
  }
  if (condY < evY) {
    return 'top';
  }
  return 'bottom';
}

/** 获取某个 Condition 节点的输出端点应吸附的侧边与比例 */
export function getConditionPortSide(
  cond: ConditionDef,
  doc: TaskDocument
): { side: PortSide; ratio: number } {
  if (cond.portSide) {
    return { side: cond.portSide, ratio: cond.portOffsetRatio ?? 0.5 };
  }

  const depEvents = doc.events.filter((ev) => ev.incomingConditions?.includes(cond.id));
  if (depEvents.length === 0) {
    return { side: 'right', ratio: 0.5 };
  }

  const avgX = depEvents.reduce((s, e) => s + e.x, 0) / depEvents.length;
  const avgY = depEvents.reduce((s, e) => s + e.y, 0) / depEvents.length;
  const condCenterX = cond.x + 90;
  const condCenterY = cond.y + 19;

  const dx = avgX - condCenterX;
  const dy = avgY - condCenterY;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return { side: dx >= 0 ? 'right' : 'left', ratio: 0.5 };
  }
  return { side: dy >= 0 ? 'bottom' : 'top', ratio: 0.5 };
}

/** 重新计算并吸附排列单个 Event 卡片边缘的所有专属输入端点 */
export function updateEventPortsPlacement(doc: TaskDocument, evId: string): void {
  const evEl = document.getElementById(`node-${evId}`);
  if (!evEl) return;
  const ev = getEvent(doc, evId);
  if (!ev) return;

  const incoming = ev.incomingConditions ?? [];
  if (incoming.length === 0) {
    const emptyPort = evEl.querySelector('.port-in-empty') as HTMLElement | null;
    if (emptyPort) {
      emptyPort.style.left = '-7px';
      emptyPort.style.right = 'auto';
      emptyPort.style.top = '50%';
      emptyPort.style.bottom = 'auto';
      emptyPort.style.transform = 'translateY(-50%)';
      emptyPort.dataset.side = 'left';
    }
    return;
  }

  const sideGroups: Record<
    PortSide,
    Array<{ condId: string; cond: ConditionDef; el: HTMLElement }>
  > = {
    left: [],
    right: [],
    top: [],
    bottom: []
  };

  incoming.forEach((cid) => {
    const cond = getCondition(doc, cid);
    const portEl = evEl.querySelector(`.port-in[data-cond-id="${cid}"]`) as HTMLElement | null;
    if (!cond || !portEl) return;
    const side = getEventPortSide(ev.x, ev.y, cond.x, cond.y);
    sideGroups[side].push({ condId: cid, cond, el: portEl });
  });

  (['left', 'right'] as const).forEach((side) => {
    const list = sideGroups[side];
    list.sort((a, b) => a.cond.y - b.cond.y);
    const k = list.length;
    list.forEach((item, i) => {
      let topPct = 50;
      if (k === 2) {
        topPct = i === 0 ? 25 : 75;
      } else if (k >= 3) {
        topPct = Math.round(18 + (64 / (k - 1)) * i);
      }
      item.el.style.left = side === 'left' ? '-7px' : 'auto';
      item.el.style.right = side === 'right' ? '-7px' : 'auto';
      item.el.style.top = `${topPct}%`;
      item.el.style.bottom = 'auto';
      item.el.style.transform = 'translateY(-50%)';
      item.el.dataset.side = side;
    });
  });

  (['top', 'bottom'] as const).forEach((side) => {
    const list = sideGroups[side];
    list.sort((a, b) => a.cond.x - b.cond.x);
    const k = list.length;
    list.forEach((item, i) => {
      let leftPct = 50;
      if (k === 2) {
        leftPct = i === 0 ? 25 : 75;
      } else if (k >= 3) {
        leftPct = Math.round(20 + (60 / (k - 1)) * i);
      }
      item.el.style.top = side === 'top' ? '-7px' : 'auto';
      item.el.style.bottom = side === 'bottom' ? '-7px' : 'auto';
      item.el.style.left = `${leftPct}%`;
      item.el.style.right = 'auto';
      item.el.style.transform = 'translateX(-50%)';
      item.el.dataset.side = side;
    });
  });
}

export function updateAllEventPortsPlacement(doc: TaskDocument): void {
  doc.events.forEach((ev) => updateEventPortsPlacement(doc, ev.id));
}

export function updateConditionPortPlacement(doc: TaskDocument, condId: string): void {
  const condEl = document.getElementById(`node-${condId}`);
  if (!condEl) return;
  const cond = getCondition(doc, condId);
  if (!cond) return;

  const portEl = condEl.querySelector('.port-out') as HTMLElement | null;
  if (!portEl) return;

  const { side, ratio } = getConditionPortSide(cond, doc);
  const pct = Math.round(ratio * 100);

  if (side === 'right') {
    portEl.style.left = 'auto';
    portEl.style.right = '-7px';
    portEl.style.top = `${pct}%`;
    portEl.style.bottom = 'auto';
    portEl.style.transform = 'translateY(-50%)';
  } else if (side === 'left') {
    portEl.style.left = '-7px';
    portEl.style.right = 'auto';
    portEl.style.top = `${pct}%`;
    portEl.style.bottom = 'auto';
    portEl.style.transform = 'translateY(-50%)';
  } else if (side === 'top') {
    portEl.style.left = `${pct}%`;
    portEl.style.right = 'auto';
    portEl.style.top = '-7px';
    portEl.style.bottom = 'auto';
    portEl.style.transform = 'translateX(-50%)';
  } else {
    portEl.style.left = `${pct}%`;
    portEl.style.right = 'auto';
    portEl.style.top = 'auto';
    portEl.style.bottom = '-7px';
    portEl.style.transform = 'translateX(-50%)';
  }
  portEl.dataset.side = side;
}

export function updateAllConditionPortsPlacement(doc: TaskDocument): void {
  doc.conditions.forEach((c) => updateConditionPortPlacement(doc, c.id));
}
