import { ViewMode } from '../../core/session';
import { escapeHtml } from '../../utils/dom';

export interface CanvasMenuCallbacks {
  onCreateSubNode: (type: 'action' | 'selector' | 'choice', cx: number, cy: number) => void;
  onCreateEvent: (cx: number, cy: number) => void;
  onCreateCondition: (cx: number, cy: number) => void;
  onBackToMain: () => void;
  onResetLayout: () => void;
}

export class CanvasContextMenu {
  private menuEl: HTMLElement | null = null;

  public openCanvasMenu(
    sx: number,
    sy: number,
    cx: number,
    cy: number,
    viewMode: ViewMode,
    callbacks: CanvasMenuCallbacks
  ): void {
    this.close();
    const menu = document.createElement('div');
    menu.className = 'graph-context-menu';
    menu.style.left = `${sx}px`;
    menu.style.top = `${sy}px`;

    if (viewMode === 'subgraph') {
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
        this.close();
        if (action === 'add-sub-action') {
          callbacks.onCreateSubNode('action', cx, cy);
        } else if (action === 'add-sub-selector') {
          callbacks.onCreateSubNode('selector', cx, cy);
        } else if (action === 'add-sub-choice') {
          callbacks.onCreateSubNode('choice', cx, cy);
        } else if (action === 'back-to-main') {
          callbacks.onBackToMain();
        } else if (action === 'add-event') {
          callbacks.onCreateEvent(cx, cy);
        } else if (action === 'add-condition') {
          callbacks.onCreateCondition(cx, cy);
        } else if (action === 'reset-layout') {
          callbacks.onResetLayout();
        }
      };
    });

    document.body.appendChild(menu);
    this.menuEl = menu;
  }

  public openEdgeMenu(
    sx: number,
    sy: number,
    edgeInfo: {
      title: string;
      onDelete: () => void;
    }
  ): void {
    this.close();

    const menu = document.createElement('div');
    menu.className = 'graph-context-menu edge-context-menu';
    const clampedX = Math.max(12, Math.min(sx, window.innerWidth - 240));
    const clampedY = Math.max(12, Math.min(sy, window.innerHeight - 150));
    menu.style.left = `${clampedX}px`;
    menu.style.top = `${clampedY}px`;

    menu.innerHTML = `
      <div class="ctx-header">⚡ 连线操作</div>
      <div style="padding: 4px 10px; font-size: 11px; color: #94a3b8; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.4;" title="${escapeHtml(edgeInfo.title)}">
        ${escapeHtml(edgeInfo.title)}
      </div>
      <div class="ctx-divider"></div>
      <div class="ctx-item ctx-danger" data-action="delete" style="display: flex; align-items: center; gap: 6px; font-weight: 600;">
        <span>🗑️ 删除此连线</span>
      </div>
    `;

    const delBtn = menu.querySelector('[data-action="delete"]') as HTMLElement | null;
    delBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
      edgeInfo.onDelete();
    });

    document.body.appendChild(menu);
    this.menuEl = menu;
  }

  public close(): void {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
  }

  public dispose(): void {
    this.close();
  }
}
