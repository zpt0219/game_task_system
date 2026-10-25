type Child = Node | string | number | null | undefined | false;

const PROP_KEYS = new Set(['value', 'checked', 'disabled', 'type', 'placeholder', 'title', 'rows', 'selected', 'min', 'max', 'step']);

/**
 * 轻量 DOM 构建器：h('div', { class: 'x', onclick: fn }, child1, child2)
 * 字符串子节点按纯文本插入（自动转义）。
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    Object.entries(props).forEach(([k, v]) => {
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') el.style.cssText = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (k.startsWith('data-')) el.setAttribute(k, String(v));
      else if (PROP_KEYS.has(k)) (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, String(v));
    });
  }
  children.flat().forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  });
  return el;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** 当前焦点是否在输入控件中（此时不拦截 Delete / Ctrl+Z 等快捷键） */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
