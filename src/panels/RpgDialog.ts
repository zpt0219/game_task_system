import { DialogConfig } from '../core/types';
import { parseBBCode } from '../utils/bbcode';

export class RpgDialog {
  private overlay: HTMLElement;
  private avatarEl: HTMLElement;
  private nameEl: HTMLElement;
  private titleEl: HTMLElement;
  private bodyEl: HTMLElement;
  private footerEl: HTMLElement;

  constructor() {
    this.overlay = document.getElementById('dialogOverlay') as HTMLElement;
    this.avatarEl = document.getElementById('dialogAvatar') as HTMLElement;
    this.nameEl = document.getElementById('dialogSpeakerName') as HTMLElement;
    this.titleEl = document.getElementById('dialogSpeakerTitle') as HTMLElement;
    this.bodyEl = document.getElementById('dialogBody') as HTMLElement;
    this.footerEl = document.getElementById('dialogFooter') as HTMLElement;

    this.overlay.onclick = (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    };
  }

  public show(config: DialogConfig): void {
    this.avatarEl.textContent = config.avatar || '💬';
    this.nameEl.textContent = config.speaker || '神秘人物';
    this.titleEl.textContent = config.speakerTitle || '事件交互';
    this.bodyEl.innerHTML = parseBBCode(config.text);

    this.footerEl.innerHTML = '';

    if (config.options && config.options.length > 0) {
      config.options.forEach((opt) => {
        const btn = document.createElement('button');
        btn.className = `dialog-btn ${opt.className || 'primary-btn'}`;
        btn.textContent = opt.text;
        btn.disabled = !!opt.disabled;
        btn.onclick = () => {
          if (opt.disabled) return;
          this.close();
          if (opt.onClick) opt.onClick();
        };
        this.footerEl.appendChild(btn);
      });
    } else {
      const btn = document.createElement('button');
      btn.className = 'dialog-btn primary-btn';
      btn.textContent = config.confirmText || '明白';
      btn.onclick = () => {
        this.close();
        if (config.onConfirm) config.onConfirm();
      };
      this.footerEl.appendChild(btn);
    }

    this.overlay.classList.add('show');
  }

  public close(): void {
    this.overlay.classList.remove('show');
  }
}
