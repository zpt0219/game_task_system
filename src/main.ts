import './style.css';
import { RpgDialog } from './panels/RpgDialog';
import { Header } from './panels/Header';
import { NodeInspector } from './panels/NodeInspector';
import { StateSidebar } from './panels/StateSidebar';
import { GraphCanvas } from './panels/GraphCanvas';
import { appState } from './core/state';

function initApp(): void {
  const dialog = new RpgDialog();

  let graphCanvas: GraphCanvas | null = null;
  new Header(() => {
    if (graphCanvas) {
      graphCanvas.resetLayout();
      appState.log('📐 已恢复默认无遮挡任务布局！', true);
    }
  });

  new NodeInspector(dialog, (node) => {
    if (graphCanvas) {
      graphCanvas.updateNodeAppearance(node);
    }
  });

  new StateSidebar();
  graphCanvas = new GraphCanvas(dialog);

  appState.log('🔮 《紫水晶骑士物语》任务与条件图谱原型初始化完成！', true);
  appState.log('💡 提示：左侧为当前队伍/主角状态，中间为精简图谱，右侧展示选定节点的 ActionSequence 详细情况。');
}

window.addEventListener('DOMContentLoaded', initApp);
