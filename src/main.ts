import './style.css';
import { project } from './core/project';
import { appState, buildInitialState } from './core/state';
import { RpgDialog } from './panels/RpgDialog';
import { Header } from './panels/Header';
import { NodeInspector } from './panels/NodeInspector';
import { StateSidebar } from './panels/StateSidebar';
import { GraphCanvas } from './panels/GraphCanvas';
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
  let canvas: GraphCanvas | null = null;

  new Header(
    () => {
      if (canvas) {
        canvas.resetLayout();
        appState.log('📐 已恢复默认无遮挡任务布局！', true);
      }
    },
    // + Event 按钮
    () => {
      // 在画布当前视野中心新建
      const p = project.get();
      const ev = project.addEvent(200 + p.events.length * 20, 200 + p.events.length * 20);
      appState.select({ kind: 'event', id: ev.id });
      appState.log(`✨ 新建 Event 节点：[${ev.title}]`, true);
    },
    // + Trigger 按钮
    () => {
      const p = project.get();
      const tr = project.addTrigger(460, 100 + p.triggers.length * 40);
      appState.select({ kind: 'trigger', id: tr.id });
      appState.log(`✨ 新建 Trigger 判断器：[${tr.title}]`, true);
    }
  );

  new NodeInspector(dialog);
  new StateSidebar();
  canvas = new GraphCanvas(dialog);

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
        if (ev && confirm(`确定删除 Event「${ev.title}」吗？`)) {
          project.deleteEvent(sel.id);
          appState.select(null);
          appState.log(`🗑️ 已删除 Event 节点：[${ev.title}]`);
        }
      } else if (sel.kind === 'trigger') {
        const tr = project.getTrigger(sel.id);
        if (tr) {
          const refs = project.findTriggerRefs(tr.id);
          if (refs.length > 0) {
            const names = refs.map((r) => `「${r.event.title} - ${r.branch.title}」`).join('\n');
            if (!confirm(`该 Trigger 正在被以下 ${refs.length} 个 Event 分支引用：\n${names}\n\n确认删除吗？（删除后将一并从这些分支中移除该前置条件）`)) {
              return;
            }
          } else if (!confirm(`确定删除 Trigger「${tr.title}」吗？`)) {
            return;
          }
          project.deleteTrigger(tr.id);
          appState.select(null);
          appState.log(`🗑️ 已删除 Trigger 节点：[${tr.title}]`);
        }
      }
    }
  });

  appState.log('🔮 《紫水晶骑士物语》任务与 Trigger 依赖图谱初始化完成！', true);
  appState.log('💡 提示：在【编辑模式】下，可任意添加/删除/修改 Event 与 Trigger 节点，自动持久化至 data/castle.json。');
}

window.addEventListener('DOMContentLoaded', () => {
  void initApp();
});
