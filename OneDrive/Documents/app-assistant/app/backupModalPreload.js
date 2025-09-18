const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('modalAPI', {
  // Backup modal
  chooseBackupPath: (path) => ipcRenderer.send('backup-modal:choose', path),
  cancelBackup: () => ipcRenderer.send('backup-modal:cancel'),

  // Google connect modal
  proceedGoogleConnect: () => ipcRenderer.send('google-connect:proceed'),
  cancelGoogleConnect: () => ipcRenderer.send('google-connect:cancel'),

  // Telemetry: log email only once (appends to developer Google Sheet on first call per email)
  logBackupEmailOnce: (email, source = 'drive-backup', extra = {}) =>
    ipcRenderer.invoke('telemetry:log-backup-email-once', { email, source, extra })
});
