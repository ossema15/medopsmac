const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const os = require('os');
const DatabaseManager = require(path.join(__dirname, 'database', 'database'));
const FileManager = require(path.join(__dirname, 'utils', 'fileManager'));
const { encrypt, decrypt } = require(path.join(__dirname, 'utils', 'encryption'));
const { exec } = require('child_process');
const networkManager = require(path.join(__dirname, '..', 'main', 'networkManager'));
const CommunicationManager = require(path.join(__dirname, 'communication', 'communicationManager'));
const noble = require('@abandonware/noble');

// Global error handlers to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
  console.error('Promise:', promise);
  
  // Log additional details for debugging
  if (reason instanceof Error) {
    console.error('Error stack:', reason.stack);
  }
  
  // Don't crash the app for unhandled rejections
  // Just log them and continue
  console.log('Continuing execution despite unhandled rejection...');
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  console.error('Error stack:', err.stack);
  
  // Don't crash the app for uncaught exceptions
  // Just log them and continue
  console.log('Continuing execution despite uncaught exception...');
});

let mainWindow;
let database;
let fileManager;
let communicationManager;

// Resolve persistent storage under Electron's userData directory
// e.g. C:\\Users\\<User>\\AppData\\Roaming\\<AppName>\\Data
const userDataPath = app.getPath('userData');
const dataPath = path.join(userDataPath, 'Data');
const patientFilesPath = path.join(dataPath, 'PatientFiles');
const dbFilePath = path.join(dataPath, 'medops.db');

function createDirectories() {
  try {
    // Create data directory structure under userData
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
      console.log('Created data directory:', dataPath);
    }
    
    // Create patient files directory
    if (!fs.existsSync(patientFilesPath)) {
      fs.mkdirSync(patientFilesPath, { recursive: true });
      console.log('Created patient files directory:', patientFilesPath);
    }
    
    console.log('All directories created successfully');
  } catch (error) {
    console.error('Error creating directories:', error);
    throw error;
  }
}

// Migrate legacy data from C:\\MedOps if present (one-time copy, non-destructive)
function migrateLegacyData() {
  try {
    const legacyRoot = 'C:\\MedOps';
    const legacyData = path.join(legacyRoot, 'Data');
    const legacyDb = path.join(legacyData, 'medops.db');
    const legacyPatientFiles = path.join(legacyData, 'PatientFiles');

    // Migrate DB file if exists and target DB missing
    if (fs.existsSync(legacyDb)) {
      if (!fs.existsSync(dbFilePath)) {
        try {
          fs.copyFileSync(legacyDb, dbFilePath);
          console.log(`[MIGRATION] Copied legacy DB to userData: ${legacyDb} -> ${dbFilePath}`);
        } catch (e) {
          console.warn('[MIGRATION] Failed copying legacy DB:', e.message);
        }
      } else {
        console.log('[MIGRATION] DB already exists at target, skipping DB copy');
      }
    }

    // Migrate PatientFiles (merge copy)
    if (fs.existsSync(legacyPatientFiles)) {
      try {
        // Ensure target exists
        if (!fs.existsSync(patientFilesPath)) fs.mkdirSync(patientFilesPath, { recursive: true });
        const items = fs.readdirSync(legacyPatientFiles);
        for (const item of items) {
          const src = path.join(legacyPatientFiles, item);
          const dest = path.join(patientFilesPath, item);
          const stat = fs.statSync(src);
          if (stat.isDirectory()) {
            copyDirRecursive(src, dest);
          } else {
            if (!fs.existsSync(dest)) {
              fs.copyFileSync(src, dest);
            }
          }
        }
        console.log(`[MIGRATION] Merged legacy PatientFiles into: ${patientFilesPath}`);
      } catch (e) {
        console.warn('[MIGRATION] Failed copying legacy PatientFiles:', e.message);
      }
    }
  } catch (err) {
    console.warn('[MIGRATION] Unexpected error:', err.message);
  }
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src);
  for (const entry of entries) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    const st = fs.statSync(s);
    if (st.isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      if (!fs.existsSync(d)) fs.copyFileSync(s, d);
    }
  }
}

// Append a row to developer Google Sheet about backup enable event
async function appendBackupEnableEventToSheet({ email, source = 'drive-backup', extra = {} }) {
  const {
    GOOGLE_SHEETS_SPREADSHEET_ID,
    GOOGLE_SHEETS_SHEET_NAME = 'Sheet1',
    GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, '..', 'medops-467602-d4086c7d736a.json')
  } = process.env;

  if (!GOOGLE_SHEETS_SPREADSHEET_ID) {
    throw new Error('Missing GOOGLE_SHEETS_SPREADSHEET_ID env');
  }

  const credPath = path.isAbsolute(GOOGLE_APPLICATION_CREDENTIALS)
    ? GOOGLE_APPLICATION_CREDENTIALS
    : path.resolve(process.cwd(), GOOGLE_APPLICATION_CREDENTIALS);

  if (!fs.existsSync(credPath)) {
    throw new Error(`Service account JSON not found at ${credPath}`);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const timestamp = new Date().toISOString();
  let appVersion = 'unknown';
  let appName = 'app-assistant';
  try {
    const pkg = require(path.resolve(process.cwd(), 'package.json'));
    appVersion = pkg.version || 'unknown';
    appName = pkg.name || appName;
  } catch {}

  // Columns: Timestamp | App Name | App Version | Email | Source | Extra(JSON)
  const row = [timestamp, appName, appVersion, email || '', source, JSON.stringify(extra || {})];

  // Quote sheet/tab name to support spaces/special chars
  const safeSheetName = `'${(GOOGLE_SHEETS_SHEET_NAME || 'Sheet1').replace(/'/g, "''")}'`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID,
    range: `${safeSheetName}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '..', 'public', 'medops.png'),
    title: 'MedOps',
    show: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    focusable: true
  });
  // Remove default application menu and hide menubar
  try { Menu.setApplicationMenu(null); } catch {}
  try { mainWindow.removeMenu?.(); } catch {}
  // (system:get-machine-uuid handler registered in registerIPCHandlers)

  // Store reference globally for communication manager
  global.mainWindow = mainWindow;

  // Initialize networkManager IPC bridge
  networkManager.setupIPC(mainWindow);

  mainWindow.loadFile(path.join(__dirname, 'app', 'public', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show');
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    console.log('Window closed');
    mainWindow = null;
    global.mainWindow = null;
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Window failed to load:', errorCode, errorDescription);
    dialog.showErrorBox('Loading Error', `Failed to load application: ${errorDescription}`);
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`Renderer Console [${level}]:`, message);
  });
}

// Initialize application
async function initializeApp() {
  try {
    console.log('Starting application initialization...');
    createDirectories();
    console.log('Directories created successfully');
    console.log('userData path:', userDataPath);
    console.log('DB path:', dbFilePath);
    console.log('Patient files path:', patientFilesPath);
    
    // One-time migration from legacy C:\\MedOps location if applicable
    migrateLegacyData();
    
    // Initialize database
    console.log('Initializing database...');
    database = new DatabaseManager(dbFilePath);
    await database.initialize();
    console.log('Database initialized successfully');

    // Clear old messages on startup
    await database.clearOldMessages();
    console.log('Old messages cleared from database');
    
    // Set up a timer to clear old messages at midnight every day
    function scheduleMidnightCleanup() {
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
      const msUntilMidnight = nextMidnight - now;
      setTimeout(async () => {
        await database.clearOldMessages();
        console.log('Old messages cleared at midnight');
        scheduleMidnightCleanup();
      }, msUntilMidnight);
    }
    scheduleMidnightCleanup();
    
    // Initialize file manager
    console.log('Initializing file manager...');
    fileManager = new FileManager(patientFilesPath);
    console.log('File manager initialized successfully');
    
    // Initialize communication manager
    console.log('Initializing communication manager...');
      communicationManager = new CommunicationManager(database, fileManager);
  await communicationManager.initialize();
  
  // Make communication manager available globally for network manager
  global.communicationManager = communicationManager;
  console.log('🔧 [MAIN] Communication manager set globally:', !!global.communicationManager);
    console.log('Communication manager initialized successfully');
    
    console.log('MedOps initialized successfully');
  } catch (error) {
    console.error('Failed to initialize application:', error);
    console.error('Error stack:', error.stack);
    
    // Show a more detailed error dialog
    const errorMessage = `Initialization Error: ${error.message}\n\nStack: ${error.stack}`;
    dialog.showErrorBox('Initialization Error', errorMessage);
  }
}

// Function to register all IPC handlers
function registerIPCHandlers() {
  console.log('Registering IPC handlers...');
  
  ipcMain.handle('database:get-patients', async () => {
    try {
      console.log('Handling database:get-patients request...');
      if (!database) {
        throw new Error('Database not initialized');
      }
      const patients = await database.getAllPatients();
      console.log(`Retrieved ${patients.length} patients`);
      return patients;
    } catch (error) {
      console.error('Error getting patients:', error);
      console.error('Error stack:', error.stack);
      throw error;
    }
  });

  ipcMain.handle('database:get-all-patients', async () => {
    try {
      console.log('Handling database:get-all-patients request...');
      if (!database) {
        throw new Error('Database not initialized');
      }
      const patients = await database.getAllPatients();
      console.log(`Retrieved ${patients.length} all patients`);
      return patients;
    } catch (error) {
      console.error('Error getting all patients:', error);
      console.error('Error stack:', error.stack);
      throw error;
    }
  });

  ipcMain.handle('database:get-patient', async (event, patientId) => {
    try {
      console.log('Handling database:get-patient request for ID:', patientId);
      if (!database) {
        throw new Error('Database not initialized');
      }
      const patient = await database.getPatient(patientId);
      console.log(`Retrieved patient:`, patient ? patient.id : 'not found');
      return patient;
    } catch (error) {
      console.error('Error getting patient:', error);
      console.error('Error stack:', error.stack);
      throw error;
    }
  });

ipcMain.handle('database:get-today-patients', async () => {
  try {
    console.log('Handling database:get-today-patients request...');
    if (!database) {
      throw new Error('Database not initialized');
    }
    const patients = await database.getTodayPatients();
    console.log(`Retrieved ${patients.length} todays patients`);
    return patients;
  } catch (error) {
    console.error('Error getting today\'s patients:', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
});

  // System: get primary MAC address
  ipcMain.handle('system:get-mac-address', async () => {
    try {
      const ifaces = os.networkInterfaces();
      let mac = null;
      for (const [name, addrs] of Object.entries(ifaces)) {
        if (!Array.isArray(addrs)) continue;
        for (const info of addrs) {
          // Skip internal, loopback, and invalid MACs
          if (info.internal) continue;
          const m = (info.mac || '').toLowerCase();
          if (!m || m === '00:00:00:00:00:00') continue;
          mac = m;
          break;
        }
        if (mac) break;
      }
      if (!mac) {
        return { success: false, error: 'MAC address not found' };
      }
      return { success: true, mac };
    } catch (e) {
      console.error('[MAIN] Failed to get MAC address:', e);
      return { success: false, error: e.message };
    }
  });

ipcMain.handle('database:add-patient', async (event, patientData) => {
  try {
    // Generate patient ID: name + year of birth (case-insensitive)
    const year = patientData.date_of_birth ? patientData.date_of_birth.split('-')[0] : patientData.year_of_birth;
    const patientId = `${patientData.name.toLowerCase()}_${year}`;

    const patient = {
      id: patientId,
      ...patientData,
      year_of_birth: parseInt(year),
      status: 'booked',
      created_at: new Date().toISOString()
    };
    
    await database.addPatient(patient);
    // Auto-push updated dashboard + waiting list if connected
    try {
      if (communicationManager && communicationManager.isConnected) {
        console.log('🔧 [MAIN] Auto-push after adding patient');
        await communicationManager.sendDashboardStatusOnConnection();
      }
    } catch (e) {
      console.warn('⚠️ [MAIN] Auto-push after adding patient failed:', e.message);
    }
    return patient;
  } catch (error) {
    console.error('Error adding patient:', error);
    throw error;
  }
});

ipcMain.handle('database:update-patient-status', async (event, { patientId, status }) => {
  try {
    await database.updatePatientStatus(patientId, status);
    // Auto-push updated dashboard + waiting list if connected
    try {
      if (communicationManager && communicationManager.isConnected) {
        console.log('🔧 [MAIN] Auto-push after status change');
        await communicationManager.sendDashboardStatusOnConnection();
      }
    } catch (e) {
      console.warn('⚠️ [MAIN] Auto-push after status change failed:', e.message);
    }
    return { success: true };
  } catch (error) {
    console.error('Error updating patient status:', error);
    throw error;
  }
});

ipcMain.handle('database:get-appointments', async () => {
  try {
    return await database.getAppointments();
  } catch (error) {
    console.error('Error getting appointments:', error);
    throw error;
  }
});

ipcMain.handle('database:add-appointment', async (event, appointmentData) => {
  try {
    await database.addAppointment(appointmentData);
    // Auto-push updated dashboard + waiting list if connected
    try {
      if (communicationManager && communicationManager.isConnected) {
        console.log('🔧 [MAIN] Auto-push after adding appointment');
        await communicationManager.sendDashboardStatusOnConnection();
      }
    } catch (e) {
      console.warn('⚠️ [MAIN] Auto-push after adding appointment failed:', e.message);
    }
    return { success: true };
  } catch (error) {
    console.error('Error adding appointment:', error);
    throw error;
  }
});

ipcMain.handle('database:delete-appointment', async (event, appointmentId) => {
  try {
    console.log(`[MAIN] Deleting appointment with ID: ${appointmentId}`);
    const result = await database.deleteAppointment(appointmentId);
    console.log(`[MAIN] Appointment deletion result:`, result);
    // Auto-push updated dashboard + waiting list if connected
    try {
      if (communicationManager && communicationManager.isConnected) {
        console.log('🔧 [MAIN] Auto-push after deleting appointment');
        await communicationManager.sendDashboardStatusOnConnection();
      }
    } catch (e) {
      console.warn('⚠️ [MAIN] Auto-push after deleting appointment failed:', e.message);
    }
    return result;
  } catch (error) {
    console.error('[MAIN] Error deleting appointment:', error);
    throw error;
  }
});

// First-time patient detection handlers
ipcMain.handle('database:add-first-time-patient', async (event, firstTimePatient) => {
  try {
    const result = await database.addFirstTimePatient(firstTimePatient);
    return result;
  } catch (error) {
    console.error('Error adding first-time patient:', error);
    throw error;
  }
});

ipcMain.handle('database:get-first-time-patients', async (event, status) => {
  try {
    const patients = await database.getFirstTimePatients(status);
    return patients;
  } catch (error) {
    console.error('Error deleting first-time patient:', error);
    throw error;
  }
});

ipcMain.handle('database:is-first-time-patient-detected', async (event, appointmentId) => {
  try {
    const isDetected = await database.isFirstTimePatientDetected(appointmentId);
    return isDetected;
  } catch (error) {
    console.error('Error checking first-time patient detection:', error);
    throw error;
  }
});

ipcMain.handle('database:get-first-time-patient-stats', async () => {
  try {
    const stats = await database.getFirstTimePatientStats();
    return stats;
  } catch (error) {
    console.error('Error getting first-time patient stats:', error);
    throw error;
  }
});

  // Telemetry: log backup email ONCE and append to Google Sheets
  ipcMain.handle('telemetry:log-backup-email-once', async (event, payload) => {
    try {
      const { email, source = 'drive-backup', extra = {} } = payload || {};
      if (!email || typeof email !== 'string') {
        return { success: false, logged: false, error: 'Invalid or missing email' };
      }

      const storeDir = app.getPath('userData') || __dirname;
      const storePath = path.join(storeDir, 'telemetry.json');

      let state = { loggedEmails: [] };
      try {
        if (fs.existsSync(storePath)) {
          const raw = fs.readFileSync(storePath, 'utf8');
          state = JSON.parse(raw || '{}');
          if (!Array.isArray(state.loggedEmails)) state.loggedEmails = [];
        }
      } catch (e) {
        console.warn('[Telemetry] Failed reading telemetry store, recreating:', e.message);
        state = { loggedEmails: [] };
      }

      if (state.loggedEmails.includes(email)) {
        return { success: true, logged: false, reason: 'already-logged' };
      }

      await appendBackupEnableEventToSheet({ email, source, extra });

      state.loggedEmails.push(email);
      try {
        fs.writeFileSync(storePath, JSON.stringify(state, null, 2), 'utf8');
      } catch (e) {
        console.warn('[Telemetry] Failed writing telemetry store:', e.message);
      }

      return { success: true, logged: true };
    } catch (error) {
      console.error('[Telemetry] Failed to log backup email once:', error);
      return { success: false, logged: false, error: error.message };
    }
  });

ipcMain.handle('file:select-files', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (!result.canceled) {
      return result.filePaths;
    }
    return [];
  } catch (error) {
    console.error('Error selecting files:', error);
    throw error;
  }
});

ipcMain.handle('file:save-patient-files', async (event, { patientId, filePaths }) => {
  try {
    const savedFiles = await fileManager.savePatientFiles(patientId, filePaths);
    return savedFiles;
  } catch (error) {
    console.error('Error saving patient files:', error);
    throw error;
  }
});

ipcMain.handle('file:delete-patient-file', async (event, { patientId, fileName }) => {
  try {
    await fileManager.deletePatientFile(patientId, fileName);
    return { success: true };
  } catch (error) {
    console.error('Error deleting patient file:', error);
    throw error;
  }
});

ipcMain.handle('file:delete-patient-directory', async (event, patientId) => {
  try {
    await fileManager.deletePatientDirectory(patientId);
    return { success: true };
  } catch (error) {
    console.error('Error deleting patient directory:', error);
    throw error;
  }
});

ipcMain.handle('file:get-patient-files', async (event, patientId) => {
  try {
    const files = await fileManager.getPatientFiles(patientId);
    return files;
  } catch (error) {
    console.error('Error getting patient files:', error);
    throw error;
  }
});

// Remove ipcMain.handle('communication:send-to-doctor') handler and any references to sendToDoctor
// Add debug log to send-patient-data handler if not present
ipcMain.handle('send-patient-data', async (event, data) => {
  try {
    console.log('DEBUG: Handling send-patient-data', data);
    const patient = await database.getPatient(data.patientId);
    const files = await fileManager.getPatientFiles(data.patientId);

    // Emit patient:transfer event to backend (unencrypted, as backend expects)
    if (communicationManager.socket && communicationManager.socket.connected) {
      communicationManager.socket.emit('patient:transfer', {
        patientData: patient,
        files,
        patientId: data.patientId,
        timestamp: new Date().toISOString()
      });
      console.log('DEBUG: Emitted patient:transfer event to backend');
    } else {
      console.error('ERROR: communicationManager.socket not connected');
    }

    await database.updatePatientStatus(data.patientId, 'with_doctor');

    return { success: true };
  } catch (error) {
    console.error('Error in send-patient-data handler:', error);
    throw error;
  }
});

ipcMain.handle('send-dashboard-status', async (event) => {
  try {
    console.log('🔧 [MAIN] IPC: send-dashboard-status handler called');
    
    // Get all patients and appointments
    const patientsList = await database.getPatients();
    const appointmentsList = await database.getAppointments();
    
    console.log(` [MAIN] Found ${patientsList.length} patients and ${appointmentsList.length} appointments`);
    
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    // Compute current week range [weekStart .. weekEnd]
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    // Get today's appointments
    const todaysAppointments = appointmentsList.filter(a => a.appointment_date === todayStr);
    const todayPatientIds = new Set(todaysAppointments.map(a => a.patient_id));
    const todayPatients = patientsList.filter(p => todayPatientIds.has(p.id));
    
    // Filter for waiting patients (status 'waiting' and hasBeenEdited === true)
    const waitingPatients = todayPatients.filter(p => p.status === 'waiting' && p.hasBeenEdited);
    
    // Helper to parse date strings from DB (supports "YYYY-MM-DDTHH:mm:ssZ" or "YYYY-MM-DD HH:mm:ss")
    const toDate = (s) => {
      if (!s) return null;
      const norm = typeof s === 'string' ? s.replace(' ', 'T') : s;
      const d = new Date(norm);
      return isNaN(d.getTime()) ? null : d;
    };

    // Patients with appointments this week
    const weekAppointments = appointmentsList.filter(a => {
      const d = new Date(a.appointment_date);
      return d >= weekStart && d <= weekEnd;
    });
    const weekPatientIds = new Set(weekAppointments.map(a => a.patient_id));
    const weekPatientsByAppt = patientsList.filter(p => weekPatientIds.has(p.id));
    // Include patients updated/created within this week with status 'waiting'
    const weekWaitingUpdated = patientsList.filter(p => {
      if (p.status !== 'waiting') return false;
      const u = toDate(p.updated_at) || toDate(p.created_at);
      if (!u) return false;
      const dOnly = new Date(u.getFullYear(), u.getMonth(), u.getDate());
      const ws = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
      const we = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate());
      return dOnly >= ws && dOnly <= we;
    });
    const weekMap = new Map();
    [...weekPatientsByAppt, ...weekWaitingUpdated].forEach(p => weekMap.set(p.id, p));
    const weekPatientsCount = Array.from(weekMap.values()).length;
    
    console.log(` [MAIN] Today's patients: ${todayPatients.length}, Waiting patients: ${waitingPatients.length}`);
    
    // Create dashboard status data
    const dashboardStatus = {
      timestamp: new Date().toISOString(),
      todayPatients: todayPatients.length,
      weekPatients: weekPatientsCount,
      waitingPatients: waitingPatients.length,
      waitingPatientsList: waitingPatients.map(p => ({
        id: p.id,
        name: p.name,
        age: p.age,
        gender: p.gender,
        appointmentTime: todaysAppointments.find(a => a.patient_id === p.id)?.appointment_time || null,
        status: p.status
      })),
      todayPatientsList: todayPatients.map(p => ({
        id: p.id,
        name: p.name,
        age: p.age,
        gender: p.gender,
        appointmentTime: todaysAppointments.find(a => a.patient_id === p.id)?.appointment_time || null,
        status: p.status
      }))
    };

    // Send via communication manager
    if (communicationManager) {
      console.log(' [MAIN] Calling communicationManager.sendDashboardStatus()');
      await communicationManager.sendDashboardStatus(dashboardStatus);
      console.log(' [MAIN] Dashboard status sent successfully via communication manager');
      console.log('✅ [MAIN] Dashboard status sent successfully via communication manager');
    } else {
      console.error('❌ [MAIN] ERROR: communicationManager not available');
    }

    return { success: true, data: dashboardStatus };
  } catch (error) {
    console.error('❌ [MAIN] Error in send-dashboard-status handler:', error);
    throw error;
  }
});

ipcMain.handle('send-waiting-patients', async (event) => {
  try {
    console.log('🔧 [MAIN] IPC: send-waiting-patients handler called');
    
    // Get all patients and appointments
    const patientsList = await database.getPatients();
    const appointmentsList = await database.getAppointments();
    
    console.log(`🔧 [MAIN] Found ${patientsList.length} patients and ${appointmentsList.length} appointments`);
    
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    // Get today's appointments
    const todaysAppointments = appointmentsList.filter(a => a.appointment_date === todayStr);
    const todayPatientIds = new Set(todaysAppointments.map(a => a.patient_id));
    const todayPatients = patientsList.filter(p => todayPatientIds.has(p.id));
    
    // Filter for waiting patients (status 'waiting' and hasBeenEdited === true)
    const waitingPatients = todayPatients.filter(p => p.status === 'waiting' && p.hasBeenEdited);
    
    console.log(`🔧 [MAIN] Found ${waitingPatients.length} waiting patients`);
    
    // Create waiting patients data
    const waitingData = {
      timestamp: new Date().toISOString(),
      waitingCount: waitingPatients.length,
      waitingPatients: waitingPatients.map(p => ({
        id: p.id,
        name: p.name,
        appointmentTime: todaysAppointments.find(a => a.patient_id === p.id)?.appointment_time || null
      }))
    };

    // Send via communication manager
    if (communicationManager) {
      console.log('🔧 [MAIN] Calling communicationManager.sendWaitingPatientNames()');
      await communicationManager.sendWaitingPatientNames(waitingPatients);
      console.log('✅ [MAIN] Waiting patients sent successfully via communication manager');
    } else {
      console.error('❌ [MAIN] ERROR: communicationManager not available');
    }

    return { success: true, data: waitingData };
  } catch (error) {
    console.error('❌ [MAIN] Error in send-waiting-patients handler:', error);
    throw error;
  }
});

// Add a test function to manually trigger dashboard status sending
ipcMain.handle('test-dashboard-status', async (event) => {
  try {
    console.log('🧪 [MAIN] TEST: Manually triggering dashboard status send...');
    
    if (communicationManager) {
      console.log('🧪 [MAIN] Communication manager available, checking connection...');
      console.log('🧪 [MAIN] isConnected:', communicationManager.isConnected);
      
      if (communicationManager.isConnected) {
        console.log('🧪 [MAIN] Connection is active, sending dashboard status...');
        const result = await communicationManager.sendDashboardStatusOnConnection();
        if (result.success) {
          console.log('🧪 [MAIN] Dashboard status sent successfully!');
          return { success: true, message: 'Dashboard status sent successfully' };
        } else {
          console.log('🧪 [MAIN] Dashboard status send failed:', result.error);
          return { success: false, message: result.error };
        }
      } else {
        console.log('🧪 [MAIN] Connection not active, cannot send dashboard status');
        return { success: false, message: 'Connection not active' };
      }
    } else {
      console.log('🧪 [MAIN] Communication manager not available');
      return { success: false, message: 'Communication manager not available' };
    }
  } catch (error) {
    console.error('🧪 [MAIN] Error in test-dashboard-status:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('settings:get-config', async () => {
  try {
    return await database.getSettings();
  } catch (error) {
    console.error('Error getting settings:', error);
    throw error;
  }
});

ipcMain.handle('settings:update-config', async (event, settings) => {
  try {
    await database.updateSettings(settings);
    return { success: true };
  } catch (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
});

ipcMain.handle('user:get-info', async () => {
  try {
    const settings = await database.getSettings();
    return {
      username: settings.username || '',
      email: settings.email || '',
      license: settings.license || ''
    };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('user:set-info', async (event, userInfo) => {
  try {
    await database.updateSettings({
      username: userInfo.username || '',
      email: userInfo.email || '',
      license: userInfo.license || ''
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('backup:select-drive', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Backup Drive'
    });
    
    if (!result.canceled) {
      return result.filePaths[0];
    }
    return null;
  } catch (error) {
    console.error('Error selecting backup drive:', error);
    throw error;
  }
});

ipcMain.handle('backup:create-backup', async (event, backupFolder) => {
  const fs = require('fs');
  const path = require('path');
  try {
    if (!backupFolder) throw new Error('No backup folder specified');
    // Assume patient files are stored in a known directory, e.g., app.getPath('userData')/patients
    const app = require('electron').app;
    const patientsDir = path.join(app.getPath('userData'), 'patients');
    if (!fs.existsSync(patientsDir)) throw new Error('No patient files found');
    const files = fs.readdirSync(patientsDir).filter(f => f.endsWith('.json'));
    let copied = 0;
    let errors = [];
    for (const file of files) {
      const src = path.join(patientsDir, file);
      const dest = path.join(backupFolder, file);
      try {
        fs.copyFileSync(src, dest);
        copied++;
      } catch (err) {
        errors.push({ file, error: err.message });
      }
    }
    return { success: errors.length === 0, copied, errors };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('backup:backup-patient', async (event, patient, backupFolder) => {
  try {
    if (!backupFolder) throw new Error('No backup folder specified');
    if (!patient || !patient.id) throw new Error('Invalid patient data');
    const fileName = `patient_${patient.id}.json`;
    const filePath = path.join(backupFolder, fileName);
    fs.writeFileSync(filePath, JSON.stringify(patient, null, 2), 'utf-8');
    return { success: true, filePath };
  } catch (error) {
    console.error('Error backing up patient:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('backup:get-backup-files', async () => {
  try {
    const result = await database.getBackupFiles();
    return result;
  } catch (error) {
    console.error('Error getting backup files:', error);
    throw error;
  }
});

ipcMain.handle('backup:restore-patient', async (event, backupFilePath) => {
  try {
    const result = await database.restorePatientFromBackup(backupFilePath);
    return result;
  } catch (error) {
    console.error('Error restoring patient from backup:', error);
    throw error;
  }
});

ipcMain.handle('backup:restore-all-patients', async () => {
  try {
    const result = await database.restoreAllPatientsFromBackup();
    return result;
  } catch (error) {
    console.error('Error restoring all patients from backup:', error);
    throw error;
  }
});

ipcMain.handle('backup:validate-path', async () => {
  try {
    const result = await database.validateAndUpdateBackupPath();
    return result;
  } catch (error) {
    console.error('Error validating backup path:', error);
    throw error;
  }
});

ipcMain.handle('backup:get-path-status', async () => {
  try {
    const result = await database.getBackupPathStatus();
    return result;
  } catch (error) {
    console.error('Error getting backup path status:', error);
    throw error;
  }
});

// Handle communication events
ipcMain.on('communication:message-received', (event, message) => {
  if (mainWindow) {
    mainWindow.webContents.send('communication:new-message', message);
  }
});

ipcMain.on('communication:appointment-request', (event, data) => {
  if (mainWindow) {
    mainWindow.webContents.send('communication:appointment-notification', data);
  }
});

ipcMain.on('communication:book-appointment-request', (event, data) => {
  if (mainWindow) {
    mainWindow.webContents.send('communication:book-appointment-request', data);
  }
});



ipcMain.handle('communication:ping-doctor', async (event, ip) => {
  return new Promise((resolve, reject) => {
    // Use 1 echo request for speed, cross-platform
    const cmd = process.platform === 'win32' ? `ping -n 1 ${ip}` : `ping -c 1 ${ip}`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(stderr || error.message);
      } else {
        resolve(stdout);
      }
    });
  });
});

ipcMain.handle('communication:send-file', async (event, { patientId, fileName, filePath }) => {
  try {
    await communicationManager.sendFile(patientId, fileName, filePath);
    return { success: true };
  } catch (error) {
    console.error('Error sending file:', error);
    throw error;
  }
});

// Network communication handlers - network-connect is handled by networkManager.setupIPC()

// send-patient-data and send-chat-message are handled by networkManager.setupIPC()

ipcMain.handle('file:open-file', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    console.error('Error opening file:', error);
    throw error;
  }
});

ipcMain.handle('database:update-patient', async (event, patientData) => {
  try {
    const year = patientData.date_of_birth ? patientData.date_of_birth.split('-')[0] : patientData.year_of_birth;
    await database.updatePatient({
      ...patientData,
      year_of_birth: parseInt(year)
    });
    // Auto-push updated dashboard + waiting list if connected
    try {
      if (communicationManager && communicationManager.isConnected) {
        console.log('🔧 [MAIN] Auto-push after updating patient');
        await communicationManager.sendDashboardStatusOnConnection();
      }
    } catch (e) {
      console.warn('⚠️ [MAIN] Auto-push after updating patient failed:', e.message);
    }
    return { success: true };
  } catch (error) {
    console.error('Error updating patient:', error);
    throw error;
  }
});

// Atomic patient ID rename: updates DB references and renames/merges patient directory
ipcMain.handle('database:rename-patient-id', async (event, { oldId, newId, updateFields = {} }) => {
  try {
    // Perform atomic DB rename (patients, appointments, recent_patients)
    await database.renamePatientId(oldId, newId, updateFields);

    // Rename/merge filesystem directory if present
    try {
      await fileManager.renamePatientDirectory(oldId, newId);
    } catch (fsErr) {
      console.warn(`[MAIN] renamePatientDirectory warning (${oldId} -> ${newId}):`, fsErr?.message || fsErr);
      // Non-fatal; DB already consistent
    }

    // Auto-push updated dashboard + waiting list if connected
    try {
      if (communicationManager && communicationManager.isConnected) {
        console.log('🔧 [MAIN] Auto-push after renaming patient ID');
        await communicationManager.sendDashboardStatusOnConnection();
      }
    } catch (e) {
      console.warn('⚠️ [MAIN] Auto-push after renaming patient failed:', e.message);
    }

    return { success: true };
  } catch (error) {
    console.error('Error renaming patient ID:', error);
    throw error;
  }
});

ipcMain.handle('database:delete-patient', async (event, patientId) => {
  try {
    // Delete patient files first
    try {
      await fileManager.deletePatientDirectory(patientId);
      console.log(`Deleted patient files for ${patientId}`);
    } catch (fileError) {
      console.warn(`Could not delete patient files for ${patientId}:`, fileError);
      // Continue with patient deletion even if file deletion fails
    }

    // Delete patient from database
    await database.deletePatient(patientId);
    console.log(`Deleted patient ${patientId} from database`);
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting patient:', error);
    throw error;
  }
});

// Forward file-received events to renderer
if (mainWindow) {
  global.mainWindow.webContents.on('communication:file-received', (event, data) => {
    mainWindow.webContents.send('file-received', data);
  });
}

ipcMain.handle('database:clear-messages', async () => {
  try {
    await database.clearMessages();
    return { success: true };
  } catch (error) {
    console.error('Error clearing messages:', error);
    throw error;
  }
});

ipcMain.handle('database:clear-old-messages', async () => {
  try {
    await database.clearOldMessages();
    return { success: true };
  } catch (error) {
    console.error('Error clearing old messages:', error);
    throw error;
  }
});

ipcMain.handle('database:update-appointment', async (event, appointmentData) => {
  console.log('[IPC] Registering handler for database:update-appointment');
  try {
    await database.updateAppointment(appointmentData);
    console.log('[IPC] Successfully updated appointment');
    return { success: true };
  } catch (error) {
    console.error('Error updating appointment:', error);
    throw error;
  }
});
console.log('[IPC] Handler for database:update-appointment registered');
  
  // System: Get machine UUID for licensing (Windows/macOS)
  ipcMain.handle('system:get-machine-uuid', async () => {
    const platform = process.platform;
    const execAsync = (cmd) => new Promise((resolve) => {
      exec(cmd, { windowsHide: true }, (error, stdout, stderr) => {
        resolve({ error, stdout: String(stdout || ''), stderr: String(stderr || '') });
      });
    });

    try {
      if (platform === 'win32') {
        let uuid = '';
        // Prefer value format for stable parsing
        let res = await execAsync('wmic csproduct get uuid /value');
        if (!res.error) {
          const m = res.stdout.match(/UUID=([0-9A-Fa-f-]+)/);
          if (m) uuid = m[1];
        }
        // Fallback to table format
        if (!uuid) {
          res = await execAsync('wmic csproduct get uuid');
          if (!res.error) {
            const lines = res.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            uuid = lines.find(l => /[0-9A-Fa-f-]{8,}/.test(l) && l.toLowerCase() !== 'uuid') || '';
          }
        }
        // Final fallback for systems without WMIC
        if (!uuid) {
          res = await execAsync('powershell -NoProfile -Command "(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID"');
          if (!res.error) {
            const line = res.stdout.split(/\r?\n/).map(s => s.trim()).find(Boolean);
            if (line && /[0-9A-Fa-f-]{8,}/.test(line)) uuid = line;
          }
        }
        if (!uuid) return { success: false, error: 'UUID not found' };
        return { success: true, uuid };
      } else if (platform === 'darwin') {
        const res = await execAsync('system_profiler SPHardwareDataType | grep "Hardware UUID"');
        if (res.error) return { success: false, error: res.error.message || 'Command failed' };
        const match = res.stdout.match(/Hardware UUID:\s*([0-9A-Fa-f-]+)/);
        if (!match) return { success: false, error: 'UUID not found' };
        return { success: true, uuid: match[1] };
      }
      return { success: false, error: `Unsupported platform: ${platform}` };
    } catch (e) {
      console.error('[MAIN] system:get-machine-uuid failed:', e);
      return { success: false, error: e.message };
    }
  });

  // Bug report: send silently via SMTP if configured, otherwise store locally
  ipcMain.handle('bug-report:send', async (event, { message }) => {
    try {
      const subject = 'app assistant bug report';
      const to = 'ghuilaineo@gmail.com';
      const timestamp = new Date().toISOString();
      const content = `Time: ${timestamp}\nFrom: MedOps App\n\n${message || ''}`;

      // Try email via nodemailer if available and configured
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFrom = process.env.SMTP_FROM || smtpUser;

      let sent = false;
      try {
        if (smtpHost && smtpPort && smtpUser && smtpPass && smtpFrom) {
          let nodemailer;
          try {
            nodemailer = require('nodemailer');
          } catch (e) {
            nodemailer = null; // not installed; fallback to file
          }
          if (nodemailer) {
            const transporter = nodemailer.createTransport({
              host: smtpHost,
              port: smtpPort,
              secure: smtpPort === 465, // common heuristic
              auth: { user: smtpUser, pass: smtpPass },
            });
            await transporter.sendMail({ from: smtpFrom, to, subject, text: content });
            sent = true;
            console.log('[BUG REPORT] Email sent successfully');
          }
        }
      } catch (emailErr) {
        console.warn('[BUG REPORT] Email send failed, will fallback to file:', emailErr.message);
      }

      if (!sent) {
        try {
          const reportsDir = path.join(app.getPath('userData') || __dirname, 'bug-reports');
          if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
          }
          const fileName = `bug_${timestamp.replace(/[:.]/g, '-')}.txt`;
          fs.writeFileSync(path.join(reportsDir, fileName), content, 'utf8');
          console.log('[BUG REPORT] Saved locally at', path.join(reportsDir, fileName));
          return { success: true, stored: true };
        } catch (fileErr) {
          console.error('[BUG REPORT] Failed to store locally:', fileErr);
          throw fileErr;
        }
      }

      return { success: true, sent: true };
    } catch (err) {
      console.error('[BUG REPORT] Handler failed:', err);
      throw err;
    }
  });

  console.log('All IPC handlers registered successfully');
}

// App lifecycle
app.whenReady().then(async () => {
  try {
    await initializeApp();
    registerIPCHandlers();
    createWindow();
  } catch (error) {
    console.error('Failed to start application:', error);
    dialog.showErrorBox('Startup Error', `Failed to start application: ${error.message}`);
    // Still try to register IPC handlers and create window for debugging
    try {
      registerIPCHandlers();
      createWindow();
    } catch (innerError) {
      console.error('Failed to recover after startup error:', innerError);
    }
  } finally {
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (communicationManager) {
    await communicationManager.cleanup();
  }
  if (database) {
    await database.close();
  }
}); 