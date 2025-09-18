const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bootstrapper', {
  pickInstallDir: () => ipcRenderer.invoke('pick-install-dir'),
  openEula: () => ipcRenderer.invoke('open-eula'),
  startInstall: (opts) => ipcRenderer.invoke('start-install', opts),
  openFolder: (dir) => ipcRenderer.invoke('open-folder', dir),
  getDefaultInstallDir: () => ipcRenderer.invoke('get-default-install-dir'),
  getLogPath: () => ipcRenderer.invoke('get-log-path'),
  openLog: () => ipcRenderer.invoke('open-log'),
  getResourceUrl: (relPath) => ipcRenderer.invoke('get-resource-url', relPath),
});
