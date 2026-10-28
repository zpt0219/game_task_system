import { ViewModel } from '../app/viewModel';
import { TaskStudioEvents } from '../command/events';

const dirtyPanels = new Set<Panel>();
let frameRequested = false;

function flush(): void {
  frameRequested = false;
  const panels = [...dirtyPanels];
  dirtyPanels.clear();
  for (const panel of panels) {
    if (!panel.isDisposed) {
      panel.render();
    }
  }
}

/**
 * 面板基类：采用「脏标记 + requestAnimationFrame」合并同一帧内的多次状态变更，
 * 并提供幂等的 dispose() 生命周期管理。
 */
export abstract class Panel {
  protected _isDisposed = false;
  private readonly unsubscribeVm: () => void;

  public get isDisposed(): boolean {
    return this._isDisposed;
  }

  constructor(protected readonly vm: ViewModel) {
    this.unsubscribeVm = vm.registerListener(this as Partial<TaskStudioEvents>);
  }

  protected markDirty(): void {
    if (this._isDisposed) return;
    dirtyPanels.add(this);
    if (!frameRequested) {
      frameRequested = true;
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(flush);
      } else {
        setTimeout(flush, 0);
      }
    }
  }

  /** 从 ViewModel 读取当前状态刷新 DOM */
  abstract render(): void;

  /** 幂等销毁：注销 VM 监听，从脏队列移除，调用子类 onDispose() */
  public dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;
    dirtyPanels.delete(this);
    this.unsubscribeVm();
    this.onDispose();
  }

  protected onDispose(): void {}
}

export function flushDirtyPanelsForTest(): void {
  flush();
}
