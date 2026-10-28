import { ViewModel } from '../../app/viewModel';
import { getCondition, getEvent, SubGraphPortSource } from '../../core/editOps';
import { escapeHtml } from '../../utils/dom';
import {
  getEventPortSide,
  PortSide,
  updateConditionPortPlacement,
  updateEventPortsPlacement
} from './PortPlacement';

export interface ActiveWireDrag {
  mode: 'main' | 'subgraph';
  sourceId: string;
  caseId?: string;
  isDefault?: boolean;
  optId?: string;
  sourcePortEl: HTMLElement;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  hasDragged: boolean;
  snappedTargetId: string | null;
  snappedPortPos: { x: number; y: number } | null;
  snappedPortSide?: PortSide;
  reconnectFromTargetId?: string;
  reconnectPortEl?: HTMLElement;
  isSlidingConditionPort?: boolean;
  slidingCondSide?: PortSide;
  slidingCondRatio?: number;
}

export interface WireInteractionDeps {
  getViewport: () => HTMLElement;
  getSvgEdges: () => SVGSVGElement;
  getPortCanvasPos: (portEl: HTMLElement) => { x: number; y: number };
  clientToCanvasPos: (clientX: number, clientY: number) => { x: number; y: number };
  isInsideViewport: (clientX: number, clientY: number) => boolean;
  renderEdges: () => void;
  rebuildSubGraphSync: (eventId: string) => void;
  pulseNode: (id: string) => void;
  closeContextMenu: () => void;
}

export class WireInteraction {
  public activeWire: ActiveWireDrag | null = null;
  public connectingCondId: string | null = null;
  public subConnectingSource: SubGraphPortSource | null = null;
  public suppressNextViewportClick = false;

  private rubberbandPath: SVGPathElement | null = null;
  private dropMenuEl: HTMLElement | null = null;
  private connectingBannerEl: HTMLElement | null = null;

  constructor(
    private readonly vm: ViewModel,
    private readonly deps: WireInteractionDeps
  ) {}

  public get hasActiveInteraction(): boolean {
    return !!(this.activeWire || this.connectingCondId || this.subConnectingSource || this.dropMenuEl);
  }

  public get isDropMenuOpen(): boolean {
    return !!this.dropMenuEl;
  }

  public getReconnectingMainEdge(): { sourceId: string; targetId: string } | null {
    if (
      this.activeWire &&
      this.activeWire.mode === 'main' &&
      this.activeWire.reconnectFromTargetId
    ) {
      return {
        sourceId: this.activeWire.sourceId,
        targetId: this.activeWire.reconnectFromTargetId
      };
    }
    return null;
  }

  public syncRubberbandAfterEdgeRender(): void {
    if (this.activeWire) {
      this.ensureRubberbandElement();
      this.updateRubberbandWire();
    }
  }

  public handleGlobalPointerMove(e: PointerEvent): void {
    if (this.activeWire && !this.activeWire.hasDragged && !this.dropMenuEl) {
      const cPos = this.deps.clientToCanvasPos(e.clientX, e.clientY);
      this.activeWire.currentX = cPos.x;
      this.activeWire.currentY = cPos.y;
      this.checkMagnetSnapping(e.clientX, e.clientY, cPos);
      this.updateRubberbandWire();
    }
  }

  public handleGlobalClick(e: MouseEvent): boolean {
    if (this.suppressNextViewportClick) {
      this.suppressNextViewportClick = false;
      return true;
    }
    const target = e.target as HTMLElement | null;
    if (target?.closest('.wire-drop-menu')) return true;
    if (target?.closest('.node-port')) return true;
    if (this.dropMenuEl) {
      this.closeDropMenu();
      this.cancelActiveWire();
      return true;
    }
    if (this.activeWire && !this.activeWire.hasDragged) {
      this.cancelActiveWire();
    }
    if (this.connectingCondId) {
      this.cancelConnecting();
    }
    if (this.subConnectingSource) {
      this.cancelSubConnecting();
    }
    return false;
  }

  public handleEscapeKey(): boolean {
    this.closeDropMenu();
    if (this.activeWire) {
      this.cancelActiveWire();
      return true;
    }
    if (this.subConnectingSource) {
      this.cancelSubConnecting();
      return true;
    }
    if (this.connectingCondId) {
      this.cancelConnecting();
      return true;
    }
    return false;
  }

  public handlePortPointerDown(
    e: PointerEvent,
    portEl: HTMLElement,
    config: {
      mode: 'main' | 'subgraph';
      sourceId: string;
      caseId?: string;
      isDefault?: boolean;
      optId?: string;
      initialHasDragged?: boolean;
      reconnectFromTargetId?: string;
      reconnectPortEl?: HTMLElement;
    }
  ): void {
    if (!config.initialHasDragged && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    this.closeDropMenu();
    this.cancelActiveWire();

    const startPos = this.deps.getPortCanvasPos(portEl);
    const pointerCanvasPos = this.deps.clientToCanvasPos(e.clientX, e.clientY);
    const hasDragged = !!config.initialHasDragged;

    this.activeWire = {
      mode: config.mode,
      sourceId: config.sourceId,
      caseId: config.caseId,
      isDefault: config.isDefault,
      optId: config.optId,
      sourcePortEl: portEl,
      startX: startPos.x,
      startY: startPos.y,
      currentX: hasDragged ? pointerCanvasPos.x : startPos.x,
      currentY: hasDragged ? pointerCanvasPos.y : startPos.y,
      hasDragged,
      snappedTargetId: config.reconnectFromTargetId || null,
      snappedPortPos: config.reconnectPortEl
        ? this.deps.getPortCanvasPos(config.reconnectPortEl)
        : null,
      snappedPortSide: undefined,
      reconnectFromTargetId: config.reconnectFromTargetId,
      reconnectPortEl: config.reconnectPortEl
    };

    if (config.reconnectFromTargetId) {
      this.deps.renderEdges();
    }

    portEl.classList.add('port-active');
    if (hasDragged) {
      if (this.activeWire.reconnectFromTargetId) {
        this.updateSlidingWire(e.clientX, e.clientY, pointerCanvasPos);
      } else {
        this.checkMagnetSnapping(e.clientX, e.clientY, pointerCanvasPos);
      }
    }
    this.ensureRubberbandElement();
    this.updateRubberbandWire();

    if (config.mode === 'main') {
      this.connectingCondId = config.sourceId;
    } else {
      this.subConnectingSource = {
        nodeId: config.sourceId,
        caseId: config.caseId,
        isDefault: config.isDefault,
        optId: config.optId
      };
    }

    const onPointerMove = (moveEv: PointerEvent) => {
      if (!this.activeWire) return;
      const cPos = this.deps.clientToCanvasPos(moveEv.clientX, moveEv.clientY);
      this.activeWire.currentX = cPos.x;
      this.activeWire.currentY = cPos.y;

      const dist = Math.hypot(cPos.x - this.activeWire.startX, cPos.y - this.activeWire.startY);
      if (dist > 4) {
        this.activeWire.hasDragged = true;
      }

      if (this.activeWire.reconnectFromTargetId) {
        this.updateSlidingWire(moveEv.clientX, moveEv.clientY, cPos);
        this.updateRubberbandWire();
      } else if (this.activeWire.mode === 'main') {
        const isSliding = this.updateSlidingConditionPort(cPos);
        if (!isSliding) {
          this.checkMagnetSnapping(moveEv.clientX, moveEv.clientY, cPos);
          this.updateRubberbandWire();
        }
      } else {
        this.checkMagnetSnapping(moveEv.clientX, moveEv.clientY, cPos);
        this.updateRubberbandWire();
      }
    };

    const onPointerUp = (upEv: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      if (!this.activeWire) return;
      const wire = this.activeWire;

      if (wire.hasDragged) {
        this.suppressNextViewportClick = true;
        setTimeout(() => {
          this.suppressNextViewportClick = false;
        }, 0);

        if (wire.reconnectFromTargetId) {
          const origTargetId = wire.reconnectFromTargetId;
          const condId = wire.sourceId;

          if (wire.snappedTargetId === origTargetId) {
            const cond = getCondition(this.vm.doc, condId);
            const ev = getEvent(this.vm.doc, origTargetId);
            this.vm.log(
              `保留依赖关系：[${cond?.title || condId}] ➔ [${ev?.title || origTargetId}]`,
              true
            );
            this.cancelActiveWire();
            this.deps.renderEdges();
          } else if (wire.snappedTargetId && wire.snappedTargetId !== origTargetId) {
            const newTargetId = wire.snappedTargetId;
            const cond = getCondition(this.vm.doc, condId);
            const oldEv = getEvent(this.vm.doc, origTargetId);
            const newEv = getEvent(this.vm.doc, newTargetId);

            this.cancelActiveWire();
            this.vm.edit.reconnectCondition(origTargetId, newTargetId, condId);
            this.vm.log(
              `🔄 已将依赖关系改接：[${cond?.title || condId}] 从 [${
                oldEv?.title || origTargetId
              }] 改至 [${newEv?.title || newTargetId}]`,
              true
            );
            this.deps.pulseNode(newTargetId);
          } else {
            const cond = getCondition(this.vm.doc, condId);
            const oldEv = getEvent(this.vm.doc, origTargetId);
            this.cancelActiveWire();
            this.vm.edit.disconnectCondition(origTargetId, condId);
            this.vm.log(
              `✂️ 已断开 Condition 依赖：[${cond?.title || condId}] ➔ [${
                oldEv?.title || origTargetId
              }]（找不到连接点，Ctrl+Z 可撤销）`,
              true
            );
          }
          return;
        }

        if (wire.isSlidingConditionPort && wire.mode === 'main') {
          const condId = wire.sourceId;
          const targetSide = wire.slidingCondSide || 'right';
          const targetRatio = wire.slidingCondRatio ?? 0.5;

          this.vm.edit.updateConditionPort(condId, targetSide, targetRatio);
          const cond = getCondition(this.vm.doc, condId);
          this.vm.log(
            `📍 已将 Condition [${cond?.title || condId}] 的出口端点移至 [${targetSide}]（保留全部依赖）`,
            true
          );
          this.cancelActiveWire();
          this.deps.renderEdges();
          return;
        }

        if (wire.snappedTargetId) {
          this.completeWireConnection(wire.snappedTargetId);
        } else {
          const dropCanvasPos = this.deps.clientToCanvasPos(upEv.clientX, upEv.clientY);
          const distFromStart = Math.hypot(
            dropCanvasPos.x - wire.startX,
            dropCanvasPos.y - wire.startY
          );
          if (distFromStart > 28 && this.deps.isInsideViewport(upEv.clientX, upEv.clientY)) {
            this.openDropOnEmptyMenu(upEv.clientX, upEv.clientY, dropCanvasPos, wire);
          } else {
            this.cancelActiveWire();
          }
        }
      } else {
        this.showClickConnectBanner(wire);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  public handlePortInPointerDown(
    e: PointerEvent,
    portInEl: HTMLElement,
    config: {
      mode: 'main' | 'subgraph';
      targetId: string;
      condId?: string;
    }
  ): void {
    if (e.button !== 0) return;

    if (config.mode === 'main') {
      if ((this.activeWire && this.activeWire.mode === 'main') || this.connectingCondId) {
        e.stopPropagation();
        e.preventDefault();
        if (this.activeWire) {
          this.completeWireConnection(config.targetId);
        } else {
          this.completeConnecting(config.targetId);
          this.deps.pulseNode(config.targetId);
        }
        return;
      }

      const ev = getEvent(this.vm.doc, config.targetId);
      const condId =
        config.condId ||
        (ev?.incomingConditions && ev.incomingConditions.length > 0
          ? ev.incomingConditions[ev.incomingConditions.length - 1]
          : null);

      if (ev && condId) {
        e.stopPropagation();
        e.preventDefault();
        const downX = e.clientX;
        const downY = e.clientY;
        let unplugged = false;

        const onMove = (moveEv: PointerEvent) => {
          if (unplugged) return;
          if (Math.hypot(moveEv.clientX - downX, moveEv.clientY - downY) > 4) {
            unplugged = true;
            cleanupWait();

            const condEl = document.getElementById(`node-${condId}`);
            const condPortOut = condEl?.querySelector('.port-out') as HTMLElement | null;

            if (condPortOut) {
              this.handlePortPointerDown(moveEv, condPortOut, {
                mode: 'main',
                sourceId: condId,
                initialHasDragged: true,
                reconnectFromTargetId: ev.id,
                reconnectPortEl: portInEl
              });
            }
          }
        };

        const cleanupWait = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', cleanupWait);
          window.removeEventListener('pointercancel', cleanupWait);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', cleanupWait);
        window.addEventListener('pointercancel', cleanupWait);
      }
    } else if (config.mode === 'subgraph' && this.vm.session.subGraphEventId) {
      const subGraphEventId = this.vm.session.subGraphEventId;
      if (
        (this.activeWire &&
          this.activeWire.mode === 'subgraph' &&
          this.activeWire.sourceId !== config.targetId) ||
        (this.subConnectingSource && this.subConnectingSource.nodeId !== config.targetId)
      ) {
        e.stopPropagation();
        e.preventDefault();
        if (this.activeWire) {
          this.completeWireConnection(config.targetId);
        } else {
          this.completeSubConnecting(config.targetId);
          this.deps.pulseNode(config.targetId);
        }
        return;
      }

      const ev = getEvent(this.vm.doc, subGraphEventId);
      if (!ev || !ev.actionGraph) return;

      let upstream: SubGraphPortSource | null = null;

      for (const n of ev.actionGraph.nodes) {
        if ((n.type === 'start' || n.type === 'action') && n.nextId === config.targetId) {
          upstream = { nodeId: n.id };
          break;
        }
        if (n.type === 'selector') {
          if (n.defaultTargetId === config.targetId) {
            upstream = { nodeId: n.id, isDefault: true };
            break;
          }
          const matchedCase = n.cases.find((c) => c.targetId === config.targetId);
          if (matchedCase) {
            upstream = { nodeId: n.id, caseId: matchedCase.id };
            break;
          }
        }
        if (n.type === 'choice') {
          const matchedOpt = n.options.find((o) => o.targetId === config.targetId);
          if (matchedOpt) {
            upstream = { nodeId: n.id, optId: matchedOpt.id };
            break;
          }
        }
      }

      if (upstream) {
        e.stopPropagation();
        e.preventDefault();
        const capturedUpstream = upstream;
        const downX = e.clientX;
        const downY = e.clientY;
        let unplugged = false;

        const onMove = (moveEv: PointerEvent) => {
          if (unplugged) return;
          if (Math.hypot(moveEv.clientX - downX, moveEv.clientY - downY) > 4) {
            unplugged = true;
            cleanupWait();

            this.vm.edit.disconnectSubGraph(subGraphEventId, capturedUpstream);
            this.vm.log(
              `🔌 已拔出连线：[${capturedUpstream.nodeId}] ➔ [${config.targetId}]，可拖动改接至新目标`,
              true
            );

            // 同步重建子图 DOM 以获取最新的端口元素
            this.deps.rebuildSubGraphSync(subGraphEventId);

            const freshPortEl = this.querySubSourcePortEl(
              capturedUpstream.nodeId,
              capturedUpstream.caseId,
              capturedUpstream.isDefault,
              capturedUpstream.optId
            );

            if (freshPortEl) {
              this.handlePortPointerDown(moveEv, freshPortEl, {
                mode: 'subgraph',
                sourceId: capturedUpstream.nodeId,
                caseId: capturedUpstream.caseId,
                isDefault: capturedUpstream.isDefault,
                optId: capturedUpstream.optId,
                initialHasDragged: true
              });
            }
          }
        };

        const cleanupWait = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', cleanupWait);
          window.removeEventListener('pointercancel', cleanupWait);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', cleanupWait);
        window.addEventListener('pointercancel', cleanupWait);
      }
    }
  }

  public completeWireConnection(targetId: string): void {
    if (!this.activeWire) return;
    const mode = this.activeWire.mode;
    const condId = this.connectingCondId || this.activeWire.sourceId;
    const subSrc = this.subConnectingSource || {
      nodeId: this.activeWire.sourceId,
      caseId: this.activeWire.caseId,
      isDefault: this.activeWire.isDefault,
      optId: this.activeWire.optId
    };

    this.cancelActiveWire();

    if (mode === 'main') {
      this.connectingCondId = condId;
      this.completeConnecting(targetId);
    } else {
      this.subConnectingSource = subSrc;
      this.completeSubConnecting(targetId);
    }
    this.deps.pulseNode(targetId);
  }

  public completeConnecting(evId: string): void {
    const chosenCondId = this.connectingCondId;
    this.cancelConnecting();
    if (!chosenCondId) return;

    const existingEv = getEvent(this.vm.doc, evId);
    if (!existingEv) return;
    if (existingEv.incomingConditions && existingEv.incomingConditions.includes(chosenCondId)) {
      this.vm.log(`ℹ️ Event [${evId}] 已依赖 Condition [${chosenCondId}]`, true);
      return;
    }

    if (this.vm.edit.connectCondition(evId, chosenCondId)) {
      this.vm.log(`已建立依赖关系：Event [${evId}] 依赖 Condition [${chosenCondId}]`, true);
    }
  }

  public completeSubConnecting(targetNodeId: string): void {
    const src = this.subConnectingSource;
    this.cancelSubConnecting();
    const eventId = this.vm.session.subGraphEventId;
    if (!src || !eventId) return;

    const ev = getEvent(this.vm.doc, eventId);
    const targetNode = ev?.actionGraph?.nodes.find((n) => n.id === targetNodeId);
    if (!targetNode || targetNode.type === 'start') {
      this.vm.log('⚠️ 不能将连线连入 Start 入口节点！', true);
      return;
    }

    if (this.vm.edit.connectSubGraph(eventId, src, targetNodeId)) {
      const targetTitle = targetNode.title || targetNode.id;
      const defaultOptionIndex = targetNode.type === 'choice' ? 0 : undefined;
      this.vm.log(
        `🔗 已连接：${src.nodeId} ➔ ${targetTitle}${
          defaultOptionIndex !== undefined ? ' (默认选项 index: 0)' : ''
        }`,
        true
      );
    }
  }

  public cancelActiveWire(): void {
    if (this.activeWire) {
      if (this.activeWire.sourcePortEl) {
        this.activeWire.sourcePortEl.classList.remove('port-active');
      }
      if (this.activeWire.reconnectPortEl) {
        this.activeWire.reconnectPortEl.style.opacity = '1';
        this.activeWire.reconnectPortEl.classList.remove('port-active', 'snap-port-hover');
      }
      if (this.activeWire.reconnectFromTargetId) {
        updateEventPortsPlacement(this.vm.doc, this.activeWire.reconnectFromTargetId);
      } else if (this.activeWire.mode === 'main') {
        updateConditionPortPlacement(this.vm.doc, this.activeWire.sourceId);
      }
      this.activeWire = null;
    }
    if (this.rubberbandPath) {
      this.rubberbandPath.style.display = 'none';
      this.rubberbandPath.classList.remove('snapped');
    }
    document
      .querySelectorAll('.snap-target-hover')
      .forEach((el) => el.classList.remove('snap-target-hover'));
    document
      .querySelectorAll('.snap-port-hover')
      .forEach((el) => el.classList.remove('snap-port-hover'));
    this.cancelConnecting();
    this.cancelSubConnecting();
  }

  public closeDropMenu(): void {
    if (this.dropMenuEl) {
      this.dropMenuEl.remove();
      this.dropMenuEl = null;
    }
  }

  public dispose(): void {
    this.closeDropMenu();
    this.cancelActiveWire();
    if (this.connectingBannerEl) {
      this.connectingBannerEl.remove();
      this.connectingBannerEl = null;
    }
  }

  private ensureRubberbandElement(): SVGPathElement {
    const svgEdges = this.deps.getSvgEdges();
    if (!this.rubberbandPath || !this.rubberbandPath.parentNode) {
      const existing = svgEdges.querySelector('#rubberband-wire') as SVGPathElement | null;
      if (existing) {
        this.rubberbandPath = existing;
      } else {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.id = 'rubberband-wire';
        path.setAttribute('class', 'wire-rubberband');
        path.setAttribute('marker-end', 'url(#arrow-focal)');
        svgEdges.appendChild(path);
        this.rubberbandPath = path;
      }
    }
    return this.rubberbandPath;
  }

  private updateRubberbandWire(): void {
    if (!this.activeWire) return;
    const path = this.ensureRubberbandElement();

    let x1 = this.activeWire.startX;
    let y1 = this.activeWire.startY;
    let x2 = this.activeWire.currentX;
    let y2 = this.activeWire.currentY;

    if (this.activeWire.snappedPortPos) {
      x2 = this.activeWire.snappedPortPos.x;
      y2 = this.activeWire.snappedPortPos.y;
      path.classList.add('snapped');
      path.setAttribute('marker-end', 'url(#arrow-active)');
    } else {
      path.classList.remove('snapped');
      path.setAttribute('marker-end', 'url(#arrow-focal)');
    }

    if (this.activeWire.mode === 'main') {
      const condEl = document.getElementById(`node-${this.activeWire.sourceId}`);
      if (condEl) {
        const portEl = condEl.querySelector('.port-out') as HTMLElement | null;
        if (portEl) {
          const pos = this.deps.getPortCanvasPos(portEl);
          x1 = pos.x;
          y1 = pos.y;
        }
      }
    }

    let cx1: number, cy1: number, cx2: number, cy2: number;
    const snapSide = this.activeWire.snappedPortSide;
    const outSide = this.activeWire.sourcePortEl?.dataset.side || (x2 >= x1 ? 'right' : 'left');
    const dx = Math.max(Math.abs(x2 - x1) * 0.45, 40);
    const dy = Math.max(Math.abs(y2 - y1) * 0.45, 35);

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

    if (snapSide === 'top') {
      cx2 = x2;
      cy2 = y2 - dy;
    } else if (snapSide === 'bottom') {
      cx2 = x2;
      cy2 = y2 + dy;
    } else if (snapSide === 'right') {
      cx2 = x2 + dx;
      cy2 = y2;
    } else if (snapSide === 'left') {
      cx2 = x2 - dx;
      cy2 = y2;
    } else if (x2 >= x1) {
      cx2 = x2 - dx;
      cy2 = y2;
    } else {
      cx2 = x2 + dx;
      cy2 = y2;
    }

    path.setAttribute('d', `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`);
    path.style.display = 'block';
  }

  private updateSlidingConditionPort(cPos: { x: number; y: number }): boolean {
    if (
      !this.activeWire ||
      this.activeWire.mode !== 'main' ||
      this.activeWire.reconnectFromTargetId
    ) {
      return false;
    }

    const condId = this.activeWire.sourceId;
    const cond = getCondition(this.vm.doc, condId);
    const condEl = document.getElementById(`node-${condId}`);
    const portEl = this.activeWire.sourcePortEl;

    if (!cond || !condEl || !portEl) return false;

    const condW = condEl.offsetWidth || 180;
    const condH = condEl.offsetHeight || 38;
    const left = cond.x;
    const top = cond.y;
    const right = left + condW;
    const bottom = top + condH;

    const dx = Math.max(left - cPos.x, 0, cPos.x - right);
    const dy = Math.max(top - cPos.y, 0, cPos.y - bottom);
    const distToCard = Math.hypot(dx, dy);

    if (distToCard <= 55) {
      this.activeWire.isSlidingConditionPort = true;

      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      const nx = (cPos.x - cx) / (condW / 2);
      const ny = (cPos.y - cy) / (condH / 2);

      let slideSide: PortSide;
      let slideX: number;
      let slideY: number;
      let slideRatio = 0.5;

      if (Math.abs(nx) >= Math.abs(ny)) {
        if (nx >= 0) {
          slideSide = 'right';
          slideX = right;
          slideY = Math.max(top + 8, Math.min(bottom - 8, cPos.y));
          slideRatio = condH > 16 ? (slideY - top) / condH : 0.5;
        } else {
          slideSide = 'left';
          slideX = left;
          slideY = Math.max(top + 8, Math.min(bottom - 8, cPos.y));
          slideRatio = condH > 16 ? (slideY - top) / condH : 0.5;
        }
      } else {
        if (ny >= 0) {
          slideSide = 'bottom';
          slideX = Math.max(left + 12, Math.min(right - 12, cPos.x));
          slideY = bottom;
          slideRatio = condW > 24 ? (slideX - left) / condW : 0.5;
        } else {
          slideSide = 'top';
          slideX = Math.max(left + 12, Math.min(right - 12, cPos.x));
          slideY = top;
          slideRatio = condW > 24 ? (slideX - left) / condW : 0.5;
        }
      }

      if (slideSide === 'right') {
        portEl.style.left = 'auto';
        portEl.style.right = '-7px';
        portEl.style.top = `${slideY - top}px`;
        portEl.style.bottom = 'auto';
        portEl.style.transform = 'translateY(-50%)';
      } else if (slideSide === 'left') {
        portEl.style.left = '-7px';
        portEl.style.right = 'auto';
        portEl.style.top = `${slideY - top}px`;
        portEl.style.bottom = 'auto';
        portEl.style.transform = 'translateY(-50%)';
      } else if (slideSide === 'top') {
        portEl.style.left = `${slideX - left}px`;
        portEl.style.right = 'auto';
        portEl.style.top = '-7px';
        portEl.style.bottom = 'auto';
        portEl.style.transform = 'translateX(-50%)';
      } else {
        portEl.style.left = `${slideX - left}px`;
        portEl.style.right = 'auto';
        portEl.style.top = 'auto';
        portEl.style.bottom = '-7px';
        portEl.style.transform = 'translateX(-50%)';
      }
      portEl.dataset.side = slideSide;
      portEl.classList.add('port-active');

      this.activeWire.slidingCondSide = slideSide;
      this.activeWire.slidingCondRatio = slideRatio;

      if (this.rubberbandPath) {
        this.rubberbandPath.style.display = 'none';
      }

      this.deps.renderEdges();
      return true;
    }
    this.activeWire.isSlidingConditionPort = false;
    return false;
  }

  private updateSlidingWire(
    clientX: number,
    clientY: number,
    canvasPos: { x: number; y: number }
  ): void {
    if (!this.activeWire || !this.activeWire.reconnectFromTargetId) return;

    const origEvId = this.activeWire.reconnectFromTargetId;
    const origEv = getEvent(this.vm.doc, origEvId);
    const origEl = document.getElementById(`node-${origEvId}`);
    const portEl = this.activeWire.reconnectPortEl;

    if (!origEv || !origEl) {
      this.checkMagnetSnapping(clientX, clientY, canvasPos);
      return;
    }

    const evW = origEl.offsetWidth || 200;
    const evH = origEl.offsetHeight || 38;
    const left = origEv.x;
    const top = origEv.y;
    const right = left + evW;
    const bottom = top + evH;

    const dx = Math.max(left - canvasPos.x, 0, canvasPos.x - right);
    const dy = Math.max(top - canvasPos.y, 0, canvasPos.y - bottom);
    const distToCard = Math.hypot(dx, dy);

    if (distToCard <= 55) {
      document.querySelectorAll('.snap-target-hover').forEach((el) => {
        if (el !== origEl) el.classList.remove('snap-target-hover');
      });
      document.querySelectorAll('.snap-port-hover').forEach((el) => {
        if (el !== portEl) el.classList.remove('snap-port-hover');
      });

      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      const nx = (canvasPos.x - cx) / (evW / 2);
      const ny = (canvasPos.y - cy) / (evH / 2);

      let slideSide: PortSide;
      let slideX: number;
      let slideY: number;

      if (Math.abs(nx) >= Math.abs(ny)) {
        if (nx >= 0) {
          slideSide = 'right';
          slideX = right;
          slideY = Math.max(top + 8, Math.min(bottom - 8, canvasPos.y));
        } else {
          slideSide = 'left';
          slideX = left;
          slideY = Math.max(top + 8, Math.min(bottom - 8, canvasPos.y));
        }
      } else {
        if (ny >= 0) {
          slideSide = 'bottom';
          slideX = Math.max(left + 12, Math.min(right - 12, canvasPos.x));
          slideY = bottom;
        } else {
          slideSide = 'top';
          slideX = Math.max(left + 12, Math.min(right - 12, canvasPos.x));
          slideY = top;
        }
      }

      if (portEl) {
        if (slideSide === 'right') {
          portEl.style.left = 'auto';
          portEl.style.right = '-7px';
          portEl.style.top = `${slideY - top}px`;
          portEl.style.bottom = 'auto';
          portEl.style.transform = 'translateY(-50%)';
        } else if (slideSide === 'left') {
          portEl.style.left = '-7px';
          portEl.style.right = 'auto';
          portEl.style.top = `${slideY - top}px`;
          portEl.style.bottom = 'auto';
          portEl.style.transform = 'translateY(-50%)';
        } else if (slideSide === 'top') {
          portEl.style.left = `${slideX - left}px`;
          portEl.style.right = 'auto';
          portEl.style.top = '-7px';
          portEl.style.bottom = 'auto';
          portEl.style.transform = 'translateX(-50%)';
        } else {
          portEl.style.left = `${slideX - left}px`;
          portEl.style.right = 'auto';
          portEl.style.top = 'auto';
          portEl.style.bottom = '-7px';
          portEl.style.transform = 'translateX(-50%)';
        }
        portEl.dataset.side = slideSide;
        portEl.style.opacity = '1';
        portEl.classList.add('snap-port-hover', 'port-active');
      }

      origEl.classList.add('snap-target-hover');
      this.activeWire.snappedTargetId = origEvId;
      this.activeWire.snappedPortPos = { x: slideX, y: slideY };
      this.activeWire.snappedPortSide = slideSide;
    } else {
      origEl.classList.remove('snap-target-hover');
      if (portEl) {
        portEl.classList.remove('snap-port-hover', 'port-active');
        portEl.style.opacity = '0.35';
      }
      this.checkMagnetSnapping(clientX, clientY, canvasPos);
    }
  }

  private checkMagnetSnapping(
    clientX: number,
    clientY: number,
    canvasPos: { x: number; y: number }
  ): void {
    if (!this.activeWire) return;

    document
      .querySelectorAll('.snap-target-hover')
      .forEach((el) => el.classList.remove('snap-target-hover'));
    document
      .querySelectorAll('.snap-port-hover')
      .forEach((el) => el.classList.remove('snap-port-hover'));

    this.activeWire.snappedTargetId = null;
    this.activeWire.snappedPortPos = null;
    this.activeWire.snappedPortSide = undefined;

    let bestCandidate: {
      id: string;
      portPos: { x: number; y: number };
      el: HTMLElement;
      portIn?: HTMLElement | null;
      side?: PortSide;
      dist: number;
    } | null = null;

    if (this.activeWire.mode === 'main') {
      const doc = this.vm.doc;
      const cond = getCondition(doc, this.activeWire.sourceId);

      for (const ev of doc.events) {
        if (
          this.activeWire.reconnectFromTargetId &&
          ev.id === this.activeWire.reconnectFromTargetId
        ) {
          continue;
        }
        const el = document.getElementById(`node-${ev.id}`);
        if (!el) continue;

        const evW = el.offsetWidth || 200;
        const evH = el.offsetHeight || 38;
        const condX = cond ? cond.x : canvasPos.x;
        const condY = cond ? cond.y : canvasPos.y;
        const side = getEventPortSide(ev.x, ev.y, condX, condY, evW);

        let snapX: number;
        let snapY: number;
        if (side === 'right') {
          snapX = ev.x + evW;
          snapY = Math.max(ev.y + 8, Math.min(ev.y + evH - 8, canvasPos.y));
        } else if (side === 'left') {
          snapX = ev.x;
          snapY = Math.max(ev.y + 8, Math.min(ev.y + evH - 8, canvasPos.y));
        } else if (side === 'top') {
          snapX = Math.max(ev.x + 12, Math.min(ev.x + evW - 12, canvasPos.x));
          snapY = ev.y;
        } else {
          snapX = Math.max(ev.x + 12, Math.min(ev.x + evW - 12, canvasPos.x));
          snapY = ev.y + evH;
        }

        const dist = Math.hypot(canvasPos.x - snapX, canvasPos.y - snapY);
        const rect = el.getBoundingClientRect();
        const isInside =
          clientX >= rect.left - 25 &&
          clientX <= rect.right + 25 &&
          clientY >= rect.top - 20 &&
          clientY <= rect.bottom + 20;

        if (dist < 55 || isInside) {
          if (!bestCandidate || dist < bestCandidate.dist) {
            const existingPort =
              (el.querySelector(
                `.port-in[data-cond-id="${this.activeWire.sourceId}"]`
              ) as HTMLElement | null) || (el.querySelector('.port-in') as HTMLElement | null);
            bestCandidate = {
              id: ev.id,
              portPos: { x: snapX, y: snapY },
              el,
              portIn: existingPort,
              side,
              dist
            };
          }
        }
      }
    } else if (this.activeWire.mode === 'subgraph' && this.vm.session.subGraphEventId) {
      const ev = getEvent(this.vm.doc, this.vm.session.subGraphEventId);
      if (!ev || !ev.actionGraph) return;

      for (const node of ev.actionGraph.nodes) {
        if (node.id === this.activeWire.sourceId || node.type === 'start') continue;
        const el = document.getElementById(`subnode-${node.id}`);
        if (!el) continue;
        const portIn = el.querySelector('.port-in') as HTMLElement | null;
        if (!portIn) continue;

        const portCanvasPos = this.deps.getPortCanvasPos(portIn);
        const dist = Math.hypot(canvasPos.x - portCanvasPos.x, canvasPos.y - portCanvasPos.y);
        const rect = el.getBoundingClientRect();
        const isInside =
          clientX >= rect.left - 15 &&
          clientX <= rect.right + 15 &&
          clientY >= rect.top - 10 &&
          clientY <= rect.bottom + 10;

        if (dist < 40 || isInside) {
          if (!bestCandidate || dist < bestCandidate.dist) {
            bestCandidate = {
              id: node.id,
              portPos: portCanvasPos,
              el,
              portIn,
              side: 'left',
              dist
            };
          }
        }
      }
    }

    if (bestCandidate) {
      this.activeWire.snappedTargetId = bestCandidate.id;
      this.activeWire.snappedPortPos = bestCandidate.portPos;
      this.activeWire.snappedPortSide = bestCandidate.side;
      bestCandidate.el.classList.add('snap-target-hover');
      if (bestCandidate.portIn) {
        bestCandidate.portIn.classList.add('snap-port-hover');
      }
    }
  }

  private querySubSourcePortEl(
    nodeId: string,
    caseId?: string,
    isDefault?: boolean,
    optId?: string
  ): HTMLElement | null {
    const fromEl = document.getElementById(`subnode-${nodeId}`);
    if (!fromEl) return null;
    if (isDefault) {
      return fromEl.querySelector('.port-out[data-default="true"]') as HTMLElement | null;
    }
    if (caseId) {
      return fromEl.querySelector(`.port-out[data-caseid="${caseId}"]`) as HTMLElement | null;
    }
    if (optId) {
      return fromEl.querySelector(`.port-out[data-optid="${optId}"]`) as HTMLElement | null;
    }
    return (
      (fromEl.querySelector('.sub-node-header .port-out') as HTMLElement | null) ||
      (fromEl.querySelector('.port-out') as HTMLElement | null)
    );
  }

  private openDropOnEmptyMenu(
    clientX: number,
    clientY: number,
    canvasPos: { x: number; y: number },
    wire: ActiveWireDrag
  ): void {
    this.closeDropMenu();
    this.deps.closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'wire-drop-menu';
    const clampedX = Math.max(12, Math.min(clientX + 6, window.innerWidth - 250));
    const clampedY = Math.max(12, Math.min(clientY + 6, window.innerHeight - 190));
    menu.style.left = `${clampedX}px`;
    menu.style.top = `${clampedY}px`;

    if (wire.mode === 'main') {
      const cond = getCondition(this.vm.doc, wire.sourceId);
      const condTitle = cond ? cond.title.replace(/^🔍 condition: /, '') : wire.sourceId;
      menu.innerHTML = `
        <div class="wire-drop-header">
          <span>⚡ 从 [${escapeHtml(condTitle)}] 连出</span>
        </div>
        <div class="wire-drop-item" data-action="new-event">
          <span>💬 新建 Event 节点并建立依赖</span>
        </div>
      `;
    } else {
      menu.innerHTML = `
        <div class="wire-drop-header">
          <span>⚡ 连接至新 Action Tree 节点</span>
        </div>
        <div class="wire-drop-item" data-action="new-action">
          <span>🎬 新建 Action 复合动作并连入</span>
        </div>
        <div class="wire-drop-item" data-action="new-selector">
          <span>🔀 新建 Selector 条件分支并连入</span>
        </div>
        <div class="wire-drop-item" data-action="new-choice">
          <span>💬 新建 Choice 玩家选项并连入</span>
        </div>
      `;
    }

    menu.querySelectorAll('.wire-drop-item').forEach((item) => {
      (item as HTMLElement).onclick = (e) => {
        e.stopPropagation();
        const action = (item as HTMLElement).dataset.action;
        const sourceId = wire.sourceId;
        const subSrc: SubGraphPortSource = {
          nodeId: wire.sourceId,
          caseId: wire.caseId,
          isDefault: wire.isDefault,
          optId: wire.optId
        };

        this.closeDropMenu();
        this.cancelActiveWire();

        if (action === 'new-event') {
          const newEv = this.vm.edit.addEvent(canvasPos.x, canvasPos.y, sourceId);
          if (newEv) {
            this.vm.log(
              `✨ 新建 Event [${newEv.title}] 并已建立 Condition [${sourceId}] 依赖`,
              true
            );
            this.deps.pulseNode(newEv.id);
          }
        } else if (
          action === 'new-action' ||
          action === 'new-selector' ||
          action === 'new-choice'
        ) {
          const subGraphEventId = this.vm.session.subGraphEventId;
          if (!subGraphEventId) return;
          const subType =
            action === 'new-action'
              ? 'action'
              : action === 'new-selector'
              ? 'selector'
              : 'choice';
          const newNode = this.vm.edit.addSubNode(
            subGraphEventId,
            subType,
            canvasPos.x,
            canvasPos.y,
            subSrc
          );
          if (newNode) {
            const nodeTitle = 'title' in newNode && newNode.title ? newNode.title : newNode.id;
            this.vm.log(`✨ 新建并连入 Action Tree 节点：[${nodeTitle}]`, true);
            this.deps.pulseNode(newNode.id);
          }
        }
      };
    });

    document.body.appendChild(menu);
    this.dropMenuEl = menu;
  }

  private showClickConnectBanner(wire: ActiveWireDrag): void {
    if (wire.mode === 'main') {
      this.startConnecting(wire.sourceId);
    } else {
      this.startSubConnecting(wire.sourceId, wire.caseId, wire.isDefault, wire.optId);
    }
  }

  private startConnecting(condId: string): void {
    this.connectingCondId = condId;
    const cond = getCondition(this.vm.doc, condId);
    const title = cond ? cond.title.replace(/^🔍 condition: /, '') : condId;
    if (!this.connectingBannerEl) {
      this.connectingBannerEl = document.createElement('div');
      this.connectingBannerEl.className = 'connecting-banner';
      this.deps.getViewport().appendChild(this.connectingBannerEl);
    }
    this.connectingBannerEl.innerHTML = `
      <span>🔗 正在为 Condition [<b>${escapeHtml(title)}</b>] 建立依赖连线 ➔ 请点击目标 Event 节点完成依赖声明</span>
      <button id="btnCancelConnect" style="background:#334155; border:none; color:#f8fafc; border-radius:4px; padding:2px 8px; font-size:11px; cursor:pointer;">取消 (ESC)</button>
    `;
    this.connectingBannerEl.style.display = 'flex';
    this.connectingBannerEl.querySelector('#btnCancelConnect')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancelActiveWire();
    });
  }

  private cancelConnecting(): void {
    this.connectingCondId = null;
    if (this.connectingBannerEl) {
      this.connectingBannerEl.style.display = 'none';
    }
  }

  private startSubConnecting(
    sourceNodeId: string,
    caseId?: string,
    isDefault?: boolean,
    optId?: string
  ): void {
    this.subConnectingSource = { nodeId: sourceNodeId, caseId, isDefault, optId };
    const eventId = this.vm.session.subGraphEventId;
    const ev = eventId ? getEvent(this.vm.doc, eventId) : null;
    const node = ev?.actionGraph?.nodes.find((n) => n.id === sourceNodeId);
    let title = node ? ('title' in node ? node.title : node.id) : sourceNodeId;
    if (caseId && node?.type === 'selector') {
      const c = node.cases.find((x) => x.id === caseId);
      if (c) title += ` ➔ 分支「${c.title}」`;
    } else if (isDefault) {
      title += ` ➔ Default (保底)`;
    } else if (optId && node?.type === 'choice') {
      const o = node.options.find((x) => x.id === optId);
      if (o) title += ` ➔ 选项「${o.text}」`;
    }

    if (!this.connectingBannerEl) {
      this.connectingBannerEl = document.createElement('div');
      this.connectingBannerEl.className = 'connecting-banner';
      this.deps.getViewport().appendChild(this.connectingBannerEl);
    }
    this.connectingBannerEl.innerHTML = `
      <span>🔗 正在连线：<b>${escapeHtml(title)}</b> ➔ 请点击目标节点的 In 端点完成连接</span>
      <button id="btnCancelConnect" style="background:#334155; border:none; color:#f8fafc; border-radius:4px; padding:2px 8px; font-size:11px; cursor:pointer;">取消 (ESC)</button>
    `;
    this.connectingBannerEl.style.display = 'flex';
    this.connectingBannerEl.querySelector('#btnCancelConnect')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancelActiveWire();
    });
  }

  private cancelSubConnecting(): void {
    this.subConnectingSource = null;
    if (this.connectingBannerEl) {
      this.connectingBannerEl.style.display = 'none';
    }
  }
}
