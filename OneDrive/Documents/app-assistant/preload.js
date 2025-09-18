const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Database operations
  getPatients: () => ipcRenderer.invoke('database:get-patients'),
  getAllPatients: () => ipcRenderer.invoke('database:get-all-patients'),
  getTodayPatients: () => ipcRenderer.invoke('database:get-today-patients'),
  getPatient: (patientId) => ipcRenderer.invoke('database:get-patient', patientId),
  addPatient: (patientData) => ipcRenderer.invoke('database:add-patient', patientData),
  updatePatient: (patientData) => ipcRenderer.invoke('database:update-patient', patientData),
  deletePatient: (patientId) => ipcRenderer.invoke('database:delete-patient', patientId),
  updatePatientStatus: (patientId, status) => ipcRenderer.invoke('database:update-patient-status', { patientId, status }),
  getAppointments: () => ipcRenderer.invoke('database:get-appointments'),
  addAppointment: (appointmentData) => ipcRenderer.invoke('database:add-appointment', appointmentData),
  updateAppointment: (appointmentData) => ipcRenderer.invoke('database:update-appointment', appointmentData),
  deleteAppointment: (appointmentId) => ipcRenderer.invoke('database:delete-appointment', appointmentId),
  
  // File operations
  selectFiles: () => ipcRenderer.invoke('file:select-files'),
  savePatientFiles: (patientId, filePaths) => ipcRenderer.invoke('file:save-patient-files', { patientId, filePaths }),
  getPatientFiles: (patientId) => ipcRenderer.invoke('file:get-patient-files', patientId),
  deletePatientFile: (patientId, fileName) => ipcRenderer.invoke('file:delete-patient-file', { patientId, fileName }),
  openFile: (filePath) => ipcRenderer.invoke('file:open-file', filePath),
  downloadFile: (filePath) => ipcRenderer.invoke('file:download-file', filePath),
  
  // Communication
  // sendToDoctor: (patientId) => ipcRenderer.invoke('communication:send-to-doctor', patientId), // REMOVE
  pingDoctor: (ip) => ipcRenderer.invoke('communication:ping-doctor', ip),
  sendFile: (args) => ipcRenderer.invoke('communication:send-file', args),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get-config'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update-config', settings),
  
  // Backup
  selectBackupDrive: () => ipcRenderer.invoke('backup:select-drive'),
  createBackup: (backupPath) => ipcRenderer.invoke('backup:create-backup', backupPath),
  backupPatient: (patient) => ipcRenderer.invoke('backup:backup-patient', patient),
  updatePatientBackup: (patient) => ipcRenderer.invoke('backup:update-patient-backup', patient),
  getBackupFiles: () => ipcRenderer.invoke('backup:get-backup-files'),
  restorePatient: (backupFilePath) => ipcRenderer.invoke('backup:restore-patient', backupFilePath),
  restoreAllPatients: () => ipcRenderer.invoke('backup:restore-all-patients'),
  validateBackupPath: () => ipcRenderer.invoke('backup:validate-path'),
  getBackupPathStatus: () => ipcRenderer.invoke('backup:get-path-status'),
  
  // Network communication
  networkConnect: (ip) => ipcRenderer.invoke('network-connect', ip),
  networkDisconnect: () => ipcRenderer.invoke('network-disconnect'),
  sendPatientData: (data) => ipcRenderer.invoke('send-patient-data', data),
  sendChatMessage: (message) => ipcRenderer.invoke('send-chat-message', message),
  // Push updates to doctor dashboard/waiting list
  sendWaitingPatients: () => ipcRenderer.invoke('send-waiting-patients'),
  sendDashboardStatus: () => ipcRenderer.invoke('send-dashboard-status'),
  
  // Event listeners
  onNewMessage: (callback) => {
    ipcRenderer.on('communication:new-message', (event, message) => callback(message));
  },
  onAppointmentNotification: (callback) => {
    ipcRenderer.on('communication:appointment-notification', (event, data) => callback(data));
  },
  onBookAppointmentRequest: (callback) => {
    ipcRenderer.on('communication:book-appointment-request', (event, data) => callback(data));
  },
  onFileReceived: (callback) => {
    ipcRenderer.on('file-received', (event, data) => callback(data));
  },
  onNetworkStatus: (callback) => ipcRenderer.on('network-status', (event, status) => callback(status)),
  onAppointmentNeeded: (callback) => ipcRenderer.on('appointment-needed', (event, data) => callback(data)),
  onChatMessage: (callback) => ipcRenderer.on('chat-message', (event, data) => callback(data)),
  onNetworkStatusDebug: (callback) => ipcRenderer.on('network-status-debug', (event, debugMsg) => callback(debugMsg)),
  onDoctorPresence: (callback) => ipcRenderer.on('doctor-presence', (event, data) => {
    console.log('[PRELOAD] doctor-presence event:', data);
    callback(data);
    }),

  // Connection status listener
  onConnectionStatus: (callback) => ipcRenderer.on('connection-status', (event, status) => {
    console.log('[PRELOAD] connection-status event:', status);
    callback(status);
  }),

  // Listen for connection success popup event
  onConnectionSuccessPopup: (callback) => ipcRenderer.on('show-connection-success-popup', () => callback()),
  
  // Get current connection status
  getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),
  
  // Expose test IPC
  testIpc: () => ipcRenderer.invoke('test-ipc'),
  
  // Remove event listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
  saveCredentials: (creds) => ipcRenderer.invoke('save-credentials', creds),
  verifyCredentials: (creds) => ipcRenderer.invoke('verify-credentials', creds),
  credentialsExist: () => ipcRenderer.invoke('credentials-exist'),
  isFirstTimeSetup: () => ipcRenderer.invoke('is-first-time-setup'),
  
  // Google Drive authentication
  googleDriveAuth: (credentials) => ipcRenderer.invoke('google-drive-auth', credentials),
  // Securely fetch Google OAuth config from main process (reads from env/.env)
  getGoogleDriveConfig: () => ipcRenderer.invoke('google-drive:get-config'),

  // Licensing
  getLicenseStatus: () => ipcRenderer.invoke('license:get-status'),
  activateLicense: (key) => ipcRenderer.invoke('license:activate', key),
  getHardwareId: () => ipcRenderer.invoke('license:get-hwid'),
});