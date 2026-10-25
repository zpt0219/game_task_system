import { appState } from '../core/state';
import { PRESET_STATES } from '../core/castleData';

export class Header {
  private playBtn: HTMLButtonElement;
  private editBtn: HTMLButtonElement;
  private presetSelect: HTMLSelectElement;
  private resetBtn: HTMLButtonElement;
  private resetLayoutBtn: HTMLButtonElement | null;

  constructor(private onResetLayout?: () => void) {
    this.playBtn = document.getElementById('modePlayBtn') as HTMLButtonElement;
    this.editBtn = document.getElementById('modeEditBtn') as HTMLButtonElement;
    this.presetSelect = document.getElementById('presetSelect') as HTMLSelectElement;
    this.resetBtn = document.getElementById('btnResetState') as HTMLButtonElement;
    this.resetLayoutBtn = document.getElementById('btnResetLayout') as HTMLButtonElement | null;

    this.initPresets();
    this.bindEvents();

    appState.onModeChange((mode) => {
      if (mode === 'play') {
        this.playBtn.classList.add('active');
        this.editBtn.classList.remove('active');
      } else {
        this.editBtn.classList.add('active');
        this.playBtn.classList.remove('active');
      }
    });
  }

  private initPresets(): void {
    this.presetSelect.innerHTML = '';
    PRESET_STATES.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      this.presetSelect.appendChild(opt);
    });
  }

  private bindEvents(): void {
    this.playBtn.onclick = () => {
      appState.setMode('play');
    };

    this.editBtn.onclick = () => {
      appState.setMode('edit');
    };

    this.presetSelect.onchange = (e) => {
      const targetId = (e.target as HTMLSelectElement).value;
      const found = PRESET_STATES.find((p) => p.id === targetId);
      if (found) {
        appState.loadPreset(found.state, found.name);
      }
    };

    if (this.resetLayoutBtn) {
      this.resetLayoutBtn.onclick = () => {
        if (this.onResetLayout) {
          this.onResetLayout();
        }
      };
    }

    this.resetBtn.onclick = () => {
      this.presetSelect.value = 'initial';
      appState.reset();
    };
  }
}
