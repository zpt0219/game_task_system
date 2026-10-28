import { ViewModel } from '../../app/viewModel';
import { getCondition } from '../../core/editOps';
import { ConditionDef } from '../../core/types';
import { escapeHtml } from '../../utils/dom';
import {
  updateAllConditionPortsPlacement,
  updateEventPortsPlacement
} from './PortPlacement';
import { WireInteraction } from './WireInteraction';

export interface MainGraphRenderDeps {
  nodesContainer: HTMLElement;
  svgEdges: SVGSVGElement;
  wire: WireInteraction;
  attachNodeInteraction: (el: HTMLElement, kind: 'event' | 'condition', id: string) => void;
  openEdgeContextMenu: (
    sx: number,
    sy: number,
    info: { title: string; onDelete: () => void }
  ) => void;
}

export function buildMainGraphDOM(vm: ViewModel, deps: MainGraphRenderDeps): void {
  const { nodesContainer, svgEdges, wire, attachNodeInteraction, openEdgeContextMenu } = deps;
  nodesContainer.innerHTML = '';
  const doc = vm.doc;

  // 1. Condition 条件节点
  doc.conditions.forEach((cond: ConditionDef) => {
    const el = document.createElement('div');
    el.id = `node-${cond.id}`;
    el.className = 'graph-node condition-node compact-node';
    el.dataset.id = cond.id;
    el.dataset.kind = 'condition';
    el.style.left = `${cond.x}px`;
    el.style.top = `${cond.y}px`;
    el.innerHTML = `
      <div class="cond-status-led"></div>
      <div class="node-title">${escapeHtml(cond.title)}</div>
      <div class="node-port port-out" data-tid="${cond.id}" title="【输出端点】\n• 沿卡片边缘拖拽可调整出口位置\n• 拖离卡片可拉出依赖连线"></div>
    `;
    const portOut = el.querySelector('.port-out') as HTMLElement | null;
    portOut?.addEventListener('pointerdown', (e) => {
      wire.handlePortPointerDown(e, portOut, {
        mode: 'main',
        sourceId: cond.id
      });
    });
    portOut?.addEventListener('click', (e) => e.stopPropagation());
    attachNodeInteraction(el, 'condition', cond.id);
    nodesContainer.appendChild(el);
  });

  // 2. Event 节点
  doc.events.forEach((ev) => {
    const el = document.createElement('div');
    el.id = `node-${ev.id}`;
    el.className = 'graph-node event-node compact-node';
    el.dataset.id = ev.id;
    el.dataset.kind = 'event';
    el.style.left = `${ev.x}px`;
    el.style.top = `${ev.y}px`;

    const incoming = ev.incomingConditions ?? [];
    let portsHtml = '';
    if (incoming.length === 0) {
      portsHtml = `<div class="node-port port-in port-in-empty" data-eid="${ev.id}" data-side="left" title="【依赖输入端】可吸附接入 Condition 条件节点"></div>`;
    } else {
      incoming.forEach((cid) => {
        const cond = getCondition(doc, cid);
        const cTitle = cond ? cond.title.replace(/^🔍 condition: /, '') : cid;
        portsHtml += `<div class="node-port port-in" data-eid="${ev.id}" data-cond-id="${cid}" title="前置依赖：[${escapeHtml(
          cTitle
        )}]\n• 按住拖拽可拔出此依赖连线并改接至其他 Event\n• 右键可断开此依赖"></div>`;
      });
    }

    el.innerHTML = `
      ${portsHtml}
      <div class="event-status-dot status-dot"></div>
      <div class="node-title">${escapeHtml(ev.title)}</div>
      <span class="event-status-pill status-pill"></span>
    `;

    el.querySelectorAll('.port-in').forEach((pEl) => {
      const portIn = pEl as HTMLElement;
      const cid = portIn.dataset.condId;
      portIn.addEventListener('pointerdown', (e) => {
        wire.handlePortInPointerDown(e, portIn, {
          mode: 'main',
          targetId: ev.id,
          condId: cid
        });
      });
      portIn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (wire.activeWire && wire.activeWire.mode === 'main') {
          wire.completeWireConnection(ev.id);
          wire.cancelActiveWire();
        } else if (wire.connectingCondId) {
          wire.completeConnecting(ev.id);
        }
      });
      if (cid) {
        portIn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const cond = getCondition(doc, cid);
          const cTitle = cond ? cond.title.replace(/^🔍 condition: /, '') : cid;
          openEdgeContextMenu(e.clientX, e.clientY, {
            title: `依赖关系：${cTitle} ➔ ${ev.title}`,
            onDelete: () => {
              vm.edit.disconnectCondition(ev.id, cid);
              vm.log(`✂️ 已断开依赖连线：${cTitle} ➔ ${ev.title}（Ctrl+Z 可撤销）`, true);
            }
          });
        });
        portIn.addEventListener('mouseenter', () => {
          const path = svgEdges.querySelector(
            `path.edge-path[data-from="${cid}"][data-to="${ev.id}"]`
          ) as SVGPathElement | null;
          if (path) path.classList.add('hover-highlight');
        });
        portIn.addEventListener('mouseleave', () => {
          const path = svgEdges.querySelector(
            `path.edge-path[data-from="${cid}"][data-to="${ev.id}"]`
          ) as SVGPathElement | null;
          if (path) path.classList.remove('hover-highlight');
        });
      }
    });

    attachNodeInteraction(el, 'event', ev.id);
    nodesContainer.appendChild(el);
  });

  updateAllConditionPortsPlacement(doc);
  doc.events.forEach((ev) => updateEventPortsPlacement(doc, ev.id));
}
