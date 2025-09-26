// Safe bridge between Node/Electron and frontend
import { contextBridge, ipcRenderer } from "electron";

console.log('Preload script is running...');

try {
  contextBridge.exposeInMainWorld("electronAPI", {
    ping: () => "pong",
    getDrives: () => ipcRenderer.invoke('get-drives'),
  });
  console.log('ElectronAPI exposed to main world successfully');
} catch (error) {
  console.error('Failed to expose ElectronAPI:', error);
}
