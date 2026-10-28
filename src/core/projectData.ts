import { cloneDocument, TaskDocument, uid } from './document';
import { EventDef, ProjectData } from './types';

function ensureValidActionGraph(ev: EventDef): void {
  if (!ev.actionGraph || !Array.isArray(ev.actionGraph.nodes) || ev.actionGraph.nodes.length === 0) {
    const startId = uid('start');
    const actId = uid('act');
    ev.actionGraph = {
      nodes: [
        { id: startId, type: 'start', x: 60, y: 120, nextId: actId, defaultOptionIndex: 0 },
        {
          id: actId,
          type: 'action',
          title: '🎬 动作执行',
          x: 280,
          y: 110,
          steps: [{ type: 'say', speaker: '旁白', avatar: '💬', text: '在此编写台词...', button: '继续' }]
        }
      ]
    };
  }
}

export function validateProjectData(raw: unknown): ProjectData {
  if (!raw || typeof raw !== 'object') {
    throw new Error('无效的工程数据：顶层必须是对象');
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.vars) || !Array.isArray(obj.conditions) || !Array.isArray(obj.events)) {
    throw new Error('无效的工程数据：缺失 vars / conditions / events 数组');
  }

  const cloned = structuredClone(obj) as unknown as ProjectData;
  cloned.version = typeof cloned.version === 'number' ? cloned.version : 1;
  cloned.name = typeof cloned.name === 'string' ? cloned.name : '';
  cloned.presets = Array.isArray(cloned.presets) ? cloned.presets : [];

  cloned.events.forEach((ev) => {
    if (!Array.isArray(ev.incomingConditions)) {
      ev.incomingConditions = [];
    }
    ensureValidActionGraph(ev);
  });

  return cloned;
}

export function projectDataToDocument(data: ProjectData): TaskDocument {
  return validateProjectData(data);
}

export function documentToProjectData(doc: TaskDocument): ProjectData {
  return cloneDocument(doc);
}
