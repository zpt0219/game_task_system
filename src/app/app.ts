import { GraphCanvasPanel } from '../panels/canvas/GraphCanvasPanel';
import { Header } from '../panels/Header';
import { NodeInspectorPanel } from '../panels/inspector/NodeInspectorPanel';
import { ConfirmModal } from '../panels/modals/ConfirmModal';
import { RegisterVarModal } from '../panels/modals/RegisterVarModal';
import { RpgDialog } from '../panels/modals/RpgDialog';
import { setupSplitters } from '../panels/Splitter';
import { StateSidebar } from '../panels/StateSidebar';
import { isTypingTarget } from '../utils/dom';
import { BrowserStorage } from './adapters/BrowserStorage';
import { HttpProjectAdapter } from './adapters/HttpProjectAdapter';
import { ViewModel } from './viewModel';

export class TaskStudioApp {
  public readonly vm: ViewModel;
  public readonly confirmModal: ConfirmModal;
  public readonly rpgDialog: RpgDialog;
  public readonly registerVarModal: RegisterVarModal;
  public readonly canvas: GraphCanvasPanel;
  public readonly header: Header;
  public readonly inspector: NodeInspectorPanel;
  public readonly sidebar: StateSidebar;

  private readonly disposeSplitters: () => void;
  private readonly abortCtrl = new AbortController();

  constructor() {
    const projectStorage = new HttpProjectAdapter();
    const kvStorage = new BrowserStorage();

    this.confirmModal = new ConfirmModal();
    this.rpgDialog = new RpgDialog();

    this.vm = new ViewModel({
      storage: projectStorage,
      prompts: {
        confirm: (msg, confirmText) => this.confirmModal.confirm(msg, confirmText),
        alert: (msg) => this.confirmModal.alert(msg),
        showRpgDialog: (cfg) => this.rpgDialog.show(cfg)
      }
    });

    this.registerVarModal = new RegisterVarModal(this.vm);
    this.canvas = new GraphCanvasPanel(this.vm);
    this.header = new Header(this.vm, this.canvas, () => {
      this.canvas.resetLayout();
      this.vm.log('📐 已恢复默认无遮挡任务布局！', true);
    });
    this.inspector = new NodeInspectorPanel(this.vm);
    this.sidebar = new StateSidebar(this.vm);
    this.disposeSplitters = setupSplitters(kvStorage);

    this.bindGlobalShortcuts();
  }

  public async init(): Promise<void> {
    try {
      await this.vm.loadFromStorage();
      this.vm.log('🔮 《紫水晶骑士物语》任务与 Condition 依赖图谱初始化完成！', true);
      this.vm.log(
        '💡 提示：在【编辑模式】下，可任意添加/删除/修改 Event 与 Condition 节点，自动持久化至 data/castle.json。'
      );
    } catch (err) {
      console.error('加载 data/castle.json 失败：', err);
      await this.vm.prompts.alert(`加载数据失败：${err}\n请确保开发服务器正常运行。`);
    }
  }

  private bindGlobalShortcuts(): void {
    const sig = this.abortCtrl.signal;

    window.addEventListener(
      'keydown',
      (e) => {
        if (isTypingTarget(e.target)) return;

        // 撤销 Ctrl+Z
        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
          e.preventDefault();
          this.vm.undo();
          return;
        }

        // 重做 Ctrl+Y 或 Ctrl+Shift+Z
        if (
          ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z'))
        ) {
          e.preventDefault();
          this.vm.redo();
          return;
        }

        // 删除 Delete（统一走 vm.edit.deleteSelection()，含级联清理与批量删除）
        if (e.key === 'Delete') {
          void this.vm.edit.deleteSelection();
        }
      },
      { signal: sig }
    );
  }

  public dispose(): void {
    this.abortCtrl.abort();
    this.disposeSplitters();
    this.header.dispose();
    this.inspector.dispose();
    this.sidebar.dispose();
    this.canvas.dispose();
    this.registerVarModal.dispose();
    this.confirmModal.dispose();
    this.vm.dispose();
  }
}
