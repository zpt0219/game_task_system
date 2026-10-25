import { AnyGraphNode, ConditionNode, EventNode } from '../core/types';
import { EDGES, EVENT_NODES, CONDITION_NODES, REGION_NODES } from '../core/castleData';
import { appState } from '../core/state';
import { parseBBCode } from '../utils/bbcode';
import { RpgDialog } from './RpgDialog';

export class NodeInspector {
  private contentEl: HTMLElement;
  private currentNode: AnyGraphNode | null = null;
  private allNodesMap: Record<string, AnyGraphNode> = {};

  constructor(
    private dialog: RpgDialog,
    private onNodeUpdated: (node: AnyGraphNode) => void
  ) {
    this.contentEl = document.getElementById('inspectorContent') as HTMLElement;

    [...CONDITION_NODES, ...EVENT_NODES, ...REGION_NODES].forEach((n) => {
      this.allNodesMap[n.id] = n;
    });

    appState.onSelectedNodeChange((node) => {
      this.currentNode = node;
      this.render();
    });

    appState.onStateChange(() => {
      if (this.currentNode) {
        this.render();
      }
    });

    appState.onModeChange(() => {
      this.render();
    });

    this.render();
  }

  public render(): void {
    if (!this.currentNode) {
      this.contentEl.innerHTML = `
        <div class="empty-inspector">
          <div style="font-size: 40px; margin-bottom: 12px; opacity: 0.6;">🎯</div>
          <div style="font-size: 14px; font-weight: 700; color: #f3f4f6; margin-bottom: 6px;">全图总览态</div>
          <div style="font-size: 12px; color: #9ca3af; line-height: 1.6; text-align: center;">
            点击左侧栏的 <b>人物/道具/传送点</b>，<br/>
            或画布上的任意节点，<br/>
            此处将以其为中心，展示所有相连的对话与依赖事件。
          </div>
        </div>
      `;
      return;
    }

    const node = this.currentNode;
    const mode = appState.getMode();

    this.contentEl.innerHTML = '';

    if (node.type === 'condition') {
      this.renderConditionEntityView(node as ConditionNode);
    } else {
      this.renderEventNodeView(node);
    }

    // Edit 模式下的编辑字段
    if (mode === 'edit') {
      this.renderEditFields(node);
    }
  }

  /**
   * 重点：以道具/人物/条件等实体为中心展示的关系面板
   */
  private renderConditionEntityView(node: ConditionNode): void {
    const state = appState.getState();
    const isSatisfied = node.evaluate(state);

    // 1. 实体概览卡片
    const metaCard = document.createElement('div');
    metaCard.className = 'inspector-section focal-entity-header';
    metaCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span class="cond-tag ${node.subType}">实体 / ${node.subType}</span>
        <span class="event-status-pill ${isSatisfied ? 'status-green' : 'status-grey'}">
          ${isSatisfied ? '● 状态：已满足 (TRUE)' : '○ 状态：未满足 (FALSE)'}
        </span>
      </div>
      <div style="font-size: 17px; font-weight: 700; color: #fff; margin-bottom: 6px;">
        ${node.title}
      </div>
      <div style="font-size: 12px; color: #9ca3af; line-height: 1.5; margin-bottom: 8px;">
        ${node.desc}
      </div>
      <div style="font-size: 11px; color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(56, 189, 248, 0.2); margin-bottom: 8px;">
        💡 状态由游戏内对话/交互驱动变更，不可直接篡改。点击下方相连对话可直接交互。
      </div>
      <button id="btnViewEntityGraph" class="primary-btn" style="width: 100%; font-size: 12px; padding: 7px 12px; display: flex; align-items: center; justify-content: center; gap: 6px; border-radius: 6px; cursor: pointer;">
        <span>🔍</span> 在画布单独查看围绕它的图谱
      </button>
    `;
    this.contentEl.appendChild(metaCard);

    const btnViewGraph = metaCard.querySelector('#btnViewEntityGraph') as HTMLElement | null;
    if (btnViewGraph) {
      btnViewGraph.onclick = () => {
        appState.setFocalEntity(node.id);
      };
    }

    // 查找与此条件相连的所有入边 (谁产出它) 和出边 (谁依赖它)
    const incomingEdges = EDGES.filter((e) => e.to === node.id);
    const outgoingEdges = EDGES.filter((e) => e.from === node.id);

    // 2. 📥 产出/来源对话节点
    const sourceCard = document.createElement('div');
    sourceCard.className = 'inspector-section';
    sourceCard.innerHTML = `
      <div class="inspector-label" style="color: #10b981;">
        📥 触发来源与产出对话 (${incomingEdges.length} 个)
      </div>
      <div style="font-size: 11px; color: #9ca3af; margin-bottom: 8px;">
        与以下对话节点交互可激活或获得此项：
      </div>
      <div class="entity-rel-list">
        ${
          incomingEdges.length === 0
            ? '<div style="color: #64748b; font-size: 11px;">无直接产出对话 (初始固有状态)</div>'
            : incomingEdges
                .map((e) => {
                  const eventNode = this.allNodesMap[e.from] as EventNode;
                  const isActive = e.checkActive(state);
                  return `
              <div class="rel-dialog-card" data-node-id="${eventNode.id}" style="border-left: 3px solid #10b981;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <span style="font-weight: 700; font-size: 13px; color: #f8fafc;">${eventNode.title}</span>
                  <span class="event-status-pill ${isActive ? 'status-green' : 'status-grey'}">
                    ${isActive ? '已达成' : '可前往触发'}
                  </span>
                </div>
                <div style="font-size: 11px; color: #6ee7b7; margin-bottom: 6px;">
                  效果动作: ${e.label}
                </div>
                <button class="mini-btn-action btn-goto-node" data-target-id="${eventNode.id}">
                  前往该对话 ▶
                </button>
              </div>
            `;
                })
                .join('')
        }
      </div>
    `;
    this.contentEl.appendChild(sourceCard);

    // 3. 📤 依赖/受控事件节点 (谁需要它)
    const dependentCard = document.createElement('div');
    dependentCard.className = 'inspector-section';
    dependentCard.innerHTML = `
      <div class="inspector-label" style="color: #38bdf8;">
        📤 依赖此项的事件与门禁 (${outgoingEdges.length} 个)
      </div>
      <div style="font-size: 11px; color: #9ca3af; margin-bottom: 8px;">
        此项满足后，将赋能或解锁以下对话/场景/门禁：
      </div>
      <div class="entity-rel-list">
        ${
          outgoingEdges.length === 0
            ? '<div style="color: #64748b; font-size: 11px;">无后续直接依赖事件</div>'
            : outgoingEdges
                .map((e) => {
                  const eventNode = this.allNodesMap[e.to] as EventNode;
                  const isActive = e.checkActive(state);
                  return `
              <div class="rel-dialog-card" data-node-id="${eventNode.id}" style="border-left: 3px solid #38bdf8;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <span style="font-weight: 700; font-size: 13px; color: #f8fafc;">${eventNode.title}</span>
                  <span class="event-status-pill ${isActive ? 'status-green' : 'status-amber'}">
                    ${isActive ? '✓ 前置已满足' : '🔒 前置缺失'}
                  </span>
                </div>
                <div style="font-size: 11px; color: #94a3b8; margin-bottom: 6px;">
                  校验规则: ${e.label} ${e.isInverted ? "<span style='color: #f59e0b;'>[NOT 取反]</span>" : ''}
                </div>
                <button class="mini-btn-action btn-goto-node" data-target-id="${eventNode.id}">
                  前往该事件 ▶
                </button>
              </div>
            `;
                })
                .join('')
        }
      </div>
    `;
    this.contentEl.appendChild(dependentCard);

    this.bindGotoButtons();
  }

  /**
   * 对话/事件节点的 ActionSequence 详细面板
   */
  private renderEventNodeView(node: AnyGraphNode): void {
    const state = appState.getState();
    const mode = appState.getMode();

    // 1. 顶部基础卡片
    const metaCard = document.createElement('div');
    metaCard.className = 'inspector-section';

    let statusText = '';
    let statusClass = 'status-green';
    if ('statusLabel' in node) {
      statusText = node.statusLabel(state);
      if (statusText.includes('拦截')) statusClass = 'status-amber';
      else if (statusText.includes('已完成') || statusText.includes('已出城')) statusClass = 'status-blue';
      else if (statusText.includes('🔒')) statusClass = 'status-grey';
    }

    metaCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
        <span class="event-type-badge">${node.type.toUpperCase()} / ${node.subType}</span>
        <span class="event-status-pill ${statusClass}">${statusText}</span>
      </div>
      <div style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 6px;">
        ${node.title}
      </div>
      ${
        'sourceRef' in node && node.sourceRef
          ? `<div style="font-size: 11px; color: #38bdf8; font-family: monospace;">代码绑定: ${node.sourceRef}</div>`
          : ''
      }
      <div style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin-top: 8px;">
        ${node.desc}
      </div>
    `;
    this.contentEl.appendChild(metaCard);

    // 2. Play 模式快速执行操作区
    if (mode === 'play' && ('execute' in node && typeof node.execute === 'function')) {
      const actionCard = document.createElement('div');
      actionCard.className = 'inspector-section';
      actionCard.innerHTML = `
        <button id="btnTriggerAction" class="dialog-btn primary-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <span>▶</span> 触发此对话/交互 (Play Sequence)
        </button>
      `;
      this.contentEl.appendChild(actionCard);

      const btn = actionCard.querySelector('#btnTriggerAction') as HTMLButtonElement;
      btn.onclick = () => {
        node.execute(
          appState.getState(),
          (dialogConfig) => {
            this.dialog.show(dialogConfig, () => {
              this.render();
            });
          },
          (msg, highlight) => {
            appState.log(msg, highlight);
          }
        );
      };
    }

    // 3. ActionSequence 详细步骤与分支 (Cells)
    if ('cells' in node && node.cells && node.cells.length > 0) {
      const cellsCard = document.createElement('div');
      cellsCard.className = 'inspector-section';
      cellsCard.innerHTML = `
        <div class="inspector-label">ActionSequence 内部流程与分支 (${node.cells.length} 项)</div>
        <div class="cells-flow-list">
          ${node.cells
            .map((c, i) => {
              const cellTitle = c.title || `步骤 ${i + 1}: [${c.type}]`;
              const condBadge = c.condition
                ? `<div style="font-size: 11px; color: #fbbf24; font-family: monospace; margin-bottom: 4px;">分支条件: ${c.condition}</div>`
                : '';
              const textContent = c.text ? parseBBCode(c.text) : c.action || JSON.stringify(c);

              return `
              <div class="cell-step-card">
                <div style="font-weight: 700; color: #60a5fa; margin-bottom: 4px;">${cellTitle}</div>
                ${condBadge}
                <div style="color: #e2e8f0; font-size: 12px; line-height: 1.5; white-space: pre-wrap;">${textContent}</div>
              </div>
            `;
            })
            .join('')}
        </div>
      `;
      this.contentEl.appendChild(cellsCard);
    }

    // 4. 依赖条件与后续影响
    const incomingEdges = EDGES.filter((e) => e.to === node.id);
    const outgoingEdges = EDGES.filter((e) => e.from === node.id);

    const topoCard = document.createElement('div');
    topoCard.className = 'inspector-section';
    topoCard.innerHTML = `
      <div class="inspector-label">关联条件与影响 (外部依赖)</div>
      
      <div style="font-size: 12px; font-weight: 700; color: #10b981; margin-bottom: 6px;">
        📥 外部依赖与输入条件 (External Dependencies / Triggers): ${incomingEdges.length} 条
      </div>
      ${
        incomingEdges.length === 0
          ? "<div style='color: #64748b; font-size: 11px; margin-bottom: 12px;'>无前置外部依赖 (常驻可触发)</div>"
          : incomingEdges
              .map((e) => {
                const condNode = this.allNodesMap[e.from];
                const isActive = e.checkActive(state);
                return `
              <div class="rel-dialog-card" data-node-id="${condNode.id}" style="border-left: 3px solid ${isActive ? '#10b981' : '#475569'}; margin-bottom: 6px;">
                <div style="display: flex; justify-content: space-between; font-size: 12px;">
                  <span style="font-weight: 600; color: #f8fafc;">${condNode.title}</span>
                  <span style="color: ${isActive ? '#34d399' : '#94a3b8'};">${isActive ? '✓ 满足 (TRUE)' : '○ 未满足 (FALSE)'}</span>
                </div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
                  依赖规则: ${e.label} ${e.isInverted ? "<span style='color: #f59e0b;'>[NOT 取反]</span>" : ''}
                </div>
                <button class="mini-btn-action btn-goto-node" data-target-id="${condNode.id}">
                  以该条件为中心查看 ▶
                </button>
              </div>
            `;
              })
              .join('')
      }

      <div style="font-size: 12px; font-weight: 700; color: #38bdf8; margin-top: 14px; margin-bottom: 6px;">
        📤 改变的状态与实体 (Effects): ${outgoingEdges.length} 条
      </div>
      ${
        outgoingEdges.length === 0
          ? "<div style='color: #64748b; font-size: 11px;'>无后续状态改写</div>"
          : outgoingEdges
              .map((e) => {
                const targetNode = this.allNodesMap[e.to];
                const isActive = e.checkActive(state);
                return `
              <div class="rel-dialog-card" data-node-id="${targetNode.id}" style="border-left: 3px solid ${isActive ? '#38bdf8' : '#475569'}; margin-bottom: 6px;">
                <div style="display: flex; justify-content: space-between; font-size: 12px;">
                  <span style="font-weight: 600; color: #f8fafc;">${targetNode.title}</span>
                  <span style="color: ${isActive ? '#38bdf8' : '#94a3b8'};">${isActive ? '● 生效中' : '○ 未生效'}</span>
                </div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
                  效果: ${e.label}
                </div>
                <button class="mini-btn-action btn-goto-node" data-target-id="${targetNode.id}">
                  以该实体为中心查看 ▶
                </button>
              </div>
            `;
              })
              .join('')
      }
    `;
    this.contentEl.appendChild(topoCard);

    this.bindGotoButtons();
  }

  private renderEditFields(node: AnyGraphNode): void {
    const editCard = document.createElement('div');
    editCard.className = 'inspector-section';
    editCard.innerHTML = `
      <div class="inspector-label">节点标题 (实时编辑)</div>
      <input type="text" class="inspector-input" id="inspectorNodeTitle" value="${node.title}" style="margin-bottom: 10px;">
      <div class="inspector-label">功能描述 (实时编辑)</div>
      <textarea class="inspector-textarea" id="inspectorNodeDesc">${node.desc || ''}</textarea>
    `;
    this.contentEl.appendChild(editCard);

    const titleInput = editCard.querySelector('#inspectorNodeTitle') as HTMLInputElement;
    titleInput.oninput = (e) => {
      node.title = (e.target as HTMLInputElement).value;
      this.onNodeUpdated(node);
    };

    const descInput = editCard.querySelector('#inspectorNodeDesc') as HTMLTextAreaElement;
    descInput.oninput = (e) => {
      node.desc = (e.target as HTMLTextAreaElement).value;
      this.onNodeUpdated(node);
    };
  }

  private bindGotoButtons(): void {
    this.contentEl.querySelectorAll('.btn-goto-node').forEach((btn) => {
      (btn as HTMLButtonElement).onclick = (e) => {
        e.stopPropagation();
        const targetId = (btn as HTMLElement).dataset.targetId;
        if (targetId && this.allNodesMap[targetId]) {
          appState.setSelectedNode(this.allNodesMap[targetId]);
        }
      };
    });
  }
}
