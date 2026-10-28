import { KeyValueStoragePort } from '../ports';

export class BrowserStorage implements KeyValueStoragePort {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // 忽略隐私模式或配额限制
    }
  }

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // 忽略
    }
  }
}
