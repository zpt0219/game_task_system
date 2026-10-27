import {
  EventDef,
  ProjectData,
  WorldState,
  ConditionDef,
  ActionGraphNodeUnion
} from '../core/types';
import { project, ChangeSource } from '../core/project';
import { appState } from '../core/state';
import { evalCondition, getEventStatus, runEvent } from '../core/engine';
import { mainGraphEdges, varWriters, varReaders } from '../core/graph';
import { RpgDialog } from './RpgDialog';

interface LayoutPos {
  x: number;
  y: number;
}

interface ActiveWireDrag {
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

  private viewMode: 'main' | 'focal' | 'subgraph' = 'main';
  private focalVarKey: string | null = null;
  private focalPositions: Record<string, LayoutPos> = {};
  private subGraphEventId: string | null = null;
  private subConnectingSource: {
    nodeId: string;
    caseId?: string;
    isDefault?: boolean;
    optId?: string;
  } | null = null;

  private subGraphBanner: HTMLElement;
  private btnBackFromSubGraph: HTMLElement;
  private btnLayoutSubGraph: HTMLElement | null;
  private subGraphTitle: HTMLElement;
  private subGraphNodesCount: HTMLElement;
  private btnPlayCurrentSubGraph: HTMLElement;

  private contextMenuEl: HTMLElement | null = null;
  private connectingCondId: string | null = null;
  private connectingBannerEl: HTMLElement | null = null;

  // ComfyUI 拖拽飞线与智能磁吸状态
  private activeWire: ActiveWireDrag | null = null;
  private rubberbandPath: SVGPathElement | null = null;
  private dropMenuEl: HTMLElement | null = null;

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

    this.subGraphBanner = document.getElementById('subGraphBanner') as HTMLElement;
    this.btnBackFromSubGraph = document.getElementById('btnBackFromSubGraph') as HTMLElement;
    this.btnLayoutSubGraph = document.getElementById('btnLayoutSubGraph');
    this.subGraphTitle = document.getElementById('subGraphTitle') as HTMLElement;
    this.subGraphNodesCount = document.getElementById('subGraphNodesCount') as HTMLElement;
    this.btnPlayCurrentSubGraph = document.getElementById('btnPlayCurrentSubGraph') as HTMLElement;

    this.bindViewportEvents();
    this.bindFocalBannerEvents();
    this.bindSubGraphBannerEvents();
    this.bindContextMenu();

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeDropMenu();
        if (this.activeWire) {
          this.cancelActiveWire();
        } else if (this.subConnectingSource) {
          this.cancelSubConnecting();
        } else if (this.connectingCondId) {
          this.cancelConnecting();
        } else if (this.viewMode === 'subgraph') {
          appState.setSubGraphEventId(null);
        } else if (this.viewMode === 'focal') {
          appState.setFocalVar(null);
        }
      }
    });

    this.viewport.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.wire-drop-menu')) return;
      this.closeDropMenu();
      if (this.activeWire && !this.activeWire.hasDragged) {
        this.cancelActiveWire();
      }
      if (this.connectingCondId) {
        this.cancelConnecting();
      }
      if (this.subConnectingSource) {
        this.cancelSubConnecting();
      }
    });

    // 悬浮点选连线模式下的实时光标跟踪与磁吸
    window.addEventListener('pointermove', (e) => {
      if (this.activeWire && !this.activeWire.hasDragged) {
        const cPos = this.clientToCanvasPos(e.clientX, e.clientY);
        this.activeWire.currentX = cPos.x;
        this.activeWire.currentY = cPos.y;
        this.checkMagnetSnapping(e.clientX, e.clientY, cPos);
        this.updateRubberbandWire();
      }
    });

    project.onChange((source) => this.handleProjectChange(source));
    appState.onStateChange((state) => this.renderState(state));
    appState.onModeChange(() => this.updateModeClass());
    appState.onSelectionChange(() => this.updateSelectionHighlight());
    appState.onFocalChange((key) => {
      if (key) {
        this.showFocalGraph(key);
      } else if (this.viewMode === 'focal') {
        this.showMainGraph();
      }
    });
    appState.onSubGraphChange((eventId) => {
      if (eventId) {
        this.showSubGraph(eventId);
      } else if (this.viewMode === 'subgraph') {
        this.showMainGraph();
      }
    });

    this.updateTransform();
    this.rebuildDOM();
  }

  // ------------------------------------------------------------------ 视图模式切换

  public showMainGraph(): void {
    this.closeDropMenu();
    this.cancelActiveWire();
    this.viewMode = 'main';
    this.focalVarKey = null;
    this.subGraphEventId = null;
    this.focalBanner.classList.add('hidden');
    this.subGraphBanner.classList.add('hidden');
    this.rebuildDOM();
    this.renderState(appState.getState());
  }

  public showFocalGraph(varKey: string): void {
    const v = project.getVar(varKey);
    if (!v) return;
    this.closeDropMenu();
    this.cancelActiveWire();
    this.viewMode = 'focal';
    this.focalVarKey = varKey;
    this.subGraphEventId = null;
    this.subGraphBanner.classList.add('hidden');
    this.focalBanner.classList.remove('hidden');
    appState.setSubGraphEventId(null);
    this.rebuildFocalDOM(varKey);
    this.centerFocalView();
    this.renderState(appState.getState());
  }

  public showSubGraph(eventId: string): void {
    const ev = project.getEvent(eventId);
    if (!ev) return;
    this.closeDropMenu();
    this.cancelActiveWire();
    project.ensureActionGraph(ev);
    this.viewMode = 'subgraph';
    this.subGraphEventId = eventId;
    this.focalVarKey = null;
    this.focalBanner.classList.add('hidden');
    this.subGraphBanner.classList.remove('hidden');

    this.subGraphTitle.textContent = ev.title;
    const count = ev.actionGraph?.nodes.length || 0;
    this.subGraphNodesCount.textContent = `● ${count} 个节点`;

    this.rebuildSubGraphDOM(eventId);
    this.panX = 60;
    this.panY = 50;
    this.zoom = 1.0;
    this.updateTransform();
    this.renderState(appState.getState());
    appState.select({ kind: 'event', id: eventId });
  }

  private bindSubGraphBannerEvents(): void {
    this.btnBackFromSubGraph.onclick = () => {
      appState.setSubGraphEventId(null);
    };
    if (this.btnLayoutSubGraph) {
      this.btnLayoutSubGraph.onclick = () => {
        if (this.subGraphEventId) {
          this.resetSubGraphLayout(this.subGraphEventId);
        }
      };
    }
    this.btnPlayCurrentSubGraph.onclick = () => {
      if (this.subGraphEventId) {
        this.playEvent(this.subGraphEventId);
      }
    };
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
    if (this.viewMode === 'subgraph' && this.subGraphEventId) {
      const ev = project.getEvent(this.subGraphEventId);
      if (ev) {
        this.subGraphTitle.textContent = ev.title;
        const count = ev.actionGraph?.nodes.length || 0;
        this.subGraphNodesCount.textContent = `● ${count} 个节点`;
        this.rebuildSubGraphDOM(this.subGraphEventId);
      } else {
        this.showMainGraph();
      }
    } else if (this.viewMode === 'focal' && this.focalVarKey) {
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

    // 1. Condition 条件节点
    p.conditions.forEach((cond: ConditionDef) => {
      const el = document.createElement('div');
      el.id = `node-${cond.id}`;
      el.className = 'graph-node condition-node compact-node';
      el.dataset.id = cond.id;
      el.dataset.kind = 'condition';
      el.style.left = `${cond.x}px`;
      el.style.top = `${cond.y}px`;
      el.innerHTML = `
        <div class="cond-status-led"></div>
        <div class="node-title">${this.escape(cond.title)}</div>
        <div class="node-port port-out" data-tid="${cond.id}" title="【按住拖拽连线】鼠标按住拖至 Event 节点建立依赖连线，松开即可完成"></div>
      `;
      const portOut = el.querySelector('.port-out') as HTMLElement | null;
      portOut?.addEventListener('pointerdown', (e) => {
        this.handlePortPointerDown(e, portOut, {
          mode: 'main',
          sourceId: cond.id
        });
      });
      this.attachNodeInteraction(el, 'condition', cond.id);
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
        <div class="node-port port-in" data-eid="${ev.id}" title="【依赖输入端】按住可拔出既有依赖连线，亦可接入新 Condition"></div>
        <div class="event-status-dot status-dot"></div>
        <div class="node-title">${this.escape(ev.title)}</div>
        <span class="event-status-pill status-pill"></span>
      `;
      const portIn = el.querySelector('.port-in') as HTMLElement | null;
      portIn?.addEventListener('pointerdown', (e) => {
        this.handlePortInPointerDown(e, portIn, {
          mode: 'main',
          targetId: ev.id
        });
      });
      portIn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.activeWire && this.activeWire.mode === 'main') {
          this.completeWireConnection(ev.id);
          this.cancelActiveWire();
        } else if (this.connectingCondId) {
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

  // ------------------------------------------------------------------ DOM 重建 (Sub-Graph Action Tree)

  private rebuildSubGraphDOM(eventId: string): void {
    this.nodesContainer.innerHTML = '';
    const ev = project.getEvent(eventId);
    if (!ev || !ev.actionGraph) return;

    ev.actionGraph.nodes.forEach((node) => {
      const el = document.createElement('div');
      el.id = `subnode-${node.id}`;
      el.dataset.id = node.id;
      el.dataset.kind = 'subnode';
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;

      switch (node.type) {
        case 'start': {
          el.className = 'graph-node sub-node start-node';
          el.innerHTML = `
            <div class="sub-node-header">
              <span>▶ Start</span>
            </div>
            <div class="node-port port-out" data-nid="${node.id}" title="【按住拖拽连线】鼠标按住拖至下一节点 In 端点建立连线"></div>
          `;
          const portOut = el.querySelector('.port-out') as HTMLElement | null;
          portOut?.addEventListener('pointerdown', (e) => {
            this.handlePortPointerDown(e, portOut, {
              mode: 'subgraph',
              sourceId: node.id
            });
          });
          break;
        }

        case 'action': {
          el.className = 'graph-node sub-node action-node';
          const stepsHtml = node.steps
            .map((s) => {
              if (s.type === 'say')
                return `<div class="step-preview-item" title="${this.escape(s.text)}">💬 ${this.escape(s.speaker)}: ${this.escape(s.text.slice(0, 16))}</div>`;
              if (s.type === 'set')
                return `<div class="step-preview-item">📝 ${this.escape(s.var)} = ${this.escape(String(s.value ?? s.from))}</div>`;
              if (s.type === 'add')
                return `<div class="step-preview-item">➕ ${this.escape(s.var)} ${s.amount >= 0 ? '+' : ''}${s.amount}</div>`;
              return '';
            })
            .join('');

          el.innerHTML = `
            <div class="node-port port-in" data-nid="${node.id}" title="【输入端点】按住可拔出既有连线改接，亦可吸附新连线"></div>
            <div class="sub-node-header">
              <span>${this.escape(node.title || '🎬 Action')}</span>
              <div class="node-port port-out" data-nid="${node.id}" title="【输出端点】按住拖出连线"></div>
            </div>
            <div class="action-steps-preview">
              ${stepsHtml || '<div class="step-preview-item" style="color:#64748b;">(暂无执行步骤)</div>'}
            </div>
          `;
          const portIn = el.querySelector('.port-in') as HTMLElement | null;
          portIn?.addEventListener('pointerdown', (e) => {
            this.handlePortInPointerDown(e, portIn, {
              mode: 'subgraph',
              targetId: node.id
            });
          });
          portIn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.activeWire && this.activeWire.mode === 'subgraph') {
              this.completeWireConnection(node.id);
              this.cancelActiveWire();
            } else if (this.subConnectingSource) {
              this.completeSubConnecting(node.id);
            }
          });
          const portOut = el.querySelector('.port-out') as HTMLElement | null;
          portOut?.addEventListener('pointerdown', (e) => {
            this.handlePortPointerDown(e, portOut, {
              mode: 'subgraph',
              sourceId: node.id
            });
          });
          break;
        }

        case 'selector': {
          el.className = 'graph-node sub-node selector-node';
          const casesHtml = node.cases
            .map((c) => {
              const checkDesc =
                c.checks
                  .map((chk) => {
                    const cid = chk.conditionId;
                    const t = project.getCondition(cid);
                    const title = t ? t.title.replace(/^🔍 condition: /, '') : cid;
                    const opVal = chk.op && chk.value !== undefined ? ` ${chk.op} ${chk.value}` : '';
                    return `${title}${opVal}`;
                  })
                  .join(' & ') || '无前置条件';

              return `
              <div class="sub-node-row">
                <div style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  <span style="font-weight:600; color:#e2e8f0;">${this.escape(c.title)}</span>
                  <span style="color:#94a3b8; font-size:10px; margin-left:4px; font-family:monospace;">[${this.escape(checkDesc)}]</span>
                </div>
                <div class="node-port port-out" data-nid="${node.id}" data-caseid="${c.id}" title="分支 [${this.escape(c.title)}] 输出端点 (按住拖拽连线)"></div>
              </div>
            `;
            })
            .join('');

          el.innerHTML = `
            <div class="node-port port-in" data-nid="${node.id}" title="【输入端点】按住可拔出既有连线改接，亦可吸附新连线"></div>
            <div class="sub-node-header">
              <span>${this.escape(node.title || '🔀 Selector')}</span>
            </div>
            <div class="sub-node-rows">
              ${casesHtml}
              <div class="sub-node-row default-row">
                <span>Default (保底默认)</span>
                <div class="node-port port-out" data-nid="${node.id}" data-default="true" title="Default 保底输出端点 (按住拖拽连线)"></div>
              </div>
            </div>
          `;
          const portIn = el.querySelector('.port-in') as HTMLElement | null;
          portIn?.addEventListener('pointerdown', (e) => {
            this.handlePortInPointerDown(e, portIn, {
              mode: 'subgraph',
              targetId: node.id
            });
          });
          portIn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.activeWire && this.activeWire.mode === 'subgraph') {
              this.completeWireConnection(node.id);
              this.cancelActiveWire();
            } else if (this.subConnectingSource) {
              this.completeSubConnecting(node.id);
            }
          });
          el.querySelectorAll('.port-out').forEach((p) => {
            const portEl = p as HTMLElement;
            portEl.addEventListener('pointerdown', (e) => {
              const caseId = portEl.dataset.caseid;
              const isDefault = portEl.dataset.default === 'true';
              this.handlePortPointerDown(e, portEl, {
                mode: 'subgraph',
                sourceId: node.id,
                caseId,
                isDefault
              });
            });
          });
          break;
        }

        case 'choice': {
          el.className = 'graph-node sub-node choice-node';
          const optionsHtml = node.options
            .map((o, oIdx) => {
              const checkDesc =
                o.checks && o.checks.length > 0
                  ? o.checks
                      .map((chk) => {
                        const cid = chk.conditionId;
                        const t = project.getCondition(cid);
                        const title = t ? t.title.replace(/^🔍 condition: /, '') : cid;
                        const opVal = chk.op && chk.value !== undefined ? ` ${chk.op} ${chk.value}` : '';
                        return `${title}${opVal}`;
                      })
                      .join(' & ')
                  : '';

              return `
              <div class="sub-node-row">
                <div style="display:flex; align-items:center; gap:4px; min-width:0; overflow:hidden;">
                  <span style="color:#fbbf24; font-weight:700; font-size:10px;">[${oIdx}]</span>
                  <span style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${this.escape(o.text)}</span>
                  ${
                    checkDesc
                      ? `<span style="font-size:9px; color:#f87171; background:rgba(248,113,113,0.15); padding:1px 4px; border-radius:3px;">需:${this.escape(checkDesc)}</span>`
                      : ''
                  }
                </div>
                <div class="node-port port-out" data-nid="${node.id}" data-optid="${o.id}" title="选项 [${this.escape(o.text)}] 输出端点 (按住拖拽连线)"></div>
              </div>
            `;
            })
            .join('');

          el.innerHTML = `
            <div class="node-port port-in" data-nid="${node.id}" title="【输入端点】按住可拔出既有连线改接，亦可吸附新连线"></div>
            <div class="sub-node-header">
              <span>💬 ${this.escape(node.speaker || 'NPC')}: ${this.escape(node.title || 'Choice')}</span>
            </div>
            <div class="choice-speech-quote">“${this.escape(node.text.slice(0, 36))}${node.text.length > 36 ? '...' : ''}”</div>
            <div class="sub-node-rows">
              ${optionsHtml}
            </div>
          `;
          const portIn = el.querySelector('.port-in') as HTMLElement | null;
          portIn?.addEventListener('pointerdown', (e) => {
            this.handlePortInPointerDown(e, portIn, {
              mode: 'subgraph',
              targetId: node.id
            });
          });
          portIn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.activeWire && this.activeWire.mode === 'subgraph') {
              this.completeWireConnection(node.id);
              this.cancelActiveWire();
            } else if (this.subConnectingSource) {
              this.completeSubConnecting(node.id);
            }
          });
          el.querySelectorAll('.port-out').forEach((p) => {
            const portEl = p as HTMLElement;
            portEl.addEventListener('pointerdown', (e) => {
              const optId = portEl.dataset.optid;
              this.handlePortPointerDown(e, portEl, {
                mode: 'subgraph',
                sourceId: node.id,
                optId
              });
            });
          });
          break;
        }
      }

      this.attachSubNodeInteraction(el, node, eventId);
      this.nodesContainer.appendChild(el);
    });

    this.renderEdges(appState.getState());
    this.updateSelectionHighlight();
  }

  private attachSubNodeInteraction(el: HTMLElement, node: ActionGraphNodeUnion, eventId: string): void {
    let hasMoved = false;

    el.onmousedown = (e) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('.node-port')) return;
      e.stopPropagation();
      hasMoved = false;
      this.draggingNodeId = node.id;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.nodeInitX = node.x;
      this.nodeInitY = node.y;

      const onMouseMove = (moveEv: MouseEvent) => {
        if (this.draggingNodeId !== node.id) return;
        const dx = (moveEv.clientX - this.dragStartX) / this.zoom;
        const dy = (moveEv.clientY - this.dragStartY) / this.zoom;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          hasMoved = true;
        }
        const newX = Math.round(this.nodeInitX + dx);
        const newY = Math.round(this.nodeInitY + dy);

        project.change(
          (d) => {
            const ev = d.events.find((x) => x.id === eventId);
            const targetNode = ev?.actionGraph?.nodes.find((n) => n.id === node.id);
            if (targetNode) {
              targetNode.x = newX;
              targetNode.y = newY;
            }
          },
          'drag',
          `drag_subnode_${node.id}`
        );

        el.style.left = `${newX}px`;
        el.style.top = `${newY}px`;
        this.renderEdges(appState.getState());
      };

      const onMouseUp = () => {
        if (this.draggingNodeId === node.id) {
          this.draggingNodeId = null;
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

      if (this.activeWire && this.activeWire.mode === 'subgraph' && node.type !== 'start') {
        this.completeWireConnection(node.id);
        this.cancelActiveWire();
        return;
      }

      if (this.subConnectingSource) {
        this.completeSubConnecting(node.id);
        return;
      }

      appState.select({ kind: 'subnode', id: node.id, eventId });
    };
  }

  private startSubConnecting(
    sourceNodeId: string,
    caseId?: string,
    isDefault?: boolean,
    optId?: string
  ): void {
    this.subConnectingSource = { nodeId: sourceNodeId, caseId, isDefault, optId };
    const ev = this.subGraphEventId ? project.getEvent(this.subGraphEventId) : null;
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
      this.viewport.appendChild(this.connectingBannerEl);
    }
    this.connectingBannerEl.innerHTML = `
      <span>🔗 正在连线：<b>${this.escape(title)}</b> ➔ 请点击目标节点的 In 端点完成连接</span>
      <button id="btnCancelConnect" style="background:#334155; border:none; color:#f8fafc; border-radius:4px; padding:2px 8px; font-size:11px; cursor:pointer;">取消 (ESC)</button>
    `;
    this.connectingBannerEl.style.display = 'flex';
    this.connectingBannerEl.querySelector('#btnCancelConnect')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancelSubConnecting();
    });
  }

  private cancelSubConnecting(): void {
    this.subConnectingSource = null;
    if (this.connectingBannerEl) {
      this.connectingBannerEl.style.display = 'none';
    }
  }

  private completeSubConnecting(targetNodeId: string): void {
    const src = this.subConnectingSource;
    this.cancelSubConnecting();
    if (!src || !this.subGraphEventId) return;
    const eventId = this.subGraphEventId;

    const ev = project.getEvent(eventId);
    const targetNode = ev?.actionGraph?.nodes.find((n) => n.id === targetNodeId);
    if (!targetNode || targetNode.type === 'start') {
      appState.log('⚠️ 不能将连线连入 Start 入口节点！', true);
      return;
    }

    // 核心规则：所有连到玩家选项的都要设置默认的选择 index，默认最上面那个 (0)
    const defaultOptionIndex = targetNode.type === 'choice' ? 0 : undefined;

    project.change((d) => {
      const targetEv = d.events.find((e) => e.id === eventId);
      const graph = targetEv?.actionGraph;
      if (!graph) return;
      const sourceNode = graph.nodes.find((n) => n.id === src.nodeId);
      if (!sourceNode) return;

      if (sourceNode.type === 'start' || sourceNode.type === 'action') {
        sourceNode.nextId = targetNodeId;
        sourceNode.defaultOptionIndex = defaultOptionIndex;
      } else if (sourceNode.type === 'selector') {
        if (src.isDefault) {
          sourceNode.defaultTargetId = targetNodeId;
          sourceNode.defaultOptionIndex = defaultOptionIndex;
        } else if (src.caseId) {
          const c = sourceNode.cases.find((x) => x.id === src.caseId);
          if (c) {
            c.targetId = targetNodeId;
            c.defaultOptionIndex = defaultOptionIndex;
          }
        }
      } else if (sourceNode.type === 'choice' && src.optId) {
        const o = sourceNode.options.find((x) => x.id === src.optId);
        if (o) {
          o.targetId = targetNodeId;
          o.defaultOptionIndex = defaultOptionIndex;
        }
      }
    }, 'structure');

    const targetTitle = 'title' in targetNode ? targetNode.title : (targetNode as ActionGraphNodeUnion).id;
    appState.log(
      `🔗 已连接：${src.nodeId} ➔ ${targetTitle}${
        defaultOptionIndex !== undefined ? ' (默认选项 index: 0)' : ''
      }`,
      true
    );
  }

  private getPortCanvasPos(portEl: HTMLElement): { x: number; y: number } {
    const pRect = portEl.getBoundingClientRect();
    const cRect = this.canvas.getBoundingClientRect();
    return {
      x: (pRect.left + pRect.width / 2 - cRect.left) / this.zoom,
      y: (pRect.top + pRect.height / 2 - cRect.top) / this.zoom
    };
  }

  private renderSubGraphEdges(eventId: string): void {
    const ev = project.getEvent(eventId);
    if (!ev || !ev.actionGraph) return;

    const sel = appState.getSelection();

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
              project.change((d) => {
                const targetNode = d.events.find((e) => e.id === eventId)?.actionGraph?.nodes.find((n) => n.id === node.id);
                if (targetNode && targetNode.type === 'start') {
                  delete targetNode.nextId;
                  delete targetNode.defaultOptionIndex;
                }
              }, 'structure');
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
              project.change((d) => {
                const targetNode = d.events.find((e) => e.id === eventId)?.actionGraph?.nodes.find((n) => n.id === node.id);
                if (targetNode && targetNode.type === 'action') {
                  delete targetNode.nextId;
                  delete targetNode.defaultOptionIndex;
                }
              }, 'structure');
            }
          });
        }
      } else if (node.type === 'selector') {
        node.cases.forEach((c) => {
          if (c.targetId) {
            const portEl = nodeEl.querySelector(`.port-out[data-caseid="${c.id}"]`) as HTMLElement | null;
            edgesToDraw.push({
              sourceNodeId: node.id,
              sourcePortEl: portEl,
              targetNodeId: c.targetId,
              defaultOptionIndex: c.defaultOptionIndex,
              title: `🔀 ${node.title} 分支「${c.title}」➔ ${c.targetId}`,
              disconnect: () => {
                project.change((d) => {
                  const targetNode = d.events.find((e) => e.id === eventId)?.actionGraph?.nodes.find((n) => n.id === node.id);
                  if (targetNode && targetNode.type === 'selector') {
                    const targetCase = targetNode.cases.find((x) => x.id === c.id);
                    if (targetCase) {
                      delete targetCase.targetId;
                      delete targetCase.defaultOptionIndex;
                    }
                  }
                }, 'structure');
              }
            });
          }
        });
        if (node.defaultTargetId) {
          const portEl = nodeEl.querySelector('.port-out[data-default="true"]') as HTMLElement | null;
          edgesToDraw.push({
            sourceNodeId: node.id,
            sourcePortEl: portEl,
            targetNodeId: node.defaultTargetId,
            defaultOptionIndex: node.defaultOptionIndex,
            title: `🔀 ${node.title} Default保底 ➔ ${node.defaultTargetId}`,
            disconnect: () => {
              project.change((d) => {
                const targetNode = d.events.find((e) => e.id === eventId)?.actionGraph?.nodes.find((n) => n.id === node.id);
                if (targetNode && targetNode.type === 'selector') {
                  delete targetNode.defaultTargetId;
                  delete targetNode.defaultOptionIndex;
                }
              }, 'structure');
            }
          });
        }
      } else if (node.type === 'choice') {
        node.options.forEach((o) => {
          if (o.targetId) {
            const portEl = nodeEl.querySelector(`.port-out[data-optid="${o.id}"]`) as HTMLElement | null;
            edgesToDraw.push({
              sourceNodeId: node.id,
              sourcePortEl: portEl,
              targetNodeId: o.targetId,
              defaultOptionIndex: o.defaultOptionIndex,
              title: `💬 ${node.title} 选项「${o.text}」➔ ${o.targetId}`,
              disconnect: () => {
                project.change((d) => {
                  const targetNode = d.events.find((e) => e.id === eventId)?.actionGraph?.nodes.find((n) => n.id === node.id);
                  if (targetNode && targetNode.type === 'choice') {
                    const targetOpt = targetNode.options.find((x) => x.id === o.id);
                    if (targetOpt) {
                      delete targetOpt.targetId;
                      delete targetOpt.defaultOptionIndex;
                    }
                  }
                }, 'structure');
              }
            });
          }
        });
      }
    });

    edgesToDraw.forEach((item) => {
      const targetEl = document.getElementById(`subnode-${item.targetNodeId}`);
      if (!targetEl || !item.sourcePortEl) return;
      const inPortEl = targetEl.querySelector('.port-in') as HTMLElement | null;

      const p1 = this.getPortCanvasPos(item.sourcePortEl);
      const p2 = inPortEl ? this.getPortCanvasPos(inPortEl) : { x: targetEl.offsetLeft, y: targetEl.offsetTop + 20 };

      const x1 = p1.x;
      const y1 = p1.y;
      const x2 = p2.x;
      const y2 = p2.y;

      let cx1: number, cy1: number, cx2: number, cy2: number;
      const isLoopBack = x2 <= x1 + 20;

      if (!isLoopBack) {
        // 常规向前连线
        const dx = Math.max(40, (x2 - x1) * 0.5);
        cx1 = x1 + dx;
        cy1 = y1;
        cx2 = x2 - dx;
        cy2 = y2;
      } else {
        // 循环回跳连线 (向右引出后环绕回跳至目标左侧 In 端口，避开节点中间文本区域)
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

      const isHighlight = sel && sel.id && (sel.id === item.sourceNodeId || sel.id === item.targetNodeId);

      const targetNode = ev.actionGraph?.nodes.find((n) => n.id === item.targetNodeId);
      const defaultInfo = targetNode?.type === 'choice' ? ` [默认选项: ${item.defaultOptionIndex ?? 0}]` : '';

      this.drawSvgPath({
        d: `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`,
        active: true,
        highlight: !!isHighlight,
        title: `${item.title}${defaultInfo} (点击断开连线)`,
        onClick: (e) => {
          e.stopPropagation();
          item.disconnect();
          appState.log(`✂️ 已断开连线：${item.title}（Ctrl+Z 可撤销）`, true);
        }
      });
    });
  }

  public createSubNodeAt(
    type: 'action' | 'selector' | 'choice',
    canvasX: number,
    canvasY: number
  ): string | undefined {
    if (!this.subGraphEventId) return undefined;
    if (appState.getMode() !== 'edit') {
      appState.setMode('edit');
    }
    const node = project.addGraphNode(this.subGraphEventId, type, canvasX, canvasY);
    if (node) {
      appState.select({ kind: 'subnode', id: node.id, eventId: this.subGraphEventId });
      const nodeTitle = 'title' in node ? node.title : node.id;
      appState.log(`✨ 新建 Action Tree 节点：[${nodeTitle}]`, true);
      this.pulseNode(node.id);
      return node.id;
    }
    return undefined;
  }

  public createSubNodeAtCenter(type: 'action' | 'selector' | 'choice'): string | undefined {
    const center = this.getViewportCenterCanvasPos();
    const ev = this.subGraphEventId ? project.getEvent(this.subGraphEventId) : null;
    const count = ev?.actionGraph?.nodes.length || 0;
    const stagger = (count % 8) * 16;
    const x = Math.round(center.x - 90 + stagger);
    const y = Math.round(center.y - 30 + stagger);
    return this.createSubNodeAt(type, x, y);
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

  private attachNodeInteraction(el: HTMLElement, kind: 'event' | 'condition', id: string): void {
    let hasMoved = false;

    el.onmousedown = (e) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('.node-port')) return;
      e.stopPropagation();
      hasMoved = false;
      this.draggingNodeId = id;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      const pos = this.getNodePos(id);
      this.nodeInitX = pos.x;
      this.nodeInitY = pos.y;

      const onMouseMove = (moveEv: MouseEvent) => {
        if (this.draggingNodeId !== id) return;
        const dx = (moveEv.clientX - this.dragStartX) / this.zoom;
        const dy = (moveEv.clientY - this.dragStartY) / this.zoom;
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
              const node = kind === 'event'
                ? d.events.find((x) => x.id === id)
                : d.conditions.find((x: ConditionDef) => x.id === id);
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
      };

      const onMouseUp = () => {
        if (this.draggingNodeId === id) {
          this.draggingNodeId = null;
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

      if (this.activeWire && this.activeWire.mode === 'main' && kind === 'event') {
        this.completeWireConnection(id);
        this.cancelActiveWire();
        return;
      }

      if (this.connectingCondId && kind === 'event') {
        this.completeConnecting(id);
        return;
      }

      appState.select({ kind, id });

      // Play 模式下，点击 Event 直接触发执行
      if (appState.getMode() === 'play' && kind === 'event') {
        this.playEvent(id);
      }
    };

    // 双击：编辑模式下双击 Event 进入 Action Tree 内部图谱；Play 模式下触发试玩
    el.ondblclick = (e) => {
      e.stopPropagation();
      if (kind === 'event') {
        if (appState.getMode() === 'edit') {
          appState.setSubGraphEventId(id);
          appState.log(`🕸️ 已进入「${project.getEvent(id)?.title}」内部 Action Tree 图谱`, true);
        } else {
          this.playEvent(id);
        }
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

  // ==========================================================================
  // ComfyUI 风格连线系统 (拖拽飞线、智能磁吸、释放菜单、拔线改接)
  // ==========================================================================

  private ensureRubberbandElement(): SVGPathElement {
    if (!this.rubberbandPath || !this.rubberbandPath.parentNode) {
      const existing = this.svgEdges.querySelector('#rubberband-wire') as SVGPathElement | null;
      if (existing) {
        this.rubberbandPath = existing;
      } else {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.id = 'rubberband-wire';
        path.setAttribute('class', 'wire-rubberband');
        path.setAttribute('marker-end', 'url(#arrow-focal)');
        this.svgEdges.appendChild(path);
        this.rubberbandPath = path;
      }
    }
    return this.rubberbandPath;
  }

  private updateRubberbandWire(): void {
    if (!this.activeWire) return;
    const path = this.ensureRubberbandElement();

    const x1 = this.activeWire.startX;
    const y1 = this.activeWire.startY;
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

    let cx1: number, cy1: number, cx2: number, cy2: number;
    if (x2 >= x1) {
      const dx = Math.max(Math.abs(x2 - x1) * 0.5, 40);
      cx1 = x1 + dx;
      cy1 = y1;
      cx2 = x2 - dx;
      cy2 = y2;
    } else {
      const dx = Math.max(Math.abs(x2 - x1) * 0.35, 60);
      cx1 = x1 + dx;
      cy1 = y1;
      cx2 = x2 - dx;
      cy2 = y2;
    }

    path.setAttribute('d', `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`);
    path.style.display = 'block';
  }

  private checkMagnetSnapping(clientX: number, clientY: number, canvasPos: { x: number; y: number }): void {
    if (!this.activeWire) return;

    // 清除上一次的高亮
    document.querySelectorAll('.snap-target-hover').forEach((el) => el.classList.remove('snap-target-hover'));
    document.querySelectorAll('.snap-port-hover').forEach((el) => el.classList.remove('snap-port-hover'));

    this.activeWire.snappedTargetId = null;
    this.activeWire.snappedPortPos = null;

    if (this.activeWire.mode === 'main') {
      const p = project.get();
      for (const ev of p.events) {
        const el = document.getElementById(`node-${ev.id}`);
        if (!el) continue;
        const portIn = el.querySelector('.port-in') as HTMLElement | null;
        if (!portIn) continue;

        const portCanvasPos = this.getPortCanvasPos(portIn);
        const dist = Math.hypot(canvasPos.x - portCanvasPos.x, canvasPos.y - portCanvasPos.y);
        const rect = el.getBoundingClientRect();
        const isInside =
          clientX >= rect.left - 20 &&
          clientX <= rect.right + 20 &&
          clientY >= rect.top - 15 &&
          clientY <= rect.bottom + 15;

        if (dist < 45 || isInside) {
          this.activeWire.snappedTargetId = ev.id;
          this.activeWire.snappedPortPos = portCanvasPos;
          el.classList.add('snap-target-hover');
          portIn.classList.add('snap-port-hover');
          break;
        }
      }
    } else if (this.activeWire.mode === 'subgraph' && this.subGraphEventId) {
      const ev = project.getEvent(this.subGraphEventId);
      if (!ev || !ev.actionGraph) return;

      for (const node of ev.actionGraph.nodes) {
        if (node.id === this.activeWire.sourceId || node.type === 'start') continue;
        const el = document.getElementById(`subnode-${node.id}`);
        if (!el) continue;
        const portIn = el.querySelector('.port-in') as HTMLElement | null;
        if (!portIn) continue;

        const portCanvasPos = this.getPortCanvasPos(portIn);
        const dist = Math.hypot(canvasPos.x - portCanvasPos.x, canvasPos.y - portCanvasPos.y);
        const rect = el.getBoundingClientRect();
        const isInside =
          clientX >= rect.left - 15 &&
          clientX <= rect.right + 15 &&
          clientY >= rect.top - 10 &&
          clientY <= rect.bottom + 10;

        if (dist < 40 || isInside) {
          this.activeWire.snappedTargetId = node.id;
          this.activeWire.snappedPortPos = portCanvasPos;
          el.classList.add('snap-target-hover');
          portIn.classList.add('snap-port-hover');
          break;
        }
      }
    }
  }

  private handlePortPointerDown(
    e: PointerEvent,
    portEl: HTMLElement,
    config: {
      mode: 'main' | 'subgraph';
      sourceId: string;
      caseId?: string;
      isDefault?: boolean;
      optId?: string;
    }
  ): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    this.closeDropMenu();
    this.cancelActiveWire();

    const startPos = this.getPortCanvasPos(portEl);
    this.activeWire = {
      mode: config.mode,
      sourceId: config.sourceId,
      caseId: config.caseId,
      isDefault: config.isDefault,
      optId: config.optId,
      sourcePortEl: portEl,
      startX: startPos.x,
      startY: startPos.y,
      currentX: startPos.x,
      currentY: startPos.y,
      hasDragged: false,
      snappedTargetId: null,
      snappedPortPos: null
    };

    portEl.classList.add('port-active');
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
      const cPos = this.clientToCanvasPos(moveEv.clientX, moveEv.clientY);
      this.activeWire.currentX = cPos.x;
      this.activeWire.currentY = cPos.y;

      const dist = Math.hypot(cPos.x - this.activeWire.startX, cPos.y - this.activeWire.startY);
      if (dist > 4) {
        this.activeWire.hasDragged = true;
      }

      this.checkMagnetSnapping(moveEv.clientX, moveEv.clientY, cPos);
      this.updateRubberbandWire();
    };

    const onPointerUp = (upEv: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      if (!this.activeWire) return;
      const wire = this.activeWire;

      if (wire.hasDragged) {
        if (wire.snappedTargetId) {
          this.completeWireConnection(wire.snappedTargetId);
          this.cancelActiveWire();
        } else {
          const dropCanvasPos = this.clientToCanvasPos(upEv.clientX, upEv.clientY);
          const distFromStart = Math.hypot(dropCanvasPos.x - wire.startX, dropCanvasPos.y - wire.startY);
          if (distFromStart > 28) {
            this.openDropOnEmptyMenu(upEv.clientX, upEv.clientY, dropCanvasPos, wire);
          } else {
            this.cancelActiveWire();
          }
        }
      } else {
        // 单击模式保留悬停飞线与操作横幅
        this.showClickConnectBanner(wire);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  private handlePortInPointerDown(
    e: PointerEvent,
    _portInEl: HTMLElement,
    config: {
      mode: 'main' | 'subgraph';
      targetId: string;
    }
  ): void {
    if (e.button !== 0) return;

    if (config.mode === 'main') {
      const p = project.get();
      const ev = p.events.find((x) => x.id === config.targetId);
      if (ev && ev.incomingConditions && ev.incomingConditions.length > 0) {
        e.stopPropagation();
        e.preventDefault();
        const condId = ev.incomingConditions[ev.incomingConditions.length - 1];
        project.disconnectCondition(ev.id, condId);
        appState.log(`🔌 已拔出 Condition 依赖连线：[${condId}]，可重新拖动改接至其他 Event`, true);

        const condEl = document.getElementById(`node-${condId}`);
        const condPortOut = condEl?.querySelector('.port-out') as HTMLElement | null;
        if (condPortOut) {
          this.handlePortPointerDown(e, condPortOut, {
            mode: 'main',
            sourceId: condId
          });
        }
      }
    } else if (config.mode === 'subgraph' && this.subGraphEventId) {
      const ev = project.getEvent(this.subGraphEventId);
      if (!ev || !ev.actionGraph) return;

      let upstream: {
        nodeId: string;
        caseId?: string;
        isDefault?: boolean;
        optId?: string;
        portEl: HTMLElement | null;
      } | null = null;

      for (const n of ev.actionGraph.nodes) {
        if (n.type === 'start' && n.nextId === config.targetId) {
          const fromEl = document.getElementById(`subnode-${n.id}`);
          const portEl = fromEl?.querySelector('.port-out') as HTMLElement | null;
          upstream = { nodeId: n.id, portEl };
          break;
        }
        if (n.type === 'action' && n.nextId === config.targetId) {
          const fromEl = document.getElementById(`subnode-${n.id}`);
          const portEl = fromEl?.querySelector('.sub-node-header .port-out') as HTMLElement | null;
          upstream = { nodeId: n.id, portEl };
          break;
        }
        if (n.type === 'selector') {
          if (n.defaultTargetId === config.targetId) {
            const fromEl = document.getElementById(`subnode-${n.id}`);
            const portEl = fromEl?.querySelector('.port-out[data-default="true"]') as HTMLElement | null;
            upstream = { nodeId: n.id, isDefault: true, portEl };
            break;
          }
          const matchedCase = n.cases.find((c) => c.targetId === config.targetId);
          if (matchedCase) {
            const fromEl = document.getElementById(`subnode-${n.id}`);
            const portEl = fromEl?.querySelector(`.port-out[data-caseid="${matchedCase.id}"]`) as HTMLElement | null;
            upstream = { nodeId: n.id, caseId: matchedCase.id, portEl };
            break;
          }
        }
        if (n.type === 'choice') {
          const matchedOpt = n.options.find((o) => o.targetId === config.targetId);
          if (matchedOpt) {
            const fromEl = document.getElementById(`subnode-${n.id}`);
            const portEl = fromEl?.querySelector(`.port-out[data-optid="${matchedOpt.id}"]`) as HTMLElement | null;
            upstream = { nodeId: n.id, optId: matchedOpt.id, portEl };
            break;
          }
        }
      }

      if (upstream && upstream.portEl) {
        e.stopPropagation();
        e.preventDefault();

        project.change((d) => {
          const targetEv = d.events.find((x) => x.id === this.subGraphEventId);
          const graph = targetEv?.actionGraph;
          if (!graph) return;
          const srcNode = graph.nodes.find((n) => n.id === upstream!.nodeId);
          if (!srcNode) return;
          if (srcNode.type === 'start' || srcNode.type === 'action') {
            delete srcNode.nextId;
            delete srcNode.defaultOptionIndex;
          } else if (srcNode.type === 'selector') {
            if (upstream!.isDefault) {
              delete srcNode.defaultTargetId;
              delete srcNode.defaultOptionIndex;
            } else if (upstream!.caseId) {
              const c = srcNode.cases.find((x) => x.id === upstream!.caseId);
              if (c) {
                delete c.targetId;
                delete c.defaultOptionIndex;
              }
            }
          } else if (srcNode.type === 'choice' && upstream!.optId) {
            const o = srcNode.options.find((x) => x.id === upstream!.optId);
            if (o) {
              delete o.targetId;
              delete o.defaultOptionIndex;
            }
          }
        }, 'structure');

        appState.log(`🔌 已拔出连线：[${upstream.nodeId}] ➔ [${config.targetId}]，可拖动改接至新目标`, true);

        this.handlePortPointerDown(e, upstream.portEl, {
          mode: 'subgraph',
          sourceId: upstream.nodeId,
          caseId: upstream.caseId,
          isDefault: upstream.isDefault,
          optId: upstream.optId
        });
      }
    }
  }

  private completeWireConnection(targetId: string): void {
    if (!this.activeWire) return;
    const mode = this.activeWire.mode;
    if (mode === 'main') {
      this.completeConnecting(targetId);
    } else {
      this.completeSubConnecting(targetId);
    }
    this.pulseNode(targetId);
  }

  private openDropOnEmptyMenu(
    clientX: number,
    clientY: number,
    canvasPos: { x: number; y: number },
    wire: ActiveWireDrag
  ): void {
    this.closeDropMenu();

    const menu = document.createElement('div');
    menu.className = 'wire-drop-menu';
    menu.style.left = `${clientX + 6}px`;
    menu.style.top = `${clientY + 6}px`;

    if (wire.mode === 'main') {
      const cond = project.getCondition(wire.sourceId);
      const condTitle = cond ? cond.title.replace(/^🔍 condition: /, '') : wire.sourceId;
      menu.innerHTML = `
        <div class="wire-drop-header">
          <span>⚡ 从 [${this.escape(condTitle)}] 连出</span>
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
        this.closeDropMenu();

        if (action === 'new-event') {
          const newEv = project.addEvent(canvasPos.x, canvasPos.y);
          this.completeConnecting(newEv.id);
          appState.select({ kind: 'event', id: newEv.id });
          this.pulseNode(newEv.id);
          this.cancelActiveWire();
        } else if (action === 'new-action' || action === 'new-selector' || action === 'new-choice') {
          const subType = action === 'new-action' ? 'action' : action === 'new-selector' ? 'selector' : 'choice';
          const newId = this.createSubNodeAt(subType, canvasPos.x, canvasPos.y);
          if (newId) {
            this.completeSubConnecting(newId);
            this.pulseNode(newId);
          }
          this.cancelActiveWire();
        }
      };
    });

    document.body.appendChild(menu);
    this.dropMenuEl = menu;
  }

  private closeDropMenu(): void {
    if (this.dropMenuEl) {
      this.dropMenuEl.remove();
      this.dropMenuEl = null;
    }
  }

  private cancelActiveWire(): void {
    if (this.activeWire) {
      if (this.activeWire.sourcePortEl) {
        this.activeWire.sourcePortEl.classList.remove('port-active');
      }
      this.activeWire = null;
    }
    if (this.rubberbandPath) {
      this.rubberbandPath.style.display = 'none';
      this.rubberbandPath.classList.remove('snapped');
    }
    document.querySelectorAll('.snap-target-hover').forEach((el) => el.classList.remove('snap-target-hover'));
    document.querySelectorAll('.snap-port-hover').forEach((el) => el.classList.remove('snap-port-hover'));
    this.cancelConnecting();
    this.cancelSubConnecting();
  }

  private showClickConnectBanner(wire: ActiveWireDrag): void {
    if (wire.mode === 'main') {
      this.startConnecting(wire.sourceId);
    } else {
      this.startSubConnecting(wire.sourceId, wire.caseId, wire.isDefault, wire.optId);
    }
  }

  // ------------------------------------------------------------------ 连线交互
  private startConnecting(condId: string): void {
    this.connectingCondId = condId;
    const cond = project.getCondition(condId);
    const title = cond ? cond.title.replace(/^🔍 condition: /, '') : condId;
    if (!this.connectingBannerEl) {
      this.connectingBannerEl = document.createElement('div');
      this.connectingBannerEl.className = 'connecting-banner';
      this.viewport.appendChild(this.connectingBannerEl);
    }
    this.connectingBannerEl.innerHTML = `
      <span>🔗 正在为 Condition [<b>${this.escape(title)}</b>] 建立依赖连线 ➔ 请点击目标 Event 节点完成依赖声明</span>
      <button id="btnCancelConnect" style="background:#334155; border:none; color:#f8fafc; border-radius:4px; padding:2px 8px; font-size:11px; cursor:pointer;">取消 (ESC)</button>
    `;
    this.connectingBannerEl.style.display = 'flex';
    this.connectingBannerEl.querySelector('#btnCancelConnect')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancelConnecting();
    });
  }

  private cancelConnecting(): void {
    this.connectingCondId = null;
    if (this.connectingBannerEl) {
      this.connectingBannerEl.style.display = 'none';
    }
  }

  private completeConnecting(evId: string): void {
    const chosenCondId = this.connectingCondId;
    this.cancelConnecting();
    if (!chosenCondId) return;

    project.change((d) => {
      const targetEv = d.events.find((x) => x.id === evId);
      if (targetEv) {
        if (!targetEv.incomingConditions) {
          targetEv.incomingConditions = [];
        }
        if (!targetEv.incomingConditions.includes(chosenCondId)) {
          targetEv.incomingConditions.push(chosenCondId);
        }
      }
    }, 'structure');
    appState.log(`已建立依赖关系：Event [${evId}] 依赖 Condition [${chosenCondId}]`, true);
  }

  private getNodePos(id: string): LayoutPos {
    if (this.viewMode === 'focal' && this.focalPositions[id]) {
      return this.focalPositions[id];
    }
    const ev = project.getEvent(id);
    if (ev) return { x: ev.x, y: ev.y };
    const tr = project.getCondition(id);
    if (tr) return { x: tr.x, y: tr.y };
    return { x: 0, y: 0 };
  }

  // ------------------------------------------------------------------ 状态渲染

  public renderState(state: WorldState): void {
    const p = project.get();

    // 1. Condition 状态
    p.conditions.forEach((cond: ConditionDef) => {
      const el = document.getElementById(`node-${cond.id}`);
      if (!el) return;
      const ok = evalCondition(p, state, cond);
      el.classList.toggle('satisfied', ok);
      el.classList.toggle('unsatisfied', !ok);
    });

    // 2. Event 状态（根据当前动作树预计命中的逻辑分支展示 status pill）
    p.events.forEach((ev) => {
      const el = document.getElementById(`node-${ev.id}`);
      if (!el) return;
      const pill = el.querySelector('.status-pill') as HTMLElement | null;
      const st = getEventStatus(p, state, ev);

      if (pill) {
        pill.textContent = st.title;
        pill.className = `event-status-pill status-pill ${st.colorClass}`;
      }
      const isAvailable = st.colorClass !== 'status-red';
      el.classList.toggle('available', isAvailable);
      el.classList.toggle('locked', !isAvailable);
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

    if (this.viewMode === 'subgraph' && this.subGraphEventId) {
      this.renderSubGraphEdges(this.subGraphEventId);
    } else if (this.viewMode === 'focal' && this.focalVarKey) {
      this.renderFocalEdges(p, state, sel);
    } else {
      this.renderMainEdges(p, state, sel);
    }

    if (this.activeWire) {
      this.ensureRubberbandElement();
      this.updateRubberbandWire();
    }
  }

  /** 顶层大图：Condition ➔ Event（声明 Event 依赖哪些 Condition 前置条件） */
  private renderMainEdges(p: ProjectData, state: WorldState, sel: ReturnType<typeof appState.getSelection>): void {
    const edges = mainGraphEdges(p);

    edges.forEach((edge) => {
      const fromEl = document.getElementById(`node-${edge.from}`);
      const toEl = document.getElementById(`node-${edge.to}`);
      if (!fromEl || !toEl) return;

      const cond = project.getCondition(edge.from);
      const ev = project.getEvent(edge.to);
      if (!cond || !ev) return;

      const posFrom = { x: cond.x, y: cond.y };
      const posTo = { x: ev.x, y: ev.y };
      const fromW = fromEl.offsetWidth || 180;
      const fromH = fromEl.offsetHeight || 38;
      const toW = toEl.offsetWidth || 200;
      const toH = toEl.offsetHeight || 38;

      const condActive = evalCondition(p, state, cond);
      const isSelected =
        sel &&
        ((sel.kind === 'condition' && sel.id === edge.from) || (sel.kind === 'event' && sel.id === edge.to));

      let x1: number, y1: number, x2: number, y2: number;
      let cx1: number, cy1: number, cx2: number, cy2: number;

      // 判断相对方位
      if (posFrom.x + fromW <= posTo.x + 10) {
        // Condition 在左，Event 在右：常规流向
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
        // Condition 在右，Event 在左：外部依赖反向回指（如 condition ➔ 国王）
        x1 = posFrom.x;
        y1 = posFrom.y + fromH * 0.5;
        x2 = posTo.x + toW + 3;
        y2 = posTo.y + toH * 0.5;
        const dx = Math.max(Math.abs(x2 - x1) * 0.45, 40);
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
        active: condActive,
        highlight: !!isSelected,
        title: `${cond.title} ➔ 依赖此条件：${ev.title} (点击可断开依赖连线)`,
        onClick: (e) => {
          e.stopPropagation();
          project.disconnectCondition(edge.to, edge.from);
          appState.log(`✂️ 已断开依赖连线：${cond.title} ➔ ${ev.title}（Ctrl+Z 可撤销）`, true);
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
    if (this.viewMode === 'subgraph' && this.subGraphEventId) {
      this.resetSubGraphLayout(this.subGraphEventId);
      return;
    }

    // 恢复标准三栏布局
    let evLeftIdx = 0;
    let evRightIdx = 0;
    let condIdx = 0;

    project.change((d) => {
      d.conditions.forEach((t: ConditionDef) => {
        t.x = 460;
        t.y = 100 + condIdx * 140;
        condIdx++;
      });
      d.events.forEach((e) => {
        // 判断放在左栏还是右栏：被 condition 控制的放右栏，起始 source 放左栏
        const inConds = e.incomingConditions ?? [];
        const hasInputs = inConds.length > 0;
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

  /**
   * 将当前 Event 内部的 Action Tree 子图按流程图 (DAG Flowchart) 算法自动排列：
   * 1. DFS 环路检测，区分前向依赖与后向回跳 (Back-edges)，防止循环对话死锁
   * 2. 拓扑分层 (Ranks / Columns) 确定横向 X 坐标
   * 3. 沿父端口分支序排列每列节点，前后向中心对齐与碰撞间隙推移 (minGap=50px) 确定纵向 Y 坐标
   * 4. 彻底消除节点重叠，使结构清晰如流程图
   */
  public resetSubGraphLayout(eventId: string): void {
    const ev = project.getEvent(eventId);
    if (!ev || !ev.actionGraph || !ev.actionGraph.nodes || ev.actionGraph.nodes.length === 0) return;

    const nodes = ev.actionGraph.nodes;
    const nodeMap = new Map<string, ActionGraphNodeUnion>();
    nodes.forEach((n) => nodeMap.set(n.id, n));

    const getNodeHeight = (n: ActionGraphNodeUnion): number => {
      switch (n.type) {
        case 'start':
          return 50;
        case 'action':
          return 55 + (n.steps?.length || 0) * 28;
        case 'selector':
          return 55 + (n.cases?.length || 0) * 36 + 36;
        case 'choice':
          return 95 + (n.options?.length || 0) * 36;
        default:
          return 80;
      }
    };

    const getNodeWidth = (n: ActionGraphNodeUnion): number => {
      if (n.type === 'start') return 140;
      if (n.type === 'choice') return 280;
      return 260;
    };

    // 提取邻接关系（保持各端口分支顺序）
    const adj = new Map<string, string[]>();
    const inEdges = new Map<string, string[]>();
    nodes.forEach((n) => {
      adj.set(n.id, []);
      inEdges.set(n.id, []);
    });

    nodes.forEach((n) => {
      const targets: string[] = [];
      if (n.type === 'start' || n.type === 'action') {
        if (n.nextId && nodeMap.has(n.nextId)) targets.push(n.nextId);
      } else if (n.type === 'selector') {
        n.cases.forEach((c) => {
          if (c.targetId && nodeMap.has(c.targetId)) targets.push(c.targetId);
        });
        if (n.defaultTargetId && nodeMap.has(n.defaultTargetId)) {
          targets.push(n.defaultTargetId);
        }
      } else if (n.type === 'choice') {
        n.options.forEach((opt) => {
          if (opt.targetId && nodeMap.has(opt.targetId)) targets.push(opt.targetId);
        });
      }
      adj.set(n.id, targets);
      targets.forEach((t) => inEdges.get(t)?.push(n.id));
    });

    // 1. DFS 环路检测，识别后向回跳 (back-edges)，得到前向 DAG 邻接表
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const backEdges = new Set<string>();
    const forwardAdj = new Map<string, string[]>();
    nodes.forEach((n) => forwardAdj.set(n.id, []));

    const dfs = (u: string) => {
      visited.add(u);
      inStack.add(u);
      const targets = adj.get(u) || [];
      for (const v of targets) {
        if (inStack.has(v)) {
          backEdges.add(`${u}->${v}`);
        } else {
          forwardAdj.get(u)?.push(v);
          if (!visited.has(v)) {
            dfs(v);
          }
        }
      }
      inStack.delete(u);
    };

    const startNodes = nodes.filter((n) => n.type === 'start').map((n) => n.id);
    const roots = startNodes.length > 0 ? startNodes : (nodes[0] ? [nodes[0].id] : []);
    roots.forEach((sn) => {
      if (!visited.has(sn)) dfs(sn);
    });
    nodes.forEach((n) => {
      if (!visited.has(n.id)) dfs(n.id);
    });

    // 2. 拓扑分层 (Ranks) 计算
    const ranks = new Map<string, number>();
    nodes.forEach((n) => ranks.set(n.id, 0));

    const inDegree = new Map<string, number>();
    nodes.forEach((n) => inDegree.set(n.id, 0));
    forwardAdj.forEach((targets) => {
      targets.forEach((v) => {
        inDegree.set(v, (inDegree.get(v) || 0) + 1);
      });
    });

    const queue: string[] = [];
    roots.forEach((sn) => {
      if ((inDegree.get(sn) || 0) === 0) queue.push(sn);
    });
    nodes.forEach((n) => {
      if ((inDegree.get(n.id) || 0) === 0 && !queue.includes(n.id)) {
        queue.push(n.id);
      }
    });

    while (queue.length > 0) {
      const u = queue.shift()!;
      const curR = ranks.get(u) || 0;
      const targets = forwardAdj.get(u) || [];
      for (const v of targets) {
        ranks.set(v, Math.max(ranks.get(v) || 0, curR + 1));
        const deg = (inDegree.get(v) || 0) - 1;
        inDegree.set(v, deg);
        if (deg === 0) {
          queue.push(v);
        }
      }
    }

    // 3. 按列组织节点并依据父节点分支端口次序排序
    const rankGroups = new Map<number, string[]>();
    nodes.forEach((n) => {
      const r = ranks.get(n.id) || 0;
      if (!rankGroups.has(r)) rankGroups.set(r, []);
      rankGroups.get(r)!.push(n.id);
    });

    const maxRank = Math.max(...Array.from(rankGroups.keys()), 0);
    const rankOrder = new Map<number, string[]>();

    for (let r = 0; r <= maxRank; r++) {
      if (r === 0) {
        rankOrder.set(0, rankGroups.get(0) || []);
      } else {
        const ordered: string[] = [];
        const seen = new Set<string>();
        const prevNodes = rankOrder.get(r - 1) || [];
        for (const p of prevNodes) {
          const children = forwardAdj.get(p) || [];
          for (const c of children) {
            if (ranks.get(c) === r && !seen.has(c)) {
              seen.add(c);
              ordered.push(c);
            }
          }
        }
        (rankGroups.get(r) || []).forEach((nid) => {
          if (!seen.has(nid)) {
            seen.add(nid);
            ordered.push(nid);
          }
        });
        rankOrder.set(r, ordered);
      }
    }

    // 4. 计算列 X 坐标
    const colX = new Map<number, number>();
    let curX = 40;
    for (let r = 0; r <= maxRank; r++) {
      colX.set(r, curX);
      const rNodes = rankOrder.get(r) || [];
      let maxW = 260;
      rNodes.forEach((nid) => {
        const n = nodeMap.get(nid);
        if (n) maxW = Math.max(maxW, getNodeWidth(n));
      });
      const gap = maxW >= 280 ? 50 : 60;
      curX += maxW + gap;
    }

    // 5. 纵向排列并计算 Y 坐标（Pass 1 前向平均对齐，Pass 2 后向父节点居中，Pass 3 间隙防碰撞）
    const positions = new Map<string, { x: number; y: number }>();
    const minGap = 50;

    let yCursor = 100;
    (rankOrder.get(0) || []).forEach((nid) => {
      const n = nodeMap.get(nid)!;
      positions.set(nid, { x: colX.get(0) || 40, y: yCursor });
      yCursor += getNodeHeight(n) + minGap;
    });

    for (let r = 1; r <= maxRank; r++) {
      const nodesInRank = rankOrder.get(r) || [];
      const targetYs = new Map<string, number>();

      nodesInRank.forEach((nid) => {
        const n = nodeMap.get(nid)!;
        const parents = (inEdges.get(nid) || []).filter(
          (p) => positions.has(p) && !backEdges.has(`${p}->${nid}`)
        );
        if (parents.length > 0) {
          const sumY = parents.reduce((acc, p) => {
            const pNode = nodeMap.get(p)!;
            const pPos = positions.get(p)!;
            return acc + pPos.y + getNodeHeight(pNode) / 2;
          }, 0);
          targetYs.set(nid, sumY / parents.length - getNodeHeight(n) / 2);
        } else {
          targetYs.set(nid, 100);
        }
      });

      let prevBottom = -999999;
      nodesInRank.forEach((nid) => {
        const n = nodeMap.get(nid)!;
        const h = getNodeHeight(n);
        const desiredY = targetYs.get(nid) ?? 100;
        const actualY = Math.max(desiredY, prevBottom + minGap);
        positions.set(nid, { x: colX.get(r) || 40, y: actualY });
        prevBottom = actualY + h;
      });
    }

    // Pass 2: 后向居中父节点
    for (let r = maxRank - 1; r >= 0; r--) {
      const nodesInRank = rankOrder.get(r) || [];
      nodesInRank.forEach((nid) => {
        const n = nodeMap.get(nid)!;
        const children = (forwardAdj.get(nid) || []).filter((c) => positions.has(c));
        if (children.length > 0) {
          const firstC = children[0];
          const lastC = children[children.length - 1];
          const firstPos = positions.get(firstC)!;
          const lastPos = positions.get(lastC)!;
          const lastNode = nodeMap.get(lastC)!;
          const childrenCenter = (firstPos.y + lastPos.y + getNodeHeight(lastNode)) / 2;
          const h = getNodeHeight(n);
          positions.get(nid)!.y = childrenCenter - h / 2;
        }
      });

      // 消除该层重叠
      let prevBottom = -999999;
      nodesInRank.forEach((nid) => {
        const n = nodeMap.get(nid)!;
        const h = getNodeHeight(n);
        const pos = positions.get(nid)!;
        if (pos.y < prevBottom + minGap) {
          pos.y = prevBottom + minGap;
        }
        prevBottom = pos.y + h;
      });
    }

    // Pass 3: 归一化 Y 偏移，使顶部节点从 y=60 开始
    let minY = Infinity;
    positions.forEach((pos) => {
      minY = Math.min(minY, pos.y);
    });
    const yShift = 60 - (isFinite(minY) ? minY : 60);

    // 写入 project 并记录操作历史
    project.change((d) => {
      const targetEv = d.events.find((x) => x.id === eventId);
      if (!targetEv || !targetEv.actionGraph) return;
      targetEv.actionGraph.nodes.forEach((node) => {
        const pos = positions.get(node.id);
        if (pos) {
          node.x = pos.x;
          node.y = Math.round(pos.y + yShift);
        }
      });
    }, 'structure');

    // 重新渲染当前子图与连线，并平移重置视角
    this.rebuildSubGraphDOM(eventId);
    this.panX = 60;
    this.panY = 50;
    this.zoom = 1.0;
    this.updateTransform();
    this.renderEdges(appState.getState());
    appState.log(`📐 已将事件 [${ev.title}] 的内部节点自动整理为清晰流程图布局！`, true);
  }

  public updateNodeAppearance(id: string): void {
    const el = document.getElementById(`node-${id}`);
    if (!el) return;
    const ev = project.getEvent(id);
    const cond = project.getCondition(id);
    const titleEl = el.querySelector('.node-title');
    if (titleEl) {
      if (ev) titleEl.textContent = ev.title;
      if (cond) titleEl.textContent = cond.title;
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
      const el = document.getElementById(`node-${id}`) || document.getElementById(`subnode-${id}`);
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

  public createNodeAt(type: 'event' | 'condition', canvasX: number, canvasY: number): string {
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
      const cond = project.addCondition(canvasX, canvasY);
      appState.select({ kind: 'condition', id: cond.id });
      appState.log(`🔍 拖拽生成 Condition 条件节点：[${cond.title}] (坐标: ${canvasX}, ${canvasY})`, true);
      this.pulseNode(cond.id);
      return cond.id;
    }
  }

  public createNodeAtCenter(type: 'event' | 'condition'): string {
    const center = this.getViewportCenterCanvasPos();
    const p = project.get();
    const count = type === 'event' ? p.events.length : p.conditions.length;
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
      if ((e.target as HTMLElement).closest('.node-port')) return;
      if ((e.target as HTMLElement).closest('.wire-drop-menu')) return;
      if (this.activeWire) return;
      // 允许左键空白区或中键平移
      if (e.button !== 0 && e.button !== 1) return;
      this.isPanning = true;
      this.hasMovedPanning = false;
      this.startPanX = e.clientX - this.panX;
      this.startPanY = e.clientY - this.panY;
      this.closeContextMenu();
      this.closeDropMenu();
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
        if (this.viewMode === 'subgraph' && this.subGraphEventId) {
          appState.select({ kind: 'event', id: this.subGraphEventId });
        } else {
          appState.select(null);
        }
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

    if (this.viewMode === 'subgraph') {
      menu.innerHTML = `
        <div class="ctx-item" data-action="add-sub-action">🎬 新建复合动作 Action</div>
        <div class="ctx-item" data-action="add-sub-selector">🔀 新建条件分支 Selector</div>
        <div class="ctx-item" data-action="add-sub-choice">💬 新建玩家选项 Choice</div>
        <div class="ctx-divider"></div>
        <div class="ctx-item" data-action="back-to-main">← 返回全局大图 (ESC)</div>
      `;
    } else {
      menu.innerHTML = `
        <div class="ctx-item" data-action="add-event">💬 新建 Event 对话/事件节点</div>
        <div class="ctx-item" data-action="add-condition">🔍 新建 Condition 条件节点</div>
        <div class="ctx-divider"></div>
        <div class="ctx-item" data-action="reset-layout">📐 恢复标准排列布局</div>
      `;
    }

    menu.querySelectorAll('.ctx-item').forEach((item) => {
      (item as HTMLElement).onclick = (e) => {
        e.stopPropagation();
        const action = (item as HTMLElement).dataset.action;
        this.closeContextMenu();
        if (action === 'add-sub-action') {
          this.createSubNodeAt('action', cx, cy);
        } else if (action === 'add-sub-selector') {
          this.createSubNodeAt('selector', cx, cy);
        } else if (action === 'add-sub-choice') {
          this.createSubNodeAt('choice', cx, cy);
        } else if (action === 'back-to-main') {
          appState.setSubGraphEventId(null);
        } else if (action === 'add-event') {
          const ev = project.addEvent(cx, cy);
          appState.select({ kind: 'event', id: ev.id });
          appState.log(`✨ 新建 Event 节点：[${ev.title}]`, true);
        } else if (action === 'add-condition') {
          const cond = project.addCondition(cx, cy);
          appState.select({ kind: 'condition', id: cond.id });
          appState.log(`✨ 新建 Condition 条件节点：[${cond.title}]`, true);
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
