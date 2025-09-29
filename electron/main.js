import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";
import { exec, spawn } from "child_process";
import crypto from "crypto";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Security: Generate signing key pair for scan reports
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

// Store keys securely (in production, use proper key management)
const SIGNING_KEYS = { publicKey, privateKey };

function createWindow() {
  const preloadPath = path.join(__dirname, "preload.js");
  console.log('Preload path:', preloadPath);
  console.log('Preload file exists:', fs.existsSync(preloadPath));
  
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: false,
    },
  });

  // Set Content Security Policy
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ['default-src \'self\' \'unsafe-inline\' data: blob:;']
      }
    });
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  win.webContents.on('dom-ready', () => {
    console.log('DOM is ready');
  });

  win.on('closed', () => {
    app.quit();
  });
}

// DRIVE SCANNING FUNCTIONS (READ-ONLY)
// =====================================

/**
 * Get mounted drives and partitions with encryption status
 * Safe operation that only reads filesystem information
 */
ipcMain.handle('get-drives', async () => {
  try {
    const platform = os.platform();
    const drives = [];

    if (platform === 'win32') {
      // Windows: Check drive letters A-Z (READ-ONLY)
      for (let i = 65; i <= 90; i++) {
        const drive = String.fromCharCode(i) + ':';
        try {
          const stats = await fs.promises.stat(drive + path.sep);
          if (stats.isDirectory()) {
            const space = await getDriveSpace(drive + path.sep);
            const driveInfo = await getWindowsDriveInfo(drive);
            drives.push({
              name: drive,
              path: drive + path.sep,
              type: 'drive',
              ...space,
              ...driveInfo
            });
          }
        } catch (error) {
          // Drive doesn't exist or is not accessible
        }
      }
    } else {
      // Unix-like systems: Read /proc/mounts (Linux) or use df command (READ-ONLY)
      if (platform === 'linux') {
        try {
          const mounts = await fs.promises.readFile('/proc/mounts', 'utf8');
          const lines = mounts.split('\n');
          
          for (const line of lines) {
            const parts = line.split(' ');
            if (parts.length >= 2) {
              const device = parts[0];
              const mountPoint = parts[1];
              
              // Filter for actual drives (not virtual filesystems)
              if (device.startsWith('/dev/') && !device.includes('loop')) {
                try {
                  const space = await getDriveSpace(mountPoint);
                  const encryptionInfo = await getLinuxEncryptionInfo(device);
                  drives.push({
                    name: path.basename(device),
                    path: mountPoint,
                    device: device,
                    type: 'mount',
                    ...space,
                    ...encryptionInfo
                  });
                } catch (error) {
                  // Skip if can't access
                }
              }
            }
          }
        } catch (error) {
          // Fallback: just show root
          const space = await getDriveSpace('/');
          drives.push({
            name: 'Root',
            path: '/',
            type: 'mount',
            ...space
          });
        }
      } else {
        // macOS: Check FileVault status (READ-ONLY)
        const space = await getDriveSpace('/');
        const macInfo = await getMacEncryptionInfo();
        drives.push({
          name: 'Macintosh HD',
          path: '/',
          type: 'mount',
          ...space,
          ...macInfo
        });
      }
    }

    return drives;
  } catch (error) {
    console.error('Error getting drives:', error);
    return [];
  }
});

async function getDriveSpace(drivePath) {
  try {
    const stats = await fs.promises.statfs(drivePath);
    const total = stats.blocks * stats.bsize;
    const free = stats.bavail * stats.bsize;
    const used = total - free;
    
    return {
      total: total,
      free: free,
      used: used,
      totalGB: (total / (1024 ** 3)).toFixed(2),
      freeGB: (free / (1024 ** 3)).toFixed(2),
      usedGB: (used / (1024 ** 3)).toFixed(2),
      usagePercent: ((used / total) * 100).toFixed(1)
    };
  } catch (error) {
    return {
      total: 0, free: 0, used: 0,
      totalGB: '0', freeGB: '0', usedGB: '0', usagePercent: '0'
    };
  }
}

async function getWindowsDriveInfo(drive) {
  return new Promise((resolve) => {
    // Check BitLocker status using PowerShell (READ-ONLY query)
    const psCommand = `Get-BitLockerVolume -MountPoint "${drive}" | Select-Object MountPoint,EncryptionPercentage,LockStatus,ProtectionStatus | ConvertTo-Json`;
    
    exec(`powershell -Command "${psCommand}"`, (error, stdout) => {
      let bitLockerInfo = { encrypted: false, encryptionStatus: 'Unknown' };
      
      if (!error && stdout) {
        try {
          const data = JSON.parse(stdout);
          bitLockerInfo = {
            encrypted: data.ProtectionStatus === 'On',
            encryptionStatus: data.ProtectionStatus || 'Unknown',
            encryptionPercent: data.EncryptionPercentage || 0,
            lockStatus: data.LockStatus || 'Unknown'
          };
        } catch (e) {
          // Ignore parsing errors
        }
      }
      
      resolve(bitLockerInfo);
    });
  });
}

async function getLinuxEncryptionInfo(device) {
  return new Promise((resolve) => {
    exec(`lsblk -f ${device}`, (error, stdout) => {
      let encryptionInfo = { encrypted: false, encryptionStatus: 'Unknown' };
      
      if (!error && stdout.includes('crypto_LUKS')) {
        encryptionInfo = {
          encrypted: true,
          encryptionStatus: 'LUKS',
          encryptionType: 'LUKS'
        };
      }
      
      resolve(encryptionInfo);
    });
  });
}

async function getMacEncryptionInfo() {
  return new Promise((resolve) => {
    exec('fdesetup status', (error, stdout) => {
      let encryptionInfo = { encrypted: false, encryptionStatus: 'Unknown' };
      
      if (!error) {
        encryptionInfo = {
          encrypted: stdout.includes('FileVault is On'),
          encryptionStatus: stdout.includes('FileVault is On') ? 'FileVault' : 'Off',
          encryptionType: 'FileVault'
        };
      }
      
      resolve(encryptionInfo);
    });
  });
}

// HIDDEN FILE SCANNING (READ-ONLY, Limited to 200 files)
// =======================================================

ipcMain.handle('scan-hidden-files', async (event, targetPath) => {
  try {
    const platform = os.platform();
    const hiddenFiles = [];
    const maxFiles = 200; // Performance limit
    
    const scanPath = targetPath || os.homedir();
    console.log(`Starting hidden files scan in: ${scanPath} (Platform: ${platform})`);
    
    if (platform === 'win32') {
      console.log('Using Windows hidden files scanner');
      await scanWindowsHiddenFiles(scanPath, hiddenFiles, maxFiles);
    } else {
      console.log('Using Unix hidden files scanner');
      await scanUnixHiddenFiles(scanPath, hiddenFiles, maxFiles);
    }
    
    console.log(`Scan completed. Found ${hiddenFiles.length} hidden files`);
    hiddenFiles.sort((a, b) => b.size - a.size);
    
    return {
      files: hiddenFiles.slice(0, maxFiles),
      totalScanned: hiddenFiles.length,
      scanPath: scanPath,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Error in hidden files scan handler:', error);
    return {
      files: [],
      totalScanned: 0,
      error: `Scan failed: ${error.message}`,
      scanPath: targetPath || os.homedir(),
      timestamp: new Date().toISOString()
    };
  }
});

async function scanWindowsHiddenFiles(scanPath, hiddenFiles, maxFiles) {
  console.log(`Starting Windows hidden files scan in: ${scanPath}`);
  
  // Try multiple approaches for finding hidden files on Windows
  await Promise.all([
    scanWindowsWithCMD(scanPath, hiddenFiles, maxFiles),
    scanWindowsWithPowerShell(scanPath, hiddenFiles, maxFiles),
    scanWindowsWithNodeJS(scanPath, hiddenFiles, maxFiles),
    scanCommonHiddenLocations(scanPath, hiddenFiles, maxFiles)
  ]);
  
  console.log(`Windows scan completed. Found ${hiddenFiles.length} files total`);
}

async function scanWindowsWithCMD(scanPath, hiddenFiles, maxFiles) {
  return new Promise((resolve) => {
    console.log('Executing CMD dir command for hidden files...');
    
    // Use CMD dir command with /A:H to find hidden files
    const cmdCommand = `dir "${scanPath}" /A:H /B /S`;
    
    exec(cmdCommand, { 
      maxBuffer: 1024 * 1024,
      timeout: 10000 
    }, async (error, stdout, stderr) => {
      if (error) {
        console.log('CMD error (normal if no hidden files):', error.message);
      }
      
      if (stdout && stdout.trim()) {
        const lines = stdout.trim().split('\n');
        let count = 0;
        
        for (const line of lines) {
          if (hiddenFiles.length >= maxFiles || count >= Math.floor(maxFiles/4)) break;
          
          const filePath = line.trim();
          if (filePath && filePath.length > 0) {
            try {
              const stats = await fs.promises.stat(filePath);
              const fileName = path.basename(filePath);
              
              hiddenFiles.push({
                path: filePath,
                name: fileName,
                size: stats.isFile() ? stats.size : 0,
                lastModified: stats.mtime.toISOString(),
                attributes: 'Hidden',
                type: 'hidden',
                platform: 'windows',
                isDirectory: stats.isDirectory()
              });
              count++;
            } catch (statError) {
              // Skip files we can't stat
            }
          }
        }
        console.log(`CMD scan found ${count} hidden files`);
      } else {
        console.log('CMD scan: No hidden files found or no output');
      }
      resolve();
    });
  });
}

async function scanWindowsWithPowerShell(scanPath, hiddenFiles, maxFiles) {
  return new Promise((resolve) => {
    // Simpler PowerShell command that's more likely to work
    const psCommand = `Get-ChildItem -Path "${scanPath}" -Force -File -ErrorAction SilentlyContinue | Where-Object { $_.Attributes -match "Hidden" -or $_.Name.StartsWith('.') } | Select-Object -First ${Math.floor(maxFiles/3)} FullName, Length, LastWriteTime, Attributes, Name | ConvertTo-Json`;
    
    console.log('Executing PowerShell command for hidden files...');
    exec(`powershell -ExecutionPolicy Bypass -Command "${psCommand}"`, { 
      maxBuffer: 1024 * 1024,
      timeout: 15000 
    }, (error, stdout, stderr) => {
      if (error) {
        console.log('PowerShell error (trying alternative):', error.message);
      }
      
      if (stdout && stdout.trim() && stdout.trim() !== 'null') {
        try {
          let files = JSON.parse(stdout.trim());
          if (!Array.isArray(files)) {
            files = files ? [files] : [];
          }
          
          files.forEach(file => {
            if (file && file.FullName && hiddenFiles.length < maxFiles) {
              hiddenFiles.push({
                path: file.FullName,
                name: file.Name,
                size: parseInt(file.Length) || 0,
                lastModified: file.LastWriteTime || new Date().toISOString(),
                attributes: file.Attributes || 'Hidden',
                type: file.Name.startsWith('.') ? 'dotfile' : 'hidden',
                platform: 'windows'
              });
            }
          });
          console.log(`PowerShell found ${files.length} hidden files`);
        } catch (parseError) {
          console.log('PowerShell JSON parse error:', parseError.message);
        }
      }
      resolve();
    });
  });
}

async function scanWindowsWithNodeJS(scanPath, hiddenFiles, maxFiles) {
  console.log('Scanning with Node.js fs module...');
  
  try {
    const entries = await fs.promises.readdir(scanPath, { withFileTypes: true });
    let count = 0;
    
    for (const entry of entries) {
      if (hiddenFiles.length >= maxFiles || count >= Math.floor(maxFiles/3)) break;
      
      // Look for dotfiles (Unix-style hidden files on Windows)
      if (entry.name.startsWith('.') && entry.name !== '.' && entry.name !== '..') {
        const fullPath = path.join(scanPath, entry.name);
        
        try {
          const stats = await fs.promises.stat(fullPath);
          hiddenFiles.push({
            path: fullPath,
            name: entry.name,
            size: entry.isFile() ? stats.size : 0,
            lastModified: stats.mtime.toISOString(),
            attributes: 'Dotfile',
            type: 'dotfile',
            platform: 'windows'
          });
          count++;
        } catch (statError) {
          // Skip files we can't access
        }
      }
    }
    console.log(`Node.js scan found ${count} dotfiles`);
  } catch (error) {
    console.log('Node.js scan error:', error.message);
  }
}

async function scanCommonHiddenLocations(scanPath, hiddenFiles, maxFiles) {
  console.log('Scanning common hidden file locations...');
  
  // Common Windows hidden files and directories to check
  const commonHidden = [
    'desktop.ini',
    'thumbs.db',
    'Thumbs.db',
    '$RECYCLE.BIN',
    'System Volume Information',
    'hiberfil.sys',
    'pagefile.sys',
    'swapfile.sys',
    '.DS_Store',
    '.git',
    '.svn',
    '.vscode',
    'node_modules'
  ];
  
  let count = 0;
  
  for (const hiddenName of commonHidden) {
    if (hiddenFiles.length >= maxFiles || count >= Math.floor(maxFiles/3)) break;
    
    const hiddenPath = path.join(scanPath, hiddenName);
    
    try {
      await fs.promises.access(hiddenPath);
      const stats = await fs.promises.stat(hiddenPath);
      
      hiddenFiles.push({
        path: hiddenPath,
        name: hiddenName,
        size: stats.isFile() ? stats.size : 0,
        lastModified: stats.mtime.toISOString(),
        attributes: 'SystemHidden',
        type: stats.isDirectory() ? 'hidden-directory' : 'system-hidden',
        platform: 'windows',
        isDirectory: stats.isDirectory()
      });
      count++;
    } catch (accessError) {
      // File/directory doesn't exist or can't access
    }
  }
  
  console.log(`Common locations scan found ${count} hidden items`);
}

async function scanUnixHiddenFiles(scanPath, hiddenFiles, maxFiles) {
  console.log(`Scanning Unix hidden files in: ${scanPath}`);
  
  async function scanDirectory(dirPath, currentCount, depth = 0) {
    if (currentCount >= maxFiles || depth > 3) return currentCount; // Limit recursion depth
    
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (currentCount >= maxFiles) break;
        
        // Check if it's a hidden file/directory (starts with .)
        if (entry.name.startsWith('.') && entry.name !== '.' && entry.name !== '..') {
          const fullPath = path.join(dirPath, entry.name);
          
          try {
            const stats = await fs.promises.stat(fullPath);
            
            hiddenFiles.push({
              path: fullPath,
              name: entry.name,
              size: entry.isFile() ? stats.size : 0,
              lastModified: stats.mtime.toISOString(),
              isDirectory: stats.isDirectory(),
              type: 'dotfile',
              platform: 'unix'
            });
            
            currentCount++;
            
            // If it's a directory, scan it recursively (but limit depth)
            if (entry.isDirectory() && depth < 2) {
              currentCount = await scanDirectory(fullPath, currentCount, depth + 1);
            }
          } catch (statError) {
            console.error(`Error stating file ${fullPath}:`, statError.message);
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dirPath}:`, error.message);
    }
    
    return currentCount;
  }
  
  try {
    let fileCount = await scanDirectory(scanPath, 0);
    
    // Also check some common hidden directories in home directory
    if (scanPath === os.homedir()) {
      const commonHiddenDirs = ['.config', '.ssh', '.local', '.cache', '.mozilla', '.chrome'];
      
      for (const dirName of commonHiddenDirs) {
        if (fileCount >= maxFiles) break;
        
        const hiddenDir = path.join(scanPath, dirName);
        
        try {
          await fs.promises.access(hiddenDir);
          fileCount = await scanDirectory(hiddenDir, fileCount, 0);
        } catch (accessError) {
          // Directory doesn't exist or can't access
        }
      }
    }
    
    console.log(`Found ${fileCount} hidden files in Unix scan`);
  } catch (error) {
    console.error('Error in Unix hidden files scan:', error);
  }
}

// SAFE FILE PREVIEW (READ-ONLY, 2KB limit)
ipcMain.handle('preview-file', async (event, filePath) => {
  try {
    const maxBytes = 2048; // 2KB limit for safety
    const buffer = Buffer.alloc(maxBytes);
    
    const fd = await fs.promises.open(filePath, 'r');
    const { bytesRead } = await fs.promises.read(fd, buffer, 0, maxBytes, 0);
    await fd.close();
    
    const content = buffer.subarray(0, bytesRead).toString('utf8');
    const isBinary = /[\x00-\x08\x0E-\x1F\x7F]/.test(content);
    
    return {
      content: isBinary ? '[Binary file - cannot preview]' : content,
      bytesRead,
      isBinary,
      filePath
    };
    
  } catch (error) {
    return {
      content: `[Error reading file: ${error.message}]`,
      bytesRead: 0,
      isBinary: false,
      filePath,
      error: error.message
    };
  }
});

// BROWSER PROFILE DETECTION (READ-ONLY)
// =====================================

ipcMain.handle('scan-browser-profiles', async () => {
  try {
    const platform = os.platform();
    const profiles = [];
    
    const chromeProfiles = await scanChromeProfiles(platform);
    profiles.push(...chromeProfiles);
    
    const firefoxProfiles = await scanFirefoxProfiles(platform);
    profiles.push(...firefoxProfiles);
    
    return {
      profiles,
      totalFound: profiles.length,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Error scanning browser profiles:', error);
    return {
      profiles: [],
      totalFound: 0,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
});

async function scanChromeProfiles(platform) {
  const profiles = [];
  const chromePaths = getChromeProfilePaths(platform);
  
  for (const chromePath of chromePaths) {
    try {
      if (!await fs.promises.access(chromePath).then(() => true).catch(() => false)) {
        continue;
      }
      
      const entries = await fs.promises.readdir(chromePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && (entry.name.startsWith('Profile') || entry.name === 'Default')) {
          const profilePath = path.join(chromePath, entry.name);
          const profileData = await analyzeBrowserProfile(profilePath, 'chrome', entry.name);
          
          if (profileData.files.length > 0) {
            profiles.push(profileData);
          }
        }
      }
      
    } catch (error) {
      console.log(`Cannot access Chrome path: ${chromePath}`);
    }
  }
  
  return profiles;
}

async function scanFirefoxProfiles(platform) {
  const profiles = [];
  const firefoxPaths = getFirefoxProfilePaths(platform);
  
  for (const firefoxPath of firefoxPaths) {
    try {
      if (!await fs.promises.access(firefoxPath).then(() => true).catch(() => false)) {
        continue;
      }
      
      const entries = await fs.promises.readdir(firefoxPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.includes('.')) {
          const profilePath = path.join(firefoxPath, entry.name);
          const profileData = await analyzeBrowserProfile(profilePath, 'firefox', entry.name);
          
          if (profileData.files.length > 0) {
            profiles.push(profileData);
          }
        }
      }
      
    } catch (error) {
      console.log(`Cannot access Firefox path: ${firefoxPath}`);
    }
  }
  
  return profiles;
}

function getChromeProfilePaths(platform) {
  const homeDir = os.homedir();
  
  switch (platform) {
    case 'win32':
      return [
        path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data'),
        path.join(homeDir, 'AppData', 'Local', 'Chromium', 'User Data')
      ];
    case 'darwin':
      return [
        path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome'),
        path.join(homeDir, 'Library', 'Application Support', 'Chromium')
      ];
    case 'linux':
      return [
        path.join(homeDir, '.config', 'google-chrome'),
        path.join(homeDir, '.config', 'chromium')
      ];
    default:
      return [];
  }
}

function getFirefoxProfilePaths(platform) {
  const homeDir = os.homedir();
  
  switch (platform) {
    case 'win32':
      return [
        path.join(homeDir, 'AppData', 'Roaming', 'Mozilla', 'Firefox', 'Profiles')
      ];
    case 'darwin':
      return [
        path.join(homeDir, 'Library', 'Application Support', 'Firefox', 'Profiles')
      ];
    case 'linux':
      return [
        path.join(homeDir, '.mozilla', 'firefox')
      ];
    default:
      return [];
  }
}

async function analyzeBrowserProfile(profilePath, browser, profileName) {
  const profileData = {
    browser,
    profileName,
    profilePath,
    files: []
  };
  
  const importantFiles = browser === 'chrome' ? 
    ['Login Data', 'Cookies', 'History', 'Bookmarks', 'Preferences'] :
    ['logins.json', 'cookies.sqlite', 'places.sqlite', 'key4.db', 'prefs.js'];
  
  for (const fileName of importantFiles) {
    const filePath = path.join(profilePath, fileName);
    
    try {
      const stats = await fs.promises.stat(filePath);
      
      profileData.files.push({
        name: fileName,
        path: filePath,
        size: stats.size,
        lastModified: stats.mtime,
        type: getFileType(fileName)
      });
      
    } catch (error) {
      // File doesn't exist or can't access
    }
  }
  
  return profileData;
}

function getFileType(fileName) {
  const types = {
    'Login Data': 'Saved Passwords',
    'Cookies': 'Browser Cookies',
    'History': 'Browsing History',
    'Bookmarks': 'Bookmarks',
    'Preferences': 'Browser Settings',
    'logins.json': 'Firefox Passwords',
    'cookies.sqlite': 'Firefox Cookies',
    'places.sqlite': 'Firefox History',
    'key4.db': 'Firefox Master Key',
    'prefs.js': 'Firefox Preferences'
  };
  
  return types[fileName] || 'Browser Data';
}

// RECOVERABILITY SCORING (READ-ONLY)
// ==================================

ipcMain.handle('compute-recoverability-score', async () => {
  try {
    const platform = os.platform();
    const factors = {};
    let score = 0;
    
    factors.swapFile = await checkSwapFile(platform);
    if (factors.swapFile.present) score += 20;
    
    factors.snapshots = await checkSnapshots(platform);
    if (factors.snapshots.present) score += 25;
    
    factors.encryption = await checkDiskEncryption();
    if (factors.encryption.enabled) score -= 30;
    
    factors.freeSpace = await analyzeFreeSpace();
    if (factors.freeSpace.percentage > 20) score += 15;
    
    score = Math.max(0, Math.min(100, score + 50));
    
    return {
      score,
      factors,
      risk: score > 70 ? 'HIGH' : score > 40 ? 'MEDIUM' : 'LOW',
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Error computing recoverability score:', error);
    return {
      score: 0,
      factors: {},
      risk: 'UNKNOWN',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
});

async function checkSwapFile(platform) {
  switch (platform) {
    case 'win32':
      try {
        await fs.promises.access('C:\\pagefile.sys');
        return { present: true, type: 'pagefile.sys', location: 'C:\\' };
      } catch {
        return { present: false, type: 'pagefile.sys' };
      }
      
    case 'linux':
      try {
        const swaps = await fs.promises.readFile('/proc/swaps', 'utf8');
        const swapLines = swaps.split('\n').filter(line => line.includes('/'));
        return {
          present: swapLines.length > 0,
          type: 'swap partition/file',
          details: swapLines
        };
      } catch {
        return { present: false, type: 'swap' };
      }
      
    case 'darwin':
      return new Promise((resolve) => {
        exec('sysctl vm.swapusage', (error, stdout) => {
          resolve({
            present: !error && stdout.includes('used'),
            type: 'virtual memory',
            details: stdout
          });
        });
      });
      
    default:
      return { present: false, type: 'unknown' };
  }
}

async function checkSnapshots(platform) {
  switch (platform) {
    case 'win32':
      return new Promise((resolve) => {
        exec('vssadmin list shadows', (error, stdout) => {
          resolve({
            present: !error && stdout.includes('Shadow Copy'),
            type: 'Volume Shadow Copy',
            count: (stdout.match(/Shadow Copy/g) || []).length
          });
        });
      });
      
    case 'linux':
      return new Promise((resolve) => {
        exec('lvs --noheadings -o lv_name,lv_attr | grep "s"', (lError, lStdout) => {
          const hasLVMSnapshots = !lError && lStdout.trim().length > 0;
          
          exec('btrfs subvolume list / 2>/dev/null', (bError, bStdout) => {
            const hasBTRFSSnapshots = !bError && bStdout.includes('subvolume');
            
            resolve({
              present: hasLVMSnapshots || hasBTRFSSnapshots,
              type: hasLVMSnapshots ? 'LVM Snapshots' : 'BTRFS Subvolumes'
            });
          });
        });
      });
      
    case 'darwin':
      return new Promise((resolve) => {
        exec('tmutil listlocalsnapshots /', (error, stdout) => {
          resolve({
            present: !error && stdout.trim().length > 0,
            type: 'Time Machine',
            count: (stdout.match(/com\.apple\.TimeMachine/g) || []).length
          });
        });
      });
      
    default:
      return { present: false, type: 'unknown' };
  }
}

async function checkDiskEncryption() {
  const drives = await ipcMain.handlersMap.get('get-drives').fn();
  const encryptedDrives = drives.filter(d => d.encrypted);
  
  return {
    enabled: encryptedDrives.length > 0,
    drives: encryptedDrives,
    coverage: drives.length > 0 ? (encryptedDrives.length / drives.length) * 100 : 0
  };
}

async function analyzeFreeSpace() {
  try {
    const drives = await ipcMain.handlersMap.get('get-drives').fn();
    let totalSpace = 0;
    let freeSpace = 0;
    
    for (const drive of drives) {
      totalSpace += drive.total || 0;
      freeSpace += drive.free || 0;
    }
    
    const percentage = totalSpace > 0 ? (freeSpace / totalSpace) * 100 : 0;
    
    return {
      totalSpace,
      freeSpace,
      percentage: Math.round(percentage),
      totalGB: (totalSpace / (1024 ** 3)).toFixed(2),
      freeGB: (freeSpace / (1024 ** 3)).toFixed(2)
    };
    
  } catch (error) {
    return {
      totalSpace: 0, freeSpace: 0, percentage: 0,
      totalGB: '0', freeGB: '0'
    };
  }
}

// WINDOWS EVENT LOG SCANNING (READ-ONLY)
// ======================================

ipcMain.handle('scan-event-logs', async () => {
  try {
    console.log('Starting Windows Event Log scan...');
    const platform = os.platform();
    
    if (platform !== 'win32') {
      return {
        logs: [],
        totalEntries: 0,
        error: 'Event log scanning is only available on Windows',
        timestamp: new Date().toISOString()
      };
    }
    
    const eventLogs = await scanWindowsEventLogs();
    
    return {
      logs: eventLogs.logs,
      totalEntries: eventLogs.totalEntries,
      logSources: eventLogs.logSources,
      scanSummary: eventLogs.scanSummary,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Error scanning event logs:', error);
    return {
      logs: [],
      totalEntries: 0,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
});

async function scanWindowsEventLogs() {
  const results = {
    logs: [],
    totalEntries: 0,
    logSources: [],
    scanSummary: {}
  };
  
  try {
    // Get list of available event logs
    console.log('[Event Logs] Getting available log sources...');
    const logSources = await getEventLogSources();
    results.logSources = logSources;
    
    // Scan critical logs for privacy-relevant entries
    const criticalLogs = ['System', 'Security', 'Application', 'Setup'];
    
    for (const logName of criticalLogs) {
      if (logSources.includes(logName)) {
        console.log(`[Event Logs] Scanning ${logName} log...`);
        const logEntries = await scanEventLog(logName);
        results.logs.push(...logEntries);
        results.scanSummary[logName] = logEntries.length;
      }
    }
    
    // Also scan Windows PowerShell logs if available
    if (logSources.includes('Windows PowerShell')) {
      console.log('[Event Logs] Scanning PowerShell logs...');
      const psEntries = await scanEventLog('Windows PowerShell');
      results.logs.push(...psEntries);
      results.scanSummary['Windows PowerShell'] = psEntries.length;
    }
    
    results.totalEntries = results.logs.length;
    console.log(`[Event Logs] Total entries found: ${results.totalEntries}`);
    
    return results;
    
  } catch (error) {
    console.error('[Event Logs] Error:', error);
    throw error;
  }
}

async function getEventLogSources() {
  return new Promise((resolve) => {
    const cmd = 'wevtutil el';
    
    exec(cmd, { encoding: 'utf8', timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('[Event Logs] Error getting log sources:', error.message);
        resolve(['System', 'Security', 'Application']); // Default logs
        return;
      }
      
      if (stderr) {
        console.warn('[Event Logs] Warning:', stderr);
      }
      
      const sources = stdout.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .slice(0, 50); // Limit to prevent overwhelming
      
      console.log(`[Event Logs] Found ${sources.length} log sources`);
      resolve(sources);
    });
  });
}

async function scanEventLog(logName) {
  return new Promise((resolve) => {
    console.log(`[Event Logs] Scanning ${logName}...`);
    
    // Use wevtutil to query recent events (last 100 entries for performance)
    // Focus on privacy-relevant event IDs
    const privacyEventIds = [
      '4624', '4625', // Logon success/failure
      '4648', // Logon with explicit credentials
      '4720', '4726', // User account created/deleted
      '4798', '4799', // User's local group membership enumerated
      '1074', // System shutdown initiated
      '6005', '6006', // Event log service started/stopped
      '104', // Log cleared
    ];
    
    const eventFilter = privacyEventIds.map(id => `EventID=${id}`).join(' or ');
    const cmd = `wevtutil qe "${logName}" /c:100 /rd:true /f:text /q:"*[System[(${eventFilter})]]"`;
    
    exec(cmd, { 
      encoding: 'utf8', 
      timeout: 45000,
      maxBuffer: 1024 * 1024 * 5 // 5MB buffer
    }, (error, stdout, stderr) => {
      const entries = [];
      
      if (error) {
        console.error(`[Event Logs] Error scanning ${logName}:`, error.message);
        resolve(entries);
        return;
      }
      
      if (stderr && !stdout) {
        console.warn(`[Event Logs] Warning for ${logName}:`, stderr);
        resolve(entries);
        return;
      }
      
      if (stdout) {
        try {
          const events = parseEventLogOutput(stdout, logName);
          entries.push(...events);
          console.log(`[Event Logs] Found ${entries.length} relevant entries in ${logName}`);
        } catch (parseError) {
          console.error(`[Event Logs] Error parsing ${logName}:`, parseError.message);
        }
      }
      
      resolve(entries);
    });
  });
}

function parseEventLogOutput(output, logSource) {
  const entries = [];
  const events = output.split('Event[').filter(event => event.trim());
  
  for (const eventText of events.slice(0, 20)) { // Limit to 20 events per log
    try {
      const entry = parseEventEntry(eventText, logSource);
      if (entry) {
        entries.push(entry);
      }
    } catch (error) {
      // Skip malformed entries
    }
  }
  
  return entries;
}

function parseEventEntry(eventText, logSource) {
  const lines = eventText.split('\n').map(line => line.trim());
  
  let eventId = null;
  let timeCreated = null;
  let level = null;
  let description = '';
  
  for (const line of lines) {
    if (line.includes('EventID')) {
      const match = line.match(/(\d+)/);
      if (match) eventId = match[1];
    } else if (line.includes('TimeCreated')) {
      const match = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z?/);
      if (match) timeCreated = match[0];
    } else if (line.includes('Level')) {
      const match = line.match(/(\d+)/);
      if (match) {
        const levelNum = parseInt(match[1]);
        level = levelNum === 1 ? 'Critical' : 
               levelNum === 2 ? 'Error' : 
               levelNum === 3 ? 'Warning' : 
               levelNum === 4 ? 'Information' : 'Unknown';
      }
    } else if (line.length > 10 && !line.includes('System') && !line.includes('Provider')) {
      if (description.length < 200) { // Limit description length
        description += line + ' ';
      }
    }
  }
  
  if (eventId && timeCreated) {
    return {
      eventId,
      timeCreated,
      level: level || 'Information',
      logSource,
      description: description.trim().substring(0, 200),
      privacyRisk: assessPrivacyRisk(eventId, description)
    };
  }
  
  return null;
}

function assessPrivacyRisk(eventId, description) {
  const highRiskEvents = ['4624', '4625', '4648', '4720', '4726', '104'];
  const mediumRiskEvents = ['4798', '4799', '1074', '6005', '6006'];
  
  if (highRiskEvents.includes(eventId)) {
    return 'High';
  } else if (mediumRiskEvents.includes(eventId)) {
    return 'Medium';
  } else {
    return 'Low';
  }
}

// PDF REPORT GENERATION WITH DIGITAL SIGNATURE
// ============================================

ipcMain.handle('generate-scan-report', async (event, scanData) => {
  try {
    const reportId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    
    const reportData = {
      reportId,
      timestamp,
      version: '1.0',
      ...scanData
    };
    
    const signature = crypto.sign('sha256', Buffer.from(JSON.stringify(reportData)), SIGNING_KEYS.privateKey);
    const signedReport = {
      ...reportData,
      signature: signature.toString('base64'),
      publicKey: SIGNING_KEYS.publicKey
    };
    
    const qrCodeData = await QRCode.toDataURL(`VERIFY:${reportId}:${signature.toString('base64').substring(0, 32)}`);
    const pdfBuffer = await generatePDFReport(signedReport, qrCodeData);
    
    const reportsDir = path.join(os.homedir(), 'PrivacyScanner-Reports');
    await fs.promises.mkdir(reportsDir, { recursive: true });
    
    const pdfPath = path.join(reportsDir, `scan-report-${reportId}.pdf`);
    const jsonPath = path.join(reportsDir, `scan-report-${reportId}.json`);
    
    await fs.promises.writeFile(pdfPath, pdfBuffer);
    await fs.promises.writeFile(jsonPath, JSON.stringify(signedReport, null, 2));
    
    return {
      success: true,
      reportId,
      pdfPath,
      jsonPath,
      signature: signature.toString('base64')
    };
    
  } catch (error) {
    console.error('Error generating scan report:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

async function generatePDFReport(reportData, qrCodeData) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    
    // PDF Header
    doc.fontSize(20).text('Privacy & Security Scan Report', { align: 'center' });
    doc.moveDown();
    
    // Report metadata
    doc.fontSize(12);
    doc.text(`Report ID: ${reportData.reportId}`);
    doc.text(`Generated: ${new Date(reportData.timestamp).toLocaleString()}`);
    doc.text(`Version: ${reportData.version}`);
    doc.moveDown();
    
    // Drive Information
    if (reportData.drives?.length > 0) {
      doc.fontSize(16).text('Drive Analysis', { underline: true });
      doc.fontSize(10);
      
      reportData.drives.forEach(drive => {
        doc.text(`${drive.name} (${drive.totalGB} GB) - ${drive.usagePercent}% used`);
        if (drive.encrypted) {
          doc.text(`  ✓ Encrypted (${drive.encryptionStatus})`);
        } else {
          doc.text(`  ✗ Not encrypted`);
        }
      });
      doc.moveDown();
    }
    
    // Hidden Files Summary
    if (reportData.hiddenFiles) {
      doc.fontSize(16).text('Hidden Files Analysis', { underline: true });
      doc.fontSize(10);
      doc.text(`Total files scanned: ${reportData.hiddenFiles.totalScanned}`);
      doc.text(`Largest files found: ${Math.min(5, reportData.hiddenFiles.files?.length || 0)}`);
      
      const topFiles = reportData.hiddenFiles.files?.slice(0, 5) || [];
      topFiles.forEach(file => {
        doc.text(`  ${path.basename(file.path)} - ${(file.size / 1024).toFixed(1)} KB`);
      });
      doc.moveDown();
    }
    
    // Browser Profiles
    if (reportData.browserProfiles?.profiles?.length > 0) {
      doc.fontSize(16).text('Browser Profiles Found', { underline: true });
      doc.fontSize(10);
      
      reportData.browserProfiles.profiles.forEach(profile => {
        doc.text(`${profile.browser.toUpperCase()}: ${profile.profileName}`);
        doc.text(`  Files: ${profile.files.length} profile files detected`);
      });
      doc.moveDown();
    }
    
    // Event Logs Analysis
    if (reportData.eventLogs?.logs?.length > 0) {
      doc.fontSize(16).text('Windows Event Log Analysis', { underline: true });
      doc.fontSize(10);
      doc.text(`Total log entries analyzed: ${reportData.eventLogs.totalEntries}`);
      doc.text(`Log sources scanned: ${reportData.eventLogs.logSources.join(', ')}`);
      
      const highRiskEvents = reportData.eventLogs.logs.filter(log => log.privacyRisk === 'High');
      if (highRiskEvents.length > 0) {
        doc.text(`High-risk privacy events: ${highRiskEvents.length}`);
        doc.moveDown(0.5);
        doc.text('Recent high-risk events:');
        highRiskEvents.slice(0, 3).forEach(event => {
          doc.text(`  Event ${event.eventId} (${event.logSource}): ${event.description.substring(0, 60)}...`);
        });
      }
      doc.moveDown();
    }
    
    // Recoverability Score
    if (reportData.recoverabilityScore) {
      doc.fontSize(16).text('Recoverability Assessment', { underline: true });
      doc.fontSize(14);
      const riskColor = reportData.recoverabilityScore.risk === 'HIGH' ? 'red' : 
                       reportData.recoverabilityScore.risk === 'MEDIUM' ? 'orange' : 'green';
      doc.fillColor(riskColor).text(`Risk Level: ${reportData.recoverabilityScore.risk}`);
      doc.fillColor('black');
      doc.fontSize(10);
      doc.text(`Score: ${reportData.recoverabilityScore.score}/100`);
      
      const factors = reportData.recoverabilityScore.factors;
      if (factors.swapFile?.present) doc.text('✓ Swap/Page file detected');
      if (factors.snapshots?.present) doc.text('✓ System snapshots found');
      if (factors.encryption?.enabled) doc.text('✓ Disk encryption enabled');
      doc.moveDown();
    }
    
    // QR Code for verification
    if (qrCodeData) {
      doc.fontSize(12).text('Verification QR Code:', { underline: true });
      doc.image(qrCodeData, { width: 100, height: 100 });
      doc.moveDown();
    }
    
    // Signature info
    doc.fontSize(8);
    doc.text('This report is digitally signed for authenticity verification.');
    doc.text(`Signature: ${reportData.signature?.substring(0, 64)}...`);
    
    doc.end();
  });
}

// REPORT VERIFICATION
ipcMain.handle('verify-report', async (event, reportPath) => {
  try {
    const reportContent = await fs.promises.readFile(reportPath, 'utf8');
    const reportData = JSON.parse(reportContent);
    
    if (!reportData.signature || !reportData.publicKey) {
      return { valid: false, error: 'Report missing signature or public key' };
    }
    
    const { signature, publicKey, ...dataToVerify } = reportData;
    
    const isValid = crypto.verify(
      'sha256',
      Buffer.from(JSON.stringify(dataToVerify)),
      publicKey,
      Buffer.from(signature, 'base64')
    );
    
    return {
      valid: isValid,
      reportId: reportData.reportId,
      timestamp: reportData.timestamp,
      publicKeyMatch: publicKey === SIGNING_KEYS.publicKey
    };
    
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
});

// SECURE WIPE SIMULATION (SAFE - No actual wiping)
ipcMain.handle('simulate-secure-wipe', async (event, options) => {
  return new Promise((resolve) => {
    const steps = [
      'Initializing secure wipe protocol...',
      'Analyzing target drive structure...',
      'Preparing DoD 5220.22-M standard wipe...',
      'Pass 1/3: Writing zeros to all sectors...',
      'Pass 2/3: Writing random data...',
      'Pass 3/3: Final verification pass...',
      'Updating drive metadata...',
      'Secure wipe simulation completed!'
    ];
    
    let currentStep = 0;
    const totalSteps = steps.length;
    
    const interval = setInterval(() => {
      currentStep++;
      const progress = (currentStep / totalSteps) * 100;
      
      event.sender.send('wipe-progress', {
        step: currentStep,
        totalSteps,
        progress: Math.round(progress),
        message: steps[currentStep - 1] || 'Completed',
        completed: currentStep >= totalSteps
      });
      
      if (currentStep >= totalSteps) {
        clearInterval(interval);
        resolve({
          success: true,
          message: 'Secure wipe simulation completed successfully',
          duration: totalSteps * 1000
        });
      }
    }, 1000);
  });
});

// DEMO DATA GENERATION
ipcMain.handle('generate-demo-data', async () => {
  return {
    drives: [
      {
        name: 'C:',
        path: 'C:\\',
        type: 'drive',
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
          path: 'C:\\Users\\Demo\\AppData\\Local\\Microsoft\\Windows\\UsrClass.dat',
          size: 2097152,
          lastModified: new Date().toISOString(),
          type: 'registry'
        },
        {
          path: 'C:\\Users\\Demo\\NTUSER.DAT',
          size: 8388608,
          lastModified: new Date().toISOString(),
          type: 'registry'
        },
        {
          path: 'C:\\Users\\Demo\\AppData\\Local\\Temp\\.tmp_cache',
          size: 524288,
          lastModified: new Date().toISOString(),
          type: 'cache'
        },
        {
          path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\desktop.ini',
          size: 282,
          lastModified: new Date().toISOString(),
          type: 'system'
        },
        {
          path: 'C:\\Windows\\System32\\config\\SAM',
          size: 65536,
          lastModified: new Date().toISOString(),
          type: 'system'
        },
        {
          path: 'C:\\Users\\Demo\\.gitconfig',
          size: 420,
          lastModified: new Date().toISOString(),
          type: 'config'
        },
        {
          path: 'C:\\Users\\Demo\\.ssh\\known_hosts',
          size: 1024,
          lastModified: new Date().toISOString(),
          type: 'ssh'
        }
      ],
      totalScanned: 143,
      scanPath: 'C:\\Users\\Demo'
    },
    browserProfiles: {
      profiles: [
        {
          browser: 'chrome',
          profileName: 'Default',
          files: [
            { name: 'Login Data', size: 32768, type: 'Saved Passwords' }
          ]
        }
      ],
      totalFound: 1
    },
    eventLogs: {
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
        },
        {
          eventId: '104',
          timeCreated: new Date().toISOString(),
          level: 'Information',
          logSource: 'System',
          description: 'The Application log file was cleared.',
          privacyRisk: 'High'
        }
      ],
      totalEntries: 3,
      logSources: ['System', 'Security', 'Application'],
      scanSummary: { Security: 2, System: 1 },
      timestamp: new Date().toISOString()
    },
    recoverabilityScore: {
      score: 75,
      risk: 'HIGH',
      factors: {
        swapFile: { present: true, type: 'pagefile.sys' },
        snapshots: { present: true, type: 'Volume Shadow Copy' },
        encryption: { enabled: true, coverage: 50 }
      }
    }
  };
});

// APP LIFECYCLE
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ERROR HANDLING
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
