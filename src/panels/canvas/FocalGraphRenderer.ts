import { ViewModel } from '../../app/viewModel';
import { getVar } from '../../core/editOps';
import { varReaders, varWriters } from '../../core/graph';
import { EventDef } from '../../core/types';
import { escapeHtml } from '../../utils/dom';
import { LayoutPos } from './EdgeRenderer';

export interface FocalGraphRenderDeps {
  nodesContainer: HTMLElement;
  focalPositions: Record<string, LayoutPos>;
  attachNodeInteraction: (el: HTMLElement, kind: 'event' | 'condition', id: string) => void;
}

export function buildFocalGraphDOM(
  vm: ViewModel,
  varKey: string,
  deps: FocalGraphRenderDeps
): void {
  const { nodesContainer, focalPositions, attachNodeInteraction } = deps;
  nodesContainer.innerHTML = '';
  for (const k of Object.keys(focalPositions)) {
    delete focalPositions[k];
  }

  const doc = vm.doc;
  const v = getVar(doc, varKey);
  if (!v) return;

  const writers = varWriters(doc, varKey);
  const rawReaders = varReaders(doc, varKey);
  const readers = rawReaders.filter((r) => !writers.some((w) => w.id === r.id));

  const maxRows = Math.max(1, writers.length, readers.length);
  const centerY = Math.max(180, 100 + (maxRows - 1) * 60);

  // 1. 中间焦点实体
  const focalId = `focal_${varKey}`;
  const focalX = 480;
  const focalY = centerY;
  focalPositions[focalId] = { x: focalX, y: focalY };

  const focalEl = document.createElement('div');
  focalEl.id = `node-${focalId}`;
  focalEl.className = 'graph-node condition-node compact-node focal-center-node';
  focalEl.dataset.id = focalId;
  focalEl.dataset.kind = 'var';
  focalEl.style.left = `${focalX}px`;
  focalEl.style.top = `${focalY}px`;
  focalEl.innerHTML = `
    <div class="cond-status-led"></div>
    <div class="node-title">${v.icon} ${escapeHtml(v.label)} (${escapeHtml(v.key)})</div>
  `;
  focalEl.onclick = (e) => {
    e.stopPropagation();
    vm.select({ kind: 'var', id: varKey });
  };
  nodesContainer.appendChild(focalEl);

  const createFocalEventElement = (ev: EventDef, x: number, y: number): HTMLElement => {
    const el = document.createElement('div');
    el.id = `node-${ev.id}`;
    el.className = 'graph-node event-node compact-node';
    el.dataset.id = ev.id;
    el.dataset.kind = 'event';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.innerHTML = `
      <div class="event-status-dot status-dot"></div>
      <div class="node-title">${escapeHtml(ev.title)}</div>
      <span class="event-status-pill status-pill"></span>
    `;
    attachNodeInteraction(el, 'event', ev.id);
    return el;
  };

  // 2. 左侧来源节点 (Writers)
  if (writers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'focal-placeholder-card';
    empty.style.left = '80px';
    empty.style.top = `${centerY}px`;
    empty.textContent = 'ℹ️ 初始固有 / 无直接改写此项的 Event';
    nodesContainer.appendChild(empty);
  } else {
    const startY = centerY - ((writers.length - 1) * 120) / 2;
    writers.forEach((ev, idx) => {
      const x = 80;
      const y = startY + idx * 120;
      focalPositions[ev.id] = { x, y };
      const el = createFocalEventElement(ev, x, y);
      nodesContainer.appendChild(el);
    });
  }

  // 3. 右侧依赖节点 (Readers)
  if (readers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'focal-placeholder-card';
    empty.style.left = '880px';
    empty.style.top = `${centerY}px`;
    empty.textContent = 'ℹ️ 终端状态 / 无后续依赖此项的 Event';
    nodesContainer.appendChild(empty);
  } else {
    const startY = centerY - ((readers.length - 1) * 120) / 2;
    readers.forEach((ev, idx) => {
      const x = 880;
      const y = startY + idx * 120;
      focalPositions[ev.id] = { x, y };
      const el = createFocalEventElement(ev, x, y);
      nodesContainer.appendChild(el);
    });
  }
}
