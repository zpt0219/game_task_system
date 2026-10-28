import { StateChangeMeta } from '../core/session';
import { WorldState } from '../core/types';

export type DocumentChangeSource = 'load' | 'structure' | 'field' | 'drag' | 'history';
export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

export interface LogEntry {
  id: number;
  time: string;
  message: string;
  isHighlight: boolean;
}

export interface TaskStudioEvents {
  onProjectLoaded(): void;
  onDocumentChanged(source: DocumentChangeSource): void;
  onSessionChanged(): void;
  onWorldStateChanged(state: WorldState, meta?: StateChangeMeta): void;
  onContextChanged(): void;
  onHistoryChanged(canUndo: boolean, canRedo: boolean): void;
  onSaveStatus(status: SaveStatus, error?: string): void;
  onLogAdded(entry: LogEntry): void;
}
