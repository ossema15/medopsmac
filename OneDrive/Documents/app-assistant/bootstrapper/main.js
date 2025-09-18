const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1060,
    height: 680,
    resizable: false,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  
  // Provide a hidden application menu so default shortcuts (e.g. Ctrl+Shift+I) work
  // Keep the menu bar hidden from view
  try {
    const template = [
      { role: 'fileMenu' },
      { role: 'viewMenu' },
      { role: 'help', submenu: [] }
    ];
    const appMenu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(appMenu);
  } catch {}
  try { mainWindow.setMenuBarVisibility(false); } catch {}
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// Simple file logger
const logDir = app.getPath('userData');
const logPath = path.join(logDir, 'bootstrapper-install.log');
function appendLog(line) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`);
  } catch (_) {}
}

function getDefaultInstallDir() {
  // electron-builder NSIS (perMachine=false) default is per-user:
  // %LOCALAPPDATA%\Programs\<ProductName>
  const local = process.env['LOCALAPPDATA'];
  if (local) {
    return path.join(local, 'Programs', 'MedOps');
  }
  // Fallback to Program Files
  const pf = process.env['ProgramFiles'] || 'C\\Program Files';
  return path.join(pf, 'MedOps');
}

async function findBundledInstaller() {
  // In packaged app, resources live at process.resourcesPath
  // ExtraResources copied installer(s) into resources/installer
  const installerRoot = path.join(process.resourcesPath || path.dirname(process.execPath), 'installer');
  try {
    const files = fs.readdirSync(installerRoot);
    const candidates = files.filter(f => /MedOps-.*-Setup\.exe$/i.test(f) || /MedOps Setup .*\.exe$/i.test(f));
    if (candidates.length === 0) return null;

    const arch = process.arch === 'ia32' ? 'ia32' : 'x64';
    const scored = candidates.map(name => {
      const full = path.join(installerRoot, name);
      let mtime = 0;
      try { mtime = fs.statSync(full).mtimeMs || 0; } catch {}
      const matchesArch = (arch === 'x64' && /-x64-Setup\.exe$/i.test(name)) || (arch === 'ia32' && /-ia32-Setup\.exe$/i.test(name));
      return { name, full, mtime, matchesArch };
    });

    // Sort by: matchesArch desc, then newest first
    scored.sort((a, b) => {
      if (a.matchesArch !== b.matchesArch) return a.matchesArch ? -1 : 1;
      return b.mtime - a.mtime;
    });

    return scored[0].full;
  } catch (_) {
    return null;
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers used by renderer
ipcMain.handle('get-resource-url', async (_evt, relPath) => {
  try {
    const base = process.resourcesPath || path.dirname(process.execPath);
    const abs = path.join(base, relPath || '');
    return pathToFileURL(abs).toString();
  } catch (e) {
    appendLog(`get-resource-url exception: ${e?.stack || e}`);
    return '';
  }
});

ipcMain.handle('pick-install-dir', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Choisir le dossier d\'installation',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths?.[0]) return '';
  return res.filePaths[0];
});

ipcMain.handle('open-eula', async () => {
  const eulaPath = path.join(process.resourcesPath || path.dirname(process.execPath), 'eula', 'Contrat.rtf');
  try {
    const r = await shell.openPath(eulaPath);
    if (r) appendLog(`open-eula error: ${r}`);
    return true;
  } catch (e) {
    appendLog(`open-eula exception: ${e?.stack || e}`);
    return false;
  }
});

ipcMain.handle('get-default-install-dir', async () => {
  return getDefaultInstallDir();
});

ipcMain.handle('get-log-path', async () => {
  return logPath;
});

ipcMain.handle('open-log', async () => {
  try {
    const r = await shell.openPath(logPath);
    if (r) appendLog(`open-log error: ${r}`);
    return true;
  } catch (e) {
    appendLog(`open-log exception: ${e?.stack || e}`);
    return false;
  }
});

ipcMain.handle('open-folder', async (_evt, dir) => {
  if (!dir) return false;
  try {
    await shell.openPath(dir);
    return true;
  } catch (e) {
    appendLog(`open-folder exception: ${e?.stack || e}`);
    return false;
  }
});

ipcMain.handle('start-install', async (_evt, opts = {}) => {
  const chosenDir = (opts.installDir || '').trim();
  const installDir = chosenDir || getDefaultInstallDir();
  const autoLaunch = opts.autoLaunch !== false; // default: true
  const installer = await findBundledInstaller();

  appendLog(`start-install: installer=${installer || 'not-found'} targetDir=${installDir}`);

  if (!installer || !fs.existsSync(installer)) {
    const msg = 'Programme d\'installation introuvable.';
    appendLog(msg);
    return { ok: false, error: msg, logPath };
  }

  // NSIS silent install with custom dir: /S and /D=dir (no quotes per NSIS convention)
  const args = [];
  // Force silent so the NSIS UI doesn't appear; our bootstrapper shows progress
  args.push('/S');
  // /D= must be the last argument and must not be quoted even if it contains spaces
  if (installDir) args.push(`/D=${installDir}`);

  return new Promise((resolve) => {
    try {
      const child = spawn(installer, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', (d) => appendLog(String(d)));
      child.stderr.on('data', (d) => appendLog(String(d)));
      child.on('error', (e) => {
        appendLog(`spawn error: ${e?.stack || e}`);
      });
      child.on('exit', (code) => {
        appendLog(`installer exited with code ${code}`);
        if (code === 0) {
          if (!autoLaunch) {
            appendLog('autoLaunch disabled by user; not launching MedOps.');
            return resolve({ ok: true, code, launched: false, logPath });
          }
          // Try launching the installed app automatically
          try {
            const exePath = path.join(installDir, 'MedOps.exe');
            if (fs.existsSync(exePath)) {
              const launched = spawn(exePath, [], { detached: true, stdio: 'ignore' });
              launched.unref?.();
              appendLog(`Launched MedOps: ${exePath}`);
              return resolve({ ok: true, code, launched: true, logPath });
            } else {
              appendLog(`Installed EXE not found at ${exePath}`);
              return resolve({ ok: true, code, launched: false, logPath });
            }
          } catch (e) {
            appendLog(`auto-launch exception: ${e?.stack || e}`);
            return resolve({ ok: true, code, launched: false, logPath });
          }
        }
        resolve({ ok: false, code, logPath });
      });
    } catch (e) {
      const msg = `Échec du lancement de l'installateur: ${e?.message || e}`;
      appendLog(msg);
      resolve({ ok: false, error: msg, logPath });
    }
  });
})
;
