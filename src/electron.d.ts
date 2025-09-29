// TypeScript definitions for Electron API
interface Drive {
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
  encrypted?: boolean;
  encryptionStatus?: string;
  encryptionType?: string;
}

interface HiddenFile {
  path: string;
  name?: string;
  size: number;
  lastModified: string;
  attributes?: string;
  type: string;
  platform: string;
  isDirectory?: boolean;
}

interface HiddenFilesResult {
  files: HiddenFile[];
  totalScanned: number;
  scanPath: string;
  timestamp: string;
  error?: string;
}

interface BrowserProfile {
  browser: string;
  profileName: string;
  profilePath: string;
  files: Array<{
    name: string;
    path: string;
    size: number;
    lastModified: string;
    type: string;
  }>;
}

interface BrowserProfilesResult {
  profiles: BrowserProfile[];
  totalFound: number;
  timestamp: string;
  error?: string;
}

interface EventLogEntry {
  eventId: string;
  timeCreated: string;
  level: 'Critical' | 'Error' | 'Warning' | 'Information' | 'Unknown';
  logSource: string;
  description: string;
  privacyRisk: 'High' | 'Medium' | 'Low';
}

interface EventLogsResult {
  logs: EventLogEntry[];
  totalEntries: number;
  logSources: string[];
  scanSummary: Record<string, number>;
  timestamp: string;
  error?: string;
}

interface RecoverabilityScore {
  score: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  factors: {
    swapFile?: { present: boolean; type: string; location?: string };
    snapshots?: { present: boolean; type: string; count?: number };
    encryption?: { enabled: boolean; drives: any[]; coverage: number };
    freeSpace?: { percentage: number; totalGB: string; freeGB: string };
  };
  timestamp: string;
  error?: string;
}

interface WipeProgress {
  step: number;
  totalSteps: number;
  progress: number;
  message: string;
  completed: boolean;
}

interface FilePreview {
  content: string;
  bytesRead: number;
  isBinary: boolean;
  filePath: string;
  error?: string;
}

interface ScanReport {
  success: boolean;
  reportId?: string;
  pdfPath?: string;
  jsonPath?: string;
  signature?: string;
  error?: string;
}

interface DemoData {
  drives: Drive[];
  hiddenFiles: HiddenFilesResult;
  browserProfiles: BrowserProfilesResult;
  recoverabilityScore: RecoverabilityScore;
}

export interface ElectronAPI {
  // System Information
  ping: () => string;
  getDrives: () => Promise<Drive[]>;
  
  // Hidden File Scanning (READ-ONLY)
  scanHiddenFiles: (targetPath?: string) => Promise<HiddenFilesResult>;
  previewFile: (filePath: string) => Promise<FilePreview>;
  
  // Browser Profile Detection (READ-ONLY)
  scanBrowserProfiles: () => Promise<BrowserProfilesResult>;
  
  // Windows Event Log Scanning (READ-ONLY)
  scanEventLogs: () => Promise<EventLogsResult>;
  
  // Recoverability Analysis (READ-ONLY)
  computeRecoverabilityScore: () => Promise<RecoverabilityScore>;
  
  // Report Generation
  generateScanReport: (scanData: any) => Promise<ScanReport>;
  verifyReport: (reportPath: string) => Promise<any>;
  
  // Simulation (SAFE - No actual wiping)
  simulateSecureWipe: (options: any) => Promise<void>;
  
  // Demo Data
  generateDemoData: () => Promise<DemoData>;
  
  // Event Listeners
  onWipeProgress: (callback: (progress: WipeProgress) => void) => void;
  removeWipeProgressListener: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
