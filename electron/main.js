import { app, BrowserWindow, ipcMain } from "electron";
import path  from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const preloadPath = path.join(__dirname, "preload.js");
  console.log('Preload path:', preloadPath);
  console.log('Preload file exists:', fs.existsSync(preloadPath));
  
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
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
    // Dev: load from Vite dev server
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools(); // Open dev tools in development
  } else {
    // Prod: load built index.html
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Add debugging for when the page is ready
  win.webContents.on('dom-ready', () => {
    console.log('DOM is ready');
  });

  win.webContents.on('did-finish-load', () => {
    console.log('Page finished loading');
  });

  // Handle window closed
  win.on('closed', () => {
    app.quit();
  });
}

// IPC handler for getting drives
ipcMain.handle('get-drives', async () => {
  try {
    const platform = os.platform();
    const drives = [];

    if (platform === 'win32') {
      // Windows: Check drive letters A-Z
      for (let i = 65; i <= 90; i++) {
        const drive = String.fromCharCode(i) + ':';
        try {
          const stats = await fs.promises.stat(drive + path.sep);
          if (stats.isDirectory()) {
            const space = await getDriveSpace(drive + path.sep);
            drives.push({
              name: drive,
              path: drive + path.sep,
              type: 'drive',
              ...space
            });
          }
        } catch (error) {
          // Drive doesn't exist or is not accessible
        }
      }
    } else {
      // Unix-like systems: Read /proc/mounts (Linux) or use df command
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
              if (device.startsWith('/dev/') && !device.includes('loop') && mountPoint !== '/') {
                try {
                  const space = await getDriveSpace(mountPoint);
                  drives.push({
                    name: path.basename(device),
                    path: mountPoint,
                    device: device,
                    type: 'mount',
                    ...space
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
        // macOS and other Unix systems
        const space = await getDriveSpace('/');
        drives.push({
          name: 'Root',
          path: '/',
          type: 'mount',
          ...space
        });
      }
    }

    return drives;
  } catch (error) {
    console.error('Error getting drives:', error);
    return [];
  }
});

// Helper function to get drive space
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
      total: 0,
      free: 0,
      used: 0,
      totalGB: '0',
      freeGB: '0',
      usedGB: '0',
      usagePercent: '0'
    };
  }
}

app.whenReady().then(createWindow);

// Quit when all windows are closed
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
