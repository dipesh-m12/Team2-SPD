// Safe bridge between Node/Electron and frontend
import { contextBridge, ipcRenderer } from "electron";

console.log('Preload script is running...');

try {
  contextBridge.exposeInMainWorld("electronAPI", {
    // System Information
    ping: () => "pong",
    getDrives: () => ipcRenderer.invoke('get-drives'),
    
    // Hidden File Scanning (READ-ONLY)
    scanHiddenFiles: (targetPath) => ipcRenderer.invoke('scan-hidden-files', targetPath),
    previewFile: (filePath) => ipcRenderer.invoke('preview-file', filePath),
    
    // Browser Profile Detection (READ-ONLY)
    scanBrowserProfiles: () => ipcRenderer.invoke('scan-browser-profiles'),
    
    // Windows Event Log Scanning (READ-ONLY)
    scanEventLogs: () => ipcRenderer.invoke('scan-event-logs'),
    
    // Recoverability Analysis (READ-ONLY)
    computeRecoverabilityScore: () => ipcRenderer.invoke('compute-recoverability-score'),
    
    // Report Generation
    generateScanReport: (scanData) => ipcRenderer.invoke('generate-scan-report', scanData),
    verifyReport: (reportPath) => ipcRenderer.invoke('verify-report', reportPath),
    
    // Simulation (SAFE - No actual wiping)
    simulateSecureWipe: (options) => ipcRenderer.invoke('simulate-secure-wipe', options),
    
    // Demo Data
    generateDemoData: () => ipcRenderer.invoke('generate-demo-data'),
    
    // Event Listeners
    onWipeProgress: (callback) => {
      ipcRenderer.on('wipe-progress', (event, data) => callback(data));
    },
    
    removeWipeProgressListener: () => {
      ipcRenderer.removeAllListeners('wipe-progress');
    }
  });
  console.log('ElectronAPI exposed to main world successfully');
} catch (error) {
  console.error('Failed to expose ElectronAPI:', error);
}
