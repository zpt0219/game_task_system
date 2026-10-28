import './style.css';
import { project } from './core/project';
import { appState, buildInitialState } from './core/state';
import { RpgDialog } from './panels/RpgDialog';
import { Header } from './panels/Header';
import { NodeInspector } from './panels/NodeInspector';
import { StateSidebar } from './panels/StateSidebar';
import { GraphCanvas } from './panels/GraphCanvas';
import { setupSplitters } from './panels/Splitter';
import { isTypingTarget } from './utils/dom';

async function initApp(): Promise<void> {
  // 1. 从项目后台接口加载 data/castle.json
  try {
    await project.load();
  } catch (err) {
    console.error('加载 data/castle.json 失败：', err);
    alert(`加载数据失败：${err}\n请确保开发服务器正常运行。`);
    return;
  }

  // 2. 初始化初始运行时状态
  appState.setState(buildInitialState(project.get()));

  // 3. 构建各个面板
  const dialog = new RpgDialog();
  const canvas = new GraphCanvas(dialog);

  new Header(
    () => {
      canvas.resetLayout();
      appState.log('📐 已恢复默认无遮挡任务布局！', true);
    },
    canvas
  );

  new NodeInspector(dialog);
  new StateSidebar();
  setupSplitters();

  // 4. 全局快捷键绑定
  window.addEventListener('keydown', (e) => {
    // 若正在输入文本，则不触发快捷键
    if (isTypingTarget(e.target)) return;

    // 撤销 Ctrl+Z
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      e.preventDefault();
      if (project.undo()) appState.log('↺ 撤销了上一步操作');
      return;
    }

    // 重做 Ctrl+Y 或 Ctrl+Shift+Z
    if (
      ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z'))
    ) {
      e.preventDefault();
      if (project.redo()) appState.log('↻ 重做了上一步操作');
      return;
    }

    // 删除 Delete
    if (e.key === 'Delete') {
      const sel = appState.getSelection();
      if (!sel) return;

      if (sel.kind === 'event') {
        const ev = project.getEvent(sel.id);
        if (ev) {
          project.deleteEvent(sel.id);
          appState.select(null);
          appState.log(`🗑️ 已删除 Event 节点：[${ev.title}]（Ctrl+Z 可撤销）`);
        }
      } else if (sel.kind === 'condition') {
        const cond = project.getCondition(sel.id);
        if (cond) {
          project.deleteCondition(cond.id);
          appState.select(null);
          appState.log(`🗑️ 已删除 Condition 节点：[${cond.title}]（Ctrl+Z 可撤销）`);
        }
      } else if (sel.kind === 'subnode') {
        const node = project.getGraphNode(sel.eventId, sel.id);
        if (node && node.type !== 'start') {
          project.deleteGraphNode(sel.eventId, sel.id);
          appState.select({ kind: 'event', id: sel.eventId });
          appState.log(`🗑️ 已删除 Action Tree 节点：[${node.id}]（Ctrl+Z 可撤销）`);
        }
      } else if (sel.kind === 'multi') {
        const count = sel.items.length;
        project.change((d) => {
          sel.items.forEach((item) => {
            if (item.kind === 'event') {
              d.events = d.events.filter((x) => x.id !== item.id);
            } else if (item.kind === 'condition') {
              d.conditions = d.conditions.filter((x) => x.id !== item.id);
              d.events.forEach((ev) => {
                if (ev.incomingConditions) {
                  ev.incomingConditions = ev.incomingConditions.filter((c) => c !== item.id);
                }
              });
            } else if (item.kind === 'subnode' && item.eventId) {
              const ev = d.events.find((x) => x.id === item.eventId);
              if (ev?.actionGraph) {
                ev.actionGraph.nodes = ev.actionGraph.nodes.filter((n) => n.id !== item.id && n.type !== 'start');
              }
            }
          });
        }, 'structure');
        appState.select(null);
        appState.log(`🗑️ 已批量删除 ${count} 个选中节点（Ctrl+Z 可撤销）`, true);
      }
    }
  });

  appState.log('🔮 《紫水晶骑士物语》任务与 Condition 依赖图谱初始化完成！', true);
  appState.log('💡 提示：在【编辑模式】下，可任意添加/删除/修改 Event 与 Condition 节点，自动持久化至 data/castle.json。');
}

window.addEventListener('DOMContentLoaded', () => {
  void initApp();
});
