import { project, SaveStatus } from '../core/project';
import { appState, buildInitialState } from '../core/state';

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

    this.addEventBtn.onclick = () => {
      if (this.onAddEvent) this.onAddEvent();
    };

    this.addTriggerBtn.onclick = () => {
      if (this.onAddTrigger) this.onAddTrigger();
    };

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
}
