import { validateProjectData } from '../../core/projectData';
import { ProjectData } from '../../core/types';
import { ProjectStoragePort } from '../ports';

const API_URL = '/api/project';

export class HttpProjectAdapter implements ProjectStoragePort {
  public async loadProject(): Promise<ProjectData> {
    try {
      const res = await fetch(API_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      return validateProjectData(raw);
    } catch (err) {
      // 降级尝试加载相对静态资源 data/castle.json (用于生产静态托管环境)
      try {
        const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '') + '/';
        const staticUrl = `${base}data/castle.json`;
        const res = await fetch(staticUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(`静态数据读取失败：HTTP ${res.status}`);
        const raw = await res.json();
        return validateProjectData(raw);
      } catch (fallbackErr) {
        throw new Error(`读取 project 数据失败：API 失败 (${err}), 静态降级失败 (${fallbackErr})`);
      }
    }
  }

  public async saveProject(data: ProjectData): Promise<void> {
    try {
      const res = await fetch(API_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      throw new Error('静态演示模式：修改保存在当前浏览器内存中');
    }
  }
}
