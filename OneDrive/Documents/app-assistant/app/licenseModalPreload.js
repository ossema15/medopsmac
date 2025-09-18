const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('license', {
  getStatus: () => ipcRenderer.invoke('license:get-status'),
  activate: (key) => ipcRenderer.invoke('license:activate', key),
  getHwid: () => ipcRenderer.invoke('license:get-hwid'),
  activated: () => ipcRenderer.send('license-modal:activated'),
  close: () => ipcRenderer.send('license-modal:close'),
});
