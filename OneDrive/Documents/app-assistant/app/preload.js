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
  renamePatientId: (oldId, newId, updateFields = {}) => ipcRenderer.invoke('database:rename-patient-id', { oldId, newId, updateFields }),
  deletePatient: (patientId) => ipcRenderer.invoke('database:delete-patient', patientId),
  updatePatientStatus: (patientId, status) => ipcRenderer.invoke('database:update-patient-status', { patientId, status }),
  getAppointments: () => ipcRenderer.invoke('database:get-appointments'),
  addAppointment: (appointmentData) => ipcRenderer.invoke('database:add-appointment', appointmentData),
  deleteAppointment: (appointmentId) => ipcRenderer.invoke('database:delete-appointment', appointmentId),
  updateAppointment: (appointmentData) => ipcRenderer.invoke('database:update-appointment', appointmentData),
  // Composite appointment helpers
  getAppointmentByComposite: (patient_id, appointment_date, appointment_time) =>
    ipcRenderer.invoke('database:get-appointment-by-composite', { patient_id, appointment_date, appointment_time }),
  upsertAppointmentByComposite: (appointmentData) =>
    ipcRenderer.invoke('database:upsert-appointment-by-composite', appointmentData),

  // First-time patient detection
  addFirstTimePatient: (firstTimePatient) => ipcRenderer.invoke('database:add-first-time-patient', firstTimePatient),
  getFirstTimePatients: (status) => ipcRenderer.invoke('database:get-first-time-patients', status),
  updateFirstTimePatientStatus: (id, status, processedBy, notes) => ipcRenderer.invoke('database:update-first-time-patient-status', { id, status, processedBy, notes }),
  deleteFirstTimePatient: (id) => ipcRenderer.invoke('database:delete-first-time-patient', id),
  isFirstTimePatientDetected: (appointmentId) => ipcRenderer.invoke('database:is-first-time-patient-detected', appointmentId),
  getFirstTimePatientStats: () => ipcRenderer.invoke('database:get-first-time-patient-stats'),
  
  // File operations
  selectFiles: () => ipcRenderer.invoke('file:select-files'),
  savePatientFiles: (patientId, filePaths) => ipcRenderer.invoke('file:save-patient-files', { patientId, filePaths }),
  openFile: (filePath) => ipcRenderer.invoke('file:open-file', filePath),
  downloadFile: (filePath) => ipcRenderer.invoke('file:download-file', filePath),
  getPatientFiles: (patientId) => ipcRenderer.invoke('file:get-patient-files', patientId),
  deletePatientFile: (patientId, fileName) => ipcRenderer.invoke('file:delete-patient-file', { patientId, fileName }),
  deletePatientDirectory: (patientId) => ipcRenderer.invoke('file:delete-patient-directory', patientId),
  
  // Communication
  // sendToDoctor: (patientId) => ipcRenderer.invoke('communication:send-to-doctor', patientId), // REMOVE
  pingDoctor: (ip) => ipcRenderer.invoke('communication:ping-doctor', ip),
  sendFile: (args) => ipcRenderer.invoke('communication:send-file', args),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get-config'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update-config', settings),
  
  // Backup
  selectBackupDrive: () => ipcRenderer.invoke('backup:select-drive'),
  createBackup: (backupFolder) => ipcRenderer.invoke('backup:create-backup', backupFolder),
  backupPatient: (patient, backupFolder) => ipcRenderer.invoke('backup:backup-patient', patient, backupFolder),
  getBackupFiles: () => ipcRenderer.invoke('backup:get-backup-files'),
  restorePatient: (backupFilePath) => ipcRenderer.invoke('backup:restore-patient', backupFilePath),
  restoreAllPatients: () => ipcRenderer.invoke('backup:restore-all-patients'),
  validateBackupPath: () => ipcRenderer.invoke('backup:validate-path'),
  getBackupPathStatus: () => ipcRenderer.invoke('backup:get-path-status'),
  
  // Event listeners
  onNewMessage: (callback) => {
    ipcRenderer.on('communication:new-message', (event, message) => callback(message));
  },
  onAppointmentNotification: (callback) => {
    ipcRenderer.on('communication:appointment-notification', (event, data) => callback(data));
  },
  onFileReceived: (callback) => {
    ipcRenderer.on('file-received', (event, data) => callback(data));
  },
  onDoctorPresence: (callback) => ipcRenderer.on('doctor-presence', (event, data) => {
    console.log('[PRELOAD] doctor-presence event:', data);
    callback(data);
  }),
  
  // Remove event listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // Network communication
  networkConnect: (params) => ipcRenderer.invoke('network-connect', params),
  networkDisconnect: () => ipcRenderer.invoke('network-disconnect'),
  sendPatientData: (data) => ipcRenderer.invoke('send-patient-data', data),
  sendChatMessage: (message) => ipcRenderer.invoke('send-chat-message', message),
  sendFrontendReady: () => ipcRenderer.invoke('frontend-ready'),
  sendDoctorLoggedIn: () => ipcRenderer.invoke('doctor-logged-in'),
  getClientId: () => {
    let id = localStorage.getItem('assistantClientId');
    if (!id) {
      id = Math.random().toString(36).substr(2, 9);
      localStorage.setItem('assistantClientId', id);
    }
    return id;
  },
  getMachineId: () => {
    let id = localStorage.getItem('assistantMachineId');
    if (!id) {
      id = 'machine_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('assistantMachineId', id);
    }
    return id;
  },
  onNetworkStatus: (callback) => ipcRenderer.on('network-status', (event, status) => callback(status)),
  onAppointmentNeeded: (callback) => ipcRenderer.on('appointment-needed', (event, data) => callback(data)),
  onChatMessage: (callback) => ipcRenderer.on('chat-message', (event, data) => callback(data)),
  onNetworkStatusDebug: (callback) => ipcRenderer.on('network-status-debug', (event, debugMsg) => callback(debugMsg)),
  secureLogin: (credentials) => ipcRenderer.invoke('secure-login', credentials),
  getUserInfo: () => ipcRenderer.invoke('user:get-info'),
  setUserInfo: (userInfo) => ipcRenderer.invoke('user:set-info', userInfo),
  addRecentPatient: (patient) => ipcRenderer.invoke('database:add-recent-patient', patient),
  getRecentPatients: () => ipcRenderer.invoke('database:get-recent-patients'),
  verifyCredentials: (creds) => ipcRenderer.invoke('verify-credentials', creds),
  saveCredentials: (creds) => ipcRenderer.invoke('save-credentials', creds),
  credentialsExist: () => ipcRenderer.invoke('credentials-exist'),
  isFirstTimeSetup: () => ipcRenderer.invoke('is-first-time-setup'),
  useRecoveryCode: (code) => ipcRenderer.invoke('credentials:use-recovery-code', code),
  
  // Focus management
  blurAndFocusWindow: () => ipcRenderer.invoke('blur-and-focus-window'),
  
  // System status
  onSystemStatus: (callback) => ipcRenderer.on('system-status', (event, data) => callback(data)),
  // Connection status listener
  onConnectionStatus: (callback) => ipcRenderer.on('connection-status', (event, status) => {
    callback(status);
  }),
  
  // Connection loss listener
  onConnectionLost: (callback) => ipcRenderer.on('connection-lost', (event) => {
    callback();
  }),
  
  // Remove connection lost listener
  removeConnectionLostListener: (callback) => {
    ipcRenderer.removeListener('connection-lost', callback);
  },
  
  // Google Drive authentication
  googleDriveAuth: (credentials) => ipcRenderer.invoke('google-drive-auth', credentials),
  // Securely fetch Google OAuth config from main process (reads from env/.env)
  getGoogleDriveConfig: () => ipcRenderer.invoke('google-drive:get-config'),
  
  // Auto-backup functionality
  getAllPatients: () => ipcRenderer.invoke('getAllPatients'),
  getAppointments: () => ipcRenderer.invoke('getAppointments'),
  getSettings: () => ipcRenderer.invoke('getSettings'),
  
  // Licensing
  getLicenseStatus: () => ipcRenderer.invoke('license:get-status'),
  activateLicense: (key) => ipcRenderer.invoke('license:activate', key),
  resetTrial: () => ipcRenderer.invoke('license:reset-trial'),
  // Dev testing helpers
  setTrialStart: (opts) => ipcRenderer.invoke('license:set-trial-start', opts),
  setSim: (flags) => ipcRenderer.invoke('license:set-sim', flags),
  getHardwareId: () => ipcRenderer.invoke('license:get-hwid'),
  
  // Dashboard status
  sendDashboardStatus: () => ipcRenderer.invoke('send-dashboard-status'),
  testDashboardStatus: () => ipcRenderer.invoke('test-dashboard-status'),
  // Waiting patients updates
  sendWaitingPatients: () => ipcRenderer.invoke('send-waiting-patients'),
  
  // Get current connection status
  getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),
  
  testIpc: (params) => ipcRenderer.invoke('test-ipc', params),
  // System info
  getSystemMachineUUID: () => ipcRenderer.invoke('system:get-machine-uuid'),
  getSystemMacAddress: () => ipcRenderer.invoke('system:get-mac-address'),

  // Bug reporting
  sendBugReport: ({ message }) => ipcRenderer.invoke('bug-report:send', { message }),

  // Telemetry: one-time email logging to developer Google Sheet
  logBackupEmailOnce: (email, source = 'drive-backup', extra = {}) =>
    ipcRenderer.invoke('telemetry:log-backup-email-once', { email, source, extra }),
  isFirstTimeSetup: () => ipcRenderer.invoke('is-first-time-setup'),
  useRecoveryCode: (code) => ipcRenderer.invoke('credentials:use-recovery-code', code),
});