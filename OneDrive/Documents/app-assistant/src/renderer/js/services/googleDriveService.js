class GoogleDriveService {
  constructor() {
    // Load credentials securely from main process via IPC (not bundled in renderer)
    this.credentials = null;
    this.loadCredentials = async () => {
      if (this.credentials) return this.credentials;
      const defaults = {
        client_id: '',
        client_secret: '',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        redirect_uris: ['http://localhost:3000/oauth/callback']
      };
      try {
        const cfg = await (window.electronAPI?.getGoogleDriveConfig?.() || Promise.resolve(defaults));
        // Normalize shape
        this.credentials = {
          client_id: cfg.client_id || defaults.client_id,
          client_secret: cfg.client_secret || defaults.client_secret,
          auth_uri: cfg.auth_uri || defaults.auth_uri,
          token_uri: cfg.token_uri || defaults.token_uri,
          redirect_uris: Array.isArray(cfg.redirect_uris) && cfg.redirect_uris.length ? cfg.redirect_uris : defaults.redirect_uris
        };
      } catch (_) {
        this.credentials = defaults;
      }
      return this.credentials;
    };
    
    this.scopes = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      // Add scopes to fetch the authenticated user's email
      'openid',
      'https://www.googleapis.com/auth/userinfo.email'
    ];
    
    this.isConnected = false;
    this.accessToken = null;
    this.refreshToken = null;
    this.folderId = null;

    // In-memory per-filename locks to prevent concurrent duplicate creates
    this.fileLocks = new Map(); // key: fileName, value: Promise currently running

    // Cache for Drive file IDs by fileName to avoid name-query races
    try {
      const persisted = localStorage.getItem('gdriveFileIdCache');
      this.fileIdCache = persisted ? JSON.parse(persisted) : {};
    } catch (e) {
      console.warn('[DEBUG] Failed to parse gdriveFileIdCache from storage, resetting');
      this.fileIdCache = {};
    }
  }

  // Initialize Google Drive connection
  async initialize() {
    try {
      // Ensure credentials are loaded
      await this.loadCredentials();
      // Check if we have stored tokens
      const storedTokens = localStorage.getItem('googleDriveTokens');
      if (storedTokens) {
        const tokens = JSON.parse(storedTokens);
        this.accessToken = tokens.access_token;
        this.refreshToken = tokens.refresh_token;
        this.folderId = tokens.folder_id;
        
        // Verify if tokens are still valid
        if (await this.verifyToken()) {
          this.isConnected = true;
          
          // If we have valid tokens but no folder ID, try to create the folder
          if (!this.folderId) {
            console.log('[DEBUG] Valid tokens found but no folder ID, attempting to create folder');
            const folderResult = await this.createMedOpsFolder();
            if (folderResult.success) {
              this.folderId = folderResult.folderId;
              // Update stored tokens with folder ID
              tokens.folder_id = this.folderId;
              localStorage.setItem('googleDriveTokens', JSON.stringify(tokens));
            } else {
              console.log('[DEBUG] Failed to create folder:', folderResult.error);
            }
          }
          
          return { success: true, message: 'Already connected to Google Drive' };
        }
      }
      
      return { success: false, message: 'Not connected to Google Drive' };
    } catch (error) {
      console.error('Error initializing Google Drive service:', error);
      return { success: false, error: error.message };
    }
  }

  // Start OAuth 2.0 authentication flow
  async authenticate() {
    try {
      const creds = await this.loadCredentials();
      // Use Electron's IPC to handle OAuth flow
      const result = await window.electronAPI.googleDriveAuth({
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        auth_uri: creds.auth_uri,
        token_uri: creds.token_uri,
        redirect_uri: creds.redirect_uris[0],
        scopes: this.scopes
      });

      if (result.success) {
        this.accessToken = result.access_token;
        this.refreshToken = result.refresh_token;
        
        // Create MedOps folder in Google Drive
        const folderResult = await this.createMedOpsFolder();
        if (folderResult.success) {
          this.folderId = folderResult.folderId;
        }

        // Store tokens and folder ID
        const tokens = {
          access_token: this.accessToken,
          refresh_token: this.refreshToken,
          folder_id: this.folderId,
          expires_at: Date.now() + (result.expires_in * 1000)
        };
        localStorage.setItem('googleDriveTokens', JSON.stringify(tokens));
        // Mark service as connected after successful auth and token persistence
        this.isConnected = true;
        
        // Return success along with authenticated email if available
        return { success: true, email: result.email };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error during Google Drive authentication:', error);
      throw error;
    }
  }



  // Create MedOps folder in Google Drive
  async createMedOpsFolder() {
    try {
      // First check if a folder with this name already exists
      const existingFolder = await this.findFolderByName('MedOps Backup');
      if (existingFolder) {
        console.log('[DEBUG] Found existing MedOps Backup folder');
        return { success: true, folderId: existingFolder.id };
      }

      const response = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'MedOps Backup',
          mimeType: 'application/vnd.google-apps.folder',
          description: 'MedOps patient records and appointments backup'
        })
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message);
      }

      console.log('[DEBUG] Created new MedOps Backup folder');
      return { success: true, folderId: data.id };
    } catch (error) {
      console.error('Error creating MedOps folder:', error);
      return { success: false, error: error.message };
    }
  }

  // Find folder by name in Google Drive
  async findFolderByName(folderName) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      const data = await response.json();
      
      if (data.error) {
        console.error('[DEBUG] Google Drive API error:', data.error);
        return null;
      }

      return data.files.length > 0 ? data.files[0] : null;
    } catch (error) {
      console.error('Error finding folder by name:', error);
      return null;
    }
  }

  // Verify if access token is still valid
  async verifyToken() {
    try {
      // Must have an access token
      if (!this.accessToken) {
        console.log('[DEBUG] No access token available for verification');
        return false;
      }

      // 1) Prefer local expiry if available
      try {
        const stored = JSON.parse(localStorage.getItem('googleDriveTokens') || '{}');
        if (stored.expires_at && Date.now() < stored.expires_at - 60_000) { // 60s buffer
          return true;
        }
      } catch (_) {
        // ignore parse errors; fall back to remote check
      }

      // 2) Lightweight validation by hitting Drive "about" endpoint
      const aboutResp = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (aboutResp.ok) {
        return true;
      }

      // 3) If unauthorized/forbidden, attempt refresh
      if (aboutResp.status === 401 || aboutResp.status === 403) {
        const refreshed = await this.refreshAccessToken();
        return !!refreshed;
      }

      // Other non-OK statuses: treat as not verified but do not destroy tokens yet
      console.warn('[DEBUG] Token verify via Drive about returned status:', aboutResp.status);
      return false;
    } catch (error) {
      console.error('Error verifying token:', error);
      return false;
    }
  }

  // Refresh access token using refresh token
  async refreshAccessToken() {
    try {
      if (!this.refreshToken) {
        console.log('[DEBUG] No refresh token available');
        return false;
      }
      const creds = await this.loadCredentials();
      const response = await fetch(creds.token_uri, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: creds.client_id,
          client_secret: creds.client_secret,
          refresh_token: this.refreshToken,
          grant_type: 'refresh_token'
        })
      });

      const data = await response.json();
      
      if (data.error) {
        console.log('[DEBUG] Token refresh failed:', data.error);
        // Clear stored tokens if refresh fails
        localStorage.removeItem('googleDriveTokens');
        this.accessToken = null;
        this.refreshToken = null;
        this.folderId = null;
        this.isConnected = false;
        return false;
      }

      this.accessToken = data.access_token;
      
      // Update stored tokens
      const storedTokens = JSON.parse(localStorage.getItem('googleDriveTokens') || '{}');
      storedTokens.access_token = this.accessToken;
      storedTokens.expires_at = Date.now() + (data.expires_in * 1000);
      localStorage.setItem('googleDriveTokens', JSON.stringify(storedTokens));
      
      return true;
    } catch (error) {
      console.error('Error refreshing access token:', error);
      // Clear tokens on error
      localStorage.removeItem('googleDriveTokens');
      this.accessToken = null;
      this.refreshToken = null;
      this.folderId = null;
      this.isConnected = false;
      return false;
    }
  } // <--- Added missing closing brace here

  // Upload file to Google Drive
  async uploadFile(fileName, content, mimeType = 'application/json') {
    try {
      // Serialize all operations per fileName to eliminate race-created duplicates
      return await this.withFileLock(fileName, async () => {
      if (!this.isConnected || !this.accessToken) {
        console.log('[DEBUG] Not connected to Google Drive or no access token');
        return { success: false, error: 'Not connected to Google Drive' };
      }

      if (!this.folderId) {
        console.log('[DEBUG] No folder ID available');
        return { 
          success: false, 
          error: 'Google Drive folder not configured. Please reconnect to Google Drive or use the "Recreate Folder" button in Settings.' 
        };
      }

      // 1) Try to use cached fileId first to avoid name-query races
      const cachedId = this.fileIdCache[fileName];
      if (cachedId) {
        try {
          console.log('[DEBUG] Updating by cached fileId for', fileName, cachedId);
          const updated = await this.patchFileContent(cachedId, content, mimeType);
          if (updated.success) {
            // Best-effort duplicate cleanup after update
            await this.cleanupDuplicatesForName(fileName, cachedId);
            return updated;
          }
        } catch (e) {
          console.warn('[DEBUG] Cached fileId update failed, will fallback to name lookup', e);
        }
      }

      // 2) Name lookup (may find multiple). Prefer the most recent.
      const matches = await this.getFilesByName(fileName);
      if (matches.length > 0) {
        const primary = matches[0]; // already sorted by modifiedTime desc
        console.log('[DEBUG] Updating existing file via name lookup:', primary.id, 'matches:', matches.length);
        const updated = await this.patchFileContent(primary.id, content, mimeType);
        if (updated.success) {
          // Update cache
          this.fileIdCache[fileName] = primary.id;
          this.saveFileIdCache();
          // Remove older duplicates
          await this.cleanupDuplicatesForName(fileName, primary.id, matches.slice(1));
          return updated;
        }
      }

      // 3) Create new file
      console.log('[DEBUG] Creating new file');
      const metadata = {
        name: fileName,
        parents: [this.folderId],
        mimeType: mimeType
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([content], { type: mimeType }));

      const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: form
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message);
      }

      // Update cache with new id
      this.fileIdCache[fileName] = data.id;
      this.saveFileIdCache();

      // Final duplicate check (rare, but in case of external races)
      await this.cleanupDuplicatesForName(fileName, data.id);

      return { success: true, fileId: data.id, fileName: data.name };
      });
    } catch (error) {
      console.error('Error uploading file to Google Drive:', error);
      return { success: false, error: error.message };
    }
  }

  // Internal: update file content by id
  async patchFileContent(fileId, content, mimeType) {
    const contentResponse = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': mimeType
        },
        body: content
      }
    );

    if (!contentResponse.ok) {
      let msg = `HTTP ${contentResponse.status}`;
      try {
        const errorData = await contentResponse.json();
        msg = errorData.error?.message || msg;
      } catch (_) {}
      return { success: false, error: msg };
    }

    const data = await contentResponse.json();
    return { success: true, fileId: data.id, fileName: data.name };
  }

  // Internal: list all files matching name in the MedOps folder, sorted by modifiedTime desc
  async getFilesByName(fileName) {
    try {
      if (!this.folderId) return [];
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and '${this.folderId}' in parents and trashed=false&orderBy=modifiedTime desc`,
        {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${this.accessToken}` }
        }
      );
      const data = await response.json();
      if (data.error) {
        console.error('[DEBUG] getFilesByName error:', data.error);
        return [];
      }
      return Array.isArray(data.files) ? data.files : [];
    } catch (e) {
      console.error('[DEBUG] getFilesByName exception:', e);
      return [];
    }
  }

  // Internal: remove older duplicates for a given name, keeping keepId
  async cleanupDuplicatesForName(fileName, keepId, prelisted = null) {
    try {
      const files = prelisted || await this.getFilesByName(fileName);
      const toDelete = files.filter(f => f.id !== keepId);
      if (toDelete.length > 0) {
        console.log(`[DEBUG] Cleaning up ${toDelete.length} duplicate(s) for ${fileName}`);
        for (const f of toDelete) {
          await this.deleteFile(f.id);
        }
      }
    } catch (e) {
      console.warn('[DEBUG] cleanupDuplicatesForName failed:', e);
    }
  }

  // Internal: delete a Drive file by id
  async deleteFile(fileId) {
    try {
      const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });
      if (!resp.ok && resp.status !== 404) {
        console.warn('[DEBUG] deleteFile non-ok:', resp.status, resp.statusText);
      }
    } catch (e) {
      console.warn('[DEBUG] deleteFile exception:', e);
    }
  }

  // Internal: persist fileId cache
  saveFileIdCache() {
    try {
      localStorage.setItem('gdriveFileIdCache', JSON.stringify(this.fileIdCache));
    } catch (e) {
      console.warn('[DEBUG] Failed to persist gdriveFileIdCache:', e);
    }
  }

  // Internal: run a function with a per-filename lock to avoid concurrent creates
  async withFileLock(fileName, fn) {
    const existing = this.fileLocks.get(fileName);
    if (existing) {
      // Wait for the in-flight operation to finish, then run ours
      await existing.catch(() => {});
    }
    let resolveOuter;
    const p = new Promise((resolve) => { resolveOuter = resolve; });
    this.fileLocks.set(fileName, p);
    try {
      const result = await fn();
      resolveOuter();
      return result;
    } catch (e) {
      resolveOuter();
      throw e;
    } finally {
      this.fileLocks.delete(fileName);
    }
  }

  // Find file by name in MedOps folder
  async findFile(fileName) {
    try {
      if (!this.isConnected || !this.accessToken) {
        console.log('[DEBUG] Not connected to Google Drive or no access token');
        return null;
      }

      if (!this.folderId) {
        console.log('[DEBUG] No folder ID available for file search');
        console.log('[DEBUG] This usually means the folder creation failed during authentication');
        return null;
      }

      console.log('[DEBUG] Searching for file:', fileName, 'in folder:', this.folderId);

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and '${this.folderId}' in parents and trashed=false`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      const data = await response.json();
      
      if (data.error) {
        console.error('[DEBUG] Google Drive API error:', data.error);
        return null;
      }

      console.log('[DEBUG] Found files:', data.files.length, 'for filename:', fileName);
      
      if (data.files.length > 0) {
        console.log('[DEBUG] Returning existing file:', data.files[0].id);
        return data.files[0];
      } else {
        console.log('[DEBUG] No existing file found, will create new one');
        return null;
      }
    } catch (error) {
      console.error('Error finding file:', error);
      return null;
    }
  }

  // Download file from Google Drive
  async downloadFile(fileId) {
    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();
      return { success: true, content };
    } catch (error) {
      console.error('Error downloading file from Google Drive:', error);
      return { success: false, error: error.message };
    }
  }

  // List all files in MedOps folder
  async listFiles() {
    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${this.folderId}' in parents and trashed=false&orderBy=modifiedTime desc&fields=files(id,name,mimeType,modifiedTime,createdTime),nextPageToken`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message);
      }

      return { success: true, files: data.files };
    } catch (error) {
      console.error('Error listing files from Google Drive:', error);
      return { success: false, error: error.message };
    }
  }

  // Backup patient to Google Drive with consistent filename
  async backupPatient(patient) {
    try {
      // Use consistent filename without timestamp to avoid duplicates
      const fileName = `patient_${patient.id}.json`;
      const content = JSON.stringify({
        ...patient,
        backupCreatedAt: new Date().toISOString(),
        backupVersion: '1.0',
        backupType: 'google_drive',
        lastModified: new Date().toISOString()
      }, null, 2);

      const result = await this.uploadFile(fileName, content);
      return result;
    } catch (error) {
      console.error('Error backing up patient to Google Drive:', error);
      return { success: false, error: error.message };
    }
  }

  // Backup all patients to Google Drive
  async backupAllPatients(patients) {
    try {
      const results = [];
      
      for (const patient of patients) {
        const result = await this.backupPatient(patient);
        results.push({ patientId: patient.id, ...result });
      }

      return { success: true, results };
    } catch (error) {
      console.error('Error backing up all patients to Google Drive:', error);
      return { success: false, error: error.message };
    }
  }

  // Manual backup appointments to Google Drive
  async backupAllAppointments(appointments) {
    try {
      console.log('Manually backing up appointments to Google Drive');
      // Use consistent filename without timestamp to avoid duplicates
      const fileName = `appointments.json`;
      const content = JSON.stringify({
        appointments,
        backupCreatedAt: new Date().toISOString(),
        backupVersion: '1.0',
        backupType: 'google_drive_appointments_manual',
        lastModified: new Date().toISOString()
      }, null, 2);

      const result = await this.uploadFile(fileName, content);
      
      if (result.success) {
        console.log('Manual backup appointments successful');
      } else {
        console.error('Manual backup appointments failed:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('Manual backup appointments error:', error);
      return { success: false, error: error.message };
    }
  }

  // Restore patient from Google Drive
  async restorePatient(fileId) {
    try {
      const result = await this.downloadFile(fileId);
      if (!result.success) {
        return result;
      }

      const patient = JSON.parse(result.content);
      return { success: true, patient };
    } catch (error) {
      console.error('Error restoring patient from Google Drive:', error);
      return { success: false, error: error.message };
    }
  }

  // Restore all patients from Google Drive with deduplication
  async restoreAllPatients() {
    try {
      const listResult = await this.listFiles();
      if (!listResult.success) {
        return listResult;
      }

      // Filter patient files
      const patientFiles = listResult.files.filter(file =>
        file.name.startsWith('patient_') && file.name.endsWith('.json')
      );

      // Robust dedup: read patient.id from file content; fallback to filename parsing
      const byPatientId = new Map(); // patientId -> { file, time }
      for (const file of patientFiles) {
        let patientIdFromContent = null;
        try {
          const dl = await this.downloadFile(file.id);
          if (dl.success) {
            const obj = JSON.parse(dl.content);
            if (obj && typeof obj === 'object' && obj.id) {
              patientIdFromContent = obj.id;
            }
          }
        } catch (e) {
          console.warn('[DEBUG] Failed to read patient file for dedup, will fallback to filename:', file.name, e);
        }

        const fallbackId = file.name.replace('patient_', '').replace('.json', '');
        const key = patientIdFromContent || fallbackId;
        const t = new Date(file.modifiedTime || file.createdTime).getTime() || 0;

        const existing = byPatientId.get(key);
        if (!existing || t > existing.time) {
          byPatientId.set(key, { file, time: t });
        }
      }

      const latestFiles = Array.from(byPatientId.values()).map(v => v.file);

      console.log(`[DEBUG] Restoring ${latestFiles.length} unique patients from ${patientFiles.length} total files`);

      const results = [];
      for (const file of latestFiles) {
        const result = await this.restorePatient(file.id);
        results.push({ fileName: file.name, ...result });
      }

      return { success: true, results };
    } catch (error) {
      console.error('Error restoring all patients from Google Drive:', error);
      return { success: false, error: error.message };
    }
  }

  // Optional admin utility: cleanup duplicates across Drive by filename
  async cleanupDriveDuplicates() {
    try {
      const listResult = await this.listFiles();
      if (!listResult.success) return listResult;

      const byName = new Map();
      for (const f of listResult.files) {
        const arr = byName.get(f.name) || [];
        arr.push(f);
        byName.set(f.name, arr);
      }

      const summary = [];
      for (const [name, files] of byName.entries()) {
        if (files.length <= 1) continue;
        const sorted = files.sort((a, b) => {
          const aTime = new Date(a.modifiedTime || a.createdTime);
          const bTime = new Date(b.modifiedTime || b.createdTime);
          return bTime - aTime;
        });
        const keep = sorted[0];
        const toDelete = sorted.slice(1);
        await this.cleanupDuplicatesForName(name, keep.id, toDelete);
        summary.push({ name, kept: keep.id, deleted: toDelete.map(x => x.id) });
      }

      return { success: true, summary };
    } catch (e) {
      console.error('[DEBUG] cleanupDriveDuplicates failed:', e);
      return { success: false, error: e.message };
    }
  }

  // Restore appointments from Google Drive with deduplication
  async restoreAppointments() {
    try {
      const listResult = await this.listFiles();
      if (!listResult.success) {
        return listResult;
      }

      // Find the latest appointments file
      const appointmentFiles = listResult.files.filter(file => 
        file.name === 'appointments.json'
      );

      console.log('[DEBUG] Found appointment files:', appointmentFiles.length);

      if (appointmentFiles.length === 0) {
        return { success: false, error: 'No appointments file found' };
      }

      // If multiple files exist, keep the most recent one
      let latestFile = appointmentFiles[0];
      if (appointmentFiles.length > 1) {
        latestFile = appointmentFiles.sort((a, b) => {
          const aTime = new Date(a.modifiedTime || a.createdTime);
          const bTime = new Date(b.modifiedTime || b.createdTime);
          return bTime - aTime; // Most recent first
        })[0];
        console.log(`[DEBUG] Found ${appointmentFiles.length} appointment files, using most recent: ${latestFile.name}`);
      }

      console.log('[DEBUG] Downloading appointments file:', latestFile.id);
      const result = await this.downloadFile(latestFile.id);
      if (!result.success) {
        return result;
      }

      console.log('[DEBUG] Downloaded appointments content length:', result.content.length);
      const data = JSON.parse(result.content);
      console.log('[DEBUG] Parsed appointments data structure:', Object.keys(data));
      console.log('[DEBUG] Number of appointments found:', data.appointments ? data.appointments.length : 'undefined');
      
      if (data.appointments && data.appointments.length > 0) {
        console.log('[DEBUG] Sample appointment from backup:', data.appointments[0]);
      }
      
      return { success: true, appointments: data.appointments };
    } catch (error) {
      console.error('Error restoring appointments from Google Drive:', error);
      return { success: false, error: error.message };
    }
  }

  // Restore settings from Google Drive with deduplication
  async restoreSettings() {
    try {
      const listResult = await this.listFiles();
      if (!listResult.success) {
        return listResult;
      }

      // Find the latest settings file
      const settingsFiles = listResult.files.filter(file => 
        file.name === 'settings.json'
      );

      if (settingsFiles.length === 0) {
        return { success: false, error: 'No settings file found' };
      }

      // If multiple files exist, keep the most recent one
      let latestFile = settingsFiles[0];
      if (settingsFiles.length > 1) {
        latestFile = settingsFiles.sort((a, b) => {
          const aTime = new Date(a.modifiedTime || a.createdTime);
          const bTime = new Date(b.modifiedTime || b.createdTime);
          return bTime - aTime; // Most recent first
        })[0];
        console.log(`[DEBUG] Found ${settingsFiles.length} settings files, using most recent: ${latestFile.name}`);
      }

      const result = await this.downloadFile(latestFile.id);
      if (!result.success) {
        return result;
      }

      const data = JSON.parse(result.content);
      // Accept both wrapped format { settings: {...} } and plain settings object
      const settings = (data && typeof data === 'object' && data.settings) ? data.settings : data;
      return { success: true, settings };
    } catch (error) {
      console.error('Error restoring settings from Google Drive:', error);
      return { success: false, error: error.message };
    }
  }

  // Disconnect from Google Drive
  disconnect() {
    this.isConnected = false;
    this.accessToken = null;
    this.refreshToken = null;
    this.folderId = null;
    localStorage.removeItem('googleDriveTokens');
  }

  // Get connection status
  getStatus() {
    return {
      isConnected: this.isConnected,
      folderId: this.folderId,
      hasStoredTokens: !!localStorage.getItem('googleDriveTokens')
    };
  }

  // Manually recreate the MedOps folder (useful for troubleshooting)
  async recreateFolder() {
    try {
      if (!this.isConnected || !this.accessToken) {
        return { success: false, error: 'Not connected to Google Drive' };
      }

      console.log('[DEBUG] Manually recreating MedOps folder');
      const folderResult = await this.createMedOpsFolder();
      
      if (folderResult.success) {
        this.folderId = folderResult.folderId;
        
        // Update stored tokens with new folder ID
        const storedTokens = JSON.parse(localStorage.getItem('googleDriveTokens') || '{}');
        storedTokens.folder_id = this.folderId;
        localStorage.setItem('googleDriveTokens', JSON.stringify(storedTokens));
        
        return { success: true, folderId: this.folderId };
      } else {
        return folderResult;
      }
    } catch (error) {
      console.error('Error recreating folder:', error);
      return { success: false, error: error.message };
    }
  }

  // Clean up duplicate files in Google Drive
  async cleanupDuplicateFiles() {
    try {
      const listResult = await this.listFiles();
      if (!listResult.success) {
        return listResult;
      }

      const cleanupResults = {
        patients: { duplicates: 0, kept: 0, deleted: 0 },
        appointments: { duplicates: 0, kept: 0, deleted: 0 },
        settings: { duplicates: 0, kept: 0, deleted: 0 }
      };

      // Group files by type and patient ID
      const patientFiles = listResult.files.filter(file => 
        file.name.startsWith('patient_') && file.name.endsWith('.json')
      );
      const appointmentFiles = listResult.files.filter(file => 
        file.name === 'appointments.json'
      );
      const settingsFiles = listResult.files.filter(file => 
        file.name === 'settings.json'
      );

      // Clean up patient duplicates
      const patientGroups = {};
      for (const file of patientFiles) {
        const patientId = file.name.replace('patient_', '').replace('.json', '');
        if (!patientGroups[patientId]) {
          patientGroups[patientId] = [];
        }
        patientGroups[patientId].push(file);
      }

      for (const [patientId, files] of Object.entries(patientGroups)) {
        if (files.length > 1) {
          // Sort by modification time, keep the most recent
          const sortedFiles = files.sort((a, b) => {
            const aTime = new Date(a.modifiedTime || a.createdTime);
            const bTime = new Date(b.modifiedTime || b.createdTime);
            return bTime - aTime; // Most recent first
          });
          
          // Delete all but the most recent file
          for (let i = 1; i < sortedFiles.length; i++) {
            try {
              await fetch(`https://www.googleapis.com/drive/v3/files/${sortedFiles[i].id}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${this.accessToken}`
                }
              });
              cleanupResults.patients.deleted++;
            } catch (error) {
              console.error(`Error deleting duplicate patient file ${sortedFiles[i].name}:`, error);
            }
          }
          cleanupResults.patients.duplicates++;
          cleanupResults.patients.kept++;
        } else {
          cleanupResults.patients.kept++;
        }
      }

      // Clean up appointment duplicates
      if (appointmentFiles.length > 1) {
        const sortedAppointmentFiles = appointmentFiles.sort((a, b) => {
          const aTime = new Date(a.modifiedTime || a.createdTime);
          const bTime = new Date(b.modifiedTime || b.createdTime);
          return bTime - aTime; // Most recent first
        });
        
        // Delete all but the most recent file
        for (let i = 1; i < sortedAppointmentFiles.length; i++) {
          try {
            await fetch(`https://www.googleapis.com/drive/v3/files/${sortedAppointmentFiles[i].id}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${this.accessToken}`
              }
            });
            cleanupResults.appointments.deleted++;
          } catch (error) {
            console.error(`Error deleting duplicate appointment file ${sortedAppointmentFiles[i].name}:`, error);
          }
        }
        cleanupResults.appointments.duplicates++;
        cleanupResults.appointments.kept++;
      } else if (appointmentFiles.length === 1) {
        cleanupResults.appointments.kept++;
      }

      // Clean up settings duplicates
      if (settingsFiles.length > 1) {
        const sortedSettingsFiles = settingsFiles.sort((a, b) => {
          const aTime = new Date(a.modifiedTime || a.createdTime);
          const bTime = new Date(b.modifiedTime || b.createdTime);
          return bTime - aTime; // Most recent first
        });
        
        // Delete all but the most recent file
        for (let i = 1; i < sortedSettingsFiles.length; i++) {
          try {
            await fetch(`https://www.googleapis.com/drive/v3/files/${sortedSettingsFiles[i].id}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${this.accessToken}`
              }
            });
            cleanupResults.settings.deleted++;
          } catch (error) {
            console.error(`Error deleting duplicate settings file ${sortedSettingsFiles[i].name}:`, error);
          }
        }
        cleanupResults.settings.duplicates++;
        cleanupResults.settings.kept++;
      } else if (settingsFiles.length === 1) {
        cleanupResults.settings.kept++;
      }

      return { success: true, cleanupResults };
    } catch (error) {
      console.error('Error cleaning up duplicate files:', error);
      return { success: false, error: error.message };
    }
  }

  // ===== AUTOMATIC BACKUP & SYNC FUNCTIONALITY =====

  // Enable automatic backup mode
  enableAutoBackup() {
    this.autoBackupEnabled = true;
    localStorage.setItem('googleDriveAutoBackup', 'true');
    console.log('Google Drive auto-backup enabled');
  }

  // Disable automatic backup mode
  disableAutoBackup() {
    this.autoBackupEnabled = false;
    localStorage.setItem('googleDriveAutoBackup', 'false');
    console.log('Google Drive auto-backup disabled');
  }

  // Check if auto-backup is enabled
  isAutoBackupEnabled() {
    if (this.autoBackupEnabled === undefined) {
      this.autoBackupEnabled = localStorage.getItem('googleDriveAutoBackup') === 'true';
    }
    return this.autoBackupEnabled && this.isConnected && this.accessToken && this.folderId;
  }

  // Automatic backup trigger for patient changes
  async autoBackupPatient(patient, action = 'update') {
    if (!this.isAutoBackupEnabled()) {
      return { success: false, reason: 'Auto-backup disabled or not properly connected' };
    }

    try {
      console.log(`Auto-backing up patient ${patient.id} (${action})`);
      const result = await this.backupPatient(patient);
      
      if (result.success) {
        console.log(`Auto-backup successful for patient ${patient.id}`);
      } else {
        console.error(`Auto-backup failed for patient ${patient.id}:`, result.error);
      }
      
      return result;
    } catch (error) {
      console.error('Auto-backup error:', error);
      return { success: false, error: error.message };
    }
  }

  // Automatic backup trigger for appointments
  async autoBackupAppointments(appointments, skipAutoBackupCheck = false) {
    if (!skipAutoBackupCheck && !this.isAutoBackupEnabled()) {
      return { success: false, reason: 'Auto-backup disabled or not properly connected' };
    }

    try {
      console.log('Auto-backing up appointments');
      // Use consistent filename without timestamp to avoid duplicates
      const fileName = `appointments.json`;
      const content = JSON.stringify({
        appointments,
        backupCreatedAt: new Date().toISOString(),
        backupVersion: '1.0',
        backupType: 'google_drive_appointments',
        lastModified: new Date().toISOString()
      }, null, 2);

      const result = await this.uploadFile(fileName, content);
      
      if (result.success) {
        console.log('Auto-backup appointments successful');
      } else {
        console.error('Auto-backup appointments failed:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('Auto-backup appointments error:', error);
      return { success: false, error: error.message };
    }
  }

  // Automatic backup trigger for settings
  async autoBackupSettings(settings, skipAutoBackupCheck = false) {
    if (!skipAutoBackupCheck && !this.isAutoBackupEnabled()) {
      return { success: false, reason: 'Auto-backup disabled or not properly connected' };
    }

    try {
      console.log('Auto-backing up settings');
      // Use consistent filename without timestamp to avoid duplicates
      const fileName = `settings.json`;
      const content = JSON.stringify({
        settings,
        backupCreatedAt: new Date().toISOString(),
        backupVersion: '1.0',
        backupType: 'google_drive_settings',
        lastModified: new Date().toISOString()
      }, null, 2);

      const result = await this.uploadFile(fileName, content);
      
      if (result.success) {
        console.log('Auto-backup settings successful');
      } else {
        console.error('Auto-backup settings failed:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('Auto-backup settings error:', error);
      return { success: false, error: error.message };
    }
  }

  // Full system backup (patients + appointments + settings)
  async autoBackupFullSystem(patients, appointments, settings) {
    if (!this.isAutoBackupEnabled()) {
      return { success: false, reason: 'Auto-backup disabled or not properly connected' };
    }

    try {
      console.log('Starting full system auto-backup');
      const results = {
        patients: [],
        appointments: null,
        settings: null
      };

      // Backup all patients
      for (const patient of patients) {
        const result = await this.autoBackupPatient(patient, 'full_backup');
        results.patients.push({ patientId: patient.id, ...result });
      }

      // Backup appointments
      results.appointments = await this.autoBackupAppointments(appointments);

      // Backup settings
      results.settings = await this.autoBackupSettings(settings);

      console.log('Full system auto-backup completed');
      return { success: true, results };
    } catch (error) {
      console.error('Full system auto-backup error:', error);
      return { success: false, error: error.message };
    }
  }

  // Scheduled backup (runs periodically)
  async scheduledBackup() {
    if (!this.isAutoBackupEnabled()) {
      console.log('[DEBUG] Scheduled backup skipped - auto-backup disabled or not properly connected');
      return { success: false, reason: 'Auto-backup disabled or not properly connected' };
    }

    try {
      console.log('Running scheduled backup');
      
      // Get all data from the application
      const patients = await window.electronAPI.getAllPatients();
      const appointments = await window.electronAPI.getAppointments();
      const settings = await window.electronAPI.getSettings();

      const result = await this.autoBackupFullSystem(patients, appointments, settings);
      
      if (result.success) {
        console.log('Scheduled backup completed successfully');
      } else {
        console.error('Scheduled backup failed:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('Scheduled backup error:', error);
      return { success: false, error: error.message };
    }
  }

  // Initialize auto-backup system
  async initializeAutoBackup() {
    try {
      // Check if auto-backup is enabled and properly connected
      if (this.isAutoBackupEnabled()) {
        console.log('Initializing Google Drive auto-backup system');
        
        // Set up scheduled backup (every 15 minutes)
        this.scheduledBackupInterval = setInterval(() => {
          this.scheduledBackup();
        }, 15 * 60 * 1000); // 15 minutes
        
        // Run initial backup
        setTimeout(() => {
          this.scheduledBackup();
        }, 5000); // Run after 5 seconds
        
        console.log('Google Drive auto-backup system initialized');
      } else {
        console.log('[DEBUG] Auto-backup initialization skipped - not enabled or not properly connected');
      }
    } catch (error) {
      console.error('Error initializing auto-backup:', error);
    }
  }

  // Cleanup auto-backup system
  cleanupAutoBackup() {
    if (this.scheduledBackupInterval) {
      clearInterval(this.scheduledBackupInterval);
      this.scheduledBackupInterval = null;
      console.log('Google Drive auto-backup system cleaned up');
    }
  }

  // Enhanced disconnect with cleanup
  disconnect() {
    this.isConnected = false;
    this.accessToken = null;
    this.refreshToken = null;
    this.folderId = null;
    this.cleanupAutoBackup();
    localStorage.removeItem('googleDriveTokens');
    localStorage.removeItem('googleDriveAutoBackup');
  }
}

export default new GoogleDriveService(); 