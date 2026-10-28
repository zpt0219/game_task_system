import { ViewModel } from '../../app/viewModel';
import { getCondition, getEvent } from '../../core/editOps';
import { evalCondition } from '../../core/engine';
import { mainGraphEdges, varReaders, varWriters } from '../../core/graph';
import { getSelectedNodeIds, isNodeSelected } from '../../core/session';
import { Selection, WorldState } from '../../core/types';

export interface LayoutPos {
  x: number;
  y: number;
}

export interface EdgeRendererDeps {
  getSvgEdges: () => SVGSVGElement;
  getPortCanvasPos: (portEl: HTMLElement) => { x: number; y: number };
  getFocalPositions: () => Record<string, LayoutPos>;
  getReconnectingMainEdge: () => { sourceId: string; targetId: string } | null;
  onAfterRenderEdges?: () => void;
  onOpenEdgeContextMenu: (sx: number, sy: number, info: { title: string; onDelete: () => void }) => void;
}

export class EdgeRenderer {
  constructor(
    private readonly vm: ViewModel,
    private readonly deps: EdgeRendererDeps
  ) {}

  public renderEdges(state: WorldState): void {
    const svgEdges = this.deps.getSvgEdges();
    svgEdges.innerHTML = '';
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <marker id="arrow-inactive" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
        <path d="M 1 2 L 10 6 L 1 10 Z" fill="#64748b" />
      </marker>
      <marker id="arrow-active" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
        <path d="M 1 2 L 10 6 L 1 10 Z" fill="#10b981" />
      </marker>
      <marker id="arrow-focal" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto">
        <path d="M 1 1.5 L 11 6 L 1 10.5 Z" fill="#38bdf8" />
      </marker>
      <marker id="arrow-effect" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
        <path d="M 1 2 L 10 6 L 1 10 Z" fill="#38bdf8" />
      </marker>
    `;
    svgEdges.appendChild(defs);

    const { viewMode, subGraphEventId, focalVarKey, selection } = this.vm.session;

    if (viewMode === 'subgraph' && subGraphEventId) {
      this.renderSubGraphEdges(subGraphEventId, selection);
    } else if (viewMode === 'focal' && focalVarKey) {
      this.renderFocalEdges(focalVarKey, selection);
    } else {
      this.renderMainEdges(state, selection);
    }

    this.deps.onAfterRenderEdges?.();
  }

  private renderMainEdges(state: WorldState, sel: Selection): void {
    const doc = this.vm.doc;
    const edges = mainGraphEdges(doc);
    const reconnecting = this.deps.getReconnectingMainEdge();
    const selectedIds = new Set(getSelectedNodeIds(sel));

    edges.forEach((edge) => {
      if (
        reconnecting &&
        reconnecting.sourceId === edge.from &&
        reconnecting.targetId === edge.to
      ) {
        return;
      }

      const fromEl = document.getElementById(`node-${edge.from}`);
      const toEl = document.getElementById(`node-${edge.to}`);
      if (!fromEl || !toEl) return;

      const cond = getCondition(doc, edge.from);
      const ev = getEvent(doc, edge.to);
      if (!cond || !ev) return;

      const inPortEl =
        (toEl.querySelector(`.port-in[data-cond-id="${edge.from}"]`) as HTMLElement | null) ||
        (toEl.querySelector('.port-in') as HTMLElement | null);

      const p2 = inPortEl
        ? this.deps.getPortCanvasPos(inPortEl)
        : { x: ev.x - 3, y: ev.y + (toEl.offsetHeight || 38) * 0.5 };

      const outPortEl = fromEl.querySelector('.port-out') as HTMLElement | null;
      const p1 = outPortEl
        ? this.deps.getPortCanvasPos(outPortEl)
        : {
            x: cond.x + (fromEl.offsetWidth || 180),
            y: cond.y + (fromEl.offsetHeight || 38) * 0.5
          };

      const x1 = p1.x;
      const y1 = p1.y;
      const x2 = p2.x;
      const y2 = p2.y;

      const condActive = evalCondition(doc, state, cond);
      const isSelected = selectedIds.has(edge.from) || selectedIds.has(edge.to);

      const inSide = inPortEl?.dataset.side || (x2 < x1 ? 'right' : 'left');
      const outSide = outPortEl?.dataset.side || (x2 >= x1 ? 'right' : 'left');

      const dx = Math.max(Math.abs(x2 - x1) * 0.45, 40);
      const dy = Math.max(Math.abs(y2 - y1) * 0.45, 35);

      let cx1: number, cy1: number;
      if (outSide === 'right') {
        cx1 = x1 + dx;
        cy1 = y1;
      } else if (outSide === 'left') {
        cx1 = x1 - dx;
        cy1 = y1;
      } else if (outSide === 'top') {
        cx1 = x1;
        cy1 = y1 - dy;
      } else {
        cx1 = x1;
        cy1 = y1 + dy;
      }

      let cx2: number, cy2: number;
      if (inSide === 'right') {
        cx2 = x2 + dx;
        cy2 = y2;
      } else if (inSide === 'left') {
        cx2 = x2 - dx;
        cy2 = y2;
      } else if (inSide === 'top') {
        cx2 = x2;
        cy2 = y2 - dy;
      } else {
        cx2 = x2;
        cy2 = y2 + dy;
      }

      this.drawSvgPath({
        d: `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`,
        active: condActive,
        highlight: !!isSelected,
        fromId: edge.from,
        toId: edge.to,
        title: `${cond.title} ➔ 依赖此条件：${ev.title} (右键可删除连线)`,
        onClick: (e) => {
          e.stopPropagation();
          this.vm.log(`🔗 选中依赖连线：${cond.title} ➔ ${ev.title} (右键可选择删除)`, true);
        },
        onDelete: () => {
          this.vm.edit.disconnectCondition(edge.to, edge.from);
          this.vm.log(
            `✂️ 已删除依赖连线：${cond.title} ➔ ${ev.title}（Ctrl+Z 可撤销）`,
            true
          );
        }
      });
    });
  }

  private renderFocalEdges(focalVarKey: string, sel: Selection): void {
    const doc = this.vm.doc;
    const focalId = `focal_${focalVarKey}`;
    const focalEl = document.getElementById(`node-${focalId}`);
    if (!focalEl) return;

    const writers = varWriters(doc, focalVarKey);
    const rawReaders = varReaders(doc, focalVarKey);
    const readers = rawReaders.filter((r) => !writers.some((w) => w.id === r.id));
    const bothWriterAndReader = writers.filter((w) => rawReaders.some((r) => r.id === w.id));

    const focalPositions = this.deps.getFocalPositions();
    const focalPos = focalPositions[focalId];
    if (!focalPos) return;
    const focalW = focalEl.offsetWidth || 220;
    const focalH = focalEl.offsetHeight || 38;

    writers.forEach((ev) => {
      const evEl = document.getElementById(`node-${ev.id}`);
      const evPos = focalPositions[ev.id];
      if (!evEl || !evPos) return;

      const isBoth = bothWriterAndReader.some((b) => b.id === ev.id);
      const evW = evEl.offsetWidth || 200;
      const evH = evEl.offsetHeight || 38;

      const x1 = evPos.x + evW;
      const y1 = evPos.y + evH * (isBoth ? 0.35 : 0.5);
      const x2 = focalPos.x - 3;
      const y2 = focalPos.y + focalH * (isBoth ? 0.35 : 0.5);
      const dx = Math.max(Math.abs(x2 - x1) * 0.45, 40);
      const arch = isBoth ? -26 : 0;

      const isHighlighted =
        isNodeSelected(sel, ev.id) || isNodeSelected(sel, focalVarKey);

      this.drawSvgPath({
        d: `M ${x1} ${y1} C ${x1 + dx} ${y1 + arch}, ${x2 - dx} ${y2 + arch}, ${x2} ${y2}`,
        active: true,
        highlight: isHighlighted,
        effect: true,
        title: `【入边】${ev.title} 改变了 ${focalVarKey}`
      });

      if (isBoth) {
        const bx1 = focalPos.x;
        const by1 = focalPos.y + focalH * 0.65;
        const bx2 = evPos.x + evW + 3;
        const by2 = evPos.y + evH * 0.65;
        const bdx = Math.max(Math.abs(bx2 - bx1) * 0.45, 40);

        this.drawSvgPath({
          d: `M ${bx1} ${by1} C ${bx1 - bdx} ${by1 + 26}, ${bx2 + bdx} ${by2 + 26}, ${bx2} ${by2}`,
          active: true,
          highlight: isHighlighted,
          title: `【出边】${focalVarKey} 影响了 ${ev.title}`
        });
      }
    });

    readers.forEach((ev) => {
      const evEl = document.getElementById(`node-${ev.id}`);
      const evPos = focalPositions[ev.id];
      if (!evEl || !evPos) return;

      const x1 = focalPos.x + focalW;
      const y1 = focalPos.y + focalH * 0.5;
      const x2 = evPos.x - 3;
      const y2 = evPos.y + (evEl.offsetHeight || 38) * 0.5;
      const dx = Math.max(Math.abs(x2 - x1) * 0.45, 40);

      const isHighlighted =
        isNodeSelected(sel, ev.id) || isNodeSelected(sel, focalVarKey);

      this.drawSvgPath({
        d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
        active: true,
        highlight: isHighlighted,
        title: `【出边】${focalVarKey} 影响了 ${ev.title}`
      });
    });
  }

  private renderSubGraphEdges(eventId: string, sel: Selection): void {
    const ev = getEvent(this.vm.doc, eventId);
    if (!ev || !ev.actionGraph) return;

    interface SubEdgeItem {
      sourceNodeId: string;
      sourcePortEl: HTMLElement | null;
      targetNodeId: string;
      title: string;
      defaultOptionIndex?: number;
      disconnect: () => void;
    }

    const edgesToDraw: SubEdgeItem[] = [];

    ev.actionGraph.nodes.forEach((node) => {
      const nodeEl = document.getElementById(`subnode-${node.id}`);
      if (!nodeEl) return;

      if (node.type === 'start') {
        if (node.nextId) {
          const portEl = nodeEl.querySelector('.port-out') as HTMLElement | null;
          edgesToDraw.push({
            sourceNodeId: node.id,
            sourcePortEl: portEl,
            targetNodeId: node.nextId,
            defaultOptionIndex: node.defaultOptionIndex,
            title: `▶ Start ➔ ${node.nextId}`,
            disconnect: () => {
              this.vm.edit.disconnectSubGraph(eventId, { nodeId: node.id });
            }
          });
        }
      } else if (node.type === 'action') {
        if (node.nextId) {
          const portEl = nodeEl.querySelector('.sub-node-header .port-out') as HTMLElement | null;
          edgesToDraw.push({
            sourceNodeId: node.id,
            sourcePortEl: portEl,
            targetNodeId: node.nextId,
            defaultOptionIndex: node.defaultOptionIndex,
            title: `🎬 ${node.title} ➔ ${node.nextId}`,
            disconnect: () => {
              this.vm.edit.disconnectSubGraph(eventId, { nodeId: node.id });
            }
          });
        }
      } else if (node.type === 'selector') {
        node.cases.forEach((c) => {
          if (c.targetId) {
            const portEl = nodeEl.querySelector(
              `.port-out[data-caseid="${c.id}"]`
            ) as HTMLElement | null;
            edgesToDraw.push({
              sourceNodeId: node.id,
              sourcePortEl: portEl,
              targetNodeId: c.targetId,
              defaultOptionIndex: c.defaultOptionIndex,
              title: `🔀 ${node.title} 分支「${c.title}」➔ ${c.targetId}`,
              disconnect: () => {
                this.vm.edit.disconnectSubGraph(eventId, {
                  nodeId: node.id,
                  caseId: c.id
                });
              }
            });
          }
        });
        if (node.defaultTargetId) {
          const portEl = nodeEl.querySelector(
            '.port-out[data-default="true"]'
          ) as HTMLElement | null;
          edgesToDraw.push({
            sourceNodeId: node.id,
            sourcePortEl: portEl,
            targetNodeId: node.defaultTargetId,
            defaultOptionIndex: node.defaultOptionIndex,
            title: `🔀 ${node.title} Default保底 ➔ ${node.defaultTargetId}`,
            disconnect: () => {
              this.vm.edit.disconnectSubGraph(eventId, {
                nodeId: node.id,
                isDefault: true
              });
            }
          });
        }
      } else if (node.type === 'choice') {
        node.options.forEach((o) => {
          if (o.targetId) {
            const portEl = nodeEl.querySelector(
              `.port-out[data-optid="${o.id}"]`
            ) as HTMLElement | null;
            edgesToDraw.push({
              sourceNodeId: node.id,
              sourcePortEl: portEl,
              targetNodeId: o.targetId,
              defaultOptionIndex: o.defaultOptionIndex,
              title: `💬 ${node.title} 选项「${o.text}」➔ ${o.targetId}`,
              disconnect: () => {
                this.vm.edit.disconnectSubGraph(eventId, {
                  nodeId: node.id,
                  optId: o.id
                });
              }
            });
          }
        });
      }
    });

    const selectedIds = new Set(getSelectedNodeIds(sel));

    edgesToDraw.forEach((item) => {
      const targetEl = document.getElementById(`subnode-${item.targetNodeId}`);
      if (!targetEl || !item.sourcePortEl) return;
      const inPortEl = targetEl.querySelector('.port-in') as HTMLElement | null;

      const p1 = this.deps.getPortCanvasPos(item.sourcePortEl);
      const p2 = inPortEl
        ? this.deps.getPortCanvasPos(inPortEl)
        : { x: targetEl.offsetLeft, y: targetEl.offsetTop + 20 };

      const x1 = p1.x;
      const y1 = p1.y;
      const x2 = p2.x;
      const y2 = p2.y;

      let cx1: number, cy1: number, cx2: number, cy2: number;
      const isLoopBack = x2 <= x1 + 20;

      if (!isLoopBack) {
        const dx = Math.max(40, (x2 - x1) * 0.5);
        cx1 = x1 + dx;
        cy1 = y1;
        cx2 = x2 - dx;
        cy2 = y2;
      } else {
        const loopDx = Math.max(100, Math.abs(x1 - x2) * 0.4);
        if (y2 <= y1) {
          const topY = Math.min(y1, y2) - 80;
          cx1 = x1 + loopDx;
          cy1 = topY;
          cx2 = x2 - loopDx;
          cy2 = topY;
        } else {
          const botY = Math.max(y1, y2) + 80;
          cx1 = x1 + loopDx;
          cy1 = botY;
          cx2 = x2 - loopDx;
          cy2 = botY;
        }
      }

      const isHighlight =
        selectedIds.has(item.sourceNodeId) || selectedIds.has(item.targetNodeId);

      const targetNode = ev.actionGraph?.nodes.find((n) => n.id === item.targetNodeId);
      const defaultInfo =
        targetNode?.type === 'choice' ? ` [默认选项: ${item.defaultOptionIndex ?? 0}]` : '';

      this.drawSvgPath({
        d: `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`,
        active: true,
        highlight: !!isHighlight,
        title: `${item.title}${defaultInfo} (右键可删除连线)`,
        onClick: (e) => {
          e.stopPropagation();
          this.vm.log(`🔗 选中内部连线：${item.title} (右键可选择删除)`, true);
        },
        onDelete: () => {
          item.disconnect();
          this.vm.log(`✂️ 已删除内部连线：${item.title}（Ctrl+Z 可撤销）`, true);
        }
      });
    });
  }

  private drawSvgPath(opts: {
    d: string;
    active: boolean;
    highlight: boolean;
    effect?: boolean;
    title: string;
    fromId?: string;
    toId?: string;
    onClick?: (e: MouseEvent) => void;
    onDelete?: () => void;
  }): void {
    const svgEdges = this.deps.getSvgEdges();
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', opts.d);

    let cls = 'edge-path';
    if (opts.effect) cls += ' effect';
    cls += opts.active ? ' active' : ' inactive';
    if (opts.highlight) cls += ' focal-edge';
    path.setAttribute('class', cls);

    if (opts.fromId) path.dataset.from = opts.fromId;
    if (opts.toId) path.dataset.to = opts.toId;

    const marker = opts.highlight
      ? 'arrow-focal'
      : opts.active
      ? opts.effect
        ? 'arrow-effect'
        : 'arrow-active'
      : 'arrow-inactive';
    path.setAttribute('marker-end', `url(#${marker})`);

    const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    titleEl.textContent = opts.title;
    path.appendChild(titleEl);

    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.setAttribute('d', opts.d);
    hitPath.setAttribute('class', 'edge-hitbox');
    hitPath.style.fill = 'none';
    hitPath.style.stroke = 'transparent';
    hitPath.style.strokeWidth = '16px';
    hitPath.style.cursor = 'pointer';
    hitPath.style.pointerEvents = 'stroke';

    const triggerClick = (e: MouseEvent) => {
      if (opts.onClick) {
        opts.onClick(e);
      }
    };

    const triggerContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (opts.onDelete) {
        this.deps.onOpenEdgeContextMenu(e.clientX, e.clientY, {
          title: opts.title,
          onDelete: opts.onDelete
        });
      }
    };

    path.addEventListener('click', triggerClick);
    hitPath.addEventListener('click', triggerClick);

    path.addEventListener('contextmenu', triggerContextMenu);
    hitPath.addEventListener('contextmenu', triggerContextMenu);

    const onEnter = () => {
      path.classList.add('hover-highlight');
      if (opts.fromId && opts.toId) {
        const toEl = document.getElementById(`node-${opts.toId}`);
        const inPort = toEl?.querySelector(
          `.port-in[data-cond-id="${opts.fromId}"]`
        ) as HTMLElement | null;
        if (inPort) inPort.classList.add('snap-port-hover');
      }
    };

    const onLeave = () => {
      path.classList.remove('hover-highlight');
      if (opts.fromId && opts.toId) {
        const toEl = document.getElementById(`node-${opts.toId}`);
        const inPort = toEl?.querySelector(
          `.port-in[data-cond-id="${opts.fromId}"]`
        ) as HTMLElement | null;
        if (inPort) inPort.classList.remove('snap-port-hover');
      }
    };

    path.addEventListener('mouseenter', onEnter);
    path.addEventListener('mouseleave', onLeave);
    hitPath.addEventListener('mouseenter', onEnter);
    hitPath.addEventListener('mouseleave', onLeave);

    svgEdges.appendChild(path);
    svgEdges.appendChild(hitPath);
  }
}
