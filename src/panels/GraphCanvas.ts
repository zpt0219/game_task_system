import { EventDef, ProjectData, WorldState } from '../core/types';
import { project, ChangeSource } from '../core/project';
import { appState } from '../core/state';
import { evalTrigger, matchBranch, runEvent } from '../core/engine';
import { mainGraphEdges, varWriters, varReaders } from '../core/graph';
import { RpgDialog } from './RpgDialog';

interface LayoutPos {
  x: number;
  y: number;
}

export class GraphCanvas {
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
  private nodeInitX = 0;
  private nodeInitY = 0;

  private viewMode: 'main' | 'focal' = 'main';
  private focalVarKey: string | null = null;
  private focalPositions: Record<string, LayoutPos> = {};

  private contextMenuEl: HTMLElement | null = null;
  private connectingTrigId: string | null = null;
  private connectingBannerEl: HTMLElement | null = null;

  constructor(private dialog: RpgDialog) {
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

    this.bindViewportEvents();
    this.bindFocalBannerEvents();
    this.bindContextMenu();

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.connectingTrigId) {
        this.cancelConnecting();
      }
    });
    this.viewport.addEventListener('click', () => {
      if (this.connectingTrigId) {
        this.cancelConnecting();
      }
    });

    project.onChange((source) => this.handleProjectChange(source));
    appState.onStateChange((state) => this.renderState(state));
    appState.onModeChange(() => this.updateModeClass());
    appState.onSelectionChange(() => this.updateSelectionHighlight());
    appState.onFocalChange((key) => {
      if (key) {
        this.showFocalGraph(key);
      } else {
        this.showMainGraph();
      }
    });

    this.updateTransform();
    this.rebuildDOM();
  }

  // ------------------------------------------------------------------ 视图模式切换

  public showMainGraph(): void {
    this.viewMode = 'main';
    this.focalVarKey = null;
    this.focalBanner.classList.add('hidden');
    this.rebuildDOM();
    this.renderState(appState.getState());
  }

  public showFocalGraph(varKey: string): void {
    const v = project.getVar(varKey);
    if (!v) return;
    this.viewMode = 'focal';
    this.focalVarKey = varKey;
    this.focalBanner.classList.remove('hidden');
    this.rebuildFocalDOM(varKey);
    this.centerFocalView();
    this.renderState(appState.getState());
  }

  private centerFocalView(): void {
    const vW = this.viewport.clientWidth;
    const vH = this.viewport.clientHeight;
    this.panX = Math.round(vW / 2 - 480);
    this.panY = Math.round(vH / 2 - 220);
    this.zoom = 1.0;
    this.updateTransform();
  }

  // ------------------------------------------------------------------ 项目变更响应

  private handleProjectChange(source: ChangeSource): void {
    if (source === 'drag') {
      this.renderEdges(appState.getState());
      return;
    }
    if (this.viewMode === 'focal' && this.focalVarKey) {
      this.rebuildFocalDOM(this.focalVarKey);
    } else {
      this.rebuildDOM();
    }
    this.renderState(appState.getState());
  }

  // ------------------------------------------------------------------ DOM 重建 (Main)

  public rebuildDOM(): void {
    this.nodesContainer.innerHTML = '';
    const p = project.get();

    // 1. Trigger 节点
    p.triggers.forEach((trig) => {
      const el = document.createElement('div');
      el.id = `node-${trig.id}`;
      el.className = 'graph-node condition-node trigger-node compact-node';
      el.dataset.id = trig.id;
      el.dataset.kind = 'trigger';
      el.style.left = `${trig.x}px`;
      el.style.top = `${trig.y}px`;
      el.innerHTML = `
        <div class="cond-status-led"></div>
        <div class="node-title">${this.escape(trig.title)}</div>
        <div class="node-port port-out" data-tid="${trig.id}" title="点击此端点，再点击 Event 可建立连入关系"></div>
      `;
      el.querySelector('.port-out')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.startConnecting(trig.id);
      });
      this.attachNodeInteraction(el, 'trigger', trig.id);
      this.nodesContainer.appendChild(el);
    });

    // 2. Event 节点
    p.events.forEach((ev) => {
      const el = document.createElement('div');
      el.id = `node-${ev.id}`;
      el.className = 'graph-node event-node compact-node';
      el.dataset.id = ev.id;
      el.dataset.kind = 'event';
      el.style.left = `${ev.x}px`;
      el.style.top = `${ev.y}px`;
      el.innerHTML = `
        <div class="node-port port-in" data-eid="${ev.id}" title="Trigger 连入端点"></div>
        <div class="event-status-dot status-dot"></div>
        <div class="node-title">${this.escape(ev.title)}</div>
        <span class="event-status-pill status-pill"></span>
      `;
      el.querySelector('.port-in')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.connectingTrigId) {
          this.completeConnecting(ev.id);
        }
      });
      this.attachNodeInteraction(el, 'event', ev.id);
      this.nodesContainer.appendChild(el);
    });

    this.renderEdges(appState.getState());
    this.updateSelectionHighlight();
  }

  // ------------------------------------------------------------------ DOM 重建 (Focal)

  private rebuildFocalDOM(varKey: string): void {
    this.nodesContainer.innerHTML = '';
    this.focalPositions = {};
    const p = project.get();
    const v = project.getVar(varKey);
    if (!v) return;

    const writers = varWriters(p, varKey);
    // 核心原则：如果一个 Event 既写又读（如国王），保留在左侧顶层，不在右侧重复！
    const rawReaders = varReaders(p, varKey);
    const readers = rawReaders.filter((r) => !writers.some((w) => w.id === r.id));

    const maxRows = Math.max(1, writers.length, readers.length);
    const centerY = Math.max(180, 100 + (maxRows - 1) * 60);

    // 1. 中间焦点实体
    const focalId = `focal_${varKey}`;
    const focalX = 480;
    const focalY = centerY;
    this.focalPositions[focalId] = { x: focalX, y: focalY };

    const focalEl = document.createElement('div');
    focalEl.id = `node-${focalId}`;
    focalEl.className = 'graph-node condition-node compact-node focal-center-node';
    focalEl.dataset.id = focalId;
    focalEl.dataset.kind = 'var';
    focalEl.style.left = `${focalX}px`;
    focalEl.style.top = `${focalY}px`;
    focalEl.innerHTML = `
      <div class="cond-status-led"></div>
      <div class="node-title">${v.icon} ${this.escape(v.label)} (${v.key})</div>
    `;
    focalEl.onclick = (e) => {
      e.stopPropagation();
      appState.select({ kind: 'var', id: varKey });
    };
    this.nodesContainer.appendChild(focalEl);

    // 2. 左侧来源节点 (Writers)
    if (writers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'focal-placeholder-card';
      empty.style.left = '80px';
      empty.style.top = `${centerY}px`;
      empty.textContent = 'ℹ️ 初始固有 / 无直接改写此项的 Event';
      this.nodesContainer.appendChild(empty);
    } else {
      const startY = centerY - ((writers.length - 1) * 120) / 2;
      writers.forEach((ev, idx) => {
        const x = 80;
        const y = startY + idx * 120;
        this.focalPositions[ev.id] = { x, y };
        const el = this.createFocalEventElement(ev, x, y);
        this.nodesContainer.appendChild(el);
      });
    }

    // 3. 右侧依赖节点 (Readers)
    if (readers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'focal-placeholder-card';
      empty.style.left = '880px';
      empty.style.top = `${centerY}px`;
      empty.textContent = 'ℹ️ 终端状态 / 无后续依赖此项的 Event';
      this.nodesContainer.appendChild(empty);
    } else {
      const startY = centerY - ((readers.length - 1) * 120) / 2;
      readers.forEach((ev, idx) => {
        const x = 880;
        const y = startY + idx * 120;
        this.focalPositions[ev.id] = { x, y };
        const el = this.createFocalEventElement(ev, x, y);
        this.nodesContainer.appendChild(el);
      });
    }

    this.renderEdges(appState.getState());
    this.updateSelectionHighlight();
  }

  private createFocalEventElement(ev: EventDef, x: number, y: number): HTMLElement {
    const el = document.createElement('div');
    el.id = `node-${ev.id}`;
    el.className = 'graph-node event-node compact-node';
    el.dataset.id = ev.id;
    el.dataset.kind = 'event';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.innerHTML = `
      <div class="event-status-dot status-dot"></div>
      <div class="node-title">${this.escape(ev.title)}</div>
      <span class="event-status-pill status-pill"></span>
    `;
    this.attachNodeInteraction(el, 'event', ev.id);
    return el;
  }

  // ------------------------------------------------------------------ 节点交互 (拖拽 / 点击 / 双击试玩)

  private attachNodeInteraction(el: HTMLElement, kind: 'event' | 'trigger', id: string): void {
    let hasMoved = false;

    el.onmousedown = (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      hasMoved = false;
      this.draggingNodeId = id;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      const pos = this.getNodePos(id);
      this.nodeInitX = pos.x;
      this.nodeInitY = pos.y;
    };

    window.addEventListener('mousemove', (e) => {
      if (this.draggingNodeId !== id) return;
      const dx = (e.clientX - this.dragStartX) / this.zoom;
      const dy = (e.clientY - this.dragStartY) / this.zoom;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMoved = true;
      }
      const newX = Math.round(this.nodeInitX + dx);
      const newY = Math.round(this.nodeInitY + dy);

      if (this.viewMode === 'focal') {
        this.focalPositions[id] = { x: newX, y: newY };
      } else {
        project.change(
          (d) => {
            const node = kind === 'event' ? d.events.find((x) => x.id === id) : d.triggers.find((x) => x.id === id);
            if (node) {
              node.x = newX;
              node.y = newY;
            }
          },
          'drag',
          `drag_${id}`
        );
      }

      el.style.left = `${newX}px`;
      el.style.top = `${newY}px`;
      this.renderEdges(appState.getState());
    });

    window.addEventListener('mouseup', () => {
      if (this.draggingNodeId === id) {
        this.draggingNodeId = null;
      }
    });

    el.onclick = (e) => {
      e.stopPropagation();
      if (hasMoved) return;

      if (this.connectingTrigId && kind === 'event') {
        this.completeConnecting(id);
        return;
      }

      appState.select({ kind, id });

      // Play 模式下，点击 Event 直接触发执行
      if (appState.getMode() === 'play' && kind === 'event') {
        this.playEvent(id);
      }
    };

    // 双击始终触发试玩（哪怕在编辑模式下也能快速测试）
    el.ondblclick = (e) => {
      e.stopPropagation();
      if (kind === 'event') {
        this.playEvent(id);
      }
    };
  }

  public playEvent(id: string): void {
    const ev = project.getEvent(id);
    if (!ev) return;
    runEvent(
      {
        project: project.get(),
        getState: () => appState.getState(),
        mutate: (fn) => appState.mutate(fn),
        showDialog: (cfg) => this.dialog.show(cfg),
        log: (msg, hl) => appState.log(msg, hl)
      },
      ev
    );
  }

  // ------------------------------------------------------------------ 连线交互
  private startConnecting(trigId: string): void {
    this.connectingTrigId = trigId;
    const trig = project.getTrigger(trigId);
    const title = trig ? trig.title.replace('⚡ trigger: ', '') : trigId;
    if (!this.connectingBannerEl) {
      this.connectingBannerEl = document.createElement('div');
      this.connectingBannerEl.className = 'connecting-banner';
      this.viewport.appendChild(this.connectingBannerEl);
    }
    this.connectingBannerEl.innerHTML = `
      <span>🔗 正在连线：<b>${this.escape(title)}</b> ➔ 请点击目标 Event 节点完成连入</span>
      <button id="btnCancelConnect" style="background:#334155; border:none; color:#f8fafc; border-radius:4px; padding:2px 8px; font-size:11px; cursor:pointer;">取消 (ESC)</button>
    `;
    this.connectingBannerEl.style.display = 'flex';
    this.connectingBannerEl.querySelector('#btnCancelConnect')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancelConnecting();
    });
  }

  private cancelConnecting(): void {
    this.connectingTrigId = null;
    if (this.connectingBannerEl) {
      this.connectingBannerEl.style.display = 'none';
    }
  }

  private completeConnecting(evId: string): void {
    const chosenTrigId = this.connectingTrigId;
    this.cancelConnecting();
    if (!chosenTrigId) return;

    project.change((d) => {
      const targetEv = d.events.find((x) => x.id === evId);
      if (targetEv) {
        if (!targetEv.incomingTriggers) {
          targetEv.incomingTriggers = Array.from(new Set(targetEv.branches.flatMap((b) => b.when)));
        }
        if (!targetEv.incomingTriggers.includes(chosenTrigId)) {
          targetEv.incomingTriggers.push(chosenTrigId);
        }
      }
    }, 'structure');
    appState.log(`已建立连入关系：${chosenTrigId} ➔ ${evId}`, true);
  }

  private getNodePos(id: string): LayoutPos {
    if (this.viewMode === 'focal' && this.focalPositions[id]) {
      return this.focalPositions[id];
    }
    const ev = project.getEvent(id);
    if (ev) return { x: ev.x, y: ev.y };
    const tr = project.getTrigger(id);
    if (tr) return { x: tr.x, y: tr.y };
    return { x: 0, y: 0 };
  }

  // ------------------------------------------------------------------ 状态渲染

  public renderState(state: WorldState): void {
    const p = project.get();

    // 1. Trigger 状态
    p.triggers.forEach((trig) => {
      const el = document.getElementById(`node-${trig.id}`);
      if (!el) return;
      const ok = evalTrigger(p, state, trig);
      el.classList.toggle('satisfied', ok);
      el.classList.toggle('unsatisfied', !ok);
    });

    // 2. Event 状态（根据当前匹配到的分支展示 status pill）
    p.events.forEach((ev) => {
      const el = document.getElementById(`node-${ev.id}`);
      if (!el) return;
      const pill = el.querySelector('.status-pill') as HTMLElement | null;
      const branch = matchBranch(p, state, ev);
      const title = branch ? branch.title : '无匹配分支';

      if (pill) {
        pill.textContent = title;
        pill.className = 'event-status-pill status-pill';
        if (!branch) {
          pill.classList.add('status-red');
        } else if (title.includes('拦截') || title.includes('提醒') || title.includes('远眺')) {
          pill.classList.add('status-amber');
        } else if (title.includes('已') || title.includes('通') || title.includes('常驻')) {
          pill.classList.add('status-blue');
        } else {
          pill.classList.add('status-green');
        }
      }
      el.classList.toggle('available', !!branch);
      el.classList.toggle('locked', !branch);
    });

    // 3. Focal 模式下更新 Banner
    if (this.viewMode === 'focal' && this.focalVarKey) {
      const v = project.getVar(this.focalVarKey);
      if (v) {
        this.focalTitle.textContent = `${v.icon} ${v.label} (${v.key})`;
        const val = state[v.key];
        const isTrue = val === true || (typeof val === 'number' && val > 0) || val === 'active';
        this.focalStatusPill.className = `focal-status-pill status-pill ${isTrue ? 'status-green' : 'status-grey'}`;
        this.focalStatusPill.textContent = `● 当前值：${val === undefined ? '∅' : String(val)}`;

        const writers = varWriters(p, this.focalVarKey);
        const readers = varReaders(p, this.focalVarKey);
        this.focalSourcesCount.textContent = `📥 ${writers.length} 个来源 Event`;
        this.focalTargetsCount.textContent = `📤 ${readers.length} 个影响 Event`;
      }
    }

    this.renderEdges(state);
  }

  // ------------------------------------------------------------------ 连线渲染 (根据两大节点模型推导)

  public renderEdges(state: WorldState): void {
    this.svgEdges.innerHTML = '';
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
    this.svgEdges.appendChild(defs);

    const p = project.get();
    const sel = appState.getSelection();

    if (this.viewMode === 'focal' && this.focalVarKey) {
      this.renderFocalEdges(p, state, sel);
    } else {
      this.renderMainEdges(p, state, sel);
    }
  }

  /** 顶层大图：清一色 Trigger ➔ Event */
  private renderMainEdges(p: ProjectData, state: WorldState, sel: ReturnType<typeof appState.getSelection>): void {
    const edges = mainGraphEdges(p);

    edges.forEach((edge) => {
      const fromEl = document.getElementById(`node-${edge.from}`);
      const toEl = document.getElementById(`node-${edge.to}`);
      if (!fromEl || !toEl) return;

      const trig = project.getTrigger(edge.from);
      const ev = project.getEvent(edge.to);
      if (!trig || !ev) return;

      const posFrom = { x: trig.x, y: trig.y };
      const posTo = { x: ev.x, y: ev.y };
      const fromW = fromEl.offsetWidth || 180;
      const fromH = fromEl.offsetHeight || 38;
      const toW = toEl.offsetWidth || 200;
      const toH = toEl.offsetHeight || 38;

      const trigActive = evalTrigger(p, state, trig);
      const isSelected =
        sel &&
        ((sel.kind === 'trigger' && sel.id === edge.from) || (sel.kind === 'event' && sel.id === edge.to));

      let x1: number, y1: number, x2: number, y2: number;
      let cx1: number, cy1: number, cx2: number, cy2: number;

      // 判断相对方位
      if (posFrom.x + fromW <= posTo.x + 10) {
        // Trigger 在左，Event 在右：常规流向
        x1 = posFrom.x + fromW;
        y1 = posFrom.y + fromH * 0.5;
        x2 = posTo.x - 3;
        y2 = posTo.y + toH * 0.5;
        const dx = Math.max(Math.abs(x2 - x1) * 0.45, 40);
        cx1 = x1 + dx;
        cy1 = y1;
        cx2 = x2 - dx;
        cy2 = y2;
      } else if (posFrom.x >= posTo.x + toW - 10) {
        // Trigger 在右，Event 在左：外部依赖反向回指（如 trigger ➔ 国王）
        x1 = posFrom.x;
        y1 = posFrom.y + fromH * 0.5;
        x2 = posTo.x + toW + 3;
        y2 = posTo.y + toH * 0.5;
        const dx = Math.max(Math.abs(x2 - x1) * 0.45, 40);
        // 如果高度差较大，优雅弧线绕回；水平对齐则平直指向
        const dy = posTo.y - posFrom.y;
        cx1 = x1 - dx;
        cy1 = y1 + dy * 0.2;
        cx2 = x2 + dx;
        cy2 = y2 - dy * 0.2;
      } else {
        // 上下排列
        x1 = posFrom.x + fromW / 2;
        y1 = posFrom.y + (posFrom.y < posTo.y ? fromH : 0);
        x2 = posTo.x + toW / 2;
        y2 = posTo.y + (posFrom.y < posTo.y ? -3 : toH + 3);
        const dy = Math.max(Math.abs(y2 - y1) * 0.45, 30);
        cx1 = x1;
        cy1 = y1 + (posFrom.y < posTo.y ? dy : -dy);
        cx2 = x2;
        cy2 = y2 + (posFrom.y < posTo.y ? -dy : dy);
      }

      this.drawSvgPath({
        d: `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`,
        active: trigActive,
        highlight: !!isSelected,
        title: `${trig.title} ➔ 改变行为：${ev.title} (点击可断开连线)`,
        onClick: (e) => {
          e.stopPropagation();
          project.change((d) => {
            const targetEv = d.events.find((x) => x.id === edge.to);
            if (targetEv) {
              const incoming =
                targetEv.incomingTriggers ?? Array.from(new Set(targetEv.branches.flatMap((b) => b.when)));
              targetEv.incomingTriggers = incoming.filter((t) => t !== edge.from);
              targetEv.branches.forEach((b) => {
                b.when = b.when.filter((w) => w !== edge.from);
              });
            }
          }, 'structure');
          appState.log(`✂️ 已断开连线：${trig.title} ➔ ${ev.title}（Ctrl+Z 可撤销）`, true);
        }
      });
    });
  }

  /** 专属图连线：左侧 Event ➔ 中心变量；中心变量 ➔ 右侧 Event */
  private renderFocalEdges(p: ProjectData, _state: WorldState, sel: ReturnType<typeof appState.getSelection>): void {
    if (!this.focalVarKey) return;
    const focalId = `focal_${this.focalVarKey}`;
    const focalEl = document.getElementById(`node-${focalId}`);
    if (!focalEl) return;

    const writers = varWriters(p, this.focalVarKey);
    const rawReaders = varReaders(p, this.focalVarKey);
    const readers = rawReaders.filter((r) => !writers.some((w) => w.id === r.id));
    const bothWriterAndReader = writers.filter((w) => rawReaders.some((r) => r.id === w.id));

    const focalPos = this.focalPositions[focalId];
    const focalW = focalEl.offsetWidth || 220;
    const focalH = focalEl.offsetHeight || 38;

    // 1. 入边：Event ➔ 中心变量
    writers.forEach((ev) => {
      const evEl = document.getElementById(`node-${ev.id}`);
      const evPos = this.focalPositions[ev.id];
      if (!evEl || !evPos) return;

      const isBoth = bothWriterAndReader.some((b) => b.id === ev.id);
      const evW = evEl.offsetWidth || 200;
      const evH = evEl.offsetHeight || 38;

      // 入边（上拱）
      const x1 = evPos.x + evW;
      const y1 = evPos.y + evH * (isBoth ? 0.35 : 0.5);
      const x2 = focalPos.x - 3;
      const y2 = focalPos.y + focalH * (isBoth ? 0.35 : 0.5);
      const dx = Math.max(Math.abs(x2 - x1) * 0.45, 40);
      const arch = isBoth ? -26 : 0;

      this.drawSvgPath({
        d: `M ${x1} ${y1} C ${x1 + dx} ${y1 + arch}, ${x2 - dx} ${y2 + arch}, ${x2} ${y2}`,
        active: true,
        highlight: sel?.id === ev.id || sel?.id === this.focalVarKey,
        effect: true,
        title: `【入边】${ev.title} 改变了 ${this.focalVarKey}`
      });

      // 如果既是 Writer 又是 Reader：绘制下拱回指线（变量 ➔ Event）
      if (isBoth) {
        const bx1 = focalPos.x;
        const by1 = focalPos.y + focalH * 0.65;
        const bx2 = evPos.x + evW + 3;
        const by2 = evPos.y + evH * 0.65;
        const bdx = Math.max(Math.abs(bx2 - bx1) * 0.45, 40);

        this.drawSvgPath({
          d: `M ${bx1} ${by1} C ${bx1 - bdx} ${by1 + 26}, ${bx2 + bdx} ${by2 + 26}, ${bx2} ${by2}`,
          active: true,
          highlight: sel?.id === ev.id || sel?.id === this.focalVarKey,
          title: `【出边】${this.focalVarKey} 影响了 ${ev.title}`
        });
      }
    });

    // 2. 出边：中心变量 ➔ 右侧 Event
    readers.forEach((ev) => {
      const evEl = document.getElementById(`node-${ev.id}`);
      const evPos = this.focalPositions[ev.id];
      if (!evEl || !evPos) return;

      const x1 = focalPos.x + focalW;
      const y1 = focalPos.y + focalH * 0.5;
      const x2 = evPos.x - 3;
      const y2 = evPos.y + (evEl.offsetHeight || 38) * 0.5;
      const dx = Math.max(Math.abs(x2 - x1) * 0.45, 40);

      this.drawSvgPath({
        d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
        active: true,
        highlight: sel?.id === ev.id || sel?.id === this.focalVarKey,
        title: `【出边】${this.focalVarKey} 影响了 ${ev.title}`
      });
    });
  }

  private drawSvgPath(opts: {
    d: string;
    active: boolean;
    highlight: boolean;
    effect?: boolean;
    title: string;
    onClick?: (e: MouseEvent) => void;
  }): void {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', opts.d);

    let cls = 'edge-path';
    if (opts.effect) cls += ' effect';
    cls += opts.active ? ' active' : ' inactive';
    if (opts.highlight) cls += ' focal-edge';
    path.setAttribute('class', cls);

    const marker = opts.highlight ? 'arrow-focal' : opts.active ? (opts.effect ? 'arrow-effect' : 'arrow-active') : 'arrow-inactive';
    path.setAttribute('marker-end', `url(#${marker})`);

    if (opts.onClick) {
      path.style.cursor = 'pointer';
      path.onclick = opts.onClick;
    }

    const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    titleEl.textContent = opts.title;
    path.appendChild(titleEl);

    this.svgEdges.appendChild(path);
  }

  // ------------------------------------------------------------------ 选中高亮

  public updateSelectionHighlight(): void {
    const sel = appState.getSelection();
    document.querySelectorAll('.graph-node').forEach((el) => {
      const id = (el as HTMLElement).dataset.id;
      const isSel = sel && sel.id === id;
      el.classList.toggle('selected', !!isSel);
    });
    this.renderEdges(appState.getState());
  }

  private updateModeClass(): void {
    const isEdit = appState.getMode() === 'edit';
    this.viewport.classList.toggle('mode-edit', isEdit);
    this.viewport.classList.toggle('mode-play', !isEdit);
  }

  // ------------------------------------------------------------------ 布局控制

  public resetLayout(): void {
    // 恢复标准三栏布局
    let evLeftIdx = 0;
    let evRightIdx = 0;
    let trigIdx = 0;

    project.change((d) => {
      d.triggers.forEach((t) => {
        t.x = 460;
        t.y = 100 + trigIdx * 140;
        trigIdx++;
      });
      d.events.forEach((e) => {
        // 判断放在左栏还是右栏：被 trigger 控制的放右栏，起始 source 放左栏
        const hasInputs = e.branches.some((b) => b.when.length > 0);
        if (hasInputs) {
          e.x = 860;
          e.y = 120 + evRightIdx * 120;
          evRightIdx++;
        } else {
          e.x = 60;
          e.y = 100 + evLeftIdx * 130;
          evLeftIdx++;
        }
      });
    }, 'structure');

    this.panX = 40;
    this.panY = 20;
    this.zoom = 0.95;
    this.updateTransform();
  }

  public updateNodeAppearance(id: string): void {
    const el = document.getElementById(`node-${id}`);
    if (!el) return;
    const ev = project.getEvent(id);
    const tr = project.getTrigger(id);
    const titleEl = el.querySelector('.node-title');
    if (titleEl) {
      if (ev) titleEl.textContent = ev.title;
      if (tr) titleEl.textContent = tr.title;
    }
  }

  // ------------------------------------------------------------------ 坐标转换与拖拽生成支持

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

  public setDragOverState(active: boolean): void {
    this.viewport.classList.toggle('canvas-drag-receiving', active);
  }

  public pulseNode(id: string): void {
    requestAnimationFrame(() => {
      const el = document.getElementById(`node-${id}`);
      if (!el) return;
      el.classList.remove('node-spawn-pulse');
      void el.offsetWidth;
      el.classList.add('node-spawn-pulse');
      setTimeout(() => {
        el.classList.remove('node-spawn-pulse');
      }, 1000);
    });
  }

  public isFocalView(): boolean {
    return this.viewMode === 'focal';
  }

  public createNodeAt(type: 'event' | 'trigger', canvasX: number, canvasY: number): string {
    if (this.viewMode === 'focal') {
      this.showMainGraph();
    }
    if (appState.getMode() !== 'edit') {
      appState.setMode('edit');
    }

    if (type === 'event') {
      const ev = project.addEvent(canvasX, canvasY);
      appState.select({ kind: 'event', id: ev.id });
      appState.log(`💬 拖拽生成 Event 任务节点：[${ev.title}] (坐标: ${canvasX}, ${canvasY})`, true);
      this.pulseNode(ev.id);
      return ev.id;
    } else {
      const tr = project.addTrigger(canvasX, canvasY);
      appState.select({ kind: 'trigger', id: tr.id });
      appState.log(`⚡ 拖拽生成 Trigger 条件判断器：[${tr.title}] (坐标: ${canvasX}, ${canvasY})`, true);
      this.pulseNode(tr.id);
      return tr.id;
    }
  }

  public createNodeAtCenter(type: 'event' | 'trigger'): string {
    const center = this.getViewportCenterCanvasPos();
    const p = project.get();
    const count = type === 'event' ? p.events.length : p.triggers.length;
    const stagger = (count % 8) * 16;
    const x = Math.round(center.x - 70 + stagger);
    const y = Math.round(center.y - 18 + stagger);
    return this.createNodeAt(type, x, y);
  }

  // ------------------------------------------------------------------ 画布事件 & 视口缩放平移

  private updateTransform(): void {
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  private bindViewportEvents(): void {
    this.viewport.onmousedown = (e) => {
      // 允许左键空白区或中键平移
      if (e.button !== 0 && e.button !== 1) return;
      this.isPanning = true;
      this.hasMovedPanning = false;
      this.startPanX = e.clientX - this.panX;
      this.startPanY = e.clientY - this.panY;
      this.closeContextMenu();
    };

    window.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      const dx = Math.abs(e.clientX - (this.startPanX + this.panX));
      const dy = Math.abs(e.clientY - (this.startPanY + this.panY));
      if (dx > 3 || dy > 3) this.hasMovedPanning = true;
      this.panX = e.clientX - this.startPanX;
      this.panY = e.clientY - this.startPanY;
      this.updateTransform();
    });

    window.addEventListener('mouseup', () => {
      this.isPanning = false;
    });

    this.viewport.onclick = (e) => {
      if (this.hasMovedPanning) return;
      if (
        e.target === this.viewport ||
        e.target === this.canvas ||
        e.target === this.svgEdges ||
        e.target === this.nodesContainer
      ) {
        appState.select(null);
        this.closeContextMenu();
      }
    };

    this.viewport.addEventListener('wheel', (e) => {
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
    });
  }

  private bindFocalBannerEvents(): void {
    this.btnBackToMain.onclick = () => {
      appState.setFocalVar(null);
    };
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.viewMode === 'focal') {
        appState.setFocalVar(null);
      }
    });
  }

  // ------------------------------------------------------------------ 右键菜单（添加节点）

  private bindContextMenu(): void {
    this.viewport.oncontextmenu = (e) => {
      e.preventDefault();
      const rect = this.viewport.getBoundingClientRect();
      const screenX = e.clientX;
      const screenY = e.clientY;

      // 转换为画布内逻辑坐标
      const canvasX = Math.round((screenX - rect.left - this.panX) / this.zoom);
      const canvasY = Math.round((screenY - rect.top - this.panY) / this.zoom);

      this.openContextMenu(screenX, screenY, canvasX, canvasY);
    };

    window.addEventListener('click', () => this.closeContextMenu());
  }

  private openContextMenu(sx: number, sy: number, cx: number, cy: number): void {
    this.closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'graph-context-menu';
    menu.style.left = `${sx}px`;
    menu.style.top = `${sy}px`;

    menu.innerHTML = `
      <div class="ctx-item" data-action="add-event">💬 新建 Event 对话/事件节点</div>
      <div class="ctx-item" data-action="add-trigger">⚡ 新建 Trigger 条件判断器</div>
      <div class="ctx-divider"></div>
      <div class="ctx-item" data-action="reset-layout">📐 恢复标准排列布局</div>
    `;

    menu.querySelectorAll('.ctx-item').forEach((item) => {
      (item as HTMLElement).onclick = (e) => {
        e.stopPropagation();
        const action = (item as HTMLElement).dataset.action;
        this.closeContextMenu();
        if (action === 'add-event') {
          const ev = project.addEvent(cx, cy);
          appState.select({ kind: 'event', id: ev.id });
          appState.log(`✨ 新建 Event 节点：[${ev.title}]`, true);
        } else if (action === 'add-trigger') {
          const tr = project.addTrigger(cx, cy);
          appState.select({ kind: 'trigger', id: tr.id });
          appState.log(`✨ 新建 Trigger 节点：[${tr.title}]`, true);
        } else if (action === 'reset-layout') {
          this.resetLayout();
          appState.log('📐 已恢复标准任务布局！', true);
        }
      };
    });

    document.body.appendChild(menu);
    this.contextMenuEl = menu;
  }

  private closeContextMenu(): void {
    if (this.contextMenuEl) {
      this.contextMenuEl.remove();
      this.contextMenuEl = null;
    }
  }

  private escape(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
  }
}
