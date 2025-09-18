const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class DatabaseManager {
  constructor(dbPath) {
    // Expect an absolute path passed from the main process (e.g., under app.getPath('userData'))
    if (!dbPath || typeof dbPath !== 'string') {
      throw new Error('DatabaseManager requires a valid dbPath');
    }
    this.db = new Database(dbPath);
  }

  // Get appointment by composite key
  async getAppointmentByComposite(patient_id, appointment_date, appointment_time) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM appointments
        WHERE patient_id = ? AND appointment_date = ? AND appointment_time = ?
        LIMIT 1
      `);
      return stmt.get(patient_id, appointment_date, appointment_time);
    } catch (error) {
      console.error('Error getting appointment by composite key:', error);
      throw error;
    }
  }

  // Upsert appointment using composite key (patient_id, appointment_date, appointment_time)
  async upsertAppointmentByComposite(appointment) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO appointments (
          patient_id, patient_name, appointment_date, appointment_time, reason, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
        ON CONFLICT(patient_id, appointment_date, appointment_time) DO UPDATE SET
          patient_name=excluded.patient_name,
          reason=excluded.reason,
          status=excluded.status
      `);
      const res = stmt.run(
        appointment.patient_id,
        appointment.patient_name,
        appointment.appointment_date,
        appointment.appointment_time,
        appointment.reason || '',
        appointment.status || 'scheduled',
        appointment.created_at || null
      );
      return { changes: res.changes, lastInsertRowid: res.lastInsertRowid };
    } catch (error) {
      console.error('Error upserting appointment by composite key:', error);
      throw error;
    }
  }

  async initialize() {
    try {
      // Create patients table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS patients (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          phone TEXT,
          email TEXT,
          urgent_contact TEXT,
          convention TEXT,
          insurances TEXT,
          reason_for_visit TEXT,
          medical_history TEXT,
          year_of_birth INTEGER NOT NULL,
          date_of_birth TEXT,
          consultation_price TEXT,
          status TEXT DEFAULT 'waiting',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          hasBeenEdited INTEGER DEFAULT 0
        )
      `);
      // Migration: add date_of_birth column if it doesn't exist
      const columns = this.db.prepare("PRAGMA table_info(patients)").all();
      if (!columns.some(col => col.name === 'date_of_birth')) {
        this.db.exec('ALTER TABLE patients ADD COLUMN date_of_birth TEXT');
      }
      // Migration: add updated_at column if it doesn't exist
      if (!columns.some(col => col.name === 'updated_at')) {
        this.db.exec('ALTER TABLE patients ADD COLUMN updated_at TEXT');
      }
      // Migration: add created_at column if it doesn't exist
      if (!columns.some(col => col.name === 'created_at')) {
        this.db.exec('ALTER TABLE patients ADD COLUMN created_at TEXT');
      }
      // Migration: add consultation_price column if it doesn't exist
      if (!columns.some(col => col.name === 'consultation_price')) {
        this.db.exec('ALTER TABLE patients ADD COLUMN consultation_price TEXT');
      }
      // Migration: add email column if it doesn't exist
      if (!columns.some(col => col.name === 'email')) {
        this.db.exec('ALTER TABLE patients ADD COLUMN email TEXT');
      }
      // Migration: add convention column if it doesn't exist
      if (!columns.some(col => col.name === 'convention')) {
        this.db.exec('ALTER TABLE patients ADD COLUMN convention TEXT');
      }
      // Migration: add insurances column if it doesn't exist
      if (!columns.some(col => col.name === 'insurances')) {
        this.db.exec('ALTER TABLE patients ADD COLUMN insurances TEXT');
      }
      // Migration: add hasBeenEdited column if it doesn't exist
      if (!columns.some(col => col.name === 'hasBeenEdited')) {
        this.db.exec('ALTER TABLE patients ADD COLUMN hasBeenEdited INTEGER DEFAULT 0');
      }

      // Create appointments table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS appointments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          patient_id TEXT NOT NULL,
          patient_name TEXT NOT NULL,
          appointment_date TEXT NOT NULL,
          appointment_time TEXT NOT NULL,
          reason TEXT,
          status TEXT DEFAULT 'scheduled',
          created_at TEXT NOT NULL,
          appointment_reason TEXT,
          appointment_context TEXT,
          FOREIGN KEY (patient_id) REFERENCES patients (id)
        )
      `);

      // Ensure new columns exist on older schemas
      try {
        const apptCols = this.db.prepare("PRAGMA table_info('appointments')").all();
        if (!apptCols.some(col => col.name === 'appointment_reason')) {
          this.db.exec("ALTER TABLE appointments ADD COLUMN appointment_reason TEXT");
        }
        if (!apptCols.some(col => col.name === 'appointment_context')) {
          this.db.exec("ALTER TABLE appointments ADD COLUMN appointment_context TEXT");
        }
        // Backfill: if appointment_context is missing but appointment_reason exists (legacy data),
        // copy it so Dashboard confirm gating works as expected for existing upcoming appointments.
        this.db.exec(`
          UPDATE appointments
          SET appointment_context = appointment_reason
          WHERE (appointment_context IS NULL OR appointment_context = '')
            AND appointment_reason IS NOT NULL AND appointment_reason != ''
            AND status = 'scheduled'
        `);
      } catch (e) {
        console.warn('Failed to ensure appointment columns exist:', e);
      }

      // Ensure uniqueness on (patient_id, appointment_date, appointment_time)
      this.db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_unique
        ON appointments (patient_id, appointment_date, appointment_time)
      `);

      // Create settings table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

      // Create messages table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sender TEXT NOT NULL,
          message TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          is_read INTEGER DEFAULT 0
        )
      `);
      
      // Add unique constraint to prevent duplicate messages (same sender + message within 5 seconds)
      // This will be added as an index to help with duplicate detection
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_messages_unique 
        ON messages (sender, message, timestamp)
      `);

      // Create first_time_patients table for tracking detection
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS first_time_patients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          appointment_id INTEGER NOT NULL,
          patient_name TEXT NOT NULL,
          appointment_date TEXT NOT NULL,
          appointment_time TEXT NOT NULL,
          reason TEXT,
          phone TEXT,
          email TEXT,
          date_of_birth TEXT,
          detection_date TEXT NOT NULL,
          status TEXT DEFAULT 'detected',
          processed_date TEXT,
          processed_by TEXT,
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (appointment_id) REFERENCES appointments (id)
        )
      `);

      // Create recent_patients table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS recent_patients (
          id TEXT PRIMARY KEY,
          name TEXT,
          phone TEXT,
          date_of_birth TEXT,
          updated_at TEXT
        )
      `);

      // Insert default settings
      const insertSettings = this.db.prepare(`
        INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      `);
      
      const defaultSettings = [
        ['language', 'fr'],
        ['communication_mode', 'wifi'],
        ['doctor_ip', ''],
  
        ['backup_path', '']
      ];

      defaultSettings.forEach(([key, value]) => {
        insertSettings.run(key, value);
      });

      console.log('Database initialized successfully for MedOps');
    } catch (error) {
      console.error('Database initialization error:', error);
      throw error;
    }
  }

  async getAllPatients() {
    try {
      const stmt = this.db.prepare('SELECT * FROM patients ORDER BY created_at DESC');
      return stmt.all();
    } catch (error) {
      console.error('Error getting patients:', error);
      throw error;
    }
  }

  async getTodayPatients() {
    try {
      console.log('[DATABASE] getTodayPatients: Starting to fetch today\'s patients');
      // Compute local YYYY-MM-DD to avoid UTC off-by-one
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const today = `${y}-${m}-${d}`;
      console.log('[DATABASE] getTodayPatients: Today (local) date:', today);

      // Return only:
      // 1) Patients with appointments scheduled for today
      // 2) Walk-ins (no appointments at all) created/updated today with status 'waiting'
      const stmt = this.db.prepare(`
        SELECT DISTINCT p.*
        FROM patients p
        WHERE EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.patient_id = p.id
            AND a.appointment_date = ?
            AND a.status IN ('scheduled', 'missed', 'waiting', 'walk_in_notified')
        )
        OR (
          -- Walk-ins: patient has no appointments at all
          NOT EXISTS (SELECT 1 FROM appointments ax WHERE ax.patient_id = p.id)
          AND p.status IN ('waiting', 'with_doctor')
          AND (date(p.updated_at) = ? OR date(p.created_at) = ?)
        )
        ORDER BY p.created_at DESC
      `);
      console.log('[DATABASE] getTodayPatients: SQL statement prepared');
      const result = stmt.all(today, today, today);
      console.log('[DATABASE] getTodayPatients: Query executed, found', result.length, 'patients');
      if (result.length > 0) {
        console.log('[DATABASE] getTodayPatients: First patient sample:', JSON.stringify(result[0], null, 2));
      } else {
        console.log('[DATABASE] getTodayPatients: No patients found for today');
      }
      return result;
    } catch (error) {
      console.error('[DATABASE] getTodayPatients: Error getting today\'s patients:', error);
      console.error('[DATABASE] getTodayPatients: Error stack:', error.stack);
      throw error;
    }
  }

  async getPatient(patientId) {
    try {
      const stmt = this.db.prepare('SELECT * FROM patients WHERE id = ?');
      return stmt.get(patientId);
    } catch (error) {
      console.error('Error getting patient:', error);
      throw error;
    }
  }

  async addPatient(patient) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO patients (
          id, name, phone, email, urgent_contact, convention, insurances, reason_for_visit, 
          medical_history, year_of_birth, date_of_birth, consultation_price, status, created_at, updated_at, hasBeenEdited
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const year = patient.date_of_birth ? parseInt(patient.date_of_birth.split('-')[0]) : patient.year_of_birth;
      const result = stmt.run(
        patient.id,
        patient.name,
        patient.phone,
        patient.email,
        patient.urgent_contact,
        patient.convention,
        patient.insurances,
        patient.reason_for_visit,
        patient.medical_history,
        year,
        patient.date_of_birth || null,
        patient.consultation_price || null,
        patient.status || 'booked',
        patient.created_at || new Date().toISOString(),
        patient.updated_at || new Date().toISOString(),
        patient.hasBeenEdited ? 1 : 0 // default false
      );

      // Automatically create backup of the patient
      try {
        const backupResult = await this.backupPatient(patient);
        if (backupResult.success) {
          console.log(`Patient backup created successfully: ${backupResult.filePath}`);
        } else {
          console.log(`Patient backup failed: ${backupResult.reason || backupResult.error}`);
        }
      } catch (backupError) {
        console.error('Error during automatic patient backup:', backupError);
        // Don't throw error here to avoid breaking the main operation
      }

      return { id: result.lastInsertRowid };
    } catch (error) {
      console.error('Error adding patient:', error);
      throw error;
    }
  }

  async updatePatientStatus(patientId, status) {
    try {
      const stmt = this.db.prepare(`
        UPDATE patients 
        SET status = ?, updated_at = datetime('now')
        WHERE id = ?
      `);
      
      const result = stmt.run(status, patientId);
      return { changes: result.changes };
    } catch (error) {
      console.error('Error updating patient status:', error);
      throw error;
    }
  }

  async getAppointments() {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM appointments 
        ORDER BY appointment_date ASC, appointment_time ASC
      `);
      return stmt.all();
    } catch (error) {
      console.error('Error getting appointments:', error);
      throw error;
    }
  }

  async addAppointment(appointment) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO appointments (
          patient_id, patient_name, appointment_date, appointment_time,
          reason, status, created_at, appointment_reason, appointment_context
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
      `);
      
      const result = stmt.run(
        appointment.patient_id,
        appointment.patient_name,
        appointment.appointment_date,
        appointment.appointment_time,
        appointment.reason,
        appointment.status || 'scheduled',
        appointment.appointment_reason || null,
        appointment.appointment_context || null
      );
      
      return { id: result.lastInsertRowid };
    } catch (error) {
      console.error('Error adding appointment:', error);
      throw error;
    }
  }

  async deleteAppointment(appointmentId) {
    try {
      console.log(`Attempting to delete appointment with ID: ${appointmentId}`);
      
      // First check if the appointment exists
      const checkStmt = this.db.prepare('SELECT id, patient_name, appointment_date, appointment_time FROM appointments WHERE id = ?');
      const existingAppointment = checkStmt.get(appointmentId);
      
      if (!existingAppointment) {
        console.warn(`Appointment with ID ${appointmentId} not found`);
        return { deleted: false, reason: 'Appointment not found' };
      }
      
      console.log(`Found appointment to delete:`, existingAppointment);
      
      // Delete the appointment
      const deleteStmt = this.db.prepare('DELETE FROM appointments WHERE id = ?');
      const result = deleteStmt.run(appointmentId);
      
      const deleted = result.changes > 0;
      console.log(`Appointment deletion result: ${deleted ? 'SUCCESS' : 'FAILED'}, changes: ${result.changes}`);
      
      return { deleted, appointmentData: existingAppointment };
    } catch (error) {
      console.error('Error deleting appointment:', error);
      throw error;
    }
  }

  async getSettings() {
    try {
      const stmt = this.db.prepare('SELECT key, value FROM settings');
      const rows = stmt.all();
      
      const settings = {};
      rows.forEach(row => {
        settings[row.key] = row.value;
      });
      return settings;
    } catch (error) {
      console.error('Error getting settings:', error);
      throw error;
    }
  }

  async updateSettings(settings) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO settings (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
      `);
      const transaction = this.db.transaction((settings) => {
        for (const [key, value] of Object.entries(settings)) {
          // Convert booleans and objects to strings
          let safeValue = value;
          if (typeof value === 'boolean' || typeof value === 'object') {
            safeValue = JSON.stringify(value);
          }
          stmt.run(key, safeValue);
        }
      });
      transaction(settings);
    } catch (error) {
      console.error('Error updating settings:', error);
      throw error;
    }
  }

  async addMessage(message) {
    try {
      // Check for duplicate messages to prevent storing the same message multiple times
      // Use a combination of sender, message content, and timestamp (within 5 seconds) to detect duplicates
      const checkStmt = this.db.prepare(`
        SELECT id FROM messages 
        WHERE sender = ? AND message = ? 
        AND timestamp > datetime('now', '-5 seconds')
        LIMIT 1
      `);
      
      const existingMessage = checkStmt.get(message.sender, message.message);
      
      if (existingMessage) {
        console.log('[DATABASE] Duplicate message detected, skipping:', message.message);
        return { id: existingMessage.id, duplicate: true };
      }
      
      const stmt = this.db.prepare(`
        INSERT INTO messages (sender, message, timestamp)
        VALUES (?, ?, datetime('now'))
      `);
      
      const result = stmt.run(message.sender, message.message);
      console.log('[DATABASE] Message added successfully:', message.message);
      return { id: result.lastInsertRowid };
    } catch (error) {
      console.error('Error adding message:', error);
      throw error;
    }
  }

  async getMessages() {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM messages 
        ORDER BY timestamp DESC 
        LIMIT 100
      `);
      return stmt.all();
    } catch (error) {
      console.error('Error getting messages:', error);
      throw error;
    }
  }

  async createBackup() {
    try {
      const backup = {};
      
      // Get all data
      backup.patients = await this.getAllPatients();
      backup.appointments = await this.getAppointments();
      backup.settings = await this.getSettings();
      backup.messages = await this.getMessages();
      backup.backupDate = new Date().toISOString();
      
      return backup;
    } catch (error) {
      console.error('Error creating backup:', error);
      throw error;
    }
  }

  async backupPatient(patient) {
    try {
      const settings = await this.getSettings();
      const backupPath = await this.resolveBackupPath(settings.backup_path);
      
      if (!backupPath) {
        console.log('No backup path configured, skipping patient backup');
        return { success: false, reason: 'No backup path configured' };
      }

      // Create backup directory if it doesn't exist
      const backupDir = path.join(backupPath, 'patients');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Create filename with patient ID and timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${patient.id}_${timestamp}.json`;
      const filePath = path.join(backupDir, filename);

      // Prepare patient data for backup
      const patientBackup = {
        ...patient,
        backupCreatedAt: new Date().toISOString(),
        backupVersion: '1.0'
      };

      // Write patient data to file
      fs.writeFileSync(filePath, JSON.stringify(patientBackup, null, 2));
      
      console.log(`Patient backup created: ${filePath}`);
      return { success: true, filePath };
    } catch (error) {
      console.error('Error backing up patient:', error);
      return { success: false, error: error.message };
    }
  }

  async resolveBackupPath(backupPath) {
    try {
      if (!backupPath) return null;

      // If the path exists, use it directly
      if (fs.existsSync(backupPath)) {
        return backupPath;
      }

      // Check if this is a drive letter path (Windows)
      const driveLetterMatch = backupPath.match(/^([A-Za-z]:\\)/);
      if (driveLetterMatch) {
        const originalDrive = driveLetterMatch[1];
        const relativePath = backupPath.substring(originalDrive.length);
        
        // Try to find the drive by volume ID or label
        const resolvedPath = await this.findDriveByVolumeInfo(originalDrive, relativePath);
        if (resolvedPath) {
          console.log(`Resolved backup path: ${backupPath} → ${resolvedPath}`);
          return resolvedPath;
        }
      }

      return null;
    } catch (error) {
      console.error('Error resolving backup path:', error);
      return null;
    }
  }

  async findDriveByVolumeInfo(originalDrive, relativePath) {
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);

      // Get volume information for all drives
      const { stdout } = await execAsync('wmic logicaldisk get deviceid,volumename,volumeserialnumber /format:csv');
      
      // Parse the output to find matching drives
      const lines = stdout.split('\n').filter(line => line.trim() && !line.includes('Node,DeviceID'));
      
      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length >= 4) {
          const deviceId = parts[1]?.trim();
          const volumeName = parts[2]?.trim();
          const volumeSerial = parts[3]?.trim();
          
          if (deviceId && deviceId !== originalDrive) {
            // Check if this drive has the expected backup directory structure
            const testPath = path.join(deviceId, relativePath);
            if (fs.existsSync(testPath)) {
              console.log(`Found backup drive: ${deviceId} (Volume: ${volumeName}, Serial: ${volumeSerial})`);
              return testPath;
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error finding drive by volume info:', error);
      return null;
    }
  }

  async updatePatientBackup(patient) {
    try {
      const settings = await this.getSettings();
      const backupPath = await this.resolveBackupPath(settings.backup_path);
      
      if (!backupPath) {
        console.log('No backup path configured, skipping patient backup update');
        return { success: false, reason: 'No backup path configured' };
      }

      // Create backup directory if it doesn't exist
      const backupDir = path.join(backupPath, 'patients');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Create filename with patient ID and timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${patient.id}_${timestamp}.json`;
      const filePath = path.join(backupDir, filename);

      // Prepare patient data for backup
      const patientBackup = {
        ...patient,
        backupCreatedAt: new Date().toISOString(),
        backupVersion: '1.0',
        backupType: 'update'
      };

      // Write patient data to file
      fs.writeFileSync(filePath, JSON.stringify(patientBackup, null, 2));
      
      console.log(`Patient backup updated: ${filePath}`);
      return { success: true, filePath };
    } catch (error) {
      console.error('Error updating patient backup:', error);
      return { success: false, error: error.message };
    }
  }

  async getBackupFiles() {
    try {
      const settings = await this.getSettings();
      const backupPath = await this.resolveBackupPath(settings.backup_path);
      
      if (!backupPath) {
        return { success: false, reason: 'No backup path configured' };
      }

      const backupDir = path.join(backupPath, 'patients');
      if (!fs.existsSync(backupDir)) {
        return { success: true, files: [] };
      }

      const files = fs.readdirSync(backupDir)
        .filter(file => file.endsWith('.json'))
        .map(file => {
          const filePath = path.join(backupDir, file);
          const stats = fs.statSync(filePath);
          return {
            filename: file,
            filePath: filePath,
            size: stats.size,
            modified: stats.mtime,
            patientId: file.split('_')[0] // Extract patient ID from filename
          };
        })
        .sort((a, b) => b.modified - a.modified); // Sort by most recent first

      return { success: true, files };
    } catch (error) {
      console.error('Error getting backup files:', error);
      return { success: false, error: error.message };
    }
  }

  async restorePatientFromBackup(backupFilePath) {
    try {
      if (!fs.existsSync(backupFilePath)) {
        return { success: false, reason: 'Backup file not found' };
      }

      // Read and parse the backup file
      const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
      
      // Validate backup data
      if (!backupData.id || !backupData.name) {
        return { success: false, reason: 'Invalid backup data format' };
      }

      // Check if patient already exists
      const existingPatient = await this.getPatient(backupData.id);
      
      if (existingPatient) {
        // Update existing patient
        await this.updatePatient(backupData);
        console.log(`Patient restored from backup (updated): ${backupData.id}`);
        return { success: true, action: 'updated', patientId: backupData.id };
      } else {
        // Add new patient
        await this.addPatient(backupData);
        console.log(`Patient restored from backup (created): ${backupData.id}`);
        return { success: true, action: 'created', patientId: backupData.id };
      }
    } catch (error) {
      console.error('Error restoring patient from backup:', error);
      return { success: false, error: error.message };
    }
  }

  async restoreAllPatientsFromBackup() {
    try {
      const backupFiles = await this.getBackupFiles();
      
      if (!backupFiles.success) {
        return backupFiles;
      }

      if (backupFiles.files.length === 0) {
        return { success: false, reason: 'No backup files found' };
      }

      const results = {
        total: backupFiles.files.length,
        created: 0,
        updated: 0,
        failed: 0,
        errors: []
      };

      // Group files by patient ID and get the most recent for each
      const patientBackups = {};
      backupFiles.files.forEach(file => {
        if (!patientBackups[file.patientId] || 
            file.modified > patientBackups[file.patientId].modified) {
          patientBackups[file.patientId] = file;
        }
      });

      // Restore each patient
      for (const [patientId, backupFile] of Object.entries(patientBackups)) {
        try {
          const result = await this.restorePatientFromBackup(backupFile.filePath);
          if (result.success) {
            if (result.action === 'created') {
              results.created++;
            } else {
              results.updated++;
            }
          } else {
            results.failed++;
            results.errors.push(`${patientId}: ${result.reason || result.error}`);
          }
        } catch (error) {
          results.failed++;
          results.errors.push(`${patientId}: ${error.message}`);
        }
      }

      return { success: true, results };
    } catch (error) {
      console.error('Error restoring all patients from backup:', error);
      return { success: false, error: error.message };
    }
  }

  async validateAndUpdateBackupPath() {
    try {
      const settings = await this.getSettings();
      const currentPath = settings.backup_path;
      
      if (!currentPath) {
        return { success: false, reason: 'No backup path configured' };
      }

      // Try to resolve the current path
      const resolvedPath = await this.resolveBackupPath(currentPath);
      
      if (resolvedPath && resolvedPath !== currentPath) {
        // Update the settings with the new resolved path
        await this.updateSettings({
          ...settings,
          backup_path: resolvedPath
        });
        
        console.log(`Updated backup path: ${currentPath} → ${resolvedPath}`);
        return { 
          success: true, 
          updated: true, 
          oldPath: currentPath, 
          newPath: resolvedPath 
        };
      } else if (resolvedPath) {
        return { success: true, updated: false, path: resolvedPath };
      } else {
        return { success: false, reason: 'Backup drive not found' };
      }
    } catch (error) {
      console.error('Error validating backup path:', error);
      return { success: false, error: error.message };
    }
  }

  async getBackupPathStatus() {
    try {
      const settings = await this.getSettings();
      const currentPath = settings.backup_path;
      
      if (!currentPath) {
        return { 
          configured: false, 
          accessible: false, 
          reason: 'No backup path configured' 
        };
      }

      const resolvedPath = await this.resolveBackupPath(currentPath);
      
      if (resolvedPath) {
        const backupDir = path.join(resolvedPath, 'patients');
        const hasBackupFiles = fs.existsSync(backupDir) && 
          fs.readdirSync(backupDir).some(file => file.endsWith('.json'));
        
        return {
          configured: true,
          accessible: true,
          originalPath: currentPath,
          resolvedPath: resolvedPath,
          hasBackupFiles,
          pathChanged: resolvedPath !== currentPath
        };
      } else {
        return {
          configured: true,
          accessible: false,
          originalPath: currentPath,
          reason: 'Backup drive not accessible'
        };
      }
    } catch (error) {
      console.error('Error getting backup path status:', error);
      return {
        configured: true,
        accessible: false,
        error: error.message
      };
    }
  }

  async close() {
    try {
      this.db.close();
    } catch (error) {
      console.error('Error closing database:', error);
    }
  }

  async updatePatient(patient) {
    try {
      const stmt = this.db.prepare(`
        UPDATE patients SET
          name = ?,
          phone = ?,
          email = ?,
          urgent_contact = ?,
          convention = ?,
          insurances = ?,
          reason_for_visit = ?,
          medical_history = ?,
          year_of_birth = ?,
          date_of_birth = ?,
          consultation_price = ?,
          status = ?,
          updated_at = ?,
          hasBeenEdited = ?
        WHERE id = ?
      `);
      const year = patient.date_of_birth ? parseInt(patient.date_of_birth.split('-')[0]) : patient.year_of_birth;
      const result = stmt.run(
        patient.name,
        patient.phone,
        patient.email,
        patient.urgent_contact,
        patient.convention,
        patient.insurances,
        patient.reason_for_visit,
        patient.medical_history,
        year,
        patient.date_of_birth || null,
        patient.consultation_price || null,
        patient.status || 'waiting',
        patient.updated_at || new Date().toISOString(),
        patient.hasBeenEdited ? 1 : 0,
        patient.id
      );

      // Automatically create backup of the updated patient
      try {
        const backupResult = await this.updatePatientBackup(patient);
        if (backupResult.success) {
          console.log(`Patient backup updated successfully: ${backupResult.filePath}`);
        } else {
          console.log(`Patient backup update failed: ${backupResult.reason || backupResult.error}`);
        }
      } catch (backupError) {
        console.error('Error during automatic patient backup update:', backupError);
        // Don't throw error here to avoid breaking the main operation
      }

      return { changes: result.changes };
    } catch (error) {
      console.error('Error updating patient:', error);
      throw error;
    }
  }

  async updateAppointment(appointment) {
    try {
      const stmt = this.db.prepare(`
        UPDATE appointments SET
          patient_id = ?,
          patient_name = ?,
          appointment_date = ?,
          appointment_time = ?,
          reason = ?,
          status = ?,
          created_at = ?,
          appointment_reason = ?,
          appointment_context = ?
        WHERE id = ?
      `);
      stmt.run(
        appointment.patient_id,
        appointment.patient_name,
        appointment.appointment_date,
        appointment.appointment_time,
        appointment.reason,
        appointment.status,
        appointment.created_at,
        appointment.appointment_reason || null,
        appointment.appointment_context || null,
        appointment.id
      );
      return { success: true };
    } catch (error) {
      console.error('Error updating appointment:', error);
      throw error;
    }
  }

  async clearMessages() {
    try {
      const stmt = this.db.prepare('DELETE FROM messages');
      stmt.run();
      return { success: true };
    } catch (error) {
      console.error('Error clearing messages:', error);
      throw error;
    }
  }

  async clearOldMessages() {
    try {
      // Keep only messages from today (UTC)
      const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
      const stmt = this.db.prepare(`DELETE FROM messages WHERE DATE(timestamp) < ?`);
      stmt.run(today);
      return { success: true };
    } catch (error) {
      console.error('Error clearing old messages:', error);
      throw error;
    }
  }

  async deleteAllPatients() {
    try {
      // Delete all patients from the patients table
      const stmt = this.db.prepare('DELETE FROM patients');
      const result = stmt.run();
      console.log(`Deleted ${result.changes} patients from database`);
      return { success: true, deletedCount: result.changes };
    } catch (error) {
      console.error('Error deleting all patients:', error);
      throw error;
    }
  }

  async deletePatient(patientId) {
    try {
      // Delete all appointments for this patient first
      const deleteAppointmentsStmt = this.db.prepare('DELETE FROM appointments WHERE patient_id = ?');
      const appointmentsResult = deleteAppointmentsStmt.run(patientId);
      console.log(`Deleted ${appointmentsResult.changes} appointments for patient ${patientId}`);

      // Delete the patient
      const deletePatientStmt = this.db.prepare('DELETE FROM patients WHERE id = ?');
      const patientResult = deletePatientStmt.run(patientId);
      console.log(`Deleted patient ${patientId}, changes: ${patientResult.changes}`);
      
      return { 
        success: true, 
        deletedPatient: patientResult.changes,
        deletedAppointments: appointmentsResult.changes
      };
    } catch (error) {
      console.error('Error deleting patient:', error);
      throw error;
    }
  }

  // First-time patient detection methods
  async addFirstTimePatient(firstTimePatient) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO first_time_patients (
          appointment_id, patient_name, appointment_date, appointment_time,
          reason, phone, email, date_of_birth, detection_date, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const result = stmt.run(
        firstTimePatient.appointment_id,
        firstTimePatient.patient_name,
        firstTimePatient.appointment_date,
        firstTimePatient.appointment_time,
        firstTimePatient.reason || null,
        firstTimePatient.phone || null,
        firstTimePatient.email || null,
        firstTimePatient.date_of_birth || null,
        firstTimePatient.detection_date || new Date().toISOString(),
        firstTimePatient.status || 'detected',
        new Date().toISOString(),
        new Date().toISOString()
      );

      return { id: result.lastInsertRowid };
    } catch (error) {
      console.error('Error adding first-time patient:', error);
      throw error;
    }
  }

  async getFirstTimePatients(status = null) {
    try {
      let sql = 'SELECT * FROM first_time_patients ORDER BY detection_date DESC';
      let params = [];
      
      if (status) {
        sql = 'SELECT * FROM first_time_patients WHERE status = ? ORDER BY detection_date DESC';
        params = [status];
      }
      
      const stmt = this.db.prepare(sql);
      return stmt.all(params);
    } catch (error) {
      console.error('Error getting first-time patients:', error);
      throw error;
    }
  }

  async updateFirstTimePatientStatus(id, status, processedBy = null, notes = null) {
    try {
      const stmt = this.db.prepare(`
        UPDATE first_time_patients 
        SET status = ?, processed_date = ?, processed_by = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `);
      
      const processedDate = status === 'processed' ? new Date().toISOString() : null;
      const result = stmt.run(status, processedDate, processedBy, notes, new Date().toISOString(), id);
      
      return { updated: result.changes > 0 };
    } catch (error) {
      console.error('Error updating first-time patient status:', error);
      throw error;
    }
  }

  async deleteFirstTimePatient(id) {
    try {
      const stmt = this.db.prepare('DELETE FROM first_time_patients WHERE id = ?');
      const result = stmt.run(id);
      return { deleted: result.changes > 0 };
    } catch (error) {
      console.error('Error deleting first-time patient:', error);
      throw error;
    }
  }

  async isFirstTimePatientDetected(appointmentId) {
    try {
      const stmt = this.db.prepare('SELECT id FROM first_time_patients WHERE appointment_id = ?');
      const result = stmt.get(appointmentId);
      return !!result;
    } catch (error) {
      console.error('Error checking first-time patient detection:', error);
      throw error;
    }
  }

  async getFirstTimePatientStats() {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'detected' THEN 1 ELSE 0 END) as detected,
          SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) as processed,
          SUM(CASE WHEN status = 'ignored' THEN 1 ELSE 0 END) as ignored
        FROM first_time_patients
      `);
      return stmt.get();
    } catch (error) {
      console.error('Error getting first-time patient stats:', error);
      throw error;
    }
  }

  // Add or update a recent patient, and prune to last 5
  async addRecentPatient(patient) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT OR REPLACE INTO recent_patients (id, name, phone, date_of_birth, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      patient.id,
      patient.name,
      patient.phone,
      patient.date_of_birth,
      now
    );
    await this.pruneRecentPatients(5);
  }

  // Get recent patients, most recent first
  async getRecentPatients() {
    return this.db.prepare(`
      SELECT * FROM recent_patients ORDER BY updated_at DESC LIMIT 5
    `).all();
  }

  // Prune to last N recent patients
  async pruneRecentPatients(maxCount) {
    const idsToKeep = this.db.prepare(`
      SELECT id FROM recent_patients ORDER BY updated_at DESC LIMIT ?
    `).all(maxCount).map(r => r.id);
    if (idsToKeep.length === 0) return;
    const placeholders = idsToKeep.map(() => '?').join(',');
    this.db.prepare(`
      DELETE FROM recent_patients WHERE id NOT IN (${placeholders})
    `).run(...idsToKeep);
  }
}

module.exports = DatabaseManager;