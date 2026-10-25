import { AnyGraphNode, ConditionNode, EventNode, GraphEdge, WorldState } from '../core/types';
import {
  CONDITION_NODES,
  EVENT_NODES,
  REGION_NODES,
  EDGES
} from '../core/castleData';
import { appState } from '../core/state';
import { RpgDialog } from './RpgDialog';

interface NodeLayoutPos {
  x: number;
  y: number;
}

export class GraphCanvas {
  private viewport: HTMLElement;
  private canvas: HTMLElement;
  private svgEdges: SVGSVGElement;
  private edgeLabelsContainer: HTMLElement;
  private nodesContainer: HTMLElement;

  // 实体聚焦独立图谱顶栏浮标
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
  private nodeInitialX = 0;
  private nodeInitialY = 0;

  private allNodesMap: Record<string, AnyGraphNode> = {};
  private defaultPositions: Record<string, NodeLayoutPos> = {};

  // 视图模式：'main' = 全局任务大图, 'focal' = 围绕特定实体的独立图谱
  private viewMode: 'main' | 'focal' = 'main';
  private focalEntityId: string | null = null;
  private focalPositions: Record<string, NodeLayoutPos> = {};

  constructor(private dialog: RpgDialog) {
    this.viewport = document.getElementById('graphViewport') as HTMLElement;
    this.canvas = document.getElementById('graphCanvas') as HTMLElement;
    this.svgEdges = document.getElementById('svgEdges') as unknown as SVGSVGElement;
    this.edgeLabelsContainer = document.getElementById('edgeLabelsContainer') as HTMLElement;
    this.nodesContainer = document.getElementById('nodesContainer') as HTMLElement;

    this.focalBanner = document.getElementById('focalBanner') as HTMLElement;
    this.btnBackToMain = document.getElementById('btnBackToMain') as HTMLElement;
    this.focalTitle = document.getElementById('focalTitle') as HTMLElement;
    this.focalStatusPill = document.getElementById('focalStatusPill') as HTMLElement;
    this.focalSourcesCount = document.getElementById('focalSourcesCount') as HTMLElement;
    this.focalTargetsCount = document.getElementById('focalTargetsCount') as HTMLElement;

    this.initNodesMap();
    this.initMainDOM();
    this.bindViewportEvents();
    this.bindFocalBannerEvents();

    appState.onStateChange((state) => this.render(state));
    appState.onModeChange(() => this.render(appState.getState()));
    appState.onReset(() => this.resetLayout());
    appState.onFocalEntityChange((entityId) => {
      if (entityId) {
        this.showFocalGraph(entityId);
      } else {
        this.showMainGraph();
      }
    });

    appState.onSelectedNodeChange((node) => {
      if (node) {
        if (this.viewMode === 'main' && node.type === 'condition' && (node as ConditionNode).showOnMainGraph === false) {
          // 该节点不在大图上，自动切换至该实体的独立图谱
          appState.setFocalEntity(node.id);
          return;
        }
        this.centerOnNode(node);
      }
      this.updateSelectedClass();
    });

    this.updateTransform();
    this.render(appState.getState());
  }

  private initNodesMap(): void {
    [...CONDITION_NODES, ...EVENT_NODES, ...REGION_NODES].forEach((n) => {
      this.allNodesMap[n.id] = n;
      this.defaultPositions[n.id] = { x: n.x, y: n.y };
    });
  }

  /**
   * 恢复所有节点为默认的无遮挡/无挤压布局排布
   */
  public resetLayout(): void {
    [...CONDITION_NODES, ...EVENT_NODES, ...REGION_NODES].forEach((n) => {
      const def = this.defaultPositions[n.id];
      if (def) {
        n.x = def.x;
        n.y = def.y;
        const el = document.getElementById(`node-${n.id}`);
        if (el) {
          el.style.left = `${def.x}px`;
          el.style.top = `${def.y}px`;
        }
      }
    });
    this.panX = 40;
    this.panY = 20;
    this.zoom = 0.95;
    this.updateTransform();
    this.renderEdges(appState.getState());
  }

  /**
   * 1. 全局大图 DOM 初始化：仅渲染大图所需的任务与核心门禁条件节点
   */
  private initMainDOM(): void {
    this.nodesContainer.innerHTML = '';
    this.focalPositions = {};

    // 1. 条件与触发器节点 (仅在大图上展示作为 Trigger 的核心前置条件)
    CONDITION_NODES.filter((node) => node.showOnMainGraph !== false).forEach((node) => {
      const el = document.createElement('div');
      el.id = `node-${node.id}`;
      const isTrigger = node.title.includes('trigger');
      el.className = `graph-node condition-node ${isTrigger ? 'trigger-node' : ''} compact-node`;
      el.dataset.id = node.id;
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;

      el.innerHTML = `
        <div class="cond-status-led"></div>
        <div class="node-title">${node.title}</div>
      `;

      this.attachNodeInteraction(el, node);
      this.nodesContainer.appendChild(el);
    });

    // 2. 事件节点 (全量展示剧情与交互任务)
    EVENT_NODES.forEach((node) => {
      const el = document.createElement('div');
      el.id = `node-${node.id}`;
      el.className = 'graph-node event-node compact-node';
      el.dataset.id = node.id;
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;

      el.innerHTML = `
        <div class="event-status-dot status-dot"></div>
        <div class="node-title">${node.title}</div>
        <span class="event-status-pill status-pill"></span>
      `;

      this.attachNodeInteraction(el, node);
      this.nodesContainer.appendChild(el);
    });

    // 3. 区域大节点
    REGION_NODES.forEach((node) => {
      const el = document.createElement('div');
      el.id = `node-${node.id}`;
      el.className = 'graph-node region-node compact-node';
      el.dataset.id = node.id;
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;

      el.innerHTML = `
        <div class="node-title">${node.title}</div>
        <span class="event-status-pill status-pill"></span>
      `;

      this.attachNodeInteraction(el, node);
      this.nodesContainer.appendChild(el);
    });
  }

  /**
   * 2. 围绕特定实体的独立图谱 DOM 初始化：
   * 左侧：所有产出/触发该实体的事件 (Sources)
   * 中间：被点击聚焦的实体节点 (Focal Center)
   * 右侧：所有依赖/被该实体触发的事件与门禁 (Targets)
   */
  private initFocalDOM(entityId: string): void {
    this.nodesContainer.innerHTML = '';
    this.focalPositions = {};

    const focalNode = this.allNodesMap[entityId] as ConditionNode | undefined;
    if (!focalNode) return;

    // 收集所有与该实体直接相连的连线
    const inEdges = EDGES.filter((e) => e.to === entityId);
    const outEdges = EDGES.filter((e) => e.from === entityId);

    const sourceNodes: AnyGraphNode[] = [];
    inEdges.forEach((e) => {
      const n = this.allNodesMap[e.from];
      if (n && !sourceNodes.some((sn) => sn.id === n.id)) sourceNodes.push(n);
    });

    const targetNodes: AnyGraphNode[] = [];
    outEdges.forEach((e) => {
      const n = this.allNodesMap[e.to];
      // 核心原则：左侧为顶层根节点（如国王对话）。
      // 若某个节点已作为源起顶层节点存在于左侧 sourceNodes 中（代表与当前 trigger 相互影响），
      // 则绝不可在右侧作为下游节点重复生成！保持顶层节点的唯一性！
      if (n && !sourceNodes.some((sn) => sn.id === n.id) && !targetNodes.some((tn) => tn.id === n.id)) {
        targetNodes.push(n);
      }
    });

    // 计算三栏纵向居中对齐坐标
    const maxRows = Math.max(1, sourceNodes.length, targetNodes.length);
    const centerY = Math.max(180, 100 + (maxRows - 1) * 55);

    // 1. 中间焦点实体节点
    const focalX = 480;
    const focalY = centerY;
    this.focalPositions[focalNode.id] = { x: focalX, y: focalY };

    const focalEl = document.createElement('div');
    focalEl.id = `node-${focalNode.id}`;
    focalEl.className = 'graph-node condition-node compact-node focal-center-node';
    focalEl.dataset.id = focalNode.id;
    focalEl.style.left = `${focalX}px`;
    focalEl.style.top = `${focalY}px`;
    focalEl.innerHTML = `
      <div class="cond-status-led"></div>
      <div class="node-title">${focalNode.title}</div>
    `;
    this.attachNodeInteraction(focalEl, focalNode);
    this.nodesContainer.appendChild(focalEl);

    // 2. 左侧来源节点 (Sources)
    if (sourceNodes.length === 0) {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'focal-placeholder-card';
      emptyCard.style.left = '100px';
      emptyCard.style.top = `${centerY}px`;
      emptyCard.textContent = 'ℹ️ 初始固有/无直接来源对话';
      this.nodesContainer.appendChild(emptyCard);
    } else {
      const startY = centerY - ((sourceNodes.length - 1) * 110) / 2;
      sourceNodes.forEach((node, idx) => {
        const x = 100;
        const y = startY + idx * 110;
        this.focalPositions[node.id] = { x, y };

        const el = this.createNodeElement(node, x, y);
        this.nodesContainer.appendChild(el);
      });
    }

    // 3. 右侧依赖节点 (Targets)
    if (targetNodes.length === 0) {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'focal-placeholder-card';
      emptyCard.style.left = '860px';
      emptyCard.style.top = `${centerY}px`;
      emptyCard.textContent = 'ℹ️ 终端状态 / 无后续剧情门禁';
      this.nodesContainer.appendChild(emptyCard);
    } else {
      const startY = centerY - ((targetNodes.length - 1) * 110) / 2;
      targetNodes.forEach((node, idx) => {
        const x = 860;
        const y = startY + idx * 110;
        this.focalPositions[node.id] = { x, y };

        const el = this.createNodeElement(node, x, y);
        this.nodesContainer.appendChild(el);
      });
    }
  }

  private createNodeElement(node: AnyGraphNode, x: number, y: number): HTMLElement {
    const el = document.createElement('div');
    el.id = `node-${node.id}`;
    el.dataset.id = node.id;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    if (node.type === 'condition') {
      const isTrigger = (node as ConditionNode).title.includes('trigger');
      el.className = `graph-node condition-node ${isTrigger ? 'trigger-node' : ''} compact-node`;
      el.innerHTML = `
        <div class="cond-status-led"></div>
        <div class="node-title">${node.title}</div>
      `;
    } else if (node.type === 'event') {
      el.className = 'graph-node event-node compact-node';
      el.innerHTML = `
        <div class="event-status-dot status-dot"></div>
        <div class="node-title">${node.title}</div>
        <span class="event-status-pill status-pill"></span>
      `;
    } else {
      el.className = 'graph-node region-node compact-node';
      el.innerHTML = `
        <div class="node-title">${node.title}</div>
        <span class="event-status-pill status-pill"></span>
      `;
    }

    this.attachNodeInteraction(el, node);
    return el;
  }

  private attachNodeInteraction(el: HTMLElement, node: AnyGraphNode): void {
    let hasMoved = false;

    el.onmousedown = (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      hasMoved = false;
      this.draggingNodeId = node.id;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      const pos = this.getNodeCurrentPos(node);
      this.nodeInitialX = pos.x;
      this.nodeInitialY = pos.y;
    };

    window.addEventListener('mousemove', (e) => {
      if (this.draggingNodeId !== node.id) return;
      const dx = (e.clientX - this.dragStartX) / this.zoom;
      const dy = (e.clientY - this.dragStartY) / this.zoom;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMoved = true;
      }
      const newX = Math.round(this.nodeInitialX + dx);
      const newY = Math.round(this.nodeInitialY + dy);

      if (this.viewMode === 'focal') {
        this.focalPositions[node.id] = { x: newX, y: newY };
      } else {
        node.x = newX;
        node.y = newY;
      }

      el.style.left = `${newX}px`;
      el.style.top = `${newY}px`;
      this.renderEdges(appState.getState());
    });

    window.addEventListener('mouseup', () => {
      if (this.draggingNodeId === node.id) {
        this.draggingNodeId = null;
      }
    });

    el.onclick = (e) => {
      e.stopPropagation();
      if (hasMoved) return;

      // 无论何种节点，点击都聚焦并选定它（在右侧面板展示其所有关联关系与详情）
      appState.setSelectedNode(node);

      if (node.type === 'condition') {
        // 点击条件节点：展示该实体详情
        appState.log(`🎯 选定实体 [${node.title}]，可在右侧栏查看所有相连对话。`, true);
      } else if (appState.getMode() === 'play' && 'execute' in node && typeof (node as EventNode).execute === 'function') {
        // 只有事件/对话节点在 Play 模式下才能触发动作，改写玩家状态！
        (node as EventNode).execute(
          appState.getState(),
          (dialogConfig) => {
            this.dialog.show(dialogConfig, () => {
              this.render(appState.getState());
            });
          },
          (msg, highlight) => {
            appState.log(msg, highlight);
          }
        );
        this.render(appState.getState());
      }
    };
  }

  private getNodeCurrentPos(node: AnyGraphNode): NodeLayoutPos {
    if (this.viewMode === 'focal' && this.focalPositions[node.id]) {
      return this.focalPositions[node.id];
    }
    return { x: node.x, y: node.y };
  }

  public showMainGraph(): void {
    if (this.viewMode === 'main' && !this.focalEntityId) return;
    this.viewMode = 'main';
    this.focalEntityId = null;
    this.focalBanner.classList.add('hidden');

    this.initMainDOM();
    this.panX = 40;
    this.panY = 20;
    this.zoom = 0.95;
    this.updateTransform();
    this.render(appState.getState());
    appState.log('🌐 已返回全局任务大图。', true);
  }

  public showFocalGraph(entityId: string): void {
    const focalNode = this.allNodesMap[entityId] as ConditionNode | undefined;
    if (!focalNode) return;

    this.viewMode = 'focal';
    this.focalEntityId = entityId;
    this.focalBanner.classList.remove('hidden');

    this.initFocalDOM(entityId);
    this.centerFocalView();
    this.render(appState.getState());
    appState.setSelectedNode(focalNode);
  }

  private centerFocalView(): void {
    const vW = this.viewport.clientWidth;
    const vH = this.viewport.clientHeight;
    // 聚焦图谱中心大致在 (480, 200)
    this.panX = Math.round(vW / 2 - 480 * 1.0);
    this.panY = Math.round(vH / 2 - 200 * 1.0);
    this.zoom = 1.0;
    this.updateTransform();
  }

  private bindFocalBannerEvents(): void {
    this.btnBackToMain.onclick = () => {
      appState.setFocalEntity(null);
    };

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.viewMode === 'focal') {
        appState.setFocalEntity(null);
      }
    });
  }

  public render(state: WorldState): void {
    // 1. 条件节点状态更新
    CONDITION_NODES.forEach((node) => {
      const el = document.getElementById(`node-${node.id}`);
      if (!el) return;
      const isSatisfied = node.evaluate(state);

      el.classList.remove('satisfied', 'unsatisfied', 'failed');
      if (node.subType === 'achievement') {
        const achState = state.achievements[
          node.stateKey.replace('achievements.', '') as keyof typeof state.achievements
        ];
        if (achState === 'failed') {
          el.classList.add('failed');
        } else {
          el.classList.add('satisfied');
        }
      } else {
        if (isSatisfied) {
          el.classList.add('satisfied');
        } else {
          el.classList.add('unsatisfied');
        }
      }
    });

    // 2. 事件节点状态更新
    EVENT_NODES.forEach((node) => {
      const el = document.getElementById(`node-${node.id}`);
      if (!el) return;
      const statusPill = el.querySelector('.status-pill') as HTMLElement;
      const label = node.statusLabel(state);
      if (statusPill) statusPill.textContent = label;

      el.classList.remove('available', 'locked', 'gate-locked', 'completed');

      if (node.isAvailable(state)) {
        el.classList.add('available');
        if (statusPill) statusPill.className = 'event-status-pill status-pill status-green';
      } else if (label.includes('拦截')) {
        el.classList.add('gate-locked');
        if (statusPill) statusPill.className = 'event-status-pill status-pill status-amber';
      } else {
        el.classList.add('locked');
        if (statusPill) statusPill.className = 'event-status-pill status-pill status-grey';
      }
    });

    // 3. 区域节点状态更新
    REGION_NODES.forEach((node) => {
      const el = document.getElementById(`node-${node.id}`);
      if (!el) return;
      const statusPill = el.querySelector('.status-pill') as HTMLElement;
      if (statusPill) statusPill.textContent = node.statusLabel(state);
      el.classList.remove('available', 'locked');
      if (node.isAvailable(state)) {
        el.classList.add('available');
        if (statusPill) statusPill.className = 'event-status-pill status-pill status-green';
      } else {
        el.classList.add('locked');
        if (statusPill) statusPill.className = 'event-status-pill status-pill status-grey';
      }
    });

    // 4. 若处于独立聚焦模式，更新顶栏 Banner 状态
    if (this.viewMode === 'focal' && this.focalEntityId) {
      const focalNode = this.allNodesMap[this.focalEntityId] as ConditionNode | undefined;
      if (focalNode) {
        this.focalTitle.textContent = focalNode.title;
        const isSatisfied = focalNode.evaluate(state);

        if (focalNode.subType === 'achievement') {
          const achKey = focalNode.stateKey.replace('achievements.', '') as keyof typeof state.achievements;
          const achState = state.achievements[achKey];
          if (achState === 'failed') {
            this.focalStatusPill.className = 'focal-status-pill status-pill status-red';
            this.focalStatusPill.textContent = '❌ 已熔断 (FAILED)';
          } else {
            this.focalStatusPill.className = 'focal-status-pill status-pill status-green';
            this.focalStatusPill.textContent = '🏆 挑战中 (ACTIVE)';
          }
        } else if (focalNode.subType === 'character') {
          this.focalStatusPill.className = `focal-status-pill status-pill ${isSatisfied ? 'status-green' : 'status-grey'}`;
          this.focalStatusPill.textContent = isSatisfied ? '👸 在队伍中' : '○ 未入队';
        } else {
          this.focalStatusPill.className = `focal-status-pill status-pill ${isSatisfied ? 'status-green' : 'status-grey'}`;
          this.focalStatusPill.textContent = isSatisfied ? '● 状态：已满足 (TRUE)' : '○ 状态：未满足 (FALSE)';
        }

        const inCount = EDGES.filter((e) => e.to === this.focalEntityId).length;
        const outCount = EDGES.filter((e) => e.from === this.focalEntityId).length;
        this.focalSourcesCount.textContent = `📥 ${inCount} 个触发来源`;
        this.focalTargetsCount.textContent = `📤 ${outCount} 个后续依赖`;
      }
    }

    this.updateSelectedClass();
  }

  private updateSelectedClass(): void {
    const selected = appState.getSelectedNode();
    const allNodeEls = document.querySelectorAll('.graph-node');

    allNodeEls.forEach((el) => {
      el.classList.remove('selected', 'focal-center', 'focal-neighbor');
    });

    if (!selected) {
      this.renderEdges(appState.getState());
      return;
    }

    // 查找与选中节点相连的所有邻居节点 ID
    const neighborIds = new Set<string>();
    EDGES.forEach((e) => {
      if (e.from === selected.id) neighborIds.add(e.to);
      if (e.to === selected.id) neighborIds.add(e.from);
    });

    allNodeEls.forEach((el) => {
      const id = (el as HTMLElement).dataset.id;
      if (id === selected.id) {
        el.classList.add('selected', 'focal-center');
      } else if (id && neighborIds.has(id)) {
        el.classList.add('focal-neighbor');
      }
    });

    this.renderEdges(appState.getState());
  }

  public renderEdges(state: WorldState): void {
    this.svgEdges.innerHTML = '';
    this.edgeLabelsContainer.innerHTML = '';

    // 注入 SVG 箭头标记 defs (支持未激活、激活、效果、焦点及反向警示 5 种方向箭头)
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <!-- 未激活连线箭头 (灰蓝，清晰指示流向) -->
      <marker id="arrow-inactive" viewBox="0 0 12 12" refX="10" refY="6"
              markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
        <path d="M 1 2 L 10 6 L 1 10 Z" fill="#64748b" />
      </marker>

      <!-- 激活触发连线箭头 (翡翠绿，流光指示) -->
      <marker id="arrow-active" viewBox="0 0 12 12" refX="10" refY="6"
              markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
        <path d="M 1 2 L 10 6 L 1 10 Z" fill="#10b981" />
      </marker>

      <!-- 特效/解锁连线箭头 (天蓝) -->
      <marker id="arrow-effect" viewBox="0 0 12 12" refX="10" refY="6"
              markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
        <path d="M 1 2 L 10 6 L 1 10 Z" fill="#38bdf8" />
      </marker>

      <!-- 选中焦点高亮箭头 (亮天蓝) -->
      <marker id="arrow-focal" viewBox="0 0 12 12" refX="10" refY="6"
              markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto">
        <path d="M 1 1.5 L 11 6 L 1 10.5 Z" fill="#38bdf8" />
      </marker>

      <!-- 拦截/反向警示箭头 (琥珀黄) -->
      <marker id="arrow-not" viewBox="0 0 12 12" refX="10" refY="6"
              markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
        <path d="M 1 2 L 10 6 L 1 10 Z" fill="#f59e0b" />
      </marker>
    `;
    this.svgEdges.appendChild(defs);

    const selected = appState.getSelectedNode();

    // 过滤要绘制的边：
    // - 在主图模式下：只绘制 showOnMainGraph !== false 的边
    // - 在独立聚焦模式下：只绘制与当前 focalEntity 相连的入边和出边
    const edgesToDraw: GraphEdge[] = this.viewMode === 'focal'
      ? EDGES.filter((e) => e.to === this.focalEntityId || e.from === this.focalEntityId)
      : EDGES.filter((e) => e.showOnMainGraph !== false);

    edgesToDraw.forEach((edge) => {
      const fromNode = this.allNodesMap[edge.from];
      const toNode = this.allNodesMap[edge.to];
      if (!fromNode || !toNode) return;

      const fromEl = document.getElementById(`node-${fromNode.id}`);
      const toEl = document.getElementById(`node-${toNode.id}`);
      if (!fromEl || !toEl) return;

      const posFrom = this.getNodeCurrentPos(fromNode);
      const posTo = this.getNodeCurrentPos(toNode);

      const fromW = fromEl.offsetWidth;
      const fromH = fromEl.offsetHeight;
      const toW = toEl.offsetWidth;
      const toH = toEl.offsetHeight;

      // 根据 gateIndex 或多入边分配入边锚点高度，避免多个箭头重叠
      let targetYRatio = 0.5;
      if (edge.gateIndex === 1) targetYRatio = 0.32;
      else if (edge.gateIndex === 2) targetYRatio = 0.68;

      // 当节点有多条同向出边时，微调出边锚点高度
      let sourceYRatio = 0.5;
      if (edge.from === 'cond_princess_in_party') {
        if (edge.to === 'evt_princess_bed') sourceYRatio = 0.35;
        else if (edge.to === 'evt_clock_cabinet') sourceYRatio = 0.65;
      }

      let x1: number, y1: number, x2: number, y2: number;
      let cx1: number, cy1: number, cx2: number, cy2: number;

      // 箭头尖端微调偏移量（3px），让箭头尖角精准触及目标节点卡片外边缘，避免被 DOM 卡片遮挡
      const ARROW_OFFSET = 3;

      // 核心特征边 1：国王与持有冒险书
      const isKingToBook = edge.from === 'evt_king' && edge.to === 'cond_has_book';
      const isBookToKing = edge.from === 'cond_has_book' && edge.to === 'evt_king';
      const isPrincessToKing = edge.from === 'cond_princess_in_party' && edge.to === 'evt_king';

      if (isKingToBook) {
        // 仅在道具专属图出现：上拱弧线 国王 ➔ 冒险书 (入边：国王送书改变了道具)
        x1 = posFrom.x + fromW;
        y1 = posFrom.y + fromH * 0.35;
        x2 = posTo.x - ARROW_OFFSET;
        y2 = posTo.y + toH * 0.35;
        const dx = Math.max(Math.abs(x2 - x1) * 0.45, 40);
        cx1 = x1 + dx;
        cy1 = y1 - 28;
        cx2 = x2 - dx;
        cy2 = y2 - 28;
      } else if (isBookToKing) {
        // 冒险书 ➔ 国王 (改变国王行为：由初见赐书转为日常指引)
        // 在道具专属图中下拱，与上拱入边分离；在顶层大图中平直指入国王右侧中心
        const isFocal = this.viewMode === 'focal';
        x1 = posFrom.x;
        y1 = posFrom.y + fromH * (isFocal ? 0.65 : 0.5);
        x2 = posTo.x + toW + ARROW_OFFSET;
        y2 = posTo.y + toH * (isFocal ? 0.65 : 0.5);
        const dx = Math.max(Math.abs(x2 - x1) * 0.45, 40);
        cx1 = x1 - dx;
        cy1 = y1 + (isFocal ? 28 : 0);
        cx2 = x2 + dx;
        cy2 = y2 + (isFocal ? 28 : 0);
      } else if (isPrincessToKing) {
        // 公主在队伍 ➔ 国王 (向左上方回环接入国王卡片底部，触发劝说离队分支)
        x1 = posFrom.x;
        y1 = posFrom.y + fromH * 0.35;
        x2 = posTo.x + toW * 0.7;
        y2 = posTo.y + toH + ARROW_OFFSET;
        cx1 = x1 - 80;
        cy1 = y1 - 40;
        cx2 = x2;
        cy2 = y2 + 70;
      } else if (posFrom.x + fromW < posTo.x) {
        // 从左到右常规流向 (主流向：Trigger ➔ Action / Event)
        x1 = posFrom.x + fromW;
        y1 = posFrom.y + fromH * sourceYRatio;
        x2 = posTo.x - ARROW_OFFSET;
        y2 = posTo.y + toH * targetYRatio;
        const dx = Math.max(Math.abs(x2 - x1) * 0.45, 40);
        cx1 = x1 + dx;
        cy1 = y1;
        cx2 = x2 - dx;
        cy2 = y2;
      } else if (posFrom.x > posTo.x + toW) {
        // 从右到左常规流向 (外部依赖反向输入至消费对话节点)
        x1 = posFrom.x;
        y1 = posFrom.y + fromH * sourceYRatio;
        x2 = posTo.x + toW + ARROW_OFFSET;
        y2 = posTo.y + toH * targetYRatio;
        const dx = Math.max(Math.abs(x2 - x1) * 0.45, 40);
        cx1 = x1 - dx;
        cy1 = y1;
        cx2 = x2 + dx;
        cy2 = y2;
      } else if (posFrom.y + fromH < posTo.y) {
        // 从上到下流向
        x1 = posFrom.x + fromW / 2;
        y1 = posFrom.y + fromH;
        x2 = posTo.x + toW / 2;
        y2 = posTo.y - ARROW_OFFSET;
        const dy = Math.max(Math.abs(y2 - y1) * 0.45, 30);
        cx1 = x1;
        cy1 = y1 + dy;
        cx2 = x2;
        cy2 = y2 - dy;
      } else {
        // 从下到上流向
        x1 = posFrom.x + fromW / 2;
        y1 = posFrom.y;
        x2 = posTo.x + toW / 2;
        y2 = posTo.y + toH + ARROW_OFFSET;
        const dy = Math.max(Math.abs(y2 - y1) * 0.45, 30);
        cx1 = x1;
        cy1 = y1 - dy;
        cx2 = x2;
        cy2 = y2 + dy;
      }

      const pathD = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;

      const isActive = edge.checkActive(state);
      const isFocalEdge = selected ? edge.from === selected.id || edge.to === selected.id : false;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathD);

      let edgeClass = `edge-path ${edge.type}`;
      edgeClass += isActive ? ' active' : ' inactive';

      if (selected && isFocalEdge) {
        edgeClass += ' focal-edge';
      }

      path.setAttribute('class', edgeClass);

      // 绑定方向指示箭头
      let markerId = 'arrow-inactive';
      if (selected && isFocalEdge) {
        markerId = 'arrow-focal';
      } else if (isActive) {
        if (edge.isInverted) {
          markerId = 'arrow-not';
        } else if (edge.type === 'effect') {
          markerId = 'arrow-effect';
        } else {
          markerId = 'arrow-active';
        }
      } else {
        markerId = 'arrow-inactive';
      }
      path.setAttribute('marker-end', `url(#${markerId})`);

      // 仅在鼠标悬停连线时显示轻量原生提示，去除画布上冗余的文字药丸介绍，保持画面极简干净
      const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      titleEl.textContent = `${fromNode.title} ➔ ${toNode.title}`;
      path.appendChild(titleEl);

      this.svgEdges.appendChild(path);
    });
  }

  public centerOnNode(node: AnyGraphNode): void {
    const pos = this.getNodeCurrentPos(node);
    const vW = this.viewport.clientWidth;
    const vH = this.viewport.clientHeight;
    this.panX = Math.round(vW / 2 - (pos.x + 100) * this.zoom);
    this.panY = Math.round(vH / 2 - (pos.y + 20) * this.zoom);
    this.updateTransform();
  }

  public updateNodeAppearance(node: AnyGraphNode): void {
    const el = document.getElementById(`node-${node.id}`);
    if (!el) return;
    const titleEl = el.querySelector('.node-title');
    if (titleEl) titleEl.textContent = node.title;
  }

  private updateTransform(): void {
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  private bindViewportEvents(): void {
    this.viewport.onmousedown = (e) => {
      if (e.button !== 0) return;
      this.isPanning = true;
      this.hasMovedPanning = false;
      this.startPanX = e.clientX - this.panX;
      this.startPanY = e.clientY - this.panY;
    };

    window.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      const dx = Math.abs(e.clientX - (this.startPanX + this.panX));
      const dy = Math.abs(e.clientY - (this.startPanY + this.panY));
      if (dx > 3 || dy > 3) {
        this.hasMovedPanning = true;
      }
      this.panX = e.clientX - this.startPanX;
      this.panY = e.clientY - this.startPanY;
      this.updateTransform();
    });

    window.addEventListener('mouseup', () => {
      this.isPanning = false;
    });

    // 点击空白画布取消焦点聚焦模式
    this.viewport.onclick = (e) => {
      if (this.hasMovedPanning) return;
      if (
        e.target === this.viewport ||
        e.target === this.canvas ||
        e.target === this.svgEdges ||
        e.target === this.edgeLabelsContainer
      ) {
        appState.setSelectedNode(null);
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
}
