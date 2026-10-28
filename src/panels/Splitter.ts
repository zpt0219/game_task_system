import { BrowserStorage } from '../app/adapters/BrowserStorage';
import { KeyValueStoragePort } from '../app/ports';

/**
 * 列宽拖拽调整模块 (学习并复用自 64px-portrait-studio)
 * 允许用户拖拽左右分割条调整侧边栏宽度，并通过 KeyValueStoragePort 持久化偏好
 */
export function setupSplitters(storage: KeyValueStoragePort = new BrowserStorage()): () => void {
  const splitterLeft = document.getElementById('splitter-left');
  const splitterRight = document.getElementById('splitter-right');
  const leftSidebar = document.getElementById('leftSidebar');
  const rightSidebar = document.getElementById('rightSidebar');

  const abortCtrl = new AbortController();
  const sig = abortCtrl.signal;

  if (!splitterLeft || !splitterRight || !leftSidebar || !rightSidebar) {
    return () => abortCtrl.abort();
  }

  const DEFAULT_LEFT_WIDTH = 290;
  const DEFAULT_RIGHT_WIDTH = 380;
  const STORAGE_KEY_LEFT = 'task_sys_layout_left_width';
  const STORAGE_KEY_RIGHT = 'task_sys_layout_right_width';

  const getSavedWidth = (key: string, min: number, max: number, defaultVal: number): number => {
    const val = storage.getItem(key);
    const w = parseInt(val ?? '', 10);
    return !isNaN(w) && w >= min && w <= max ? w : defaultVal;
  };

  leftSidebar.style.width = `${getSavedWidth(STORAGE_KEY_LEFT, 200, 520, DEFAULT_LEFT_WIDTH)}px`;
  rightSidebar.style.width = `${getSavedWidth(STORAGE_KEY_RIGHT, 260, 800, DEFAULT_RIGHT_WIDTH)}px`;

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

    splitter.addEventListener(
      'mousedown',
      (e) => {
        e.preventDefault();
        dragging = true;
        startX = e.clientX;
        startWidth = pane.offsetWidth;
        splitter.classList.add('is-active');
        document.body.classList.add('is-resizing');
      },
      { signal: sig }
    );

    window.addEventListener(
      'mousemove',
      (e) => {
        if (!dragging) return;
        const width = Math.max(min, Math.min(max, startWidth + direction * (e.clientX - startX)));
        pane.style.width = `${width}px`;
      },
      { signal: sig }
    );

    window.addEventListener(
      'mouseup',
      () => {
        if (!dragging) return;
        dragging = false;
        splitter.classList.remove('is-active');
        document.body.classList.remove('is-resizing');
        storage.setItem(storageKey, pane.offsetWidth.toString());
      },
      { signal: sig }
    );

    splitter.addEventListener(
      'dblclick',
      () => {
        pane.style.width = `${defaultWidth}px`;
        storage.setItem(storageKey, defaultWidth.toString());
      },
      { signal: sig }
    );
  };

  makeDraggable(splitterLeft, leftSidebar, 1, 200, 520, STORAGE_KEY_LEFT, DEFAULT_LEFT_WIDTH);
  makeDraggable(splitterRight, rightSidebar, -1, 260, 800, STORAGE_KEY_RIGHT, DEFAULT_RIGHT_WIDTH);

  return () => abortCtrl.abort();
}
