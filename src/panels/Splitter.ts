/**
 * 列宽拖拽调整模块 (学习并复用自 64px-portrait-studio)
 * 允许用户拖拽左右分割条调整侧边栏宽度，并记住用户偏好到 localStorage
 */
export function setupSplitters(): void {
  const splitterLeft = document.getElementById('splitter-left');
  const splitterRight = document.getElementById('splitter-right');
  const leftSidebar = document.getElementById('leftSidebar');
  const rightSidebar = document.getElementById('rightSidebar');

  if (!splitterLeft || !splitterRight || !leftSidebar || !rightSidebar) return;

  const DEFAULT_LEFT_WIDTH = 290;
  const DEFAULT_RIGHT_WIDTH = 380;
  const STORAGE_KEY_LEFT = 'task_sys_layout_left_width';
  const STORAGE_KEY_RIGHT = 'task_sys_layout_right_width';

  // 恢复本地保存的宽度偏好
  const getSavedWidth = (key: string, min: number, max: number, defaultVal: number): number => {
    try {
      const val = localStorage.getItem(key);
      const w = parseInt(val ?? '', 10);
      return !isNaN(w) && w >= min && w <= max ? w : defaultVal;
    } catch {
      return defaultVal;
    }
  };

  leftSidebar.style.width = `${getSavedWidth(STORAGE_KEY_LEFT, 200, 520, DEFAULT_LEFT_WIDTH)}px`;
  rightSidebar.style.width = `${getSavedWidth(STORAGE_KEY_RIGHT, 260, 650, DEFAULT_RIGHT_WIDTH)}px`;

  // 绑定拖拽逻辑
  const makeDraggable = (
    splitter: HTMLElement,
    pane: HTMLElement,
    direction: 1 | -1,
    min: number,
    max: number,
    storageKey: string,
    defaultWidth: number
  ) => {
    let dragging = false;
    let startX = 0;
    let startWidth = 0;

    splitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startWidth = pane.offsetWidth;
      splitter.classList.add('is-active');
      document.body.classList.add('is-resizing');
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const width = Math.max(min, Math.min(max, startWidth + direction * (e.clientX - startX)));
      pane.style.width = `${width}px`;
    });

    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      splitter.classList.remove('is-active');
      document.body.classList.remove('is-resizing');
      try {
        localStorage.setItem(storageKey, pane.offsetWidth.toString());
      } catch {
        // 忽略存储异常
      }
    });

    // 双击分割手柄恢复默认宽度
    splitter.addEventListener('dblclick', () => {
      pane.style.width = `${defaultWidth}px`;
      try {
        localStorage.setItem(storageKey, defaultWidth.toString());
      } catch {
        // 忽略
      }
    });
  };

  makeDraggable(splitterLeft, leftSidebar, 1, 200, 520, STORAGE_KEY_LEFT, DEFAULT_LEFT_WIDTH);
  makeDraggable(splitterRight, rightSidebar, -1, 260, 650, STORAGE_KEY_RIGHT, DEFAULT_RIGHT_WIDTH);
}
