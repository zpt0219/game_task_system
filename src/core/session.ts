import { EditorMode, ProjectData, Selection, VarValue, WorldState } from './types';

export type ViewMode = 'main' | 'focal' | 'subgraph';

export interface StateChangeMeta {
  prevState: WorldState;
  changedVars: string[];
  sourceEventId?: string | null;
}

export interface EditorSession {
  isLoaded: boolean;
  mode: EditorMode;
  viewMode: ViewMode;
  selection: Selection;
  focalVarKey: string | null;
  subGraphEventId: string | null;
  activePresetId: string;
  worldState: WorldState;
  runningEventId: string | null;
}

export function createDefaultSession(): EditorSession {
  return {
    isLoaded: false,
    mode: 'play',
    viewMode: 'main',
    selection: null,
    focalVarKey: null,
    subGraphEventId: null,
    activePresetId: '__initial__',
    worldState: {},
    runningEventId: null
  };
}

/** 根据项目变量定义生成初始世界状态，可叠加预设覆盖值 */
export function buildInitialState(
  p: ProjectData,
  overrides: Record<string, VarValue> = {}
): WorldState {
  const s: WorldState = {};
  p.vars.forEach((v) => {
    s[v.key] = v.initial;
  });
  Object.assign(s, overrides);
  return s;
}

export function normalizeMultiSelection(
  items: Array<{ kind: 'event' | 'condition' | 'subnode'; id: string; eventId?: string }>
): Selection {
  if (items.length === 0) return null;
  if (items.length === 1) {
    const it = items[0];
    if (it.kind === 'subnode') {
      return { kind: 'subnode', id: it.id, eventId: it.eventId || '' };
    }
    return { kind: it.kind, id: it.id };
  }
  return { kind: 'multi', items: items.map((it) => ({ ...it })) };
}

export function getSelectedNodeIds(selection: Selection): string[] {
  if (!selection) return [];
  if (selection.kind === 'multi') {
    return selection.items.map((i) => i.id);
  }
  if ('id' in selection && selection.id) {
    return [selection.id];
  }
  return [];
}

export function isNodeSelected(selection: Selection, id: string): boolean {
  if (!selection) return false;
  if (selection.kind === 'multi') {
    return selection.items.some((it) => it.id === id);
  }
  return 'id' in selection && selection.id === id;
}

export function selectionsEqual(a: Selection, b: Selection): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
