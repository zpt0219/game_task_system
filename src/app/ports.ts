import { DialogConfig, ProjectData } from '../core/types';

export interface ProjectStoragePort {
  loadProject(): Promise<ProjectData>;
  saveProject(data: ProjectData): Promise<void>;
}

export interface KeyValueStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StudioPrompts {
  confirm(message: string, confirmText?: string): Promise<boolean>;
  alert(message: string): Promise<void>;
  showRpgDialog(config: DialogConfig): void;
}
