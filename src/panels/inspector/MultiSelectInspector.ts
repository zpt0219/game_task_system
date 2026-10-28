import { ViewModel } from '../../app/viewModel';
import { getCondition, getEvent, getSubGraphNode } from '../../core/editOps';
import { escapeHtml } from '../../utils/dom';

export function renderMultiSelectInspector(
  container: HTMLElement,
  vm: ViewModel,
  items: Array<{ kind: 'event' | 'condition' | 'subnode'; id: string; eventId?: string }>
): void {
  const doc = vm.doc;
  const evCount = items.filter((i) => i.kind === 'event').length;
  const condCount = items.filter((i) => i.kind === 'condition').length;
  const subCount = items.filter((i) => i.kind === 'subnode').length;

  let summaryBadges = '';
  if (evCount > 0) summaryBadges += `<span class="status-pill status-blue">👑 ${evCount} 个事件</span> `;
  if (condCount > 0)
    summaryBadges += `<span class="status-pill status-cyan">🔍 ${condCount} 个条件</span> `;
  if (subCount > 0)
    summaryBadges += `<span class="status-pill status-purple">🎬 ${subCount} 个动作节点</span>`;

  const itemListHtml = items
    .map((item) => {
      let title = item.id;
      let icon = '📦';
      if (item.kind === 'event') {
        const ev = getEvent(doc, item.id);
        if (ev) title = ev.title;
        icon = '👑';
      } else if (item.kind === 'condition') {
        const cond = getCondition(doc, item.id);
        if (cond) title = cond.title;
        icon = '🔍';
      } else if (item.kind === 'subnode' && item.eventId) {
        const node = getSubGraphNode(doc, item.eventId, item.id);
        if (node) {
          title = 'title' in node ? node.title : node.id;
          icon = node.type === 'action' ? '🎬' : node.type === 'selector' ? '🔀' : '💬';
        }
      }
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: #1e293b; border-radius: 6px; font-size: 12px; margin-bottom: 4px;">
          <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <span>${icon}</span>
            <span style="font-weight: 500; color: #f8fafc;">${escapeHtml(title)}</span>
          </div>
          <span style="font-size: 10px; color: #94a3b8; font-family: monospace;">${escapeHtml(item.id)}</span>
        </div>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="inspector-section" style="border-bottom: 1px solid #1e293b; padding-bottom: 12px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
        <div style="font-size: 14px; font-weight: 700; color: #f8fafc;">📦 批量多选 (${items.length})</div>
        <button id="btnDeselectAll" class="mini-btn" style="width: auto; padding: 2px 8px;">取消多选</button>
      </div>
      <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px;">
        ${summaryBadges}
      </div>
      <div style="font-size: 11px; color: #94a3b8; line-height: 1.5;">
        💡 提示：在画布中按住<b>任意一个选中节点拖动</b>，可整体移动；按 <b>Delete</b> 键可一键批量删除。
      </div>
    </div>

    <div class="inspector-section">
      <div class="inspector-label">选中节点清单</div>
      <div style="max-height: 260px; overflow-y: auto; padding-right: 4px;">
        ${itemListHtml}
      </div>
    </div>

    <div class="inspector-section">
      <button id="btnBatchDelete" class="dialog-btn danger-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px;">
        <span>🗑️</span> 批量删除这 ${items.length} 个节点
      </button>
    </div>
  `;

  container.querySelector('#btnDeselectAll')?.addEventListener('click', () => {
    vm.select(null);
  });

  container.querySelector('#btnBatchDelete')?.addEventListener('click', async () => {
    const confirmed = await vm.prompts.confirm(
      `确定要批量删除选中的 ${items.length} 个节点吗？（Ctrl+Z 可撤销）`,
      '确认批量删除'
    );
    if (confirmed) {
      vm.edit.deleteItems(items);
    }
  });
}
