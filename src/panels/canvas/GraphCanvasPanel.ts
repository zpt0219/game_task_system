import { ViewModel } from '../../app/viewModel';
import { DocumentChangeSource } from '../../command/events';
import { getCondition, getEvent, getVar } from '../../core/editOps';
import { evalCondition, getEventStatus } from '../../core/engine';
import { varReaders, varWriters } from '../../core/graph';
import { getSelectedNodeIds, StateChangeMeta, ViewMode } from '../../core/session';
import { ActionGraphNodeUnion, ConditionDef, WorldState } from '../../core/types';
import { Panel } from '../Panel';
import { CanvasContextMenu } from './CanvasContextMenu';
import { DominoCascadeOverlay } from './DominoCascadeOverlay';
import { EdgeRenderer, LayoutPos } from './EdgeRenderer';
import { buildFocalGraphDOM } from './FocalGraphRenderer';
import { buildMainGraphDOM } from './MainGraphRenderer';
import {
  updateAllConditionPortsPlacement,
  updateAllEventPortsPlacement
} from './PortPlacement';
import { buildSubGraphDOM } from './SubGraphRenderer';
import { WireInteraction } from './WireInteraction';

export class GraphCanvasPanel extends Panel {
  private viewport: HTMLElement;
  private canvas: HTMLElement;
  private svgEdges: SVGSVGElement;
  private nodesContainer: HTMLElement;

  private focalBanner: HTMLElement;
  private btnBackToMain: HTMLElement;
  private focalTitle: HTMLElement;
  private focalStatusPill: HTMLElement;
  private focalSourcesCount: HTMLElement;
  private focalTargetsCount: HTMLElement;

  private subGraphBanner: HTMLElement;
  private btnBackFromSubGraph: HTMLElement;
  private btnLayoutSubGraph: HTMLElement | null;
  private subGraphTitle: HTMLElement;
  private subGraphNodesCount: HTMLElement;
  private btnPlayCurrentSubGraph: HTMLElement;

  private panX = 40;
  private panY = 20;
  private zoom = 0.95;
  private isPanning = false;
  private startPanX = 0;
  private startPanY = 0;
  private hasMovedPanning = false;

  private draggingNodeId: string | null = null;
  private dragStartX = 0;
  private dragStartY = 0;

  private lastViewMode: ViewMode = 'main';
  private lastFocalVarKey: string | null = null;
  private lastSubGraphEventId: string | null = null;
  private focalPositions: Record<string, LayoutPos> = {};

  private marqueeEl: HTMLElement | null = null;
  private isBoxSelecting = false;
  private hasMovedBoxSelect = false;
  private boxSelectScreenStart = { x: 0, y: 0 };
  private boxSelectStartCanvas = { x: 0, y: 0 };
  private isSpacePressed = false;
  private currentBoxSelectedItems: Array<{
    kind: 'event' | 'condition' | 'subnode';
    id: string;
    eventId?: string;
  }> = [];

  private needsStructureRebuild = true;
  private readonly contextMenu = new CanvasContextMenu();
  private readonly wire: WireInteraction;
  private readonly edgeRenderer: EdgeRenderer;
  private readonly dominoOverlay: DominoCascadeOverlay;
  private readonly abortCtrl = new AbortController();

  constructor(vm: ViewModel) {
    super(vm);
    this.viewport = document.getElementById('graphViewport') as HTMLElement;
    this.canvas = document.getElementById('graphCanvas') as HTMLElement;
    this.svgEdges = document.getElementById('svgEdges') as unknown as SVGSVGElement;
    this.nodesContainer = document.getElementById('nodesContainer') as HTMLElement;

    this.focalBanner = document.getElementById('focalBanner') as HTMLElement;
    this.btnBackToMain = document.getElementById('btnBackToMain') as HTMLElement;
    this.focalTitle = document.getElementById('focalTitle') as HTMLElement;
    this.focalStatusPill = document.getElementById('focalStatusPill') as HTMLElement;
    this.focalSourcesCount = document.getElementById('focalSourcesCount') as HTMLElement;
    this.focalTargetsCount = document.getElementById('focalTargetsCount') as HTMLElement;

    this.subGraphBanner = document.getElementById('subGraphBanner') as HTMLElement;
    this.btnBackFromSubGraph = document.getElementById('btnBackFromSubGraph') as HTMLElement;
    this.btnLayoutSubGraph = document.getElementById('btnLayoutSubGraph');
    this.subGraphTitle = document.getElementById('subGraphTitle') as HTMLElement;
    this.subGraphNodesCount = document.getElementById('subGraphNodesCount') as HTMLElement;
    this.btnPlayCurrentSubGraph = document.getElementById('btnPlayCurrentSubGraph') as HTMLElement;

    this.wire = new WireInteraction(vm, {
      getViewport: () => this.viewport,
      getSvgEdges: () => this.svgEdges,
      getPortCanvasPos: (portEl) => this.getPortCanvasPos(portEl),
      clientToCanvasPos: (cx, cy) => this.clientToCanvasPos(cx, cy),
      isInsideViewport: (cx, cy) => this.isInsideViewport(cx, cy),
      renderEdges: () => this.edgeRenderer.renderEdges(this.vm.session.worldState),
      rebuildSubGraphSync: (eventId) => this.rebuildSubGraphDOM(eventId),
      pulseNode: (id) => this.pulseNode(id),
      closeContextMenu: () => this.contextMenu.close()
    });

    this.edgeRenderer = new EdgeRenderer(vm, {
      getSvgEdges: () => this.svgEdges,
      getPortCanvasPos: (portEl) => this.getPortCanvasPos(portEl),
      getFocalPositions: () => this.focalPositions,
      getReconnectingMainEdge: () => this.wire.getReconnectingMainEdge(),
      onAfterRenderEdges: () => this.wire.syncRubberbandAfterEdgeRender(),
      onOpenEdgeContextMenu: (sx, sy, info) => {
        this.wire.closeDropMenu();
        this.contextMenu.openEdgeMenu(sx, sy, info);
      }
    });

    this.dominoOverlay = new DominoCascadeOverlay(
      () => this.svgEdges,
      (cx, cy) => this.clientToCanvasPos(cx, cy),
      (msg, hl) => this.vm.log(msg, hl)
    );

    this.bindViewportEvents();
    this.bindBannerEvents();
    this.bindContextMenu();
    this.bindGlobalWireAndEscEvents();

    this.updateTransform();
    this.render();
  }

  // ------------------------------------------------------------------ TaskStudioEvents 监听

  onProjectLoaded(): void {
    this.needsStructureRebuild = true;
    this.markDirty();
  }

  onDocumentChanged(source: DocumentChangeSource): void {
    if (source === 'drag') {
      // 拖拽期间仅更新端口位置和 SVG 连线，无需重建节点 DOM
      if (this.vm.session.viewMode === 'main') {
        updateAllConditionPortsPlacement(this.vm.doc);
        updateAllEventPortsPlacement(this.vm.doc);
      }
      this.edgeRenderer.renderEdges(this.vm.session.worldState);
      return;
    }
    this.needsStructureRebuild = true;
    this.markDirty();
  }

  onSessionChanged(): void {
    const { viewMode, focalVarKey, subGraphEventId } = this.vm.session;
    if (
      viewMode !== this.lastViewMode ||
      focalVarKey !== this.lastFocalVarKey ||
      subGraphEventId !== this.lastSubGraphEventId
    ) {
      this.wire.closeDropMenu();
      this.wire.cancelActiveWire();
      this.needsStructureRebuild = true;

      if (viewMode === 'focal' && focalVarKey !== this.lastFocalVarKey) {
        this.centerFocalView();
      } else if (viewMode === 'subgraph' && subGraphEventId !== this.lastSubGraphEventId) {
        this.panX = 60;
        this.panY = 50;
        this.zoom = 1.0;
        this.updateTransform();
      }

      this.lastViewMode = viewMode;
      this.lastFocalVarKey = focalVarKey;
      this.lastSubGraphEventId = subGraphEventId;
    }
    this.markDirty();
  }

  onWorldStateChanged(state: WorldState, meta?: StateChangeMeta): void {
    this.markDirty();
    if (meta && meta.changedVars && meta.changedVars.length > 0 && this.vm.session.viewMode === 'main') {
      requestAnimationFrame(() => {
        if (!this.isDisposed) {
          this.dominoOverlay.trigger(this.vm.doc, state, meta);
        }
      });
    }
  }

  onContextChanged(): void {
    this.viewport.classList.toggle('canvas-drag-receiving', this.vm.context.canvasDragReceiving);
  }

  // ------------------------------------------------------------------ 核心渲染 (Panel.render)

  render(): void {
    const { viewMode, focalVarKey, subGraphEventId, mode, worldState } = this.vm.session;

    // 1. 更新模式样式与顶部横幅显隐
    const isEdit = mode === 'edit';
    this.viewport.classList.toggle('mode-edit', isEdit);
    this.viewport.classList.toggle('mode-play', !isEdit);

    this.focalBanner.classList.toggle('hidden', viewMode !== 'focal');
    this.subGraphBanner.classList.toggle('hidden', viewMode !== 'subgraph');

    // 2. 按需重建节点 DOM
    if (this.needsStructureRebuild) {
      this.needsStructureRebuild = false;
      if (viewMode === 'subgraph' && subGraphEventId) {
        const ev = getEvent(this.vm.doc, subGraphEventId);
        if (ev) {
          this.subGraphTitle.textContent = ev.title;
          const count = ev.actionGraph?.nodes.length || 0;
          this.subGraphNodesCount.textContent = `● ${count} 个节点`;
          this.rebuildSubGraphDOM(subGraphEventId);
        } else {
          this.vm.showMainGraph();
          return;
        }
      } else if (viewMode === 'focal' && focalVarKey) {
        buildFocalGraphDOM(this.vm, focalVarKey, {
          nodesContainer: this.nodesContainer,
          focalPositions: this.focalPositions,
          attachNodeInteraction: (el, kind, id) => this.attachNodeInteraction(el, kind, id)
        });
      } else {
        buildMainGraphDOM(this.vm, {
          nodesContainer: this.nodesContainer,
          svgEdges: this.svgEdges,
          wire: this.wire,
          attachNodeInteraction: (el, kind, id) => this.attachNodeInteraction(el, kind, id),
          openEdgeContextMenu: (sx, sy, info) => {
            this.wire.closeDropMenu();
            this.contextMenu.openEdgeMenu(sx, sy, info);
          }
        });
      }
    }

    // 3. 刷新节点实时状态、选中高亮与 SVG 连线
    this.renderNodesWorldState(worldState);
    this.updateSelectionHighlight();
    this.edgeRenderer.renderEdges(worldState);
  }

  private rebuildSubGraphDOM(eventId: string): void {
    buildSubGraphDOM(this.vm, eventId, {
      nodesContainer: this.nodesContainer,
      wire: this.wire,
      attachSubNodeInteraction: (el, node, evId) => this.attachSubNodeInteraction(el, node, evId)
    });
  }

  private renderNodesWorldState(state: WorldState): void {
    const doc = this.vm.doc;

    doc.conditions.forEach((cond: ConditionDef) => {
      const el = document.getElementById(`node-${cond.id}`);
      if (!el) return;
      const ok = evalCondition(doc, state, cond);
      el.classList.toggle('satisfied', ok);
      el.classList.toggle('unsatisfied', !ok);
    });

    doc.events.forEach((ev) => {
      const el = document.getElementById(`node-${ev.id}`);
      if (!el) return;
      const pill = el.querySelector('.status-pill') as HTMLElement | null;
      const st = getEventStatus(doc, state, ev);

      if (pill) {
        pill.textContent = st.title;
        pill.className = `event-status-pill status-pill ${st.colorClass}`;
      }
      const isAvailable = st.colorClass !== 'status-red';
      el.classList.toggle('available', isAvailable);
      el.classList.toggle('locked', !isAvailable);
    });

    const { viewMode, focalVarKey } = this.vm.session;
    if (viewMode === 'focal' && focalVarKey) {
      const v = getVar(doc, focalVarKey);
      if (v) {
        this.focalTitle.textContent = `${v.icon} ${v.label} (${v.key})`;
        const val = state[v.key];
        const isTrue = val === true || (typeof val === 'number' && val > 0) || val === 'active';
        this.focalStatusPill.className = `focal-status-pill status-pill ${
          isTrue ? 'status-green' : 'status-grey'
        }`;
        this.focalStatusPill.textContent = `● 当前值：${val === undefined ? '∅' : String(val)}`;

        const writers = varWriters(doc, focalVarKey);
        const readers = varReaders(doc, focalVarKey);
        this.focalSourcesCount.textContent = `📥 ${writers.length} 个来源 Event`;
        this.focalTargetsCount.textContent = `📤 ${readers.length} 个影响 Event`;
      }
    }
  }

  public updateSelectionHighlight(): void {
    const selectedIds = new Set(getSelectedNodeIds(this.vm.session.selection));
    document.querySelectorAll('.graph-node').forEach((el) => {
      const id = (el as HTMLElement).dataset.id;
      const isSel = id ? selectedIds.has(id) : false;
      el.classList.toggle('selected', isSel);
    });
  }

  // ------------------------------------------------------------------ 节点拖拽与点击交互（含手势闭环）

  private attachNodeInteraction(el: HTMLElement, kind: 'event' | 'condition', id: string): void {
    let hasMoved = false;

    el.onmousedown = (e) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('.node-port')) return;
      e.stopPropagation();
      hasMoved = false;

      const sel = this.vm.session.selection;
      const isShiftOrCtrl = e.shiftKey || e.ctrlKey || e.metaKey;

      let dragItems: Array<{
        id: string;
        kind: 'event' | 'condition';
        initX: number;
        initY: number;
        el: HTMLElement;
      }> = [];
      const isCurrentInMulti =
        sel && sel.kind === 'multi' && sel.items.some((it) => it.id === id);

      if (isCurrentInMulti) {
        dragItems = sel.items
          .filter(
            (it): it is { kind: 'event' | 'condition'; id: string } =>
              it.kind === 'event' || it.kind === 'condition'
          )
          .map((it) => {
            const pos = this.getNodePos(it.id);
            const nodeEl = document.getElementById(`node-${it.id}`) || el;
            return {
              id: it.id,
              kind: it.kind,
              initX: pos.x,
              initY: pos.y,
              el: nodeEl
            };
          });
      } else {
        if (!isShiftOrCtrl && (!sel || sel.kind !== kind || sel.id !== id)) {
          this.vm.select({ kind, id });
        }
        const pos = this.getNodePos(id);
        dragItems = [{ id, kind, initX: pos.x, initY: pos.y, el }];
      }

      this.draggingNodeId = id;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      const isFocal = this.vm.session.viewMode === 'focal';
      if (!isFocal) {
        this.vm.edit.beginNodeMove();
      }

      const onMouseMove = (moveEv: MouseEvent) => {
        if (this.draggingNodeId !== id) return;
        const dx = (moveEv.clientX - this.dragStartX) / this.zoom;
        const dy = (moveEv.clientY - this.dragStartY) / this.zoom;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          hasMoved = true;
        }

        if (isFocal) {
          dragItems.forEach((item) => {
            const newX = Math.round(item.initX + dx);
            const newY = Math.round(item.initY + dy);
            this.focalPositions[item.id] = { x: newX, y: newY };
            item.el.style.left = `${newX}px`;
            item.el.style.top = `${newY}px`;
          });
          this.edgeRenderer.renderEdges(this.vm.session.worldState);
        } else {
          const nextPositions = dragItems.map((item) => {
            const newX = Math.round(item.initX + dx);
            const newY = Math.round(item.initY + dy);
            item.el.style.left = `${newX}px`;
            item.el.style.top = `${newY}px`;
            return {
              kind: item.kind,
              id: item.id,
              x: newX,
              y: newY
            };
          });
          this.vm.edit.moveNodesTo(nextPositions);
        }
      };

      const onMouseUp = () => {
        if (this.draggingNodeId === id) {
          this.draggingNodeId = null;
          if (!isFocal) {
            this.vm.edit.endNodeMove();
          }
        }
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };

    el.onclick = (e) => {
      e.stopPropagation();
      if (hasMoved) return;

      if (this.wire.activeWire && this.wire.activeWire.mode === 'main' && kind === 'event') {
        this.wire.completeWireConnection(id);
        this.wire.cancelActiveWire();
        return;
      }

      if (this.wire.connectingCondId && kind === 'event') {
        this.wire.completeConnecting(id);
        return;
      }

      const isShiftOrCtrl = e.shiftKey || e.ctrlKey || e.metaKey;
      if (isShiftOrCtrl) {
        const sel = this.vm.session.selection;
        if (!sel) {
          this.vm.select({ kind, id });
        } else if (sel.kind === 'multi') {
          const exists = sel.items.some((it) => it.id === id);
          if (exists) {
            this.vm.selectMulti(sel.items.filter((it) => it.id !== id));
          } else {
            this.vm.selectMulti([...sel.items, { kind, id }]);
          }
        } else if (
          (sel.kind === 'event' || sel.kind === 'condition') &&
          sel.id
        ) {
          if (sel.id === id) {
            this.vm.select(null);
          } else {
            this.vm.selectMulti([
              { kind: sel.kind, id: sel.id },
              { kind, id }
            ]);
          }
        }
        return;
      }

      this.vm.select({ kind, id });

      if (this.vm.session.mode === 'play' && kind === 'event') {
        this.vm.play.playEvent(id);
      }
    };

    el.ondblclick = (e) => {
      e.stopPropagation();
      if (kind === 'event') {
        if (this.vm.session.mode === 'edit') {
          this.vm.setSubGraphEventId(id);
          this.vm.log(`🕸️ 已进入「${getEvent(this.vm.doc, id)?.title}」内部 Action Tree 图谱`, true);
        } else {
          this.vm.play.playEvent(id);
        }
      }
    };
  }

  private attachSubNodeInteraction(
    el: HTMLElement,
    node: ActionGraphNodeUnion,
    eventId: string
  ): void {
    let hasMoved = false;

    el.onmousedown = (e) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('.node-port')) return;
      e.stopPropagation();
      hasMoved = false;

      const sel = this.vm.session.selection;
      const isShiftOrCtrl = e.shiftKey || e.ctrlKey || e.metaKey;

      let dragItems: Array<{ id: string; initX: number; initY: number; el: HTMLElement }> = [];
      const isCurrentInMulti =
        sel && sel.kind === 'multi' && sel.items.some((it) => it.id === node.id);

      if (isCurrentInMulti) {
        dragItems = sel.items
          .filter((it) => it.kind === 'subnode')
          .map((it) => {
            const ev = getEvent(this.vm.doc, eventId);
            const n = ev?.actionGraph?.nodes.find((x) => x.id === it.id);
            const nEl = document.getElementById(`subnode-${it.id}`) || el;
            return {
              id: it.id,
              initX: n ? n.x : 0,
              initY: n ? n.y : 0,
              el: nEl
            };
          });
      } else {
        if (!isShiftOrCtrl && (!sel || sel.kind !== 'subnode' || sel.id !== node.id)) {
          this.vm.select({ kind: 'subnode', id: node.id, eventId });
        }
        dragItems = [{ id: node.id, initX: node.x, initY: node.y, el }];
      }

      this.draggingNodeId = node.id;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.vm.edit.beginNodeMove();

      const onMouseMove = (moveEv: MouseEvent) => {
        if (this.draggingNodeId !== node.id) return;
        const dx = (moveEv.clientX - this.dragStartX) / this.zoom;
        const dy = (moveEv.clientY - this.dragStartY) / this.zoom;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          hasMoved = true;
        }

        const nextPositions = dragItems.map((item) => {
          const newX = Math.round(item.initX + dx);
          const newY = Math.round(item.initY + dy);
          item.el.style.left = `${newX}px`;
          item.el.style.top = `${newY}px`;
          return {
            kind: 'subnode' as const,
            id: item.id,
            eventId,
            x: newX,
            y: newY
          };
        });
        this.vm.edit.moveNodesTo(nextPositions);
      };

      const onMouseUp = () => {
        if (this.draggingNodeId === node.id) {
          this.draggingNodeId = null;
          this.vm.edit.endNodeMove();
        }
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };

    el.onclick = (e) => {
      e.stopPropagation();
      if (hasMoved) return;

      if (
        this.wire.activeWire &&
        this.wire.activeWire.mode === 'subgraph' &&
        node.type !== 'start' &&
        node.id !== this.wire.activeWire.sourceId
      ) {
        this.wire.completeWireConnection(node.id);
        this.wire.cancelActiveWire();
        return;
      }

      if (
        this.wire.subConnectingSource &&
        node.type !== 'start' &&
        node.id !== this.wire.subConnectingSource.nodeId
      ) {
        this.wire.completeSubConnecting(node.id);
        return;
      }

      const isShiftOrCtrl = e.shiftKey || e.ctrlKey || e.metaKey;
      if (isShiftOrCtrl) {
        const sel = this.vm.session.selection;
        if (!sel) {
          this.vm.select({ kind: 'subnode', id: node.id, eventId });
        } else if (sel.kind === 'multi') {
          const exists = sel.items.some((it) => it.id === node.id);
          if (exists) {
            this.vm.selectMulti(sel.items.filter((it) => it.id !== node.id));
          } else {
            this.vm.selectMulti([...sel.items, { kind: 'subnode', id: node.id, eventId }]);
          }
        } else if (sel.kind === 'subnode' && sel.id) {
          if (sel.id === node.id) {
            this.vm.select(null);
          } else {
            this.vm.selectMulti([
              { kind: 'subnode', id: sel.id, eventId: sel.eventId },
              { kind: 'subnode', id: node.id, eventId }
            ]);
          }
        }
        return;
      }

      this.vm.select({ kind: 'subnode', id: node.id, eventId });
    };
  }

  // ------------------------------------------------------------------ 公开节点创建与布局接口

  public createNodeAt(type: 'event' | 'condition', canvasX: number, canvasY: number): string {
    if (this.vm.session.viewMode === 'focal') {
      this.vm.showMainGraph();
    }
    if (type === 'event') {
      const ev = this.vm.edit.addEvent(canvasX, canvasY);
      if (ev) {
        this.vm.log(`💬 拖拽生成 Event 任务节点：[${ev.title}] (坐标: ${canvasX}, ${canvasY})`, true);
        this.pulseNode(ev.id);
        return ev.id;
      }
      return '';
    }
    const cond = this.vm.edit.addCondition(canvasX, canvasY);
    if (cond) {
      this.vm.log(
        `🔍 拖拽生成 Condition 条件节点：[${cond.title}] (坐标: ${canvasX}, ${canvasY})`,
        true
      );
      this.pulseNode(cond.id);
      return cond.id;
    }
    return '';
  }

  public createNodeAtCenter(type: 'event' | 'condition'): string {
    const center = this.getViewportCenterCanvasPos();
    const count =
      type === 'event' ? this.vm.doc.events.length : this.vm.doc.conditions.length;
    const stagger = (count % 8) * 16;
    const x = Math.round(center.x - 70 + stagger);
    const y = Math.round(center.y - 18 + stagger);
    return this.createNodeAt(type, x, y);
  }

  public createSubNodeAt(
    type: 'action' | 'selector' | 'choice',
    canvasX: number,
    canvasY: number
  ): string | undefined {
    const eventId = this.vm.session.subGraphEventId;
    if (!eventId) return undefined;
    const node = this.vm.edit.addSubNode(eventId, type, canvasX, canvasY);
    if (node) {
      const nodeTitle = 'title' in node && node.title ? node.title : node.id;
      this.vm.log(`✨ 新建 Action Tree 节点：[${nodeTitle}]`, true);
      this.pulseNode(node.id);
      return node.id;
    }
    return undefined;
  }

  public createSubNodeAtCenter(type: 'action' | 'selector' | 'choice'): string | undefined {
    const center = this.getViewportCenterCanvasPos();
    const eventId = this.vm.session.subGraphEventId;
    const ev = eventId ? getEvent(this.vm.doc, eventId) : null;
    const count = ev?.actionGraph?.nodes.length || 0;
    const stagger = (count % 8) * 16;
    const x = Math.round(center.x - 90 + stagger);
    const y = Math.round(center.y - 30 + stagger);
    return this.createSubNodeAt(type, x, y);
  }

  public resetLayout(): void {
    const { viewMode, subGraphEventId } = this.vm.session;
    if (viewMode === 'subgraph' && subGraphEventId) {
      this.resetSubGraphLayout(subGraphEventId);
      return;
    }
    this.vm.edit.resetMainLayout();
    this.panX = 40;
    this.panY = 20;
    this.zoom = 0.95;
    this.updateTransform();
  }

  public resetSubGraphLayout(eventId: string): void {
    const ev = getEvent(this.vm.doc, eventId);
    if (!ev) return;
    if (this.vm.edit.resetSubGraphLayout(eventId)) {
      this.panX = 60;
      this.panY = 50;
      this.zoom = 1.0;
      this.updateTransform();
      this.vm.log(`📐 已将事件 [${ev.title}] 的内部节点自动整理为清晰流程图布局！`, true);
    }
  }

  public clientToCanvasPos(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.viewport.getBoundingClientRect();
    const x = Math.round((clientX - rect.left - this.panX) / this.zoom);
    const y = Math.round((clientY - rect.top - this.panY) / this.zoom);
    return { x, y };
  }

  public isInsideViewport(clientX: number, clientY: number): boolean {
    const rect = this.viewport.getBoundingClientRect();
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }

  public getViewportCenterCanvasPos(): { x: number; y: number } {
    const rect = this.viewport.getBoundingClientRect();
    return this.clientToCanvasPos(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  public pulseNode(id: string): void {
    requestAnimationFrame(() => {
      const el =
        document.getElementById(`node-${id}`) || document.getElementById(`subnode-${id}`);
      if (!el) return;
      el.classList.remove('node-spawn-pulse');
      void el.offsetWidth;
      el.classList.add('node-spawn-pulse');
      setTimeout(() => {
        el.classList.remove('node-spawn-pulse');
      }, 1000);
    });
  }

  // ------------------------------------------------------------------ 内部辅助与视口事件绑定

  private getPortCanvasPos(portEl: HTMLElement): { x: number; y: number } {
    const pRect = portEl.getBoundingClientRect();
    const cRect = this.canvas.getBoundingClientRect();
    return {
      x: (pRect.left + pRect.width / 2 - cRect.left) / this.zoom,
      y: (pRect.top + pRect.height / 2 - cRect.top) / this.zoom
    };
  }

  private getNodePos(id: string): LayoutPos {
    if (this.vm.session.viewMode === 'focal' && this.focalPositions[id]) {
      return this.focalPositions[id];
    }
    const ev = getEvent(this.vm.doc, id);
    if (ev) return { x: ev.x, y: ev.y };
    const tr = getCondition(this.vm.doc, id);
    if (tr) return { x: tr.x, y: tr.y };
    return { x: 0, y: 0 };
  }

  private centerFocalView(): void {
    const vW = this.viewport.clientWidth;
    const vH = this.viewport.clientHeight;
    this.panX = Math.round(vW / 2 - 480);
    this.panY = Math.round(vH / 2 - 220);
    this.zoom = 1.0;
    this.updateTransform();
  }

  private updateTransform(): void {
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  private bindBannerEvents(): void {
    this.btnBackToMain.onclick = () => {
      this.vm.setFocalVar(null);
    };
    this.btnBackFromSubGraph.onclick = () => {
      this.vm.setSubGraphEventId(null);
    };
    if (this.btnLayoutSubGraph) {
      this.btnLayoutSubGraph.onclick = () => {
        if (this.vm.session.subGraphEventId) {
          this.resetSubGraphLayout(this.vm.session.subGraphEventId);
        }
      };
    }
    this.btnPlayCurrentSubGraph.onclick = () => {
      if (this.vm.session.subGraphEventId) {
        this.vm.play.playEvent(this.vm.session.subGraphEventId);
      }
    };
  }

  private bindGlobalWireAndEscEvents(): void {
    const sig = this.abortCtrl.signal;

    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') {
          if (this.wire.handleEscapeKey()) return;
          if (this.vm.session.viewMode === 'subgraph') {
            this.vm.setSubGraphEventId(null);
          } else if (this.vm.session.viewMode === 'focal') {
            this.vm.setFocalVar(null);
          }
        }
      },
      { signal: sig }
    );

    window.addEventListener(
      'click',
      (e) => {
        this.wire.handleGlobalClick(e);
        this.contextMenu.close();
      },
      { signal: sig }
    );

    window.addEventListener(
      'pointermove',
      (e) => {
        this.wire.handleGlobalPointerMove(e);
      },
      { signal: sig }
    );
  }

  private bindViewportEvents(): void {
    const sig = this.abortCtrl.signal;

    this.viewport.onmousedown = (e) => {
      if ((e.target as HTMLElement).closest('.node-port')) return;
      if ((e.target as HTMLElement).closest('.wire-drop-menu')) return;
      if (this.wire.activeWire) return;

      if (e.button === 1 || (e.button === 0 && this.isSpacePressed)) {
        e.preventDefault();
        this.isPanning = true;
        this.hasMovedPanning = false;
        this.startPanX = e.clientX - this.panX;
        this.startPanY = e.clientY - this.panY;
        this.viewport.style.cursor = 'grabbing';
        this.contextMenu.close();
        this.wire.closeDropMenu();
        return;
      }

      if (e.button === 0) {
        this.isBoxSelecting = true;
        this.hasMovedBoxSelect = false;
        this.boxSelectScreenStart = { x: e.clientX, y: e.clientY };
        this.boxSelectStartCanvas = this.clientToCanvasPos(e.clientX, e.clientY);
        this.currentBoxSelectedItems = [];
        this.contextMenu.close();
        this.wire.closeDropMenu();
      }
    };

    window.addEventListener(
      'mousemove',
      (e) => {
        if (this.isPanning) {
          const dx = Math.abs(e.clientX - (this.startPanX + this.panX));
          const dy = Math.abs(e.clientY - (this.startPanY + this.panY));
          if (dx > 3 || dy > 3) this.hasMovedPanning = true;
          this.panX = e.clientX - this.startPanX;
          this.panY = e.clientY - this.startPanY;
          this.updateTransform();
          return;
        }

        if (this.isBoxSelecting) {
          const dist = Math.hypot(
            e.clientX - this.boxSelectScreenStart.x,
            e.clientY - this.boxSelectScreenStart.y
          );
          if (dist > 4) {
            this.hasMovedBoxSelect = true;
          }

          if (this.hasMovedBoxSelect) {
            if (!this.marqueeEl) {
              this.marqueeEl = document.createElement('div');
              this.marqueeEl.className = 'selection-marquee';
              this.canvas.appendChild(this.marqueeEl);
            }

            const curPos = this.clientToCanvasPos(e.clientX, e.clientY);
            const minX = Math.min(this.boxSelectStartCanvas.x, curPos.x);
            const maxX = Math.max(this.boxSelectStartCanvas.x, curPos.x);
            const minY = Math.min(this.boxSelectStartCanvas.y, curPos.y);
            const maxY = Math.max(this.boxSelectStartCanvas.y, curPos.y);

            this.marqueeEl.style.left = `${minX}px`;
            this.marqueeEl.style.top = `${minY}px`;
            this.marqueeEl.style.width = `${maxX - minX}px`;
            this.marqueeEl.style.height = `${maxY - minY}px`;
            this.marqueeEl.style.display = 'block';

            const items: Array<{
              kind: 'event' | 'condition' | 'subnode';
              id: string;
              eventId?: string;
            }> = [];
            const { viewMode, subGraphEventId } = this.vm.session;

            if (viewMode === 'subgraph' && subGraphEventId) {
              const ev = getEvent(this.vm.doc, subGraphEventId);
              ev?.actionGraph?.nodes.forEach((node) => {
                const el = document.getElementById(`subnode-${node.id}`);
                const w = el?.offsetWidth || 180;
                const h = el?.offsetHeight || 60;
                if (node.x < maxX && node.x + w > minX && node.y < maxY && node.y + h > minY) {
                  items.push({ kind: 'subnode', id: node.id, eventId: subGraphEventId });
                }
              });
            } else if (viewMode === 'main') {
              this.vm.doc.events.forEach((ev) => {
                const el = document.getElementById(`node-${ev.id}`);
                const w = el?.offsetWidth || 180;
                const h = el?.offsetHeight || 38;
                if (ev.x < maxX && ev.x + w > minX && ev.y < maxY && ev.y + h > minY) {
                  items.push({ kind: 'event', id: ev.id });
                }
              });
              this.vm.doc.conditions.forEach((c) => {
                const el = document.getElementById(`node-${c.id}`);
                const w = el?.offsetWidth || 180;
                const h = el?.offsetHeight || 38;
                if (c.x < maxX && c.x + w > minX && c.y < maxY && c.y + h > minY) {
                  items.push({ kind: 'condition', id: c.id });
                }
              });
            }

            this.currentBoxSelectedItems = items;
            const boxedIds = new Set(items.map((it) => it.id));
            document.querySelectorAll('.graph-node').forEach((el) => {
              const nid = (el as HTMLElement).dataset.id;
              el.classList.toggle('selected', nid ? boxedIds.has(nid) : false);
            });
          }
        }
      },
      { signal: sig }
    );

    window.addEventListener(
      'mouseup',
      () => {
        if (this.isPanning) {
          this.isPanning = false;
          this.viewport.style.cursor = this.isSpacePressed ? 'grab' : '';
        }

        if (this.isBoxSelecting) {
          this.isBoxSelecting = false;
          if (this.marqueeEl) {
            this.marqueeEl.style.display = 'none';
          }

          if (this.hasMovedBoxSelect) {
            this.vm.selectMulti(this.currentBoxSelectedItems);
            this.updateSelectionHighlight();
            if (this.currentBoxSelectedItems.length > 0) {
              this.vm.log(
                `📦 已框选 ${this.currentBoxSelectedItems.length} 个节点，可按住任一选中节点一起拖动`,
                true
              );
            }
          } else {
            this.vm.select(null);
          }
          this.hasMovedBoxSelect = false;
        }
      },
      { signal: sig }
    );

    this.viewport.addEventListener(
      'auxclick',
      (e) => {
        if (e.button === 1) e.preventDefault();
      },
      { signal: sig }
    );

    window.addEventListener(
      'keydown',
      (e) => {
        if (
          e.code === 'Space' &&
          !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)
        ) {
          this.isSpacePressed = true;
          if (!this.isPanning) {
            this.viewport.style.cursor = 'grab';
          }
        }
      },
      { signal: sig }
    );

    window.addEventListener(
      'keyup',
      (e) => {
        if (e.code === 'Space') {
          this.isSpacePressed = false;
          if (!this.isPanning) {
            this.viewport.style.cursor = '';
          }
        }
      },
      { signal: sig }
    );

    this.viewport.onclick = (e) => {
      if (this.hasMovedPanning || this.hasMovedBoxSelect || this.wire.suppressNextViewportClick) {
        return;
      }
      if (
        e.target === this.viewport ||
        e.target === this.canvas ||
        e.target === this.svgEdges ||
        e.target === this.nodesContainer
      ) {
        const { viewMode, subGraphEventId } = this.vm.session;
        if (viewMode === 'subgraph' && subGraphEventId) {
          this.vm.select({ kind: 'event', id: subGraphEventId });
        } else {
          this.vm.select(null);
        }
        this.contextMenu.close();
      }
    };

    this.viewport.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const zoomFactor = 1.08;
        const oldZoom = this.zoom;
        if (e.deltaY < 0) {
          this.zoom = Math.min(this.zoom * zoomFactor, 2.5);
        } else {
          this.zoom = Math.max(this.zoom / zoomFactor, 0.4);
        }
        const rect = this.viewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        this.panX = mouseX - (mouseX - this.panX) * (this.zoom / oldZoom);
        this.panY = mouseY - (mouseY - this.panY) * (this.zoom / oldZoom);
        this.updateTransform();
      },
      { signal: sig }
    );
  }

  private bindContextMenu(): void {
    this.viewport.oncontextmenu = (e) => {
      e.preventDefault();
      this.wire.closeDropMenu();
      this.wire.cancelActiveWire();
      const rect = this.viewport.getBoundingClientRect();
      const screenX = e.clientX;
      const screenY = e.clientY;
      const canvasX = Math.round((screenX - rect.left - this.panX) / this.zoom);
      const canvasY = Math.round((screenY - rect.top - this.panY) / this.zoom);

      this.contextMenu.openCanvasMenu(
        screenX,
        screenY,
        canvasX,
        canvasY,
        this.vm.session.viewMode,
        {
          onCreateSubNode: (type, cx, cy) => {
            this.createSubNodeAt(type, cx, cy);
          },
          onCreateEvent: (cx, cy) => {
            const ev = this.vm.edit.addEvent(cx, cy);
            if (ev) {
              this.vm.log(`✨ 新建 Event 节点：[${ev.title}]`, true);
              this.pulseNode(ev.id);
            }
          },
          onCreateCondition: (cx, cy) => {
            const cond = this.vm.edit.addCondition(cx, cy);
            if (cond) {
              this.vm.log(`✨ 新建 Condition 条件节点：[${cond.title}]`, true);
              this.pulseNode(cond.id);
            }
          },
          onBackToMain: () => {
            this.vm.setSubGraphEventId(null);
          },
          onResetLayout: () => {
            this.resetLayout();
            this.vm.log('📐 已恢复标准任务布局！', true);
          }
        }
      );
    };
  }

  protected override onDispose(): void {
    this.abortCtrl.abort();
    this.wire.dispose();
    this.contextMenu.dispose();
  }
}
