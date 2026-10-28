import { ViewModel } from '../app/viewModel';
import { SaveStatus } from '../command/events';
import { GraphCanvasPanel } from './canvas/GraphCanvasPanel';
import { Panel } from './Panel';

export class Header extends Panel {
  private playBtn: HTMLButtonElement;
  private editBtn: HTMLButtonElement;
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;
  private addEventBtn: HTMLButtonElement;
  private addConditionBtn: HTMLButtonElement;
  private mainGraphTools: HTMLElement | null;
  private subGraphTools: HTMLElement | null;
  private addActionBtn: HTMLButtonElement | null;
  private addSelectorBtn: HTMLButtonElement | null;
  private addChoiceBtn: HTMLButtonElement | null;
  private presetSelect: HTMLSelectElement;
  private resetBtn: HTMLButtonElement;
  private resetLayoutBtn: HTMLButtonElement | null;
  private saveStatusBadge: HTMLElement | null;
  private readonly abortCtrl = new AbortController();

  constructor(
    vm: ViewModel,
    private readonly canvas: GraphCanvasPanel | null = null,
    private readonly onResetLayout?: () => void
  ) {
    super(vm);

    this.playBtn = document.getElementById('modePlayBtn') as HTMLButtonElement;
    this.editBtn = document.getElementById('modeEditBtn') as HTMLButtonElement;
    this.undoBtn = document.getElementById('btnUndo') as HTMLButtonElement;
    this.redoBtn = document.getElementById('btnRedo') as HTMLButtonElement;
    this.addEventBtn = document.getElementById('btnAddEventHeader') as HTMLButtonElement;
    this.addConditionBtn = document.getElementById('btnAddConditionHeader') as HTMLButtonElement;
    this.mainGraphTools = document.getElementById('mainGraphTools');
    this.subGraphTools = document.getElementById('subGraphTools');
    this.addActionBtn = document.getElementById('btnAddActionHeader') as HTMLButtonElement | null;
    this.addSelectorBtn = document.getElementById('btnAddSelectorHeader') as HTMLButtonElement | null;
    this.addChoiceBtn = document.getElementById('btnAddChoiceHeader') as HTMLButtonElement | null;
    this.presetSelect = document.getElementById('presetSelect') as HTMLSelectElement;
    this.resetBtn = document.getElementById('btnResetState') as HTMLButtonElement;
    this.resetLayoutBtn = document.getElementById('btnResetLayout') as HTMLButtonElement | null;
    this.saveStatusBadge = document.getElementById('saveStatusBadge');

    this.bindEvents();
    this.render();
  }

  onProjectLoaded(): void {
    this.markDirty();
  }

  onDocumentChanged(): void {
    this.markDirty();
  }

  onSessionChanged(): void {
    this.markDirty();
  }

  onHistoryChanged(): void {
    this.updateUndoRedo();
  }

  onSaveStatus(status: SaveStatus, error?: string): void {
    this.updateSaveStatus(status, error);
  }

  override render(): void {
    this.initPresets();
    this.updateUndoRedo();

    const { mode, subGraphEventId } = this.vm.session;
    if (mode === 'play') {
      this.playBtn.classList.add('active');
      this.editBtn.classList.remove('active');
    } else {
      this.editBtn.classList.add('active');
      this.playBtn.classList.remove('active');
    }

    if (this.mainGraphTools && this.subGraphTools) {
      if (subGraphEventId) {
        this.mainGraphTools.style.display = 'none';
        this.subGraphTools.style.display = 'flex';
      } else {
        this.mainGraphTools.style.display = 'flex';
        this.subGraphTools.style.display = 'none';
      }
    }
  }

  public initPresets(): void {
    const doc = this.vm.doc;
    const curVal = this.presetSelect.value;
    this.presetSelect.innerHTML = '';

    doc.presets.forEach((preset) => {
      const opt = document.createElement('option');
      opt.value = preset.id;
      opt.textContent = preset.name;
      this.presetSelect.appendChild(opt);
    });

    if (curVal && doc.presets.some((x) => x.id === curVal)) {
      this.presetSelect.value = curVal;
    }
  }

  private updateUndoRedo(): void {
    if (this.undoBtn) this.undoBtn.disabled = !this.vm.canUndo;
    if (this.redoBtn) this.redoBtn.disabled = !this.vm.canRedo;
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
    this.playBtn.onclick = () => this.vm.setMode('play');
    this.editBtn.onclick = () => this.vm.setMode('edit');

    this.undoBtn.onclick = () => {
      this.vm.undo();
    };

    this.redoBtn.onclick = () => {
      this.vm.redo();
    };

    // 绑定 Event / Condition 的按住拖拽生成与快捷点击创建
    this.setupNodeDragCreation(this.addEventBtn, 'event');
    this.setupNodeDragCreation(this.addConditionBtn, 'condition');

    const addVarBtn = document.getElementById('btnAddVarHeader') as HTMLButtonElement | null;
    if (addVarBtn) {
      addVarBtn.onclick = () => {
        this.vm.openRegisterVarModal();
      };
    }

    // 绑定 Action Tree 子图节点的按住拖拽生成与快捷点击创建
    if (this.addActionBtn) this.setupSubNodeDragCreation(this.addActionBtn, 'action');
    if (this.addSelectorBtn) this.setupSubNodeDragCreation(this.addSelectorBtn, 'selector');
    if (this.addChoiceBtn) this.setupSubNodeDragCreation(this.addChoiceBtn, 'choice');

    this.presetSelect.onchange = (e) => {
      const targetId = (e.target as HTMLSelectElement).value;
      this.vm.applyPreset(targetId);
    };

    if (this.resetLayoutBtn) {
      this.resetLayoutBtn.onclick = () => {
        if (this.onResetLayout) {
          this.onResetLayout();
        } else if (this.canvas) {
          this.canvas.resetLayout();
          this.vm.log('📐 已恢复标准任务布局！', true);
        }
      };
    }

    this.resetBtn.onclick = () => {
      this.presetSelect.value = 'initial';
      this.vm.resetWorldState();
    };
  }

  // ------------------------------------------------------------------ 拖拽与点击生成节点

  private setupNodeDragCreation(btn: HTMLButtonElement, type: 'event' | 'condition'): void {
    let isMouseDown = false;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let ghostEl: HTMLElement | null = null;
    let justDragged = false;

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
      this.vm.setCanvasDragReceiving(false);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
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

          ghostEl = document.createElement('div');
          ghostEl.className = `node-drag-ghost ghost-${type} compact-node ${
            type === 'event' ? 'event-node available' : 'condition-node'
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
              <div class="node-title">🔍 condition: 新条件</div>
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
          this.vm.setCanvasDragReceiving(true);
          const cPos = this.canvas.clientToCanvasPos(e.clientX, e.clientY);
          const nx = Math.round(cPos.x - 70);
          const ny = Math.round(cPos.y - (type === 'event' ? 18 : 17));
          if (badgeEl) {
            badgeEl.textContent = `🎯 释放放置 (${nx}, ${ny})`;
          }
        } else {
          ghostEl.classList.remove('is-inside-canvas');
          this.vm.setCanvasDragReceiving(false);
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

    btn.addEventListener('click', (e) => {
      if (justDragged) {
        justDragged = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (this.canvas) {
        this.canvas.createNodeAtCenter(type);
      }
    });
  }

  private setupSubNodeDragCreation(
    btn: HTMLButtonElement,
    type: 'action' | 'selector' | 'choice'
  ): void {
    let isMouseDown = false;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let ghostEl: HTMLElement | null = null;
    let justDragged = false;

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
      this.vm.setCanvasDragReceiving(false);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
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

          ghostEl = document.createElement('div');
          ghostEl.className = `node-drag-ghost ghost-${type} compact-node`;

          const titles: Record<string, string> = {
            action: '🎬 复合动作 Action',
            selector: '🔀 条件分支 Selector',
            choice: '💬 玩家选项 Choice'
          };

          ghostEl.innerHTML = `
            <div class="node-title">${titles[type]}</div>
            <span class="ghost-hint-badge">拖拽中...</span>
          `;
          document.body.appendChild(ghostEl);
        }
      }

      if (isDragging && ghostEl) {
        ghostEl.style.left = `${e.clientX}px`;
        ghostEl.style.top = `${e.clientY}px`;

        const badgeEl = ghostEl.querySelector('.ghost-hint-badge');
        if (this.canvas && this.canvas.isInsideViewport(e.clientX, e.clientY)) {
          ghostEl.classList.add('is-inside-canvas');
          this.vm.setCanvasDragReceiving(true);
          const cPos = this.canvas.clientToCanvasPos(e.clientX, e.clientY);
          const nx = Math.round(cPos.x - 80);
          const ny = Math.round(cPos.y - 20);
          if (badgeEl) {
            badgeEl.textContent = `🎯 释放放置 (${nx}, ${ny})`;
          }
        } else {
          ghostEl.classList.remove('is-inside-canvas');
          this.vm.setCanvasDragReceiving(false);
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
          const nx = Math.round(cPos.x - 80);
          const ny = Math.round(cPos.y - 20);
          this.canvas.createSubNodeAt(type, nx, ny);
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

    btn.addEventListener('click', (e) => {
      if (justDragged) {
        justDragged = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (this.canvas) {
        this.canvas.createSubNodeAtCenter(type);
      }
    });
  }

  protected override onDispose(): void {
    this.abortCtrl.abort();
  }
}
