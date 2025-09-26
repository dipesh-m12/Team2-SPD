export interface ElectronAPI {
  ping: () => string;
  getDrives: () => Promise<Array<{
    name: string;
    path: string;
    device?: string;
    type: 'drive' | 'mount';
    total: number;
    free: number;
    used: number;
    totalGB: string;
    freeGB: string;
    usedGB: string;
    usagePercent: string;
  }>>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
