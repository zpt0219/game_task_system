import { ProjectData } from './types';

export type TaskDocument = ProjectData;

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createDefaultDocument(): TaskDocument {
  return {
    version: 1,
    name: '',
    vars: [],
    conditions: [],
    events: [],
    presets: []
  };
}

export function cloneDocument(doc: TaskDocument): TaskDocument {
  return structuredClone(doc);
}

export function documentsEqual(a: TaskDocument, b: TaskDocument): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
