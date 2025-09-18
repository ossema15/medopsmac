import React, { useState, useEffect, useRef } from 'react';

import { useConfirm } from '../context/ConfirmContext';
import { useTranslation } from 'react-i18next';
// Electron APIs (shell, clipboard) when available
const { shell, clipboard } = window.require ? window.require('electron') : { shell: null, clipboard: null };
import realTimeUpdateService from '../services/realTimeUpdateService';
import googleDriveService from '../services/googleDriveService';

// Toggle switch styles
const toggleStyles = `
  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 60px;
    height: 34px;
  }
  
  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  
  .toggle-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #ccc;
    transition: .4s;
    border-radius: 34px;
  }
  
  .toggle-slider:before {
    position: absolute;
    content: "";
    height: 26px;
    width: 26px;
    left: 4px;
    bottom: 4px;
    background-color: white;
    transition: .4s;
    border-radius: 50%;
  }
  
  input:checked + .toggle-slider {
    background-color: #667eea;
  }
  
  input:focus + .toggle-slider {
    box-shadow: 0 0 1px #667eea;
  }
  
  input:checked + .toggle-slider:before {
    transform: translateX(26px);
  }
`;

function Settings({ onSettingsUpdate }) {
  const { t, i18n } = useTranslation();
  const confirm = useConfirm();
  // Determine initial connection status (fallback to 'disconnected'; we'll sync from main shortly)
  const getInitialConnStatus = () => {
    try {
      const s = realTimeUpdateService.getConnectionState && realTimeUpdateService.getConnectionState();
      const st = s?.state;
      if (st === 'connected' || st === 'CONNECTED') return 'connected';
      if (st === 'connecting' || st === 'CONNECTING' || st === 'reconnecting' || st === 'RECONNECTING') return 'connecting';
      return 'disconnected';
    } catch (_) {
      return 'disconnected';
    }
  };

  const [settings, setSettings] = useState({
    language: 'fr',
    country: 'TN',
    communication_mode: 'wifi',
    doctor_ip: '',
    backup_path: '',
    notification_sounds_enabled: true,
    auto_backup_enabled: true, // Added for auto-backup toggle
    licence_key: '',
    machine_id: '',
    // Appointments scheduling defaults
    appointment_start_time: '09:00',
    appointment_end_time: '17:00',
    appointment_slot_minutes: '15'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(getInitialConnStatus());

  const [debugLogs, setDebugLogs] = useState([]);
  const [retrying, setRetrying] = useState(false);
  const retryingRef = useRef(false); // Use ref for logic
  const [retryCount, setRetryCount] = useState(0);
  const retryTimerRef = useRef(null);
  const maxRetries = 120; // 10 minutes at 5s interval
  // Clear retry timer helper
  const clearRetryTimer = () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  // Appointments settings handlers: update state, persist, and notify
  const persistAndNotifySettings = async (updated) => {
    if (window?.electronAPI?.updateSettings) {
      const stringified = {};
      for (const [k, v] of Object.entries(updated)) {
        if (typeof v === 'boolean') stringified[k] = v ? 'true' : 'false';
        else if (v === null || v === undefined) stringified[k] = '';
        else stringified[k] = v.toString();
      }
      await window.electronAPI.updateSettings(stringified);
      window.dispatchEvent(new CustomEvent('app-settings-updated', { detail: updated }));
    }
  };

  const handleAppointmentStartTimeChange = async (e) => {
    const value = e.target.value; // format HH:MM
    const updated = { ...settings, appointment_start_time: value };
    setSettings((prev) => ({ ...prev, appointment_start_time: value }));
    try { await persistAndNotifySettings(updated); } catch (err) { console.error('[Settings] Failed to save appointment_start_time:', err); }
  };

  const handleAppointmentEndTimeChange = async (e) => {
    const value = e.target.value; // format HH:MM
    const updated = { ...settings, appointment_end_time: value };
    setSettings((prev) => ({ ...prev, appointment_end_time: value }));
    try { await persistAndNotifySettings(updated); } catch (err) { console.error('[Settings] Failed to save appointment_end_time:', err); }
  };

  const handleAppointmentSlotMinutesChange = async (e) => {
    const value = e.target.value; // string minutes
    const updated = { ...settings, appointment_slot_minutes: value };
    setSettings((prev) => ({ ...prev, appointment_slot_minutes: value }));
    try { await persistAndNotifySettings(updated); } catch (err) { console.error('[Settings] Failed to save appointment_slot_minutes:', err); }
  };

  // Country change handler: updates state and persists to settings
  const handleCountryChange = async (e) => {
    const country = e.target.value;
    try {
      // Update local state
      setSettings((prev) => ({ ...prev, country }));

      // Persist to backend settings
      if (window?.electronAPI?.updateSettings) {
        const updated = { ...settings, country };
        const stringified = {};
        for (const [k, v] of Object.entries(updated)) {
          if (typeof v === 'boolean') stringified[k] = v ? 'true' : 'false';
          else if (v === null || v === undefined) stringified[k] = '';
          else stringified[k] = v.toString();
        }
        await window.electronAPI.updateSettings(stringified);
        // Notify other parts of the app (same window) about settings change
        window.dispatchEvent(new CustomEvent('app-settings-updated', { detail: updated }));
      }
    } catch (err) {
      console.error('[Settings] Failed to change country:', err);
    }
  };

  // Language change handler: updates i18n, state, and persists to settings
  const handleLanguageChange = async (e) => {
    const lng = e.target.value;
    try {
      // Update UI language immediately
      if (i18n && typeof i18n.changeLanguage === 'function') {
        await i18n.changeLanguage(lng);
      }

      // Update local state
      setSettings((prev) => ({ ...prev, language: lng }));

      // Persist to backend settings
      if (window?.electronAPI?.updateSettings) {
        const updated = { ...settings, language: lng };
        const stringified = {};
        for (const [k, v] of Object.entries(updated)) {
          if (typeof v === 'boolean') stringified[k] = v ? 'true' : 'false';
          else if (v === null || v === undefined) stringified[k] = '';
          else stringified[k] = v.toString();
        }
        await window.electronAPI.updateSettings(stringified);
        // Notify other parts of the app (same window) about settings change
        window.dispatchEvent(new CustomEvent('app-settings-updated', { detail: updated }));
      }
    } catch (err) {
      console.error('[Settings] Failed to change language:', err);
    }
  };
  // Add doctorPresence state
  const [doctorPresence, setDoctorPresence] = useState({ backend: false, frontend: false, loggedIn: false });
  
  // Add state to track toggle saving
  const [toggleSaving, setToggleSaving] = useState(false);
  
  // Add separate state variables for toggle visual states to make them independent
  const [notificationSoundsEnabled, setNotificationSoundsEnabled] = useState(true);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  
  // Add connection status management with debouncing
  const lastStatusUpdateRef = useRef(0);
  const statusUpdateTimeoutRef = useRef(null);
  const connectionStatusRef = useRef(getInitialConnStatus());
  
  // Helper: force-sync connection status from the main process (single source of truth)
  const syncConnFromService = async () => {
    try {
      if (window?.electronAPI?.getConnectionStatus) {
        const st = await window.electronAPI.getConnectionStatus();
        if (st === 'connected') updateConnectionStatus('connected', 'electronAPI');
        else if (st === 'connecting' || st === 'reconnecting') updateConnectionStatus('connecting', 'electronAPI');
        else updateConnectionStatus('disconnected', 'electronAPI');
      }
    } catch (e) {
      // ignore
    }
  };

  // Re-sync connection status when the window gains focus or tab becomes visible
  useEffect(() => {
    const handleFocus = () => { syncConnFromService(); };
    const handleVisibility = () => { if (!document.hidden) syncConnFromService(); };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    // Also perform an immediate sync on mount from main
    syncConnFromService();
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);
  
  // Live-subscribe to connection status updates from main process via preload API
  useEffect(() => {
    if (!window?.electronAPI?.onConnectionStatus) return;
    const handler = (status) => {
      if (status === 'connected') updateConnectionStatus('connected', 'electronAPI');
      else if (status === 'connecting' || status === 'reconnecting') updateConnectionStatus('connecting', 'electronAPI');
      else updateConnectionStatus('disconnected', 'electronAPI');
    };
    window.electronAPI.onConnectionStatus(handler);
    // Initial sync
    syncConnFromService();
    return () => {
      try { window?.electronAPI?.removeAllListeners && window.electronAPI.removeAllListeners('connection-status'); } catch (_) {}
    };
  }, []);
  
  // Cross-Machine Communication states
  const [crossMachineExpanded, setCrossMachineExpanded] = useState(false);
  const [connectedMachines, setConnectedMachines] = useState([]);
  const [crossMachineMessages, setCrossMachineMessages] = useState([]);
  const [selectedMachine, setSelectedMachine] = useState('');
  const [messageText, setMessageText] = useState('');
  const [fileTransferRequests, setFileTransferRequests] = useState([]);
  const [machineStatus, setMachineStatus] = useState('online');
  
  // Google Drive states
  const [googleDriveConnected, setGoogleDriveConnected] = useState(false);
  const [googleDriveLoading, setGoogleDriveLoading] = useState(false);
  const [googleDriveStatus, setGoogleDriveStatus] = useState('');
  const [googleDriveAutoBackupEnabled, setGoogleDriveAutoBackupEnabled] = useState(false);
  // Copy-to-clipboard feedback
  const [machineIdCopyStatus, setMachineIdCopyStatus] = useState('');
  
  // Licensing states
  const [hwid, setHwid] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState({ loading: true, activated: false, expired: false, daysLeft: 0, error: null });
  const [hwidCopyStatus, setHwidCopyStatus] = useState('');

  // Helper to mask machine ID for display
  const maskMachineId = (id) => {
    if (!id) return '';
    const tail = id.slice(-4);
    return `***${tail ? tail : ''}`; // Show last 4 if available
  };

  // Initialize Google Drive status on mount
  useEffect(() => {
    (async () => {
      try {
        await googleDriveService.initialize();
        if (googleDriveService.getStatus) {
          const s = await googleDriveService.getStatus();
          setGoogleDriveConnected(!!(s && (s.isConnected || s.connected)));
          setGoogleDriveStatus(
            s && (s.isConnected || s.connected) ? 'Connected to Google Drive' : 'Not connected'
          );
          // Sync initial auto-backup toggle from service/localStorage
          if (googleDriveService?.isAutoBackupEnabled) {
            try {
              setGoogleDriveAutoBackupEnabled(!!googleDriveService.isAutoBackupEnabled());
            } catch (_) {}
          }
        }
      } catch (e) {
        console.error('[Settings] Google Drive init error:', e);
        setGoogleDriveConnected(false);
        setGoogleDriveStatus('Not connected');
      }
    })();
  }, []);

  // Licensing: load HWID and license status
  useEffect(() => {
    (async () => {
      try {
        // Prefill from settings if present
        if (settings?.licence_key) setLicenseKey(settings.licence_key);
        if (window?.electronAPI?.getHardwareId) {
          const res = await window.electronAPI.getHardwareId();
          if (res && res.hwid) setHwid(res.hwid);
        }
        if (window?.electronAPI?.getLicenseStatus) {
          const st = await window.electronAPI.getLicenseStatus();
          setLicenseStatus({ loading: false, ...st });
        } else {
          setLicenseStatus((prev) => ({ ...prev, loading: false }));
        }
      } catch (e) {
        console.warn('[Settings] Failed loading licensing info:', e);
        setLicenseStatus({ loading: false, activated: false, expired: false, daysLeft: 0, error: e.message });
      }
    })();
  }, []);

  const copyHwid = async () => {
    try {
      if (!hwid) return;
      if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(hwid);
      else if (clipboard?.writeText) clipboard.writeText(hwid);
      else {
        const el = document.createElement('textarea');
        el.value = hwid;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setHwidCopyStatus('Copied!');
      setTimeout(() => setHwidCopyStatus(''), 1500);
    } catch (e) {
      console.error('[Settings] Copy HWID failed:', e);
      setHwidCopyStatus('Copy failed');
      setTimeout(() => setHwidCopyStatus(''), 1500);
    }
  };

  const emailFingerprint = () => {
    const to = 'ghuilaineo@gmail.com';
    const subject = encodeURIComponent('MedOps License Request');
    const body = encodeURIComponent(`Hello,\n\nPlease issue a 1-year license for the following machine fingerprint:\n\n${hwid}\n\nThank you.`);
    const mailto = `mailto:${to}?subject=${subject}&body=${body}`;
    if (shell && shell.openExternal) shell.openExternal(mailto);
    else window.open(mailto, '_blank');
  };

  const handleActivateLicense = async () => {
    try {
      if (!licenseKey) return;
      setActivating(true);
      const res = await window.electronAPI.activateLicense(licenseKey);
      if (res?.success) {
        setLicenseStatus((prev) => ({ ...prev, activated: true, expired: false, error: null }));
        await confirm({ title: t('licenseActivated') || 'License Activated', message: t('licenseActivatedMsg') || 'Your license was activated successfully.', confirmText: 'OK', showCancel: false, variant: 'primary' });
        // Refresh status
        const st = await window.electronAPI.getLicenseStatus();
        setLicenseStatus({ loading: false, ...st });
      } else {
        const mapError = (code) => {
          switch (code) {
            case 'already_activated':
              return t('licenseAlreadyActivatedMsg') || 'This machine is already licensed. Re-activation is not required.';
            case 'license_consumed':
              return t('licenseConsumedMsg') || 'This license key has already been used on this machine and cannot be used again after expiry.';
            case 'rate_limited':
              return t('activationRateLimited') || 'Too many attempts. Please wait a minute and try again.';
            case 'invalid_format':
              return t('activationInvalidFormat') || 'The license key format is invalid. Please check and try again.';
            case 'bad_signature':
              return t('activationBadSignature') || 'The license key is invalid.';
            case 'expired':
              return t('activationExpired') || 'The license key is expired.';
            case 'fingerprint_mismatch':
              return t('activationFingerprintMismatch') || 'This key was issued for a different machine. Please request a new license for this machine.';
            case 'not_yet_valid':
              return t('activationNotYetValid') || 'The license key is not yet valid. Please check your system clock.';
            default:
              return t('activationFailedGeneric') || 'Activation failed. Please check the key and try again.';
          }
        };
        const msg = mapError(res?.error);
        await confirm({ title: t('activationFailed') || 'Activation Failed', message: msg, confirmText: 'OK', showCancel: false, variant: 'danger' });
      }
    } catch (e) {
      console.error('[Settings] Activation failed:', e);
      await confirm({ title: t('activationFailed') || 'Activation Failed', message: e.message, confirmText: 'OK', showCancel: false, variant: 'danger' });
    } finally {
      setActivating(false);
    }
  };

  // Google Drive handlers
  const handleConnectGoogleDrive = async () => {
    setGoogleDriveLoading(true);
    try {
      if (!googleDriveService?.authenticate) {
        throw new Error('Google Drive authenticate() not available');
      }
      const res = await googleDriveService.authenticate();
      if (res && res.success) {
        setGoogleDriveConnected(true);
        setGoogleDriveStatus('Connected to Google Drive');
        // Enable auto-backup engine if user has it enabled in settings
        try {
          if (settings?.auto_backup_enabled && googleDriveService?.enableAutoBackup) {
            await googleDriveService.enableAutoBackup();
          }
        } catch (e) {
          console.warn('[Settings] Failed enabling auto-backup after connect:', e);
        }
        // Telemetry: log the authenticated email once to developer Google Sheet
        try {
          const email = res?.email;
          if (email && window?.electronAPI?.logBackupEmailOnce) {
            const telemetryRes = await window.electronAPI.logBackupEmailOnce(email, 'drive-backup', { when: 'connect' });
            if (!telemetryRes?.success) {
              console.warn('[Telemetry] logBackupEmailOnce failed:', telemetryRes?.error || telemetryRes);
            }
          }
        } catch (e) {
          console.warn('[Telemetry] Failed to log backup email once:', e);
        }
      } else {
        setGoogleDriveConnected(false);
        setGoogleDriveStatus(res?.error || 'Failed to connect');
      }
    } catch (e) {
      console.error('[Settings] Google Drive connect failed:', e);
      setGoogleDriveConnected(false);
      setGoogleDriveStatus('Failed to connect');
    } finally {
      setGoogleDriveLoading(false);
    }
  };

  const handleBackupToGoogleDrive = async () => {
    setGoogleDriveLoading(true);
    try {
      // Fetch current app data
      const patients = (window.electronAPI?.getAllPatients)
        ? await window.electronAPI.getAllPatients()
        : [];
      const appointments = (window.electronAPI?.getAppointments)
        ? await window.electronAPI.getAppointments()
        : [];
      const settingsData = (window.electronAPI?.getSettings)
        ? await window.electronAPI.getSettings()
        : settings;

      // Backup to Drive
      if (googleDriveService?.backupAllPatients) {
        await googleDriveService.backupAllPatients(patients);
      }
      if (googleDriveService?.backupAllAppointments) {
        await googleDriveService.backupAllAppointments(appointments);
      }
      // Also backup settings via dedicated helper if available
      if (googleDriveService?.autoBackupSettings) {
        await googleDriveService.autoBackupSettings(settingsData);
      } else {
        // Fallback: upload settings.json
        if (googleDriveService?.uploadFile) {
          await googleDriveService.uploadFile('settings.json', JSON.stringify(settingsData), 'application/json');
        }
      }
      await confirm({ title: 'Backup', message: 'Backup to Google Drive completed', confirmText: 'OK', showCancel: false, variant: 'primary' });
    } catch (e) {
      console.error('[Settings] Backup to Google Drive failed:', e);
      await confirm({ title: 'Backup failed', message: 'Backup to Google Drive failed', confirmText: 'OK', showCancel: false, variant: 'danger' });
    } finally {
      setGoogleDriveLoading(false);
    }
  };

  const handleRestoreFromGoogleDrive = async () => {
    try {
      // Ask user to confirm restore
      const proceed = await confirm({
        title: 'Restore from Google Drive',
        message:
          'This will restore data from your Google Drive backup and merge it into your current database.\n\n' +
          'Patients and appointments with the same ID will be updated; others will be added. Settings will be overwritten.\n\n' +
          'Do you want to continue?',
        confirmText: 'Restore',
        cancelText: 'Cancel',
        variant: 'danger',
      });
      if (!proceed) return;

      setGoogleDriveLoading(true);

      // Summary counters
      let patientsCreated = 0;
      let patientsUpdated = 0;
      let patientsFailed = 0;

      let apptsCreated = 0;
      let apptsUpdated = 0;
      let apptsFailed = 0;

      // 1) Restore patients
      try {
        const patientsRes = await (googleDriveService?.restoreAllPatients?.() ?? Promise.resolve(null));
        if (patientsRes?.success && Array.isArray(patientsRes.results)) {
          const existingPatients = (await window.electronAPI.getPatients()) || [];
          // Normalize keys to string for reliable matching
          const byId = new Map(existingPatients.map(p => [String(p.id), p]));
          for (const item of patientsRes.results) {
            const p = item?.patient;
            if (!p || p.id === undefined || p.id === null) { patientsFailed++; continue; }
            const key = String(p.id);
            try {
              if (byId.has(key)) {
                await window.electronAPI.updatePatient({ ...byId.get(key), ...p, updatedAt: new Date().toISOString() });
                patientsUpdated++;
              } else {
                await window.electronAPI.addPatient({ ...p, created_at: p.created_at || new Date().toISOString(), updatedAt: new Date().toISOString(), status: p.status || 'existant' });
                patientsCreated++;
              }
            } catch (e) {
              console.error('[Restore] Failed to persist patient', p?.id, e);
              patientsFailed++;
            }
          }
        }
      } catch (e) {
        console.error('[Restore] Patients step failed:', e);
      }

      // 2) Restore appointments (ensure they belong to the right patients)
      try {
        const apptRes = await (googleDriveService?.restoreAppointments?.() ?? Promise.resolve(null));
        if (apptRes?.success && Array.isArray(apptRes.appointments)) {
          const existingAppts = (await window.electronAPI.getAppointments()) || [];
          const byId = new Map(existingAppts.map(a => [String(a.id), a]));
          // Also map existing patients to validate appointment ownership
          const existingPatients = (await window.electronAPI.getPatients()) || [];
          const patientsById = new Map(existingPatients.map(p => [String(p.id), p]));
          for (const apt of apptRes.appointments) {
            if (!apt || apt.id === undefined || apt.id === null) { apptsFailed++; continue; }
            const aptKey = String(apt.id);
            // Preserve where appointments belong: ensure patient_id is kept and valid
            const pidKey = apt.patient_id !== undefined && apt.patient_id !== null ? String(apt.patient_id) : null;
            if (pidKey && !patientsById.has(pidKey)) {
              // If patient from backup not present locally (e.g., failed patient restore), skip or still insert?
              // We choose to still insert; the patient may be added later, keeping linkage via patient_id.
            }
            try {
              if (byId.has(aptKey)) {
                await window.electronAPI.updateAppointment({ ...byId.get(aptKey), ...apt });
                apptsUpdated++;
              } else {
                await window.electronAPI.addAppointment({ ...apt });
                apptsCreated++;
              }
            } catch (e) {
              console.error('[Restore] Failed to persist appointment', apt?.id, e);
              apptsFailed++;
            }
          }
        }
      } catch (e) {
        console.error('[Restore] Appointments step failed:', e);
      }

      // 3) Restore settings (overwrite)
      let settingsApplied = false;
      try {
        const settingsRes = await (googleDriveService?.restoreSettings?.() ?? Promise.resolve(null));
        if (settingsRes?.success && settingsRes.settings) {
          const stringified = {};
          for (const [k, v] of Object.entries(settingsRes.settings)) {
            if (typeof v === 'boolean') stringified[k] = v ? 'true' : 'false';
            else if (v === null || v === undefined) stringified[k] = '';
            else stringified[k] = v.toString();
          }
          await window.electronAPI.updateSettings(stringified);
          settingsApplied = true;
        }
      } catch (e) {
        console.error('[Restore] Settings step failed:', e);
      }

      // Show summary (custom modal)
      const summary =
        'Restore completed.\n\n' +
        `Patients: +${patientsCreated} created, ${patientsUpdated} updated, ${patientsFailed} failed.\n` +
        `Appointments: +${apptsCreated} created, ${apptsUpdated} updated, ${apptsFailed} failed.\n` +
        `Settings: ${settingsApplied ? 'applied' : 'not changed'}.`;
      await confirm({ title: 'Restore Summary', message: summary, confirmText: 'OK', showCancel: false, variant: 'primary' });
    } catch (e) {
      console.error('[Settings] Restore from Google Drive failed:', e);
      await confirm({ title: 'Restore failed', message: 'An error occurred during restore.', confirmText: 'OK', showCancel: false, variant: 'danger' });
    } finally {
      setGoogleDriveLoading(false);
    }
  };

  const handleDisconnectGoogleDrive = async () => {
    setGoogleDriveLoading(true);
    try {
      if (googleDriveService?.disconnect) {
      }
      const res = await googleDriveService.disconnect();
      setGoogleDriveConnected(false);
      setGoogleDriveStatus('Not connected');
    } catch (e) {
      console.error('[Settings] Disconnect Google Drive failed:', e);
    } finally {
      setGoogleDriveLoading(false);
    }
  };

  const handleRecreateFolder = async () => {
    setGoogleDriveLoading(true);
    try {
      if (!googleDriveService?.recreateFolder) throw new Error('recreateFolder not available');
      const res = await googleDriveService.recreateFolder();
      if (res?.success) {
        alert('Google Drive folder recreated successfully');
      } else {
        alert(`Failed to recreate folder: ${res?.error || 'Unknown error'}`);
      }
    } catch (e) {
      console.error('[Settings] Recreate folder failed:', e);
      alert('Recreate folder failed');
    } finally {
      setGoogleDriveLoading(false);
    }
  };

  const handleCleanupDuplicateFiles = async () => {
    setGoogleDriveLoading(true);
    try {
      if (!googleDriveService?.cleanupDuplicateFiles) throw new Error('cleanupDuplicateFiles not available');
      const res = await googleDriveService.cleanupDuplicateFiles();
      if (res?.success) {
        alert('Duplicate files cleanup completed');
      } else {
        alert(`Cleanup failed: ${res?.error || 'Unknown error'}`);
      }
    } catch (e) {
      console.error('[Settings] Cleanup duplicates failed:', e);
      alert('Cleanup duplicates failed');
    } finally {
      setGoogleDriveLoading(false);
    }
  };

  // Toggle Google Drive auto-backup on/off and persist to settings
  const handleToggleAutoBackup = async () => {
    setGoogleDriveLoading(true);
    try {
      const currentlyEnabled = !!googleDriveAutoBackupEnabled;

      if (!googleDriveConnected) {
        alert('Please connect to Google Drive first');
        return;
      }

      if (currentlyEnabled) {
        if (googleDriveService?.disableAutoBackup) {
          await googleDriveService.disableAutoBackup();
        }
        if (googleDriveService?.cleanupAutoBackup) {
          try { await googleDriveService.cleanupAutoBackup(); } catch (_) {}
        }
        setGoogleDriveAutoBackupEnabled(false);
        const updated = { ...settings, auto_backup_enabled: false };
        setSettings(updated);
        if (window?.electronAPI?.updateSettings) {
          const stringified = {};
          for (const [k, v] of Object.entries(updated)) {
            if (typeof v === 'boolean') stringified[k] = v ? 'true' : 'false';
            else if (v === null || v === undefined) stringified[k] = '';
            else stringified[k] = v.toString();
          }
          await window.electronAPI.updateSettings(stringified);
        }
      } else {
        if (googleDriveService?.enableAutoBackup) {
          await googleDriveService.enableAutoBackup();
        }
        if (googleDriveService?.initializeAutoBackup) {
          try { await googleDriveService.initializeAutoBackup(); } catch (_) {}
        }
        setGoogleDriveAutoBackupEnabled(true);
        const updated = { ...settings, auto_backup_enabled: true };
        setSettings(updated);
        if (window?.electronAPI?.updateSettings) {
          const stringified = {};
          for (const [k, v] of Object.entries(updated)) {
            if (typeof v === 'boolean') stringified[k] = v ? 'true' : 'false';
            else if (v === null || v === undefined) stringified[k] = '';
            else stringified[k] = v.toString();
          }
          await window.electronAPI.updateSettings(stringified);
        }
      }
    } catch (e) {
      console.error('[Settings] Toggle auto-backup failed:', e);
      alert('Failed to toggle auto-backup');
    } finally {
      setGoogleDriveLoading(false);
    }
  };

  // Run an immediate scheduled backup
  const handleRunScheduledBackup = async () => {
    setGoogleDriveLoading(true);
    try {
      if (!googleDriveConnected) {
        await confirm({ title: 'Backup', message: 'Please connect to Google Drive first', confirmText: 'OK', showCancel: false, variant: 'primary' });
        return;
      }
      if (!googleDriveAutoBackupEnabled) {
        await confirm({ title: 'Backup', message: 'Enable auto-backup to run scheduled backup', confirmText: 'OK', showCancel: false, variant: 'primary' });
        return;
      }
      if (googleDriveService?.scheduledBackup) {
        const res = await googleDriveService.scheduledBackup();
        if (res?.success) {
          await confirm({ title: 'Backup', message: 'Backup completed successfully', confirmText: 'OK', showCancel: false, variant: 'primary' });
        } else {
          await confirm({ title: 'Backup failed', message: `Backup failed: ${res?.error || res?.reason || 'Unknown error'}`, confirmText: 'OK', showCancel: false, variant: 'danger' });
        }
      }
    } catch (e) {
      console.error('[Settings] Run scheduled backup failed:', e);
      await confirm({ title: 'Backup failed', message: 'Run scheduled backup failed', confirmText: 'OK', showCancel: false, variant: 'danger' });
    } finally {
      setGoogleDriveLoading(false);
    }
  };

  // Copy real machine ID to clipboard
  const copyMachineId = async () => {
    try {
      const id = settings?.machine_id || '';
      if (!id) {
        setMachineIdCopyStatus('');
        return;
      }
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(id);
      } else if (clipboard && clipboard.writeText) {
        clipboard.writeText(id);
      } else {
        // Fallback using a hidden textarea
        const el = document.createElement('textarea');
        el.value = id;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setMachineIdCopyStatus('Copied!');
      setTimeout(() => setMachineIdCopyStatus(''), 1500);
    } catch (e) {
      console.error('[Settings] Failed to copy machine ID:', e);
      setMachineIdCopyStatus('Copy failed');
      setTimeout(() => setMachineIdCopyStatus(''), 1500);
    }
  };

  // Note: Automatic reconnection is now handled globally in App.js

  const defaultSettings = {
    language: 'fr',
    country: 'TN',
    communication_mode: 'wifi',
    doctor_ip: '',
    backup_path: '',
    notification_sounds_enabled: true,
    auto_backup_enabled: true,
    licence_key: '',
    machine_id: '',
    // Appointments scheduling defaults
    appointment_start_time: '09:00',
    appointment_end_time: '17:00',
    appointment_slot_minutes: '15'
  };

  // Note: Automatic reconnection is now handled globally in App.js

  // Debounced connection status update to prevent rapid status changes
  const updateConnectionStatus = (newStatus, source = 'unknown') => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastStatusUpdateRef.current;
    const currentStatus = connectionStatusRef.current;
    
    console.log(`[DEBUG][Renderer] updateConnectionStatus called: ${newStatus} from ${source}, current: ${currentStatus}, timeSinceLast: ${timeSinceLastUpdate}ms`);
    
    // Clear any pending timeout
    if (statusUpdateTimeoutRef.current) {
      clearTimeout(statusUpdateTimeoutRef.current);
    }
    
    // If this is a 'connected' status from a reliable source, update immediately
    if (newStatus === 'connected' && (source === 'systemStatus' || source === 'networkStatus' || source === 'doctorPresence')) {
      setConnectionStatus(newStatus);
      connectionStatusRef.current = newStatus;
      lastStatusUpdateRef.current = now;
      setDebugLogs(prev => [...prev, `[DEBUG][Renderer] Immediate status update to ${newStatus} from ${source}`].slice(-10));
      console.log(`[DEBUG][Renderer] ✅ Immediate status update to ${newStatus} from ${source}`);
      return;
    }
    
    // For other status changes, debounce to prevent rapid changes
    const debounceDelay = 1000; // 1 second debounce
    
    if (timeSinceLastUpdate < debounceDelay && newStatus !== connectionStatusRef.current) {
      // Debounce the update
      statusUpdateTimeoutRef.current = setTimeout(() => {
        setConnectionStatus(newStatus);
        connectionStatusRef.current = newStatus;
        lastStatusUpdateRef.current = Date.now();
        setDebugLogs(prev => [...prev, `[DEBUG][Renderer] Debounced status update to ${newStatus} from ${source}`].slice(-10));
        console.log(`[DEBUG][Renderer] ⏰ Debounced status update to ${newStatus} from ${source}`);
      }, debounceDelay - timeSinceLastUpdate);
    } else {
      // Update immediately if enough time has passed or status is the same
      setConnectionStatus(newStatus);
      connectionStatusRef.current = newStatus;
      lastStatusUpdateRef.current = now;
      setDebugLogs(prev => [...prev, `[DEBUG][Renderer] Status update to ${newStatus} from ${source}`].slice(-10));
      console.log(`[DEBUG][Renderer] 🔄 Status update to ${newStatus} from ${source}`);
    }
  };



  // Initialize Google Drive connection state for UI
  const initializeGoogleDrive = async () => {
    try {
      const res = await googleDriveService.initialize();
      console.log('[Settings] Google Drive initialize result:', res);
      // UI state for Drive may be handled elsewhere; this ensures init runs without crashing.
    } catch (e) {
      console.error('[Settings] Google Drive init failed:', e);
    }
  };

  // Network connect/disconnect button handlers
  const handleConnectClick = async () => {
    try {
      setDebugLogs(prev => [...prev, '[DEBUG][Renderer] Connect button clicked'].slice(-10));
      if (window.electronAPI && window.electronAPI.networkConnect) {
        const ip = settings?.doctor_ip || '192.168.0.20';
        await window.electronAPI.networkConnect({ ip });
        updateConnectionStatus('connecting', 'userConnect');
      } else {
        console.warn('[Settings] networkConnect API not available');
      }
    } catch (e) {
      console.error('[Settings] Connect failed:', e);
    }
  };

  const handleDisconnectClick = async () => {
    try {
      setDebugLogs(prev => [...prev, '[DEBUG][Renderer] Disconnect button clicked'].slice(-10));
      if (window.electronAPI && window.electronAPI.networkDisconnect) {
        await window.electronAPI.networkDisconnect();
      } else {
        console.warn('[Settings] networkDisconnect API not available');
      }
    } catch (e) {
      console.error('[Settings] Disconnect failed:', e);
    } finally {
      updateConnectionStatus('disconnected', 'userDisconnect');
    }
  };

  useEffect(() => {
    console.log('[RENDERER] Settings loaded');
    loadSettings();
    initializeGoogleDrive();
    
    // Listen for real-time connection state changes
    const unsubscribe = realTimeUpdateService.subscribe('state:changed', (action, data) => {
      if (data && typeof data.state === 'string') {
        // Map realTimeUpdateService states to UI status
        if (data.state === 'connected' || data.state === 'CONNECTED') {
          updateConnectionStatus('connected', 'realTimeService');
        } else if (data.state === 'connecting' || data.state === 'CONNECTING' || data.state === 'reconnecting' || data.state === 'RECONNECTING') {
          updateConnectionStatus('connecting', 'realTimeService');
        } else {
          updateConnectionStatus('disconnected', 'realTimeService');
        }
      }
    });

    // Hydrate initial connection status from the real-time service on mount
    try {
      const initState = realTimeUpdateService.getConnectionState && realTimeUpdateService.getConnectionState();
      if (initState && typeof initState.state === 'string') {
        if (initState.state === 'connected' || initState.state === 'CONNECTED') {
          updateConnectionStatus('connected', 'systemStatus');
        } else if (initState.state === 'connecting' || initState.state === 'CONNECTING' || initState.state === 'reconnecting' || initState.state === 'RECONNECTING') {
          updateConnectionStatus('connecting', 'systemStatus');
        } else {
          updateConnectionStatus('disconnected', 'systemStatus');
        }
      }
    } catch (e) {
      console.warn('[Settings] Failed to hydrate initial connection state:', e);
    }

    // Listen for network status updates from backend
    if (window.electronAPI && window.electronAPI.onNetworkStatus) {
      window.electronAPI.onNetworkStatus((status) => {
        if (status === 'connected') updateConnectionStatus('connected', 'networkStatus');
        else if (status === 'connecting') updateConnectionStatus('connecting', 'networkStatus');
        else updateConnectionStatus('disconnected', 'networkStatus');
      });
    }

    // Listen for network status updates
    if (window.electronAPI && window.electronAPI.onDoctorPresence) {
      // Clean up any existing listeners first to prevent duplicates
      window.electronAPI.removeAllListeners('doctor-presence');
      
      window.electronAPI.onDoctorPresence((data) => {
        console.log('[RENDERER] doctorPresence event received:', data);
        setDoctorPresence(data);
        
        // Update connection status based on doctor presence
        if (data.online) {
          updateConnectionStatus('connected', 'doctorPresence');
          retryingRef.current = false;
          setRetrying(false);
          clearRetryTimer();
        } else {
          updateConnectionStatus('disconnected', 'doctorPresence');
        }
      });
    }
    
    // Listen for network status debug messages
    if (window.electronAPI && window.electronAPI.onNetworkStatusDebug) {
      window.electronAPI.onNetworkStatusDebug((debugMsg) => {
        setDebugLogs(prev => [...prev.slice(-9), debugMsg]); // Keep last 10 messages
      });
    }
    
    // Load connected machines
    loadConnectedMachines();
    
    // Set up event listeners for cross-machine communication
    if (window.electronAPI && window.electronAPI.onMachineConnected) {
      window.electronAPI.onMachineConnected(handleMachineConnected);
    }
    if (window.electronAPI && window.electronAPI.onMachineDisconnected) {
      window.electronAPI.onMachineDisconnected(handleMachineDisconnected);
    }
    
    // Cleanup function
    return () => {
      if (unsubscribe) unsubscribe();
      if (window.electronAPI && window.electronAPI.removeAllListeners) {
        window.electronAPI.removeAllListeners('network-status');
        window.electronAPI.removeAllListeners('doctor-presence');
        window.electronAPI.removeAllListeners('network-status-debug');
        window.electronAPI.removeAllListeners('machine-connected');
        window.electronAPI.removeAllListeners('machine-disconnected');
      }
    };
  }, []);

  // Listen for systemStatus event and update handshake state
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onSystemStatus) {
      // Clean up any existing listeners first to prevent duplicates
      window.electronAPI.removeAllListeners('system-status');
      
      window.electronAPI.onSystemStatus((data) => {
        console.log('[RENDERER][Settings] systemStatus event received:', data);
        setDoctorPresence(data);
        if (data.backend || data.frontend || data.loggedIn) {
          updateConnectionStatus('connected', 'systemStatus');
          retryingRef.current = false;
          setRetrying(false);
          clearRetryTimer();
        }
      });
    }
    
    return () => {
      // Clean up event listeners
      if (window.electronAPI && window.electronAPI.removeAllListeners) {
        window.electronAPI.removeAllListeners('system-status');
      }
    };
  }, []);

  // Removed duplicate doctorPresence listener - now handled in main useEffect

  // Cross-Machine Communication useEffect
  useEffect(() => {
    if (crossMachineExpanded) {
      // Load connected machines
      loadConnectedMachines();

      // Listen for cross-machine events
      if (window.electronAPI && window.electronAPI.onMachineConnected) {
        window.electronAPI.onMachineConnected(handleMachineConnected);
      }
      if (window.electronAPI && window.electronAPI.onMachineDisconnected) {
        window.electronAPI.onMachineDisconnected(handleMachineDisconnected);
      }
      if (window.electronAPI && window.electronAPI.onCrossMachineMessageReceived) {
        window.electronAPI.onCrossMachineMessageReceived(handleCrossMachineMessage);
      }
      if (window.electronAPI && window.electronAPI.onFileTransferRequested) {
        window.electronAPI.onFileTransferRequested(handleFileTransferRequest);
      }

      // Update machine status periodically
      const statusInterval = setInterval(() => {
        if (window.electronAPI && window.electronAPI.updateMachineStatus) {
          window.electronAPI.updateMachineStatus(machineStatus);
        }
      }, 30000); // Update every 30 seconds

      return () => {
        clearInterval(statusInterval);
      };
    }
  }, [crossMachineExpanded, machineStatus]);

  // Cross-Machine Communication functions
  const loadConnectedMachines = async () => {
    try {
      if (window.electronAPI && window.electronAPI.getConnectedMachines) {
        const response = await window.electronAPI.getConnectedMachines();
        setConnectedMachines(response.machines || []);
      }
    } catch (error) {
      console.error('Failed to load connected machines:', error);
    }
  };

  const handleMachineConnected = (data) => {
    console.log('Machine connected:', data);
    setConnectedMachines(prev => [...prev, data]);
  };

  const handleMachineDisconnected = (data) => {
    console.log('Machine disconnected:', data);
    setConnectedMachines(prev => prev.filter(machine => machine.machineId !== data.machineId));
  };

  const handleCrossMachineMessage = (data) => {
    console.log('Cross-machine message received:', data);
    setCrossMachineMessages(prev => [...prev, data]);
  };

  const handleFileTransferRequest = (data) => {
    console.log('File transfer request received:', data);
    setFileTransferRequests(prev => [...prev, data]);
  };

  const sendCrossMachineMessage = (e) => {
    e.preventDefault();
    if (selectedMachine && messageText.trim() && window.electronAPI && window.electronAPI.sendCrossMachineMessage) {
      window.electronAPI.sendCrossMachineMessage(selectedMachine, messageText, {
        timestamp: new Date().toISOString()
      });
      setMessageText('');
    }
  };

  const requestFileTransfer = (targetMachineId, fileName) => {
    if (window.electronAPI && window.electronAPI.requestFileTransfer) {
      window.electronAPI.requestFileTransfer({
        fileName,
        fileSize: '1MB', // Example size
        targetMachineId,
        requesterMachineId: window.electronAPI.getMachineId ? window.electronAPI.getMachineId() : 'unknown'
      });
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file && selectedMachine && window.electronAPI && window.electronAPI.sendFileTransferData) {
      // In a real implementation, you would chunk the file and send it
      const fileData = {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        targetMachineId: selectedMachine
      };
      window.electronAPI.sendFileTransferData(fileData);
    }
  };

  const loadSettings = async () => {
    try {
      const config = await window.electronAPI.getSettings();
      // Parse booleans from string values if needed
      const parsedConfig = { ...config };
      if (typeof parsedConfig.notification_sounds_enabled === 'string') {
        parsedConfig.notification_sounds_enabled = parsedConfig.notification_sounds_enabled === 'true';
      }
      if (typeof parsedConfig.auto_backup_enabled === 'string') {
        parsedConfig.auto_backup_enabled = parsedConfig.auto_backup_enabled === 'true';
      }
      // Populate machine_id from system MAC address, fallback to system UUID, then local-generated ID
      try {
        if (window.electronAPI && window.electronAPI.getSystemMacAddress) {
          const macResp = await window.electronAPI.getSystemMacAddress();
          if (macResp && macResp.success && macResp.mac) {
            parsedConfig.machine_id = macResp.mac;
          }
        }
        // Fallback to UUID if MAC not obtained
        if (!parsedConfig.machine_id && window.electronAPI && window.electronAPI.getSystemMachineUUID) {
          const uuidResp = await window.electronAPI.getSystemMachineUUID();
          if (uuidResp && uuidResp.success && uuidResp.uuid) {
            parsedConfig.machine_id = uuidResp.uuid;
          }
        }
        // Final fallback to existing local-generated ID
        if (!parsedConfig.machine_id && window.electronAPI && window.electronAPI.getMachineId) {
          parsedConfig.machine_id = window.electronAPI.getMachineId();
        }
      } catch (e) {
        console.warn('[Settings] Failed to retrieve system MAC/UUID:', e);
        if (!parsedConfig.machine_id && window.electronAPI && window.electronAPI.getMachineId) {
          parsedConfig.machine_id = window.electronAPI.getMachineId();
        }
      }
      setSettings({ ...defaultSettings, ...parsedConfig });
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initialize internal toggle states from settings when component mounts
  useEffect(() => {
    if (settings.notification_sounds_enabled !== undefined) {
      setNotificationSoundsEnabled(settings.notification_sounds_enabled);
    }
    if (settings.auto_backup_enabled !== undefined) {
      setAutoBackupEnabled(settings.auto_backup_enabled);
    }
  }, [settings.notification_sounds_enabled, settings.auto_backup_enabled]);

  // Sync internal toggle states with settings prop, but only when there's a true discrepancy
  useEffect(() => {
    if (settings.notification_sounds_enabled !== notificationSoundsEnabled) {
      console.log('[DEBUG] Syncing notification sounds toggle from settings:', settings.notification_sounds_enabled, 'to internal state:', notificationSoundsEnabled);
      setNotificationSoundsEnabled(settings.notification_sounds_enabled);
    }
  }, [settings.notification_sounds_enabled, notificationSoundsEnabled]);

  useEffect(() => {
    if (settings.auto_backup_enabled !== autoBackupEnabled) {
      console.log('[DEBUG] Syncing auto-backup toggle from settings:', settings.auto_backup_enabled, 'to internal state:', autoBackupEnabled);
      setAutoBackupEnabled(settings.auto_backup_enabled);
    }
  }, [settings.auto_backup_enabled, autoBackupEnabled]);

  // Sync Google Drive auto-backup UI state from persisted settings on load
  useEffect(() => {
    if (typeof settings.auto_backup_enabled === 'boolean') {
      setGoogleDriveAutoBackupEnabled(!!settings.auto_backup_enabled);
    }
  }, [settings.auto_backup_enabled]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: value
    }));

    // Update language immediately
    if (name === 'language') {
      i18n.changeLanguage(value);
    }
  };

  // Select a backup drive/folder and persist to settings
  const handleSelectBackupDrive = async () => {
    try {
      if (!window?.electronAPI?.selectBackupDrive) {
        console.warn('[Settings] selectBackupDrive API not available');
        return;
      }
      const folder = await window.electronAPI.selectBackupDrive();
      if (!folder) return; // user canceled

      // Update local state
      setSettings(prev => ({
        ...prev,
        backup_path: folder
      }));

      // Persist immediately so other actions (e.g., validation) see it
      try {
        const updatedSettings = { ...settings, backup_path: folder };
        const stringifiedSettings = {};
        for (const [key, value] of Object.entries(updatedSettings)) {
          if (typeof value === 'boolean') stringifiedSettings[key] = value ? 'true' : 'false';
          else if (value === null || value === undefined) stringifiedSettings[key] = '';
          else stringifiedSettings[key] = value.toString();
        }
        await window.electronAPI.updateSettings(stringifiedSettings);
        if (onSettingsUpdate) onSettingsUpdate();
      } catch (e) {
        console.error('[Settings] Failed to persist backup path:', e);
      }
    } catch (error) {
      console.error('[Settings] Error selecting backup drive:', error);
    }
  };

  // Create a full backup into the configured backup_path
  const handleCreateBackup = async () => {
    try {
      const backupFolder = settings?.backup_path;
      if (!backupFolder) {
        alert("Veuillez d'abord sélectionner un dossier de sauvegarde");
        return;
      }
      if (!window?.electronAPI?.createBackup) {
        alert('Fonction de sauvegarde indisponible');
        return;
      }
      const res = await window.electronAPI.createBackup(backupFolder);
      if (res?.success) {
        const count = typeof res.copied === 'number' ? res.copied : 0;
        alert(`Sauvegarde créée avec succès (${count} fichiers copiés)`);
      } else {
        alert(`Erreur de sauvegarde: ${res?.error || 'Inconnue'}`);
      }
    } catch (e) {
      console.error('[Settings] Error creating backup:', e);
      alert('Erreur lors de la création de la sauvegarde');
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      // Stringify all settings values to avoid SQLite type errors
      const stringifiedSettings = {};
      for (const [key, value] of Object.entries(settings)) {
        if (typeof value === 'boolean') {
          stringifiedSettings[key] = value ? 'true' : 'false';
        } else if (value === null || value === undefined) {
          stringifiedSettings[key] = '';
        } else {
          stringifiedSettings[key] = value.toString();
        }
      }
      await window.electronAPI.updateSettings(stringifiedSettings);
      if (onSettingsUpdate) {
        onSettingsUpdate();
      }
      // Auto-backup settings to Google Drive if enabled (best-effort)
      try {
        if (googleDriveService.isAutoBackupEnabled()) {
          await googleDriveService.autoBackupSettings(stringifiedSettings);
        }
      } catch (error) {
        console.error('Auto-backup settings failed:', error);
      }
      console.log('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      await confirm({
        title: 'Erreur',
        message: 'Erreur lors de la sauvegarde des paramètres',
        confirmText: 'OK',
        showCancel: false,
        variant: 'danger',
      });
    } finally {
      setSaving(false);
      // Clear any pending status update timeout
      if (statusUpdateTimeoutRef.current) {
        clearTimeout(statusUpdateTimeoutRef.current);
      }
    }
  };

  // Also, stop retrying if connectionStatus changes to 'connected' outside the retry loop
  useEffect(() => {
    if (connectionStatus === 'connected') {
      retryingRef.current = false;
      setRetrying(false);
      clearRetryTimer();
      setDebugLogs(prev => [...prev, `[DEBUG][Renderer] Detected connected status in useEffect, stopping retry`].slice(-10));
    }
  }, [connectionStatus]);



  // Ensure loading state is reset when component mounts
  useEffect(() => {
    setLoading(false);
    console.log('[DEBUG] Settings: Loading state reset on mount');
  }, []);

  // Additional safety: reset loading state if it gets stuck
  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => {
        console.log('[DEBUG] Settings: Loading state timeout - forcing reset');
        setLoading(false);
      }, 5000); // Reset after 5 seconds if still loading
      
      return () => clearTimeout(timeout);
    }
  }, [loading]);

  // Note: Automatic reconnection setup is now handled globally in App.js

  if (loading) {
    return (
      <div className="page-header">
        <div className="page-title">{t('settings')}</div>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <span className="spinner"></span>
          <p>{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <style>{toggleStyles}</style>
      <div className="page-header">
        <h1 className="page-title">{t('settings')}</h1>
        <p className="page-subtitle">Configuration de l'application</p>
      </div>



      {/* Language Settings */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-globe" style={{ marginRight: '10px' }}></i>
            Langue / Language
          </h3>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="language">
            {t('language')}
          </label>
          <select
            id="language"
            name="language"
            className="form-input form-select"
            value={settings.language}
            onChange={handleInputChange}
          >
            <option value="fr">{t('french')}</option>
            <option value="en">{t('english')}</option>
          </select>
        </div>
      </div>


      {/* Notification Preferences */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-bell" style={{ marginRight: '10px' }}></i>
            Notifications
          </h3>
        </div>

        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0' }}>
            <div>
              <label className="form-label" style={{ marginBottom: '0.25rem' }}>
                Sons de notification
              </label>
              <small style={{ color: '#666', display: 'block' }}>
                Activer les sons pour les notifications (normal.mp3 pour les notifications générales, expectpatient.mp3 pour les arrivées de patients)
              </small>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  name="notification_sounds_enabled"
                  checked={notificationSoundsEnabled}
                  disabled={toggleSaving}
                  onChange={async (e) => {
                    if (toggleSaving) return; // Prevent rapid clicking
                    
                    const newValue = e.target.checked;
                    console.log('[DEBUG] Toggle changed to:', newValue, 'Previous value:', notificationSoundsEnabled);
                    
                    setToggleSaving(true);
                    
                    // Update internal state immediately for visual feedback
                    setNotificationSoundsEnabled(newValue);
                    
                    // Also update the main settings state to keep it in sync
                    setSettings(prev => {
                      console.log('[DEBUG] Updating settings state from:', prev.notification_sounds_enabled, 'to:', newValue);
                      return {
                        ...prev,
                        notification_sounds_enabled: newValue
                      };
                    });
                    
                    // Save to database without showing confirmation popup
                    try {
                      const updatedSettings = {
                        ...settings,
                        notification_sounds_enabled: newValue
                      };
                      
                      // Stringify the boolean value
                      const stringifiedSettings = {
                        ...updatedSettings,
                        notification_sounds_enabled: newValue ? 'true' : 'false'
                      };
                      
                      console.log('[DEBUG] Saving settings:', stringifiedSettings);
                      await window.electronAPI.updateSettings(stringifiedSettings);
                      console.log('[DEBUG] Settings saved successfully');
                      
                      // Don't call onSettingsUpdate immediately to prevent reloading settings
                      // which could overwrite the local state before the database is updated
                      // The settings will be reloaded when the user navigates away and back
                    } catch (error) {
                      console.error('Error saving notification settings:', error);
                      // Revert both states if save failed
                      setNotificationSoundsEnabled(!newValue);
                      setSettings(prev => ({
                        ...prev,
                        notification_sounds_enabled: !newValue
                      }));
                      alert('Erreur lors de la sauvegarde des paramètres de notification');
                    } finally {
                      setToggleSaving(false);
                    }
                  }}
                />
                <span className="toggle-slider"></span>
              </label>
              {/* Test buttons for notification sounds */}
              <button
                type="button"
                className="btn btn-info btn-sm"
                style={{ marginLeft: '1rem' }}
                onClick={async () => {
                  const audio = new Audio('normal.mp3');
                  try { await audio.play(); } catch (e) { alert('Erreur lors de la lecture de normal.mp3'); }
                }}
              >
                Tester Son Normal
              </button>
              <button
                type="button"
                className="btn btn-warning btn-sm"
                style={{ marginLeft: '0.5rem' }}
                onClick={async () => {
                  const audio = new Audio('expectpatient.mp3');
                  try { await audio.play(); } catch (e) { alert('Erreur lors de la lecture de expectpatient.mp3'); }
                }}
              >
                Tester Son Arrivée Patient
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
          <h4 style={{ color: '#667eea', marginBottom: '1rem', fontSize: '1rem' }}>
            <i className="fas fa-info-circle" style={{ marginRight: '8px' }}></i>
            Types de Notifications
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.9rem' }}>
            <div>
              <h5 style={{ color: '#28a745', marginBottom: '0.5rem' }}>Notifications Générales</h5>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                <li style={{ padding: '0.25rem 0' }}>✓ Nouveaux messages</li>
                <li style={{ padding: '0.25rem 0' }}>✓ Demandes de rendez-vous</li>
                <li style={{ padding: '0.25rem 0' }}>✓ Notifications système</li>
                <li style={{ padding: '0.25rem 0' }}>✓ Succès/Erreurs</li>
                <li style={{ padding: '0.25rem 0' }}>🔊 Son: <code>normal.mp3</code></li>
              </ul>
            </div>
            <div>
              <h5 style={{ color: '#ff922b', marginBottom: '0.5rem' }}>Arrivées de Patients</h5>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                <li style={{ padding: '0.25rem 0' }}>✓ Patient attendu bientôt</li>
                <li style={{ padding: '0.25rem 0' }}>✓ Rendez-vous à venir</li>
                <li style={{ padding: '0.25rem 0' }}>✓ Notifications d'arrivée</li>
                <li style={{ padding: '0.25rem 0' }}>✓ Alertes de présence</li>
                <li style={{ padding: '0.25rem 0' }}>🔊 Son: <code>expectpatient.mp3</code></li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Language Settings */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-globe" style={{ marginRight: '10px' }}></i>
            {t('language') || 'Language'}
          </h3>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="language">
            {t('selectLanguage') || 'Select language'}
          </label>
          <select
            id="language"
            name="language"
            className="form-input form-select"
            value={settings.language || (i18n?.language || 'fr')}
            onChange={handleLanguageChange}
          >
            <option value="fr">Français (fr)</option>
            <option value="en">English (en)</option>
            <option value="ar">العربية (ar)</option>
            <option value="ar-EG">العربية - مصر (ar-EG)</option>
            <option value="ar-MR">العربية - موريتانيا (ar-MR)</option>
            <option value="es">Español (es)</option>
            <option value="pt">Português (pt)</option>
          </select>
          <small style={{ color: '#666', marginTop: '0.5rem', display: 'block' }}>
            {t('languageRtlHint') || 'Arabic languages use Right-to-Left layout automatically.'}
          </small>
        </div>
      </div>

      {/* Country Settings */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-flag" style={{ marginRight: '10px' }}></i>
            {t('country') || 'Country'}
          </h3>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="country">
            {t('selectCountry') || 'Select country'}
          </label>
          <select
            id="country"
            name="country"
            className="form-input form-select"
            value={settings.country || 'TN'}
            onChange={handleCountryChange}
          >
            <option value="TN">Tunisia (TN)</option>
            <option value="DZ">Algeria (DZ)</option>
            <option value="EG">Egypt (EG)</option>
            <option value="MR">Mauritania (MR)</option>
            <option value="ES">Spain (ES)</option>
            <option value="PT">Portugal (PT)</option>
          </select>
          <small style={{ color: '#666', marginTop: '0.5rem', display: 'block' }}>
            {t('countryAffectsRegionalSettings') || 'Used for regional defaults and reporting.'}
          </small>
        </div>
      </div>

      {/* Appointments Settings */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-calendar-alt" style={{ marginRight: '10px' }}></i>
            Rendez-vous
          </h3>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="appointment_start_time">Heure de début</label>
          <input
            id="appointment_start_time"
            type="time"
            className="form-input"
            value={settings.appointment_start_time || '09:00'}
            onChange={handleAppointmentStartTimeChange}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="appointment_end_time">Heure de fin</label>
          <input
            id="appointment_end_time"
            type="time"
            className="form-input"
            value={settings.appointment_end_time || '17:00'}
            onChange={handleAppointmentEndTimeChange}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="appointment_slot_minutes">Durée d'un créneau (minutes)</label>
          <select
            id="appointment_slot_minutes"
            className="form-input form-select"
            value={String(settings.appointment_slot_minutes || '15')}
            onChange={handleAppointmentSlotMinutesChange}
          >
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="15">15</option>
            <option value="20">20</option>
            <option value="30">30</option>
            <option value="45">45</option>
            <option value="60">60</option>
          </select>
        </div>
        <small style={{ color: '#666' }}>
          Ces paramètres contrôlent la génération des créneaux horaires dans la page des rendez-vous.
        </small>
      </div>

      {/* Communication Settings */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-wifi" style={{ marginRight: '10px' }}></i>
            Communication
          </h3>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="communication_mode">
            {t('communicationMode')}
          </label>
          <select
            id="communication_mode"
            name="communication_mode"
            className="form-input form-select"
            value={settings.communication_mode}
            onChange={handleInputChange}
          >
            <option value="wifi">{t('wifi')}</option>
          </select>
        </div>

        {settings.communication_mode === 'wifi' && (
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label className="form-label" htmlFor="doctor_ip">
                {t('doctorIP')}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ 
                  fontSize: '0.875rem', 
                  color: connectionStatus === 'connected' ? '#10b981' : connectionStatus === 'connecting' ? '#f59e0b' : '#ef4444',
                  fontWeight: '500'
                }}>
                  {connectionStatus === 'connected' ? '🟢 Connected' : 
                   connectionStatus === 'connecting' ? '🟡 Connecting...' : '🔴 Disconnected'}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                id="doctor_ip"
                name="doctor_ip"
                className="form-input"
                value={settings.doctor_ip || '192.168.0.20'}
                onChange={handleInputChange}
                placeholder="192.168.0.20"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginLeft: '0.5rem', whiteSpace: 'nowrap' }}
                onClick={handleConnectClick}
                disabled={retrying}
              >
                <i className="fas fa-plug" style={{ marginRight: '0.5rem' }}></i>
                {retrying ? t('connecting') : connectionStatus === 'disconnected' ? 'Connect & Enable Auto-Reconnect' : 'Start Connection'}
              </button>
              {retrying && (
                <button
                  type="button"
                  className="btn btn-warning"
                  style={{ marginLeft: '0.5rem', whiteSpace: 'nowrap' }}
                  onClick={() => {
                    cancelRetry();
                    setConnectionStatus('disconnected'); // Ensure state is always set to disconnected
                  }}
                >
                  <i className="fas fa-ban" style={{ marginRight: '0.5rem' }}></i>
                  Cancel
                </button>
              )}
              <button
                type="button"
                className="btn btn-danger"
                style={{ marginLeft: '0.5rem', whiteSpace: 'nowrap' }}
                onClick={handleDisconnectClick}
              >
                <i className="fas fa-times" style={{ marginRight: '0.5rem' }}></i>
                Disconnect
              </button>
            </div>
            {/* Debug logs for connection attempts */}
            {debugLogs.length > 0 && (
              <div style={{ marginTop: '1rem', background: '#222', color: '#fff', padding: '0.5rem', borderRadius: '4px', fontSize: '0.85rem', maxHeight: 120, overflowY: 'auto' }}>
                <strong>Debug Logs:</strong>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {debugLogs.map((log, idx) => (
                    <li key={idx} style={{ fontFamily: 'monospace' }}>{log}</li>
                  ))}
                </ul>
              </div>
            )}
            <small style={{ color: '#666', marginTop: '0.5rem', display: 'block' }}>
              Adresse IP de l'ordinateur du médecin
            </small>
            
            {/* Auto-reconnect settings */}
            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
              <div style={{ fontSize: '0.875rem', color: '#666' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span>Reconnexion automatique:</span>
                  <span style={{ 
                    color: connectionStatus === 'disconnected' ? '#ef4444' : '#10b981',
                    fontWeight: '500'
                  }}>
                    {connectionStatus === 'disconnected' ? '🔴 Désactivé (Déconnexion manuelle)' : '🟢 Activé (Global)'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Note:</span>
                  <span style={{ fontSize: '0.8rem' }}>
                    {connectionStatus === 'disconnected' 
                      ? 'Cliquez sur "Connect" pour réactiver la reconnexion automatique' 
                      : 'Géré globalement par l\'application'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Backup Settings */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-download" style={{ marginRight: '10px' }}></i>
            Sauvegarde Automatique
          </h3>
        </div>

        <div className="form-group">
          <label className="form-label">
            Chemin de Sauvegarde
          </label>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
            <input
              type="text"
              className="form-input"
              value={settings.backup_path}
              readOnly
              placeholder="Sélectionner un dossier de sauvegarde"
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSelectBackupDrive}
            >
              <i className="fas fa-folder-open"></i>
              Sélectionner
            </button>
          </div>
          <small style={{ color: '#666', marginTop: '0.5rem', display: 'block' }}>
            Les patients seront automatiquement sauvegardés dans ce dossier
          </small>
        </div>

        <div className="form-group" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem' }}>
          <div>
            <label className="form-label" style={{ marginBottom: '0.25rem' }}>
              Sauvegarde automatique
            </label>
            <small style={{ color: '#666', display: 'block' }}>
              Active ou désactive la sauvegarde automatique des patients
            </small>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <label className="toggle-switch">
              <input
                type="checkbox"
                name="auto_backup_enabled"
                checked={autoBackupEnabled}
                disabled={toggleSaving}
                onChange={async (e) => {
                  if (toggleSaving) return; // Prevent rapid clicking
                  
                  const backupValue = e.target.checked;
                  console.log('[DEBUG] Auto-backup toggle changed to:', backupValue);
                  
                  setToggleSaving(true);
                  
                  // Update internal state immediately for visual feedback
                  setAutoBackupEnabled(backupValue);
                  
                  // Also update the main settings state to keep it in sync
                  setSettings(prev => ({
                    ...prev,
                    auto_backup_enabled: backupValue
                  }));
                  
                  // Save to database without showing confirmation popup
                  try {
                    const updatedSettings = {
                      ...settings,
                      auto_backup_enabled: backupValue
                    };
                    
                    // Stringify the boolean value
                    const stringifiedSettings = {
                      ...updatedSettings,
                      auto_backup_enabled: backupValue ? 'true' : 'false'
                    };
                    
                    await window.electronAPI.updateSettings(stringifiedSettings);
                    console.log('[DEBUG] Auto-backup settings saved successfully');
                    
                    // Don't call onSettingsUpdate immediately to prevent reloading settings
                    // which could overwrite the local state before the database is updated
                    // The settings will be reloaded when the user navigates away and back
                  } catch (error) {
                    console.error('Error saving auto-backup settings:', error);
                    // Revert both states if save failed
                    setAutoBackupEnabled(!backupValue);
                    setSettings(prev => ({
                      ...prev,
                      auto_backup_enabled: !backupValue
                    }));
                    alert('Erreur lors de la sauvegarde des paramètres de sauvegarde automatique');
                  } finally {
                    setToggleSaving(false);
                  }
                }}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        {settings.backup_path && (
          <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-info"
                onClick={async () => {
                  try {
                    const testResult = await window.electronAPI.backupPatient({
                      id: 'test_patient',
                      name: 'Test Patient',
                      created_at: new Date().toISOString()
                    });
                    if (testResult.success) {
                      alert('Chemin de sauvegarde fonctionne correctement');
                    } else {
                      alert(`Erreur de test: ${testResult.reason || testResult.error}`);
                    }
                  } catch (error) {
                    alert('Erreur lors du test du chemin de sauvegarde');
                  }
                }}
              >
                <i className="fas fa-vial"></i>
                Tester le Chemin
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  try {
                    const status = await window.electronAPI.getBackupPathStatus();
                    if (status.configured) {
                      if (status.accessible) {
                        const message = `✅ Disque de sauvegarde accessible\n\n` +
                          `Chemin original: ${status.originalPath}\n` +
                          `Chemin résolu: ${status.resolvedPath}\n` +
                          `Fichiers de sauvegarde: ${status.hasBackupFiles ? 'Oui' : 'Non'}\n` +
                          `Chemin modifié: ${status.pathChanged ? 'Oui' : 'Non'}`;
                        alert(message);
                      } else {
                        alert(`❌ Disque de sauvegarde non accessible\n\nChemin: ${status.originalPath}\nRaison: ${status.reason}`);
                      }
                    } else {
                      alert('Aucun chemin de sauvegarde configuré');
                    }
                  } catch (error) {
                    console.error('Error getting backup path status:', error);
                    alert('Erreur lors de la vérification du statut');
                  }
                }}
              >
                <i className="fas fa-info-circle"></i>
                Statut Disque
              </button>

              <button
                type="button"
                className="btn btn-warning"
                onClick={async () => {
                  try {
                    const result = await window.electronAPI.validateBackupPath();
                    if (result.success) {
                      if (result.updated) {
                        alert(`✅ Chemin de sauvegarde mis à jour !\n\n` +
                          `Ancien: ${result.oldPath}\n` +
                          `Nouveau: ${result.newPath}\n\n` +
                          `Le disque a été trouvé avec une lettre différente.`);
                        // Reload settings to show updated path
                        await loadSettings();
                      } else {
                        alert('✅ Chemin de sauvegarde valide et accessible');
                      }
                    } else {
                      alert(`❌ Erreur: ${result.reason || result.error}`);
                    }
                  } catch (error) {
                    console.error('Error validating backup path:', error);
                    alert('Erreur lors de la validation du chemin');
                  }
                }}
              >
                <i className="fas fa-search"></i>
                Rechercher Disque
              </button>
              
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreateBackup}
              >
                <i className="fas fa-download"></i>
                Créer Sauvegarde Complète
              </button>

              <button
                type="button"
                className="btn btn-success"
                onClick={async () => {
                  try {
                    const proceed = await confirm({
                      title: 'Restaurer depuis la sauvegarde',
                      message: 'Êtes-vous sûr de vouloir restaurer tous les patients depuis la sauvegarde ? Cette opération va remplacer les données existantes.',
                      confirmText: 'Restaurer',
                      cancelText: 'Annuler',
                      variant: 'danger',
                    });
                    if (proceed) {
                      console.log('[DEBUG] Starting restore process...');
                      const result = await window.electronAPI.restoreAllPatients();
                      console.log('[DEBUG] Restore result:', result);
                      if (result.success) {
                        // Notify All Patients page to refresh
                        console.log('[DEBUG] Setting localStorage flags for refresh...');
                        localStorage.setItem('allPatientsShouldRefresh', Date.now().toString());
                        localStorage.setItem('showMissedAfterRestore', 'true');
                        
                        // Force a storage event to trigger refresh
                        window.dispatchEvent(new StorageEvent('storage', {
                          key: 'allPatientsShouldRefresh',
                          newValue: Date.now().toString(),
                          oldValue: null,
                          url: window.location.href
                        }));
                        
                        const { created, updated, failed, errors } = result.results;
                        console.log('[DEBUG] Restore completed:', { created, updated, failed, errors });
                        alert(
                          `Restauration terminée !\n` +
                          `✅ Créés: ${created}\n` +
                          `🔄 Mis à jour: ${updated}\n` +
                          `❌ Échecs: ${failed}\n` +
                          `${errors.length > 0 ? '\nErreurs:\n' + errors.join('\n') : ''}`
                        );
                      } else {
                        console.error('[DEBUG] Restore failed:', result);
                        alert(`Erreur lors de la restauration: ${result.reason || result.error}`);
                      }
                    }
                  } catch (error) {
                    console.error('Error restoring patients:', error);
                    alert('Erreur lors de la restauration des patients');
                  }
                }}
              >
                <i className="fas fa-upload"></i>
                Restaurer Patients
              </button>

              <button
                type="button"
                className="btn btn-warning"
                onClick={async () => {
                  try {
                    const backupFiles = await window.electronAPI.getBackupFiles();
                    if (backupFiles.success && backupFiles.files.length > 0) {
                      const fileList = backupFiles.files
                        .map(file => `${file.patientId} (${new Date(file.modified).toLocaleString()})`)
                        .join('\n');
                      alert(
                        `Fichiers de sauvegarde disponibles:\n\n${fileList}\n\n` +
                        `Total: ${backupFiles.files.length} fichiers`
                      );
                    } else {
                      alert('Aucun fichier de sauvegarde trouvé');
                    }
                  } catch (error) {
                    console.error('Error getting backup files:', error);
                    alert('Erreur lors de la récupération des fichiers de sauvegarde');
                  }
                }}
              >
                <i className="fas fa-list"></i>
                Lister Sauvegardes
              </button>
            </div>
          </div>
        )}

        {/* Google Drive Backup Section */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#e8f4fd', borderRadius: '5px', border: '1px solid #b3d9ff' }}>
          <h4 style={{ color: '#1976d2', marginBottom: '1rem', fontSize: '1rem' }}>
            <i className="fab fa-google-drive" style={{ marginRight: '8px' }}></i>
            Sauvegarde Google Drive
          </h4>
          
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ 
                width: '12px', 
                height: '12px', 
                borderRadius: '50%', 
                backgroundColor: googleDriveConnected ? '#4caf50' : '#f44336',
                display: 'inline-block'
              }}></div>
              <span style={{ fontSize: '0.9rem', color: '#666' }}>
                {googleDriveStatus}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {!googleDriveConnected ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConnectGoogleDrive}
                disabled={googleDriveLoading}
                style={{ 
                  backgroundColor: '#1976d2', 
                  borderColor: '#1976d2',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                {googleDriveLoading ? (
                  <span className="spinner" style={{ width: '16px', height: '16px' }}></span>
                ) : (
                  <i className="fab fa-google-drive"></i>
                )}
                Connect to Google Drive
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={handleBackupToGoogleDrive}
                  disabled={googleDriveLoading}
                  style={{ 
                    backgroundColor: '#4caf50', 
                    borderColor: '#4caf50',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {googleDriveLoading ? (
                    <span className="spinner" style={{ width: '16px', height: '16px' }}></span>
                  ) : (
                    <i className="fas fa-cloud-upload-alt"></i>
                  )}
                  Backup to Google Drive
                </button>

                <button
                  type="button"
                  className="btn btn-warning"
                  onClick={handleRestoreFromGoogleDrive}
                  disabled={googleDriveLoading}
                  style={{ 
                    backgroundColor: '#ff9800', 
                    borderColor: '#ff9800',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {googleDriveLoading ? (
                    <span className="spinner" style={{ width: '16px', height: '16px' }}></span>
                  ) : (
                    <i className="fas fa-cloud-download-alt"></i>
                  )}
                  Restore from Google Drive
                </button>

                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleDisconnectGoogleDrive}
                  disabled={googleDriveLoading}
                  style={{ 
                    backgroundColor: '#f44336', 
                    borderColor: '#f44336',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <i className="fas fa-unlink"></i>
                  Disconnect
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleRecreateFolder}
                  disabled={googleDriveLoading}
                  style={{ 
                    backgroundColor: '#6c757d', 
                    borderColor: '#6c757d',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {googleDriveLoading ? (
                    <span className="spinner" style={{ width: '16px', height: '16px' }}></span>
                  ) : (
                    <i className="fas fa-folder-plus"></i>
                  )}
                  Recreate Folder
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCleanupDuplicateFiles}
                  disabled={googleDriveLoading}
                  style={{ 
                    backgroundColor: '#6c757d', 
                    borderColor: '#6c757d',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {googleDriveLoading ? (
                    <span className="spinner" style={{ width: '16px', height: '16px' }}></span>
                  ) : (
                    <i className="fas fa-trash"></i>
                  )}
                  Cleanup Duplicate Files
                </button>
              </>
            )}
          </div>

          {/* Auto-backup controls */}
          {googleDriveConnected && (
            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f0f8ff', borderRadius: '5px', border: '1px solid #d1ecf1' }}>
              <h5 style={{ color: '#0c5460', marginBottom: '1rem', fontSize: '0.95rem' }}>
                <i className="fas fa-sync-alt" style={{ marginRight: '8px' }}></i>
                Automatic Backup Settings
              </h5>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ 
                    width: '12px', 
                    height: '12px', 
                    borderRadius: '50%', 
                    backgroundColor: googleDriveAutoBackupEnabled ? '#4caf50' : '#f44336',
                    display: 'inline-block'
                  }}></div>
                  <span style={{ fontSize: '0.9rem', color: '#666' }}>
                    Auto-backup: {googleDriveAutoBackupEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn ${googleDriveAutoBackupEnabled ? 'btn-warning' : 'btn-success'}`}
                  onClick={handleToggleAutoBackup}
                  disabled={googleDriveLoading}
                  style={{ 
                    backgroundColor: googleDriveAutoBackupEnabled ? '#ff9800' : '#4caf50', 
                    borderColor: googleDriveAutoBackupEnabled ? '#ff9800' : '#4caf50',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {googleDriveLoading ? (
                    <span className="spinner" style={{ width: '16px', height: '16px' }}></span>
                  ) : (
                    <i className={`fas ${googleDriveAutoBackupEnabled ? 'fa-pause' : 'fa-play'}`}></i>
                  )}
                  {googleDriveAutoBackupEnabled ? 'Disable Auto-backup' : 'Enable Auto-backup'}
                </button>

                <button
                  type="button"
                  className="btn btn-info"
                  onClick={handleRunScheduledBackup}
                  disabled={googleDriveLoading || !googleDriveAutoBackupEnabled}
                  style={{ 
                    backgroundColor: '#17a2b8', 
                    borderColor: '#17a2b8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    opacity: googleDriveAutoBackupEnabled ? 1 : 0.6
                  }}
                >
                  {googleDriveLoading ? (
                    <span className="spinner" style={{ width: '16px', height: '16px' }}></span>
                  ) : (
                    <i className="fas fa-clock"></i>
                  )}
                  Run Backup Now
                </button>
              </div>

              <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#666' }}>
                <p style={{ margin: '0.25rem 0' }}>
                  <i className="fas fa-info-circle" style={{ marginRight: '0.5rem' }}></i>
                  When enabled, data is automatically backed up every 30 minutes and when changes are made.
                </p>
                <p style={{ margin: '0.25rem 0' }}>
                  <i className="fas fa-shield-alt" style={{ marginRight: '0.5rem' }}></i>
                  Auto-backup includes: patients, appointments, and settings.
                </p>
              </div>
            </div>
          )}

          <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#666' }}>
            <p style={{ margin: '0.25rem 0' }}>
              <i className="fas fa-info-circle" style={{ marginRight: '0.5rem' }}></i>
              Google Drive backup provides secure cloud storage for your patient records and appointments.
            </p>
            <p style={{ margin: '0.25rem 0' }}>
              <i className="fas fa-shield-alt" style={{ marginRight: '0.5rem' }}></i>
              Your data is encrypted and stored securely in your Google Drive account.
            </p>
            <p style={{ margin: '0.25rem 0' }}>
              <i className="fas fa-exclamation-triangle" style={{ marginRight: '0.5rem', color: '#ff9800' }}></i>
              If you see "No folder ID available" errors, use the "Recreate Folder" button to fix the issue.
            </p>
          </div>
        </div>

        {/* Backup Information */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
          <h4 style={{ color: '#667eea', marginBottom: '1rem', fontSize: '1rem' }}>
            <i className="fas fa-info-circle" style={{ marginRight: '8px' }}></i>
            Fonctionnalités de Sauvegarde et Restauration
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <h5 style={{ color: '#28a745', marginBottom: '0.5rem' }}>Sauvegarde Automatique</h5>
              <ul style={{ listStyle: 'none', padding: 0, fontSize: '0.9rem' }}>
                <li style={{ padding: '0.25rem 0' }}>✓ Chaque patient sauvegardé individuellement</li>
                <li style={{ padding: '0.25rem 0' }}>✓ Sauvegarde automatique lors de l'ajout</li>
                <li style={{ padding: '0.25rem 0' }}>✓ Sauvegarde automatique lors de la modification</li>
                <li style={{ padding: '0.25rem 0' }}>✓ Horodatage de chaque sauvegarde</li>
                <li style={{ padding: '0.25rem 0' }}>✓ Fichiers nommés avec l'ID patient</li>
                <li style={{ padding: '0.25rem 0' }}>🔄 Résilient aux changements de lettre de disque</li>
              </ul>
            </div>
            <div>
              <h5 style={{ color: '#667eea', marginBottom: '0.5rem' }}>Restauration & Résilience</h5>
              <ul style={{ listStyle: 'none', padding: 0, fontSize: '0.9rem' }}>
                <li style={{ padding: '0.25rem 0' }}>📁 Dossier: <code>patients/</code></li>
                <li style={{ padding: '0.25rem 0' }}>📄 Format: <code>patient_id_timestamp.json</code></li>
                <li style={{ padding: '0.25rem 0' }}>🔄 Version: 1.0</li>
                <li style={{ padding: '0.25rem 0' }}>📊 Données complètes du patient</li>
                <li style={{ padding: '0.25rem 0' }}>🔄 Restauration automatique des patients</li>
                <li style={{ padding: '0.25rem 0' }}>🔍 Détection automatique du disque</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Backup Status */}
        <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem' }}>
          <div style={{ textAlign: 'center', padding: '0.5rem', backgroundColor: settings.backup_path ? '#e8f5e8' : '#fff3cd', borderRadius: '3px' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: settings.backup_path ? '#28a745' : '#856404' }}>
              {settings.backup_path ? '✓' : '⚠'}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>
              {settings.backup_path ? 'Configuré' : 'Non Configuré'}
            </div>
          </div>
          
          <div style={{ textAlign: 'center', padding: '0.5rem', backgroundColor: '#e3f2fd', borderRadius: '3px' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2196f3' }}>🔄</div>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>Automatique</div>
          </div>
          
          <div style={{ textAlign: 'center', padding: '0.5rem', backgroundColor: '#fff3e0', borderRadius: '3px' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ff9800' }}>📁</div>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>Individuel</div>
          </div>
          
          <div style={{ textAlign: 'center', padding: '0.5rem', backgroundColor: '#f3e5f5', borderRadius: '3px' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#9c27b0' }}>⏰</div>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>Horodaté</div>
          </div>

          <div style={{ textAlign: 'center', padding: '0.5rem', backgroundColor: '#e8f5e8', borderRadius: '3px' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#28a745' }}>🔄</div>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>Restauration</div>
          </div>

          <div style={{ textAlign: 'center', padding: '0.5rem', backgroundColor: '#fff3e0', borderRadius: '3px' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ff9800' }}>📋</div>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>Liste Fichiers</div>
          </div>

          <div style={{ textAlign: 'center', padding: '0.5rem', backgroundColor: '#e3f2fd', borderRadius: '3px' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2196f3' }}>🔍</div>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>Détection Disque</div>
          </div>

          <div style={{ textAlign: 'center', padding: '0.5rem', backgroundColor: '#e8f5e8', borderRadius: '3px' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#28a745' }}>🔄</div>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>Auto-Résolution</div>
          </div>
        </div>
      </div>

      {/* License Info */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-id-card" style={{ marginRight: '10px' }}></i>
            {t('license')}
          </h3>
        </div>

        <div className="card-body">
          {/* Trial/License Days Remaining - prominent banner */}
          {!licenseStatus.loading && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.75rem 1rem',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              backgroundColor: licenseStatus.expired
                ? '#fdecea' // red-ish
                : (licenseStatus.activated ? '#e8f5e9' : '#fff8e1'), // green for license, amber for trial
              border: '1px solid ' + (licenseStatus.expired
                ? '#f5c6cb'
                : (licenseStatus.activated ? '#c8e6c9' : '#ffe0b2')),
            }}>
              <i
                className={`fas ${licenseStatus.expired ? 'fa-exclamation-triangle' : 'fa-hourglass-half'}`}
                style={{ color: licenseStatus.expired ? '#c62828' : (licenseStatus.activated ? '#2e7d32' : '#ef6c00') }}
              />
              <span style={{ fontWeight: 600 }}>
                {licenseStatus.expired ? (
                  licenseStatus.activated ? (t('licenseExpired') || 'License expired') : (t('trialExpired') || 'Trial expired')
                ) : (
                  licenseStatus.activated
                    ? ((t('license') || 'License') + ': ' + (Number(licenseStatus.daysLeft) || 0) + ' ' + (t('daysLeft') || 'days left'))
                    : ((t('trial') || 'Trial') + ': ' + (Number(licenseStatus.daysLeft) || 0) + ' ' + (t('daysLeft') || 'days left'))
                )}
              </span>
          </div>
          )}

          {/* Fingerprint */}
          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label className="form-label" htmlFor="hwid" style={{ marginRight: 12 }}>{t('machineId') || 'Machine Fingerprint'}</label>
              <div>
                <button type="button" className="btn btn-secondary" onClick={copyHwid} disabled={!hwid} style={{ marginRight: 8 }}>
                  {t('copy') || 'Copy'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={emailFingerprint} disabled={!hwid}>
                  {t('emailDeveloper') || 'Email Developer'}
                </button>
              </div>
            </div>
            <input
              type="text"
              id="hwid"
              name="hwid"
              className="form-input"
              value={hwid || ''}
              readOnly
              placeholder={t('enterMachineId')}
            />
            {hwidCopyStatus && (
              <small className="form-hint" style={{ color: '#4caf50' }}>{hwidCopyStatus}</small>
            )}
          </div>

          {/* License input */}
          <div className="form-group">
            <label className="form-label" htmlFor="licenseKey">{t('licenceKey') || 'License Key'}</label>
            <textarea
              id="licenseKey"
              name="licenseKey"
              className="form-input"
              rows={3}
              placeholder={t('enterLicenceKey') || 'Paste your license key here'}
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" className="btn btn-primary" onClick={handleActivateLicense} disabled={activating || !licenseKey}>
              {activating ? (t('activating') || 'Activating...') : (t('activate') || 'Activate')}
            </button>
            {!licenseStatus.loading && (
              <span style={{ fontSize: 14, color: licenseStatus.activated && !licenseStatus.expired ? '#2e7d32' : '#c62828' }}>
                {licenseStatus.error ? licenseStatus.error : (
                  licenseStatus.activated ? (
                    licenseStatus.expired ? (t('licenseExpired') || 'License expired') : ((t('licenseActive') || 'License active') + (licenseStatus.daysLeft ? ` · ${licenseStatus.daysLeft} days left` : ''))
                  ) : (
                    licenseStatus.expired
                      ? (t('trialExpired') || 'Trial expired')
                      : ((t('trial') || 'Trial') + ` · ${Number(licenseStatus.daysLeft) || 0} ` + (t('daysLeft') || 'days left'))
                  )
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* System Information */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-info-circle" style={{ marginRight: '10px' }}></i>
            Informations Système
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div>
            <h4 style={{ marginBottom: '1rem', color: '#667eea' }}>Application</h4>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              <li style={{ padding: '0.5rem 0', borderBottom: '1px solid #f0f0f0' }}>
                <strong>Version:</strong> MedOps 1.0.0
              </li>
              <li style={{ padding: '0.5rem 0', borderBottom: '1px solid #f0f0f0' }}>
                <strong>Base de données:</strong> SQLite
              </li>
              <li style={{ padding: '0.5rem 0', borderBottom: '1px solid #f0f0f0' }}>
                <strong>Langue actuelle:</strong> {settings.language === 'fr' ? 'Français' : 'English'}
              </li>
              <li style={{ padding: '0.5rem 0', borderBottom: '1px solid #f0f0f0' }}>
                <strong>Mode de communication:</strong> WiFi
              </li>
            </ul>
          </div>
          
          <div>
            <h4 style={{ marginBottom: '1rem', color: '#667eea' }}>Stockage</h4>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              <li style={{ padding: '0.5rem 0', borderBottom: '1px solid #f0f0f0' }}>
                <strong>Base de données:</strong> C:\MedOps\Data\medops.db
              </li>
              <li style={{ padding: '0.5rem 0', borderBottom: '1px solid #f0f0f0' }}>
                <strong>Fichiers patients:</strong> C:\Cabneo\AssistantApp\Data\PatientFiles\
              </li>
              <li style={{ padding: '0.5rem 0', borderBottom: '1px solid #f0f0f0' }}>
                <strong>Sauvegarde:</strong> {settings.backup_path || 'Non configuré'}
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Cross-Machine Communication */}
      <div className="card">
        <div 
          className="card-header" 
          style={{ cursor: 'pointer' }}
          onClick={() => setCrossMachineExpanded(!crossMachineExpanded)}
        >
          <h3 className="card-title">
            <i className="fas fa-network-wired" style={{ marginRight: '10px' }}></i>
            Communication Inter-Machines
            <span style={{ marginLeft: 'auto', fontSize: '1.2rem' }}>
              {crossMachineExpanded ? '▼' : '▶'}
            </span>
          </h3>
        </div>

        {crossMachineExpanded && (
          <div className="card-body">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Connected Machines */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-lg font-semibold mb-4">Machines Connectées</h4>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Statut de la Machine:</label>
                  <select
                    value={machineStatus}
                    onChange={(e) => setMachineStatus(e.target.value)}
                    className="w-full p-2 border rounded"
                  >
                    <option value="online">En ligne</option>
                    <option value="busy">Occupé</option>
                    <option value="away">Absent</option>
                    <option value="offline">Hors ligne</option>
                  </select>
                </div>
                
                <div className="space-y-2">
                  {connectedMachines.map((machine, index) => (
                    <div key={index} className="p-3 bg-white rounded flex justify-between items-center border">
                      <div>
                        <div className="font-semibold">{machine.machineId}</div>
                        <div className="text-sm text-gray-600">{machine.machineType}</div>
                      </div>
                      <button
                        onClick={() => setSelectedMachine(machine.machineId)}
                        className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
                      >
                        Sélectionner
                      </button>
                    </div>
                  ))}
                  {connectedMachines.length === 0 && (
                    <div className="text-center text-gray-500 py-4">
                      Aucune machine connectée
                    </div>
                  )}
                </div>
                
                <button
                  onClick={loadConnectedMachines}
                  className="mt-4 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                >
                  Actualiser les Machines
                </button>
              </div>

              {/* Cross-Machine Messaging */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-lg font-semibold mb-4">Messagerie Inter-Machines</h4>
                
                <form onSubmit={sendCrossMachineMessage} className="mb-4">
                  <div className="space-y-3">
                    <select
                      value={selectedMachine}
                      onChange={(e) => setSelectedMachine(e.target.value)}
                      className="w-full p-2 border rounded"
                      required
                    >
                      <option value="">Sélectionner une machine</option>
                      {connectedMachines.map((machine, index) => (
                        <option key={index} value={machine.machineId}>
                          {machine.machineId} ({machine.machineType})
                        </option>
                      ))}
                    </select>
                    
                    <textarea
                      placeholder="Tapez votre message..."
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      className="w-full p-2 border rounded h-20"
                      required
                    />
                    
                    <button
                      type="submit"
                      className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
                      disabled={!selectedMachine}
                    >
                      Envoyer le Message
                    </button>
                  </div>
                </form>
                
                <div className="mt-4">
                  <h5 className="font-semibold mb-2">Messages Récents</h5>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {crossMachineMessages.map((message, index) => (
                      <div key={index} className="p-2 bg-white rounded text-sm border">
                        <div className="font-semibold">{message.senderMachineId || 'Inconnu'}</div>
                        <div>{message.message}</div>
                        <div className="text-xs text-gray-500">{message.timestamp}</div>
                      </div>
                    ))}
                    {crossMachineMessages.length === 0 && (
                      <div className="text-center text-gray-500 py-2">
                        Aucun message
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* File Transfer */}
            <div className="mt-6 bg-gray-50 p-4 rounded-lg">
              <h4 className="text-lg font-semibold mb-4">Transfert de Fichiers</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h5 className="font-semibold mb-2">Envoyer un Fichier</h5>
                  <div className="space-y-3">
                    <select
                      value={selectedMachine}
                      onChange={(e) => setSelectedMachine(e.target.value)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="">Sélectionner la machine cible</option>
                      {connectedMachines.map((machine, index) => (
                        <option key={index} value={machine.machineId}>
                          {machine.machineId} ({machine.machineType})
                        </option>
                      ))}
                    </select>
                    
                    <input
                      type="file"
                      onChange={handleFileUpload}
                      className="w-full p-2 border rounded"
                      disabled={!selectedMachine}
                    />
                    
                    <button
                      onClick={() => requestFileTransfer(selectedMachine, 'example.txt')}
                      className="w-full bg-green-500 text-white p-2 rounded hover:bg-green-600"
                      disabled={!selectedMachine}
                    >
                      Demander le Transfert
                    </button>
                  </div>
                </div>
                
                <div>
                  <h5 className="font-semibold mb-2">Demandes de Transfert</h5>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {fileTransferRequests.map((request, index) => (
                      <div key={index} className="p-2 bg-white rounded text-sm border">
                        <div>
                          <span
                            style={{ color: '#0074d9', textDecoration: 'underline', cursor: 'pointer' }}
                            onClick={() => {
                              if (shell && request.filePath) {
                                shell.openPath(request.filePath);
                              } else {
                                console.log('File clicked:', request.fileName);
                              }
                            }}
                          >
                            {request.fileName}
                          </span>
                        </div>
                        <div>De: {request.requesterMachineId}</div>
                        <div className="text-xs text-gray-500">{request.timestamp}</div>
                      </div>
                    ))}
                    {fileTransferRequests.length === 0 && (
                      <div className="text-center text-gray-500 py-2">
                        Aucune demande de transfert
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Machine Information */}
            <div className="mt-6 bg-gray-50 p-4 rounded-lg">
              <h4 className="text-lg font-semibold mb-4">Informations de la Machine</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3 bg-blue-100 rounded">
                  <div className="font-semibold">ID de la Machine</div>
                  <div className="text-sm">{window.electronAPI && window.electronAPI.getMachineId ? window.electronAPI.getMachineId() : 'Non disponible'}</div>
                </div>
                
                <div className="p-3 bg-green-100 rounded">
                  <div className="font-semibold">Type de Machine</div>
                  <div className="text-sm">{window.electronAPI && window.electronAPI.getMachineType ? window.electronAPI.getMachineType() : 'Non disponible'}</div>
                </div>
                
                <div className="p-3 bg-yellow-100 rounded">
                  <div className="font-semibold">Statut de Connexion</div>
                  <div className="text-sm">{window.electronAPI && window.electronAPI.isSocketConnected ? (window.electronAPI.isSocketConnected() ? 'Connecté' : 'Déconnecté') : 'Non disponible'}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Debug Logs */}
      {debugLogs.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <i className="fas fa-bug" style={{ marginRight: '10px' }}></i>
              Debug Logs
            </h3>
          </div>
          <div style={{ 
            backgroundColor: '#f8f9fa', 
            border: '1px solid #e9ecef', 
            borderRadius: '0.375rem', 
            padding: '1rem',
            maxHeight: '200px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '0.875rem'
          }}>
            {debugLogs.map((log, index) => (
              <div key={index} style={{ 
                padding: '0.25rem 0',
                borderBottom: index < debugLogs.length - 1 ? '1px solid #e9ecef' : 'none'
              }}>
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save Button */}
      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={handleSaveSettings}
          disabled={saving}
        >
          {saving ? (
            <>
              <span className="spinner" style={{ marginRight: '0.5rem' }}></span>
              Sauvegarde...
            </>
          ) : (
            <>
              <i className="fas fa-save" style={{ marginRight: '0.5rem' }}></i>
              Sauvegarder les Paramètres
            </>
          )}
        </button>
      </div>

      <div className="card">
        <h3>Test Dashboard Status</h3>
        <p>Manually test sending dashboard status to doctor's app</p>
        <button 
          className="btn btn-primary" 
          onClick={async () => {
            try {
              console.log('[SETTINGS] Testing dashboard status send...');
              const result = await window.electronAPI.testDashboardStatus();
              console.log('[SETTINGS] Test result:', result);
              if (result.success) {
                addNotification('Dashboard status sent successfully!', 'success');
              } else {
                addNotification(`Test failed: ${result.message}`, 'error');
              }
            } catch (error) {
              console.error('[SETTINGS] Error testing dashboard status:', error);
              addNotification('Error testing dashboard status', 'error');
            }
          }}
        >
          Test Dashboard Status Send
        </button>
      </div>
    </div>
  );
}

export default Settings; 