import { escapeHtml } from '../../utils/dom';

export class ConfirmModal {
  private overlay: HTMLElement | null = null;

  public confirm(message: string, confirmText = '确认删除'): Promise<boolean> {
    return new Promise((resolve) => {
      this.cleanup();
      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay show';
      overlay.style.zIndex = '4500';
      overlay.innerHTML = `
        <div class="rpg-dialog" style="width: 440px;">
          <div class="dialog-header">
            <div class="speaker-avatar">⚠️</div>
            <div class="speaker-info">
              <div class="speaker-name">确认操作</div>
              <div class="speaker-title">系统确认</div>
            </div>
          </div>
          <div class="dialog-body" style="white-space: pre-wrap;">${escapeHtml(message)}</div>
          <div class="dialog-footer">
            <button id="btnConfirmCancel" class="dialog-btn secondary-btn">取消 (ESC)</button>
            <button id="btnConfirmOk" class="dialog-btn danger-btn">${escapeHtml(confirmText)}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      this.overlay = overlay;

      const finish = (result: boolean) => {
        window.removeEventListener('keydown', onKey);
        this.cleanup();
        resolve(result);
      };

      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        }
      };

      window.addEventListener('keydown', onKey);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) finish(false);
      });
      overlay.querySelector('#btnConfirmCancel')?.addEventListener('click', () => finish(false));
      const okBtn = overlay.querySelector('#btnConfirmOk') as HTMLButtonElement | null;
      okBtn?.addEventListener('click', () => finish(true));
      setTimeout(() => okBtn?.focus(), 30);
    });
  }

  public alert(message: string): Promise<void> {
    return new Promise((resolve) => {
      this.cleanup();
      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay show';
      overlay.style.zIndex = '4500';
      overlay.innerHTML = `
        <div class="rpg-dialog" style="width: 440px;">
          <div class="dialog-header">
            <div class="speaker-avatar">ℹ️</div>
            <div class="speaker-info">
              <div class="speaker-name">系统提示</div>
              <div class="speaker-title">Notice</div>
            </div>
          </div>
          <div class="dialog-body" style="white-space: pre-wrap;">${escapeHtml(message)}</div>
          <div class="dialog-footer">
            <button id="btnAlertOk" class="dialog-btn primary-btn">知道了</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      this.overlay = overlay;

      const finish = () => {
        window.removeEventListener('keydown', onKey);
        this.cleanup();
        resolve();
      };

      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          finish();
        }
      };

      window.addEventListener('keydown', onKey);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) finish();
      });
      const okBtn = overlay.querySelector('#btnAlertOk') as HTMLButtonElement | null;
      okBtn?.addEventListener('click', () => finish());
      setTimeout(() => okBtn?.focus(), 30);
    });
  }

  public dispose(): void {
    this.cleanup();
  }

  private cleanup(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
}
