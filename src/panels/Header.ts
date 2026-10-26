import { project, SaveStatus } from '../core/project';
import { appState, buildInitialState } from '../core/state';
import { GraphCanvas } from './GraphCanvas';

export class Header {
  private playBtn: HTMLButtonElement;
  private editBtn: HTMLButtonElement;
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;
  private addEventBtn: HTMLButtonElement;
  private addTriggerBtn: HTMLButtonElement;
  private presetSelect: HTMLSelectElement;
  private resetBtn: HTMLButtonElement;
  private resetLayoutBtn: HTMLButtonElement | null;
  private saveStatusBadge: HTMLElement | null;

  constructor(
    private onResetLayout?: () => void,
    private canvas?: GraphCanvas | null,
    private onAddEvent?: () => void,
    private onAddTrigger?: () => void
  ) {
    this.playBtn = document.getElementById('modePlayBtn') as HTMLButtonElement;
    this.editBtn = document.getElementById('modeEditBtn') as HTMLButtonElement;
    this.undoBtn = document.getElementById('btnUndo') as HTMLButtonElement;
    this.redoBtn = document.getElementById('btnRedo') as HTMLButtonElement;
    this.addEventBtn = document.getElementById('btnAddEventHeader') as HTMLButtonElement;
    this.addTriggerBtn = document.getElementById('btnAddTriggerHeader') as HTMLButtonElement;
    this.presetSelect = document.getElementById('presetSelect') as HTMLSelectElement;
    this.resetBtn = document.getElementById('btnResetState') as HTMLButtonElement;
    this.resetLayoutBtn = document.getElementById('btnResetLayout') as HTMLButtonElement | null;
    this.saveStatusBadge = document.getElementById('saveStatusBadge');

    this.initPresets();
    this.bindEvents();
    this.updateUndoRedo();

    appState.onModeChange((mode) => {
      if (mode === 'play') {
        this.playBtn.classList.add('active');
        this.editBtn.classList.remove('active');
      } else {
        this.editBtn.classList.add('active');
        this.playBtn.classList.remove('active');
      }
    });

    project.onChange(() => {
      this.initPresets();
      this.updateUndoRedo();
    });

    project.onSaveStatus((status, err) => this.updateSaveStatus(status, err));
  }

  public initPresets(): void {
    const p = project.get();
    const curVal = this.presetSelect.value;
    this.presetSelect.innerHTML = '';

    p.presets.forEach((preset) => {
      const opt = document.createElement('option');
      opt.value = preset.id;
      opt.textContent = preset.name;
      this.presetSelect.appendChild(opt);
    });

    if (curVal && p.presets.some((x) => x.id === curVal)) {
      this.presetSelect.value = curVal;
    }
  }

  private updateUndoRedo(): void {
    if (this.undoBtn) this.undoBtn.disabled = !project.canUndo();
    if (this.redoBtn) this.redoBtn.disabled = !project.canRedo();
  }

  private updateSaveStatus(status: SaveStatus, err?: string): void {
    if (!this.saveStatusBadge) return;
    this.saveStatusBadge.className = `save-status-badge ${status}`;
    if (status === 'saved') {
      this.saveStatusBadge.textContent = '● 已保存';
      this.saveStatusBadge.title = '所有节点已自动同步至 data/castle.json';
    } else if (status === 'dirty' || status === 'saving') {
      this.saveStatusBadge.textContent = '● 保存中...';
      this.saveStatusBadge.title = '正在写入 data/castle.json';
    } else if (status === 'error') {
      this.saveStatusBadge.textContent = '⚠️ 保存失败';
      this.saveStatusBadge.title = err || '写入失败，请检查 Vite 服务器日志';
    }
  }

  private bindEvents(): void {
    this.playBtn.onclick = () => appState.setMode('play');
    this.editBtn.onclick = () => appState.setMode('edit');

    this.undoBtn.onclick = () => {
      if (project.undo()) {
        appState.log('↺ 撤销了上一步操作');
      }
    };

    this.redoBtn.onclick = () => {
      if (project.redo()) {
        appState.log('↻ 重做了上一步操作');
      }
    };

    // 绑定 Event / Trigger 的按住拖拽生成与快捷点击创建
    this.setupNodeDragCreation(this.addEventBtn, 'event');
    this.setupNodeDragCreation(this.addTriggerBtn, 'trigger');

    this.presetSelect.onchange = (e) => {
      const targetId = (e.target as HTMLSelectElement).value;
      const found = project.get().presets.find((x) => x.id === targetId);
      if (found) {
        const s = buildInitialState(project.get(), found.values);
        appState.setState(s);
        appState.setFocalVar(null);
        appState.log(`⚡ 加载测试预设：[${found.name}]`, true);
      }
    };

    if (this.resetLayoutBtn) {
      this.resetLayoutBtn.onclick = () => {
        if (this.onResetLayout) this.onResetLayout();
      };
    }

    this.resetBtn.onclick = () => {
      this.presetSelect.value = 'initial';
      const s = buildInitialState(project.get());
      appState.setState(s);
      appState.setFocalVar(null);
      appState.log('🔄 已重置所有世界数据与主角状态为初始态！', true);
    };
  }

  // ------------------------------------------------------------------ 拖拽与点击生成节点

  private setupNodeDragCreation(
    btn: HTMLButtonElement,
    type: 'event' | 'trigger'
  ): void {
    let isMouseDown = false;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let ghostEl: HTMLElement | null = null;
    let justDragged = false;

    // 防止浏览器默认的按钮拖拽与文字选中
    btn.addEventListener('dragstart', (e) => e.preventDefault());

    const cleanup = () => {
      if (!isMouseDown && !isDragging) return;
      isMouseDown = false;
      isDragging = false;
      btn.classList.remove('dragging');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', cleanup);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (ghostEl) {
        ghostEl.remove();
        ghostEl = null;
      }
      if (this.canvas) {
        this.canvas.setDragOverState(false);
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // 仅响应鼠标左键
      isMouseDown = true;
      isDragging = false;
      justDragged = false;
      startX = e.clientX;
      startY = e.clientY;

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('blur', cleanup);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isMouseDown) return;

      if (!isDragging) {
        const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
        if (dist > 4) {
          isDragging = true;
          justDragged = true;
          btn.classList.add('dragging');
          document.body.style.cursor = 'grabbing';
          document.body.style.userSelect = 'none';

          // 创建紧随光标的半透明预览幽灵节点
          ghostEl = document.createElement('div');
          ghostEl.className = `node-drag-ghost ghost-${type} compact-node ${
            type === 'event' ? 'event-node available' : 'condition-node trigger-node'
          }`;

          if (type === 'event') {
            ghostEl.innerHTML = `
              <div class="node-port port-in"></div>
              <div class="event-status-dot status-dot" style="background:#10b981; box-shadow:0 0 8px #10b981;"></div>
              <div class="node-title">💬 新事件</div>
              <span class="ghost-hint-badge">拖拽中...</span>
            `;
          } else {
            ghostEl.innerHTML = `
              <div class="cond-status-led" style="background:#10b981; box-shadow:0 0 8px #10b981;"></div>
              <div class="node-title">⚡ trigger: 新条件</div>
              <div class="node-port port-out"></div>
              <span class="ghost-hint-badge">拖拽中...</span>
            `;
          }
          document.body.appendChild(ghostEl);
        }
      }

      if (isDragging && ghostEl) {
        ghostEl.style.left = `${e.clientX}px`;
        ghostEl.style.top = `${e.clientY}px`;

        const badgeEl = ghostEl.querySelector('.ghost-hint-badge');
        if (this.canvas && this.canvas.isInsideViewport(e.clientX, e.clientY)) {
          ghostEl.classList.add('is-inside-canvas');
          this.canvas.setDragOverState(true);
          const cPos = this.canvas.clientToCanvasPos(e.clientX, e.clientY);
          const nx = Math.round(cPos.x - 70);
          const ny = Math.round(cPos.y - (type === 'event' ? 18 : 17));
          if (badgeEl) {
            badgeEl.textContent = `🎯 释放放置 (${nx}, ${ny})`;
          }
        } else {
          ghostEl.classList.remove('is-inside-canvas');
          if (this.canvas) this.canvas.setDragOverState(false);
          if (badgeEl) {
            badgeEl.textContent = `拖至中间画布以放置`;
          }
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!isMouseDown) return;

      const wasDragging = isDragging;
      cleanup();

      if (wasDragging) {
        if (this.canvas && this.canvas.isInsideViewport(e.clientX, e.clientY)) {
          const cPos = this.canvas.clientToCanvasPos(e.clientX, e.clientY);
          const nx = Math.round(cPos.x - 70);
          const ny = Math.round(cPos.y - (type === 'event' ? 18 : 17));
          this.canvas.createNodeAt(type, nx, ny);
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
        isDragging = false;
        justDragged = true;
      }
    };

    btn.addEventListener('mousedown', onMouseDown);

    // 未产生拖拽时的普通点击兜底：在当前画布视野中央创建
    btn.addEventListener('click', (e) => {
      if (justDragged) {
        justDragged = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (this.canvas) {
        this.canvas.createNodeAtCenter(type);
      } else {
        if (type === 'event' && this.onAddEvent) this.onAddEvent();
        if (type === 'trigger' && this.onAddTrigger) this.onAddTrigger();
      }
    });
  }
}
