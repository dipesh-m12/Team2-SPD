import React, { useState, useEffect } from 'react';

// Type Definitions
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

function App() {
  // State for different panels
  const [activeTab, setActiveTab] = useState<'drives' | 'hidden' | 'browsers' | 'eventlogs' | 'score' | 'report'>('drives');
  
  // Drive scanning state
  const [drives, setDrives] = useState<Drive[]>([]);
  const [drivesLoading, setDrivesLoading] = useState(true);
  const [drivesError, setDrivesError] = useState<string | null>(null);
  
  // Hidden files state
  const [hiddenFiles, setHiddenFiles] = useState<HiddenFilesResult | null>(null);
  const [hiddenFilesLoading, setHiddenFilesLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<HiddenFile | null>(null);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  
  // Browser profiles state
  const [browserProfiles, setBrowserProfiles] = useState<BrowserProfilesResult | null>(null);
  const [browserProfilesLoading, setBrowserProfilesLoading] = useState(false);
  
  // Event logs state
  const [eventLogs, setEventLogs] = useState<EventLogsResult | null>(null);
  const [eventLogsLoading, setEventLogsLoading] = useState(false);
  
  // Recoverability score state
  const [recoverabilityScore, setRecoverabilityScore] = useState<RecoverabilityScore | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  
  // Wipe simulation state
  const [wipeProgress, setWipeProgress] = useState<WipeProgress | null>(null);
  const [isWiping, setIsWiping] = useState(false);
  
  // Report generation state
  const [scanReport, setScanReport] = useState<ScanReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Initialize drives on app load
  useEffect(() => {
    fetchDrives();
  }, []);

  // Setup wipe progress listener
  useEffect(() => {
    if (window.electronAPI?.onWipeProgress) {
      window.electronAPI.onWipeProgress((progress: WipeProgress) => {
        setWipeProgress(progress);
        if (progress.completed) {
          setIsWiping(false);
        }
      });
    }
    
    return () => {
      if (window.electronAPI?.removeWipeProgressListener) {
        window.electronAPI.removeWipeProgressListener();
      }
    };
  }, []);

  // Drive scanning functions
  const fetchDrives = async () => {
    try {
      setDrivesLoading(true);
      setDrivesError(null);
      
      if (window.electronAPI) {
        const driveData = await window.electronAPI.getDrives();
        setDrives(driveData);
      } else {
        // Fallback to demo data if not in Electron
        const demoData = await getDemoData();
        setDrives(demoData.drives);
        setDrivesError('Running in demo mode - limited functionality');
      }
    } catch (err) {
      console.error('Error fetching drives:', err);
      setDrivesError(`Failed to fetch drives: ${err}`);
    } finally {
      setDrivesLoading(false);
    }
  };

  // Hidden files scanning
  const scanHiddenFiles = async (targetPath?: string) => {
    try {
      setHiddenFilesLoading(true);
      
      if (window.electronAPI) {
        const result = await window.electronAPI.scanHiddenFiles(targetPath);
        setHiddenFiles(result);
      } else {
        const demoData = await getDemoData();
        setHiddenFiles(demoData.hiddenFiles);
      }
    } catch (err) {
      console.error('Error scanning hidden files:', err);
      setHiddenFiles({
        files: [],
        totalScanned: 0,
        scanPath: targetPath || 'Unknown',
        timestamp: new Date().toISOString(),
        error: `Failed to scan: ${err}`
      });
    } finally {
      setHiddenFilesLoading(false);
    }
  };

  // File preview
  const previewFile = async (filePath: string) => {
    try {
      if (window.electronAPI) {
        const preview = await window.electronAPI.previewFile(filePath);
        setFilePreview(preview);
      } else {
        setFilePreview({
          content: '[Demo Mode] File preview not available',
          bytesRead: 0,
          isBinary: false,
          filePath
        });
      }
    } catch (err) {
      setFilePreview({
        content: `[Error previewing file: ${err}]`,
        bytesRead: 0,
        isBinary: false,
        filePath,
        error: err as string
      });
    }
  };

  // Browser profile scanning
  const scanBrowserProfiles = async () => {
    try {
      setBrowserProfilesLoading(true);
      
      if (window.electronAPI) {
        const result = await window.electronAPI.scanBrowserProfiles();
        setBrowserProfiles(result);
      } else {
        const demoData = await getDemoData();
        setBrowserProfiles(demoData.browserProfiles);
      }
    } catch (err) {
      console.error('Error scanning browser profiles:', err);
      setBrowserProfiles({
        profiles: [],
        totalFound: 0,
        timestamp: new Date().toISOString(),
        error: `Failed to scan: ${err}`
      });
    } finally {
      setBrowserProfilesLoading(false);
    }
  };

  // Event log scanning
  const scanEventLogs = async () => {
    try {
      setEventLogsLoading(true);
      
      if (window.electronAPI) {
        const result = await window.electronAPI.scanEventLogs();
        setEventLogs(result);
      } else {
        // Demo data for event logs
        setEventLogs({
          logs: [
            {
              eventId: '4624',
              timeCreated: new Date().toISOString(),
              level: 'Information',
              logSource: 'Security',
              description: 'An account was successfully logged on.',
              privacyRisk: 'High'
            },
            {
              eventId: '4625',
              timeCreated: new Date().toISOString(),
              level: 'Warning',
              logSource: 'Security',
              description: 'An account failed to log on.',
              privacyRisk: 'High'
            }
          ],
          totalEntries: 2,
          logSources: ['System', 'Security', 'Application'],
          scanSummary: { Security: 2 },
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('Error scanning event logs:', err);
      setEventLogs({
        logs: [],
        totalEntries: 0,
        logSources: [],
        scanSummary: {},
        timestamp: new Date().toISOString(),
        error: `Failed to scan: ${err}`
      });
    } finally {
      setEventLogsLoading(false);
    }
  };

  // Recoverability score computation
  const computeRecoverabilityScore = async () => {
    try {
      setScoreLoading(true);
      
      if (window.electronAPI) {
        const result = await window.electronAPI.computeRecoverabilityScore();
        setRecoverabilityScore(result);
      } else {
        const demoData = await getDemoData();
        setRecoverabilityScore(demoData.recoverabilityScore);
      }
    } catch (err) {
      console.error('Error computing recoverability score:', err);
      setRecoverabilityScore({
        score: 0,
        risk: 'UNKNOWN',
        factors: {},
        timestamp: new Date().toISOString(),
        error: `Failed to compute: ${err}`
      });
    } finally {
      setScoreLoading(false);
    }
  };

  // Secure wipe simulation
  const startSecureWipeSimulation = async () => {
    try {
      setIsWiping(true);
      setWipeProgress(null);
      
      if (window.electronAPI) {
        await window.electronAPI.simulateSecureWipe({});
      } else {
        // Demo simulation
        for (let i = 1; i <= 8; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          setWipeProgress({
            step: i,
            totalSteps: 8,
            progress: (i / 8) * 100,
            message: `Demo step ${i}/8...`,
            completed: i === 8
          });
        }
        setIsWiping(false);
      }
    } catch (err) {
      console.error('Error in secure wipe simulation:', err);
      setIsWiping(false);
    }
  };

  // Generate scan report
  const generateScanReport = async () => {
    try {
      setReportLoading(true);
      
      const reportData = {
        drives,
        hiddenFiles,
        browserProfiles,
        eventLogs,
        recoverabilityScore
      };
      
      if (window.electronAPI) {
        const result = await window.electronAPI.generateScanReport(reportData);
        setScanReport(result);
      } else {
        setScanReport({
          success: true,
          reportId: 'demo-' + Date.now(),
          pdfPath: '/demo/scan-report.pdf',
          jsonPath: '/demo/scan-report.json',
          signature: 'demo-signature'
        });
      }
    } catch (err) {
      console.error('Error generating scan report:', err);
      setScanReport({
        success: false,
        error: `Failed to generate report: ${err}`
      });
    } finally {
      setReportLoading(false);
    }
  };

  // Demo data fallback
  const getDemoData = async () => {
    if (window.electronAPI?.generateDemoData) {
      return await window.electronAPI.generateDemoData();
    }
    
    return {
      drives: [
        {
          name: 'C:',
          path: 'C:\\',
          type: 'drive' as const,
          total: 537109504000,
          free: 161406156800,
          used: 375703347200,
          totalGB: '500.00',
          freeGB: '150.23',
          usedGB: '349.77',
          usagePercent: '70.0',
          encrypted: true,
          encryptionStatus: 'BitLocker'
        }
      ],
      hiddenFiles: {
        files: [
          {
            path: 'C:\\Users\\Demo\\.config\\secrets.txt',
            size: 15420,
            lastModified: new Date().toISOString(),
            type: 'config',
            platform: 'windows'
          }
        ],
        totalScanned: 47,
        scanPath: 'C:\\Users\\Demo',
        timestamp: new Date().toISOString()
      },
      browserProfiles: {
        profiles: [
          {
            browser: 'chrome',
            profileName: 'Default',
            profilePath: 'C:\\Users\\Demo\\AppData\\Local\\Google\\Chrome\\User Data\\Default',
            files: [
              {
                name: 'Login Data',
                path: 'C:\\Users\\Demo\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Login Data',
                size: 32768,
                lastModified: new Date().toISOString(),
                type: 'Saved Passwords'
              }
            ]
          }
        ],
        totalFound: 1,
        timestamp: new Date().toISOString()
      },
      eventLogs: {
        logs: [
          {
            eventId: '4624',
            timeCreated: new Date().toISOString(),
            level: 'Information' as const,
            logSource: 'Security',
            description: 'An account was successfully logged on.',
            privacyRisk: 'High' as const
          },
          {
            eventId: '4625',
            timeCreated: new Date().toISOString(),
            level: 'Warning' as const,
            logSource: 'Security',
            description: 'An account failed to log on.',
            privacyRisk: 'High' as const
          }
        ],
        totalEntries: 2,
        logSources: ['System', 'Security', 'Application'],
        scanSummary: { Security: 2 },
        timestamp: new Date().toISOString()
      },
      recoverabilityScore: {
        score: 75,
        risk: 'HIGH' as const,
        factors: {
          swapFile: { present: true, type: 'pagefile.sys' },
          snapshots: { present: true, type: 'Volume Shadow Copy' },
          encryption: { enabled: true, drives: [], coverage: 50 }
        },
        timestamp: new Date().toISOString()
      }
    };
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'HIGH': return 'text-black bg-gray-100 border-gray-400 font-bold';
      case 'MEDIUM': return 'text-gray-800 bg-gray-50 border-gray-300';
      case 'LOW': return 'text-gray-600 bg-white border-gray-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-black shadow-sm border-b border-gray-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-white">Privacy & Security Scanner</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-300">Read-Only Analysis Tool</span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-gray-100 border-b border-gray-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {[
              { id: 'drives', label: 'Drives & Encryption', icon: '💿' },
              { id: 'hidden', label: 'Hidden Files', icon: '👁️' },
              { id: 'browsers', label: 'Browser Profiles', icon: '🌐' },
              { id: 'eventlogs', label: 'Event Logs', icon: '📋' },
              { id: 'score', label: 'Recovery Risk', icon: '⚠️' },
              { id: 'report', label: 'Scan Report', icon: '📄' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center px-1 py-4 border-b-2 text-sm font-medium ${
                  activeTab === tab.id
                    ? 'border-black text-black'
                    : 'border-transparent text-gray-600 hover:text-black hover:border-gray-400'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Panel - Main Content */}
          <div className="lg:col-span-2">
            
            {/* Drives Panel */}
            {activeTab === 'drives' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-gray-900">System Drives & Encryption</h2>
                  <button
                    onClick={fetchDrives}
                    disabled={drivesLoading}
                    className="px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
                  >
                    {drivesLoading ? 'Scanning...' : 'Refresh'}
                  </button>
                </div>

                {drivesError && (
                  <div className="bg-gray-100 border border-gray-400 text-black px-4 py-3 rounded-md">
                    ⚠️ {drivesError}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {drivesLoading ? (
                    <div className="col-span-2 flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
                    </div>
                  ) : (
                    drives.map((drive, index) => (
                      <div key={index} className="bg-white rounded-lg shadow border p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className="text-lg font-medium text-gray-900">{drive.name}</h3>
                            <p className="text-sm text-gray-500 font-mono">{drive.path}</p>
                          </div>
                          <div className={`px-2 py-1 rounded text-xs ${
                            drive.encrypted 
                              ? 'bg-black text-white' 
                              : 'bg-gray-300 text-black'
                          }`}>
                            {drive.encrypted ? '🔒 Encrypted' : '🔓 Not Encrypted'}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-gray-900">{drive.totalGB}</div>
                            <div className="text-xs text-gray-500">Total GB</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-gray-900">{drive.usedGB}</div>
                            <div className="text-xs text-gray-500">Used GB</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-gray-900">{drive.freeGB}</div>
                            <div className="text-xs text-gray-500">Free GB</div>
                          </div>
                        </div>

                        <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                          <div 
                            className="bg-black h-2 rounded-full" 
                            style={{ width: `${drive.usagePercent}%` }}
                          ></div>
                        </div>
                        <div className="text-sm text-gray-600 text-center">
                          {drive.usagePercent}% used
                        </div>

                        {drive.encryptionStatus && (
                          <div className="mt-4 text-sm text-gray-600">
                            <strong>Encryption:</strong> {drive.encryptionStatus}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Hidden Files Panel */}
            {activeTab === 'hidden' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-gray-900">Hidden Files Analysis</h2>
                  <button
                    onClick={() => scanHiddenFiles()}
                    disabled={hiddenFilesLoading}
                    className="px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
                  >
                    {hiddenFilesLoading ? 'Scanning...' : 'Scan Hidden Files'}
                  </button>
                </div>

                <div className="bg-gray-100 border border-gray-300 text-black px-4 py-3 rounded-md">
                  ℹ️ <strong>Safe Operation:</strong> This scan only reads file metadata and is limited to 200 files for performance.
                </div>

                {hiddenFiles && (
                  <div className="bg-white rounded-lg shadow border">
                    <div className="px-6 py-4 border-b">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">Scan Results</h3>
                          <p className="text-sm text-gray-500">
                            Found {hiddenFiles.totalScanned} hidden files in {hiddenFiles.scanPath}
                          </p>
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(hiddenFiles.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {hiddenFiles.error && (
                      <div className="px-6 py-4 bg-gray-100 border-b">
                        <div className="text-black font-semibold">Error: {hiddenFiles.error}</div>
                      </div>
                    )}

                    <div className="divide-y">
                      {hiddenFiles.files.slice(0, 20).map((file, index) => (
                        <div key={index} className="px-6 py-4 hover:bg-gray-50">
                          <div className="flex items-center justify-between">
                            <div className="flex-grow min-w-0">
                              <div className="flex items-center">
                                <span className="text-sm font-medium text-gray-900 truncate">
                                  {file.name|| file.path.split(/[/\\]/).pop()}
                                </span>
                                <span className={`ml-2 px-2 py-1 text-xs rounded ${
                                  file.type === 'dotfile' ? 'bg-black text-white' :
                                  file.type === 'hidden' ? 'bg-gray-600 text-white' :
                                  'bg-gray-200 text-black'
                                }`}>
                                  {file.type}
                                </span>
                              </div>
                              <div className="text-sm text-gray-500 font-mono truncate">
                                {file.path}
                              </div>
                            </div>
                            <div className="flex items-center space-x-4 ml-4">
                              <div className="text-sm text-gray-900">
                                {formatFileSize(file.size)}
                              </div>
                              <button
                                onClick={() => {
                                  setSelectedFile(file);
                                  previewFile(file.path);
                                }}
                                className="text-black hover:text-gray-600 text-sm underline"
                              >
                                Preview
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {hiddenFiles.files.length > 20 && (
                      <div className="px-6 py-4 bg-gray-50 text-center text-sm text-gray-600">
                        Showing first 20 of {hiddenFiles.files.length} files
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Browser Profiles Panel */}
            {activeTab === 'browsers' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-gray-900">Browser Profile Detection</h2>
                  <button
                    onClick={scanBrowserProfiles}
                    disabled={browserProfilesLoading}
                    className="px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
                  >
                    {browserProfilesLoading ? 'Scanning...' : 'Scan Browsers'}
                  </button>
                </div>

                <div className="bg-gray-100 border border-gray-300 text-black px-4 py-3 rounded-md">
                  ⚠️ <strong>Privacy Safe:</strong> Only file metadata is read, never actual passwords or sensitive content.
                </div>

                {browserProfiles && (
                  <div className="space-y-4">
                    {browserProfiles.error && (
                      <div className="bg-gray-100 border border-gray-400 text-black px-4 py-3 rounded-md">
                        <strong>Error:</strong> {browserProfiles.error}
                      </div>
                    )}

                    {browserProfiles.profiles.map((profile, index) => (
                      <div key={index} className="bg-white rounded-lg shadow border">
                        <div className="px-6 py-4 border-b">
                          <div className="flex items-center">
                            <div className="flex-shrink-0">
                              <span className="text-2xl">
                                {profile.browser === 'chrome' ? '🟡' : profile.browser === 'firefox' ? '🟠' : '🌐'}
                              </span>
                            </div>
                            <div className="ml-4">
                              <h3 className="text-lg font-medium text-gray-900 capitalize">
                                {profile.browser} - {profile.profileName}
                              </h3>
                              <p className="text-sm text-gray-500 font-mono">{profile.profilePath}</p>
                            </div>
                          </div>
                        </div>

                        <div className="px-6 py-4">
                          <h4 className="text-sm font-medium text-gray-900 mb-3">Profile Files Found:</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {profile.files.map((file, fileIndex) => (
                              <div key={fileIndex} className="bg-gray-50 rounded p-3">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">{file.name}</div>
                                    <div className="text-xs text-gray-500">{file.type}</div>
                                  </div>
                                  <div className="text-sm text-gray-600">
                                    {formatFileSize(file.size)}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}

                    {browserProfiles.profiles.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        No browser profiles detected on this system
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Event Logs Panel */}
            {activeTab === 'eventlogs' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-gray-900">Windows Event Log Analysis</h2>
                  <button
                    onClick={scanEventLogs}
                    disabled={eventLogsLoading}
                    style={{
                      backgroundColor: eventLogsLoading ? '#e5e7eb' : '#ffffff',
                      border: '1px solid #d1d5db',
                      color: eventLogsLoading ? '#6b7280' : '#374151'
                    }}
                    className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {eventLogsLoading ? 'Scanning...' : 'Scan Event Logs'}
                  </button>
                </div>

                {eventLogs?.error && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4">
                    <div className="flex">
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">Scan Error</h3>
                        <div className="mt-2 text-sm text-red-700">{eventLogs.error}</div>
                      </div>
                    </div>
                  </div>
                )}

                {eventLogs && !eventLogs.error && (
                  <div className="space-y-4">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="text-2xl font-bold text-gray-900">{eventLogs.totalEntries}</div>
                        <div className="text-sm text-gray-600">Total Log Entries</div>
                      </div>
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="text-2xl font-bold text-gray-900">{eventLogs.logSources.length}</div>
                        <div className="text-sm text-gray-600">Log Sources</div>
                      </div>
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="text-2xl font-bold text-red-600">
                          {eventLogs.logs.filter(log => log.privacyRisk === 'High').length}
                        </div>
                        <div className="text-sm text-gray-600">High Privacy Risk</div>
                      </div>
                    </div>

                    {/* Log Sources */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <h3 className="text-lg font-medium text-gray-900 mb-3">Available Log Sources</h3>
                      <div className="flex flex-wrap gap-2">
                        {eventLogs.logSources.map((source, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                          >
                            {source}
                            {eventLogs.scanSummary[source] && (
                              <span className="ml-1 text-gray-600">({eventLogs.scanSummary[source]})</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Event Log Entries */}
                    <div className="bg-white rounded-lg border border-gray-200">
                      <div className="px-4 py-5 sm:p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Privacy-Relevant Events</h3>
                        
                        {eventLogs.logs.length === 0 ? (
                          <div className="text-center py-6">
                            <div className="text-gray-500">No privacy-relevant event logs found</div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {eventLogs.logs.slice(0, 20).map((log, index) => (
                              <div key={index} className="border border-gray-200 rounded-lg p-4">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2">
                                      <span className="text-sm font-medium text-gray-900">Event ID: {log.eventId}</span>
                                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                        log.level === 'Critical' ? 'bg-red-100 text-red-800' :
                                        log.level === 'Error' ? 'bg-red-100 text-red-800' :
                                        log.level === 'Warning' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-blue-100 text-blue-800'
                                      }`}>
                                        {log.level}
                                      </span>
                                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                        log.privacyRisk === 'High' ? 'bg-red-100 text-red-800' :
                                        log.privacyRisk === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-green-100 text-green-800'
                                      }`}>
                                        {log.privacyRisk} Risk
                                      </span>
                                    </div>
                                    <div className="mt-1 text-sm text-gray-600">
                                      <div><strong>Source:</strong> {log.logSource}</div>
                                      <div><strong>Time:</strong> {new Date(log.timeCreated).toLocaleString()}</div>
                                      {log.description && (
                                        <div className="mt-2"><strong>Description:</strong> {log.description}</div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Recovery Score Panel */}
            {activeTab === 'score' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-gray-900">Data Recovery Risk Assessment</h2>
                  <button
                    onClick={computeRecoverabilityScore}
                    disabled={scoreLoading}
                    className="px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
                  >
                    {scoreLoading ? 'Analyzing...' : 'Analyze Risk'}
                  </button>
                </div>

                {recoverabilityScore && (
                  <div className="space-y-6">
                    {/* Risk Score Card */}
                    <div className="bg-white rounded-lg shadow border p-6">
                      <div className="text-center">
                        <div className="text-4xl font-bold text-gray-900 mb-2">
                          {recoverabilityScore.score}/100
                        </div>
                        <div className={`inline-flex px-4 py-2 rounded-full text-lg font-medium ${getRiskColor(recoverabilityScore.risk)}`}>
                          {recoverabilityScore.risk} RISK
                        </div>
                        <div className="text-sm text-gray-500 mt-2">
                          Data Recovery Risk Level
                        </div>
                      </div>
                    </div>

                    {/* Risk Factors */}
                    <div className="bg-white rounded-lg shadow border">
                      <div className="px-6 py-4 border-b">
                        <h3 className="text-lg font-medium text-gray-900">Risk Factors Analysis</h3>
                      </div>
                      <div className="divide-y">
                        
                        {/* Swap/Pagefile */}
                        <div className="px-6 py-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-medium text-gray-900">Swap/Page File</h4>
                              <p className="text-sm text-gray-500">Memory contents may be stored on disk</p>
                            </div>
                            <div className={`px-3 py-1 rounded text-sm ${
                              recoverabilityScore.factors.swapFile?.present 
                                ? 'bg-gray-300 text-black font-semibold' 
                                : 'bg-gray-100 text-gray-700'
                            }`}>
                              {recoverabilityScore.factors.swapFile?.present ? '⚠️ Present' : '✅ Not Found'}
                            </div>
                          </div>
                          {recoverabilityScore.factors.swapFile?.type && (
                            <div className="mt-2 text-sm text-gray-600">
                              Type: {recoverabilityScore.factors.swapFile.type}
                            </div>
                          )}
                        </div>

                        {/* Snapshots */}
                        <div className="px-6 py-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-medium text-gray-900">System Snapshots</h4>
                              <p className="text-sm text-gray-500">Previous system states may contain data</p>
                            </div>
                            <div className={`px-3 py-1 rounded text-sm ${
                              recoverabilityScore.factors.snapshots?.present 
                                ? 'bg-gray-300 text-black font-semibold' 
                                : 'bg-gray-100 text-gray-700'
                            }`}>
                              {recoverabilityScore.factors.snapshots?.present ? '⚠️ Present' : '✅ Not Found'}
                            </div>
                          </div>
                          {recoverabilityScore.factors.snapshots?.type && (
                            <div className="mt-2 text-sm text-gray-600">
                              Type: {recoverabilityScore.factors.snapshots.type}
                              {recoverabilityScore.factors.snapshots.count && 
                                ` (${recoverabilityScore.factors.snapshots.count} found)`
                              }
                            </div>
                          )}
                        </div>

                        {/* Encryption */}
                        <div className="px-6 py-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-medium text-gray-900">Disk Encryption</h4>
                              <p className="text-sm text-gray-500">Full-disk encryption protects against recovery</p>
                            </div>
                            <div className={`px-3 py-1 rounded text-sm ${
                              recoverabilityScore.factors.encryption?.enabled 
                                ? 'bg-gray-100 text-gray-700' 
                                : 'bg-gray-300 text-black font-semibold'
                            }`}>
                              {recoverabilityScore.factors.encryption?.enabled ? '🔒 Enabled' : '🔓 Disabled'}
                            </div>
                          </div>
                          {recoverabilityScore.factors.encryption?.coverage !== undefined && (
                            <div className="mt-2 text-sm text-gray-600">
                              Coverage: {recoverabilityScore.factors.encryption.coverage.toFixed(1)}% of drives
                            </div>
                          )}
                        </div>

                        {/* Free Space */}
                        {recoverabilityScore.factors.freeSpace && (
                          <div className="px-6 py-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="text-sm font-medium text-gray-900">Free Space</h4>
                                <p className="text-sm text-gray-500">More free space = higher recovery chances</p>
                              </div>
                              <div className={`px-3 py-1 rounded text-sm ${
                                recoverabilityScore.factors.freeSpace.percentage > 20 
                                  ? 'bg-gray-300 text-black font-semibold' 
                                  : 'bg-gray-100 text-gray-700'
                              }`}>
                                {recoverabilityScore.factors.freeSpace.percentage}% Free
                              </div>
                            </div>
                            <div className="mt-2 text-sm text-gray-600">
                              {recoverabilityScore.factors.freeSpace.freeGB} GB free of {recoverabilityScore.factors.freeSpace.totalGB} GB total
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {recoverabilityScore.error && (
                      <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md">
                        Error: {recoverabilityScore.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Report Panel */}
            {activeTab === 'report' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-gray-900">Scan Report Generation</h2>
                  <button
                    onClick={generateScanReport}
                    disabled={reportLoading}
                    className="px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
                  >
                    {reportLoading ? 'Generating...' : 'Generate Report'}
                  </button>
                </div>

                <div className="bg-gray-100 border border-gray-300 text-black px-4 py-3 rounded-md">
                  📄 <strong>Signed Reports:</strong> All reports are digitally signed with RSA keys and include QR codes for verification.
                </div>

                {/* Report Generation Form */}
                <div className="bg-white rounded-lg shadow border p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Report Contents</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center p-3 bg-gray-50 rounded">
                      <span className="text-green-500 mr-3">✅</span>
                      <div>
                        <div className="text-sm font-medium">Drive Analysis</div>
                        <div className="text-xs text-gray-500">{drives.length} drives scanned</div>
                      </div>
                    </div>
                    <div className="flex items-center p-3 bg-gray-50 rounded">
                      <span className={hiddenFiles ? "text-green-500" : "text-gray-400"}>
                        {hiddenFiles ? "✅" : "⏳"}
                      </span>
                      <div className="ml-3">
                        <div className="text-sm font-medium">Hidden Files</div>
                        <div className="text-xs text-gray-500">
                          {hiddenFiles ? `${hiddenFiles.totalScanned} files found` : 'Not scanned yet'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center p-3 bg-gray-50 rounded">
                      <span className={browserProfiles ? "text-green-500" : "text-gray-400"}>
                        {browserProfiles ? "✅" : "⏳"}
                      </span>
                      <div className="ml-3">
                        <div className="text-sm font-medium">Browser Profiles</div>
                        <div className="text-xs text-gray-500">
                          {browserProfiles ? `${browserProfiles.totalFound} profiles found` : 'Not scanned yet'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center p-3 bg-gray-50 rounded">
                      <span className={eventLogs ? "text-green-500" : "text-gray-400"}>
                        {eventLogs ? "✅" : "⏳"}
                      </span>
                      <div className="ml-3">
                        <div className="text-sm font-medium">Event Logs</div>
                        <div className="text-xs text-gray-500">
                          {eventLogs ? `${eventLogs.totalEntries} entries scanned` : 'Not scanned yet'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center p-3 bg-gray-50 rounded">
                      <span className={recoverabilityScore ? "text-green-500" : "text-gray-400"}>
                        {recoverabilityScore ? "✅" : "⏳"}
                      </span>
                      <div className="ml-3">
                        <div className="text-sm font-medium">Recovery Risk</div>
                        <div className="text-xs text-gray-500">
                          {recoverabilityScore ? `${recoverabilityScore.risk} risk level` : 'Not analyzed yet'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Generated Report */}
                {scanReport && (
                  <div className="bg-white rounded-lg shadow border">
                    <div className="px-6 py-4 border-b">
                      <h3 className="text-lg font-medium text-gray-900">Generated Report</h3>
                    </div>
                    <div className="px-6 py-4">
                      {scanReport.success ? (
                        <div className="space-y-4">
                          <div className="flex items-center text-green-600">
                            <span className="mr-2">✅</span>
                            Report generated successfully
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium text-gray-700">Report ID</label>
                              <div className="text-sm font-mono bg-gray-100 p-2 rounded">
                                {scanReport.reportId}
                              </div>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-700">Signature</label>
                              <div className="text-sm font-mono bg-gray-100 p-2 rounded truncate">
                                {scanReport.signature?.substring(0, 32)}...
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div>
                              <label className="text-sm font-medium text-gray-700">PDF Report</label>
                              <div className="text-sm text-blue-600 font-mono">
                                {scanReport.pdfPath}
                              </div>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-700">JSON Data</label>
                              <div className="text-sm text-blue-600 font-mono">
                                {scanReport.jsonPath}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center text-red-600">
                          <span className="mr-2">❌</span>
                          Report generation failed: {scanReport.error}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Panel - Actions & Preview */}
          <div className="space-y-6">
            
            {/* Secure Wipe Simulation */}
            <div className="bg-white rounded-lg shadow border p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Secure Wipe Simulation</h3>
              <div className="text-sm text-gray-600 mb-4">
                <strong>Demo Only:</strong> This performs a realistic simulation without actually modifying any data.
              </div>
              
              {wipeProgress ? (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>Step {wipeProgress.step} of {wipeProgress.totalSteps}</span>
                    <span>{wipeProgress.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-black h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${wipeProgress.progress}%` }}
                    ></div>
                  </div>
                  <div className="text-sm text-gray-600">
                    {wipeProgress.message}
                  </div>
                </div>
              ) : (
                <button
                  onClick={startSecureWipeSimulation}
                  disabled={isWiping}
                  className="w-full px-4 py-3 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
                >
                  {isWiping ? 'Simulating Wipe...' : '🗑️ Simulate Secure Wipe'}
                </button>
              )}
            </div>

            {/* File Preview */}
            {selectedFile && filePreview && (
              <div className="bg-white rounded-lg shadow border p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">File Preview</h3>
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-medium text-gray-700">File</div>
                    <div className="text-sm font-mono bg-gray-100 p-2 rounded truncate">
                      {selectedFile.name || selectedFile.path.split(/[/\\]/).pop()}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-700">Size</div>
                    <div className="text-sm">{formatFileSize(selectedFile.size)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-700">Preview (first 2KB)</div>
                    <div className="text-xs font-mono bg-gray-100 p-3 rounded max-h-40 overflow-y-auto whitespace-pre-wrap">
                      {filePreview.content}
                    </div>
                  </div>
                  {filePreview.isBinary && (
                    <div className="text-xs text-yellow-600">
                      ⚠️ Binary file detected - preview may not display correctly
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow border p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setActiveTab('hidden');
                    if (!hiddenFiles) scanHiddenFiles();
                  }}
                  className="w-full px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-gray-800"
                >
                  🔍 Scan Hidden Files
                </button>
                <button
                  onClick={() => {
                    setActiveTab('browsers');
                    if (!browserProfiles) scanBrowserProfiles();
                  }}
                  className="w-full px-4 py-2 text-sm bg-gray-700 text-white rounded-md hover:bg-black"
                >
                  🌐 Detect Browser Profiles
                </button>
                <button
                  onClick={() => {
                    setActiveTab('eventlogs');
                    if (!eventLogs) scanEventLogs();
                  }}
                  className="w-full px-4 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-black"
                >
                  📋 Scan Event Logs
                </button>
                <button
                  onClick={() => {
                    setActiveTab('score');
                    if (!recoverabilityScore) computeRecoverabilityScore();
                  }}
                  className="w-full px-4 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-black"
                >
                  ⚠️ Analyze Recovery Risk
                </button>
              </div>
            </div>

            {/* System Info */}
            <div className="bg-white rounded-lg shadow border p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">System Information</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Platform:</span>
                  <span className="font-mono">{navigator.platform}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">User Agent:</span>
                  <span className="font-mono text-xs truncate">
                    {navigator.userAgent.substring(0, 20)}...
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Electron API:</span>
                  <span className={`font-mono ${window.electronAPI ? 'text-green-600' : 'text-red-600'}`}>
                    {window.electronAPI ? 'Available' : 'Not Available'}
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}

export default App;