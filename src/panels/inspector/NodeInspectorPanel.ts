import { ViewModel } from '../../app/viewModel';
import { DocumentChangeSource } from '../../command/events';
import { Panel } from '../Panel';
import { renderConditionInspector } from './ConditionInspector';
import { renderEventInspector } from './EventInspector';
import { renderMultiSelectInspector } from './MultiSelectInspector';
import { renderSubNodeInspector } from './SubNodeInspector';
import { renderVarInspector } from './VarInspector';

export class NodeInspectorPanel extends Panel {
  private container: HTMLElement;

  constructor(vm: ViewModel) {
    super(vm);
    this.container = document.getElementById('inspectorContent') as HTMLElement;
    this.render();
  }

  onProjectLoaded(): void {
    this.markDirty();
  }

  onSessionChanged(): void {
    this.markDirty();
  }

  onWorldStateChanged(): void {
    this.markDirty();
  }

  onDocumentChanged(source: DocumentChangeSource): void {
    // 避免输入框敲字或画布拖拽时整个面板被重置破坏焦点
    if (source !== 'field' && source !== 'drag') {
      this.markDirty();
    }
  }

  override render(): void {
    const sel = this.vm.session.selection;
    this.container.innerHTML = '';

    if (!sel) {
      this.renderEmpty();
      return;
    }

    if (sel.kind === 'subnode') {
      const ev = this.vm.getEvent(sel.eventId);
      const node = this.vm.getSubNode(sel.eventId, sel.id);
      if (ev && node) renderSubNodeInspector(this.container, this.vm, ev, node);
      else this.renderEmpty();
    } else if (sel.kind === 'event') {
      const ev = this.vm.getEvent(sel.id);
      if (ev) renderEventInspector(this.container, this.vm, ev);
      else this.renderEmpty();
    } else if (sel.kind === 'condition') {
      const cond = this.vm.getCondition(sel.id);
      if (cond) renderConditionInspector(this.container, this.vm, cond);
      else this.renderEmpty();
    } else if (sel.kind === 'var') {
      const v = this.vm.getVar(sel.id);
      if (v) renderVarInspector(this.container, this.vm, v);
      else this.renderEmpty();
    } else if (sel.kind === 'multi') {
      renderMultiSelectInspector(this.container, this.vm, sel.items);
    }
  }

  private renderEmpty(): void {
    const doc = this.vm.doc;
    this.container.innerHTML = `
      <div class="empty-inspector">
        <div style="font-size: 38px; margin-bottom: 10px; opacity: 0.7;">🔮</div>
        <div style="font-size: 14px; font-weight: 700; color: #f3f4f6; margin-bottom: 6px;">
          任务图谱总览态
        </div>
        <div style="font-size: 12px; color: #9ca3af; line-height: 1.6; text-align: center; margin-bottom: 16px;">
          点击画布上的 <b>Event</b> 或 <b>Condition</b> 节点可检视与编辑；<br/>
          也可点击左侧栏的 <b>人物/道具/传送点</b> 查看其专属因果图谱。
        </div>

        <div style="width: 100%; background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px; font-size: 12px; color: #cbd5e1;">
          <div style="font-weight: 700; color: #38bdf8; margin-bottom: 8px;">📊 项目当前统计</div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span>💬 Event 可触发交互节点：</span>
            <b>${doc.events.length} 个</b>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span>🔍 Condition 条件节点：</span>
            <b>${doc.conditions.length} 个</b>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>🎒 注册变量 / 道具 / 状态：</span>
            <b>${doc.vars.length} 个</b>
          </div>
        </div>

        <div style="margin-top: 16px; font-size: 11px; color: #64748b; line-height: 1.5; text-align: center;">
          💡 快捷技巧：在画布空白区域<b>单击右键</b>即可在光标位置新建 Event 或 Condition。
        </div>
      </div>
    `;
  }
}
