import React, { useState, useEffect, useRef } from 'react';
import FileItem from '../components/FileItem';
import { useTranslation } from 'react-i18next';
import { safeFocus, enableFormInputsAndFocus, forceEnableFormInputs, fixElectronInputLocking, fixDashboardNavigationInputLocking, diagnoseInputBlocking, removeBlockingOverlays, forceElectronWindowFocus } from '../utils/focusUtils';
import { useLocation } from 'react-router-dom';
import { smartScrollToElement, preventAutoScroll } from '../utils/scrollUtils';
import googleDriveService from '../services/googleDriveService';
import { useConfirm } from '../context/ConfirmContext';

// Utility to extract 2-digit number from name or generate random 2-char suffix
function getIdSuffixFromName(name) {
  const match = name.match(/(\d{2})/);
  if (match) return match[1];
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 2; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Utility to extract 2 digits before the last digit from phone
function getPhoneSuffix(phone) {
  if (!phone) return '00';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 3) return digits.padStart(2, '0');
  return digits.slice(-3, -1); // 2 digits before last digit
}

function PatientPanel({ isDoctorConnected, addNotification }) {
  const instanceId = useRef(Math.random().toString(36).substr(2, 5));
  console.log('[RENDERER] PatientPanel instance:', instanceId.current, 'loaded');
  console.log('PatientPanel rendered'); // DEBUG: Confirm component is rendering
  const { t } = useTranslation();
  const location = useLocation();
  const confirm = useConfirm();
  const [patientData, setPatientData] = useState({
    name: '',
    phone: '',
    email: '',
    urgent_contact: '',
    convention: '',
    insurances: '',
    reason_for_visit: '',
    medical_history: '',
    date_of_birth: '',
    consultation_price: '',
    year_of_birth: ''
  });
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [notification, setNotification] = useState('');
  const nameInputRef = useRef(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState(null);
  const [patientFiles, setPatientFiles] = useState([]);
  const [firstTimePatients, setFirstTimePatients] = useState([]);
  const [existingPatientsWithAppointments, setExistingPatientsWithAppointments] = useState([]);
  const [hasProcessedNavigationState, setHasProcessedNavigationState] = useState(false);
  // Synchronous guard to prevent duplicate submissions (e.g., double-click)
  const isSavingRef = useRef(false);

  // Use local date (YYYY-MM-DD) to match database comparisons
  const getTodayLocalYMD = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Link today's appointment(s) that have no patient_id to the specified patientId
  const linkTodaysAppointmentsToPatient = async (patientId) => {
    try {
      const appointments = await window.electronAPI.getAppointments();
      const today = getTodayLocalYMD();

      // Prefer appointment ID from navigation state when available
      const navAptId = location.state?.prefillPatientData?.appointment_id || location.state?.appointmentId;
      let linked = 0;
      for (const apt of appointments) {
        const noPid = !apt.patient_id || apt.patient_id === '';
        const isToday = apt.appointment_date === today;
        const nameMatches = apt.patient_name && patientData.name && apt.patient_name.toLowerCase() === patientData.name.toLowerCase();
        const idMatches = navAptId && apt.id === navAptId;
        if (isToday && noPid && (idMatches || nameMatches)) {
          await window.electronAPI.updateAppointment({ ...apt, patient_id: patientId });
          linked++;
        }
      }
      if (linked > 0) {
        console.log(`[PatientPanel] Linked ${linked} appointment(s) to patient ${patientId}`);
      }
    } catch (e) {
      console.warn('[PatientPanel] Failed linking appointments to patient:', e);
    }
  };

  // Function to reset the form
  const resetForm = () => {
    // First, ensure loading state is reset immediately
    setLoading(false);
    
    setPatientData({
      name: '',
      phone: '',
      email: '',
      urgent_contact: '',
      convention: '',
      insurances: '',
      reason_for_visit: '',
      medical_history: '',
      date_of_birth: '',
      consultation_price: '',
      year_of_birth: ''
    });
    setSelectedFiles([]);
    setEditingPatientId(null);
    setHasProcessedNavigationState(false);
    
    // Use the utility function to enable inputs and focus
    enableFormInputsAndFocus(nameInputRef.current, 100);
  };

  // Handle transferring any patient without an appointment today (full payload, no badges)
  const handleTransferAnyPatient = async (patient) => {
    try {
      if (!patient.id) {
        addNotification('Erreur: ID du patient manquant', 'error');
        return;
      }
      if (!isDoctorConnected) {
        addNotification('Le médecin n\'est pas connecté. Veuillez attendre la connexion du médecin.', 'error');
        return;
      }
      // Include all existing patient files (images/documents) when sending
      const files = await window.electronAPI.getPatientFiles(patient.id).catch(() => []);
      await window.electronAPI.sendPatientData({
        patientData: patient,
        files,
        patientId: patient.id
      });
      addNotification(`Patient ${patient.id} transféré au médecin`, 'success');
    } catch (error) {
      console.error('Error transferring patient:', error);
      addNotification('Erreur lors du transfert au médecin', 'error');
    }
  };



  // Ensure loading state is reset when component mounts and handle focus issues
  useEffect(() => {
    setLoading(false);
    console.log('[DEBUG] PatientPanel: Loading state reset on mount');
    
    // Force reset loading state and ensure form is enabled with enhanced timing
    setTimeout(() => {
      setLoading(false);
      
      // Ensure form inputs are properly enabled
      const inputs = document.querySelectorAll('input, textarea, select');
      inputs.forEach(input => {
        if (input.hasAttribute('disabled')) {
          input.removeAttribute('disabled');
        }
      });
      
      // Use the comprehensive fix for Electron input locking
      fixDashboardNavigationInputLocking();
    }, 100);
    
    // Additional fix specifically for navigation from dashboard
    setTimeout(() => {
      if (location.state?.prefillPatientName || location.state?.prefillPatientData) {
        console.log('[DEBUG] PatientPanel: Navigation from dashboard detected, forcing input enable');
        fixDashboardNavigationInputLocking();
        setLoading(false);
      }
    }, 200);
    
    // Add event listener for window focus to handle Electron focus issues
    const handleWindowFocus = () => {
      // If loading state is stuck, reset it and force enable inputs
      if (loading) {
        setLoading(false);
        console.log('[DEBUG] PatientPanel: Loading state reset on window focus');
        forceEnableFormInputs();
      }
    };
    
    window.addEventListener('focus', handleWindowFocus);
    
    // Add keyboard shortcut for debugging (Ctrl+Shift+E to force enable inputs)
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        forceEnableFormInputs();
        console.log('[DEBUG] PatientPanel: Force enable inputs triggered by keyboard shortcut');
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, location.state]);

  // Additional safety: reset loading state if it gets stuck
  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => {
        console.log('[DEBUG] PatientPanel: Loading state timeout - forcing reset');
        setLoading(false);
      }, 5000); // Reset after 5 seconds if still loading
      
      return () => clearTimeout(timeout);
    }
  }, [loading]);

  // Force reset loading state when component becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setLoading(false);
        console.log('[DEBUG] PatientPanel: Visibility change - reset loading state');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Handle navigation to PatientPanel - ensure form is properly reset
  useEffect(() => {
    const handleNavigation = () => {
      // Reset form state when navigating to this page
      setLoading(false);
      resetForm();
      console.log('[DEBUG] PatientPanel: Navigation detected - form reset');
    };

    // Listen for hash changes (since we're using HashRouter)
    window.addEventListener('hashchange', handleNavigation);
    
    // Also handle popstate events
    window.addEventListener('popstate', handleNavigation);

    return () => {
      window.removeEventListener('hashchange', handleNavigation);
      window.removeEventListener('popstate', handleNavigation);
    };
  }, []);

  // Specific effect to handle navigation from dashboard with prefill data
  useEffect(() => {
    if ((location.state?.prefillPatientName || location.state?.prefillPatientData) && !hasProcessedNavigationState) {
      console.log('[DEBUG] PatientPanel: Navigation from dashboard with prefill data detected');
      
      // Reset loading state immediately
      setLoading(false);
      
      // Use the specific dashboard navigation fix with a single attempt
      setTimeout(() => {
        fixDashboardNavigationInputLocking();
      }, 100);
    }
  }, [location.state, hasProcessedNavigationState]);

  // Reset the navigation state flag when location changes or component unmounts
  useEffect(() => {
    // Reset the flag when location changes (but not when it's the same location with state)
    setHasProcessedNavigationState(false);
    
    return () => {
      // Reset flag on unmount
      setHasProcessedNavigationState(false);
    };
  }, [location.pathname]); // Only depend on pathname, not the full location

  const fetchPatients = async (searchTerm = '') => {
    setSearchLoading(true);
    try {
      console.log('[FRONTEND] fetchPatients: Fetching patients with searchTerm:', searchTerm);
      const [result, appointments] = await Promise.all([
        window.electronAPI.getTodayPatients(),
        window.electronAPI.getAppointments()
      ]);
      console.log('[FRONTEND] fetchPatients: Today DB patients count:', Array.isArray(result) ? result.length : 'n/a');
      console.log('[FRONTEND] fetchPatients: Appointments count:', Array.isArray(appointments) ? appointments.length : 'n/a');
      
      // Debug: Check which patients have appointments for today
      const today = getTodayLocalYMD();
      const todayAppointments = appointments.filter(apt => apt.appointment_date === today);
      console.log('[FRONTEND] fetchPatients: Today (local):', today, 'Today appointments count:', todayAppointments.length);
      
      // Debug: Check which patients from result have appointments for today
      const patientsWithTodayAppointments = result.filter(patient =>
        todayAppointments.some(apt => apt.patient_id === patient.id)
      );
      console.log('[FRONTEND] fetchPatients: Existing patients with today appointments count:', patientsWithTodayAppointments.length);
      
      // Detect first-time patients with appointments
      const firstTimeWithAppointments = await detectFirstTimePatientsWithAppointments(appointments, result);
      setFirstTimePatients(firstTimeWithAppointments);
      console.log('[FRONTEND] fetchPatients: First-time patients detected count:', firstTimeWithAppointments.length);
      
      // Detect existing patients with appointments
      const existingWithAppointments = await detectExistingPatientsWithAppointments(appointments, result);
      setExistingPatientsWithAppointments(existingWithAppointments);
      // Merge: include today's DB patients (result), existing with today's appointment, and first-time patients
      const combinedRaw = [
        ...result,
        ...patientsWithTodayAppointments,
        ...firstTimeWithAppointments
      ];
      console.log('[FRONTEND] fetchPatients: Combined pre-dedupe count:', combinedRaw.length);

      // Dedupe by id if present, otherwise by lowercased name
      const seen = new Set();
      const combinedForPanel = [];
      for (const p of combinedRaw) {
        const key = (p && (p.id || '')).toString().trim() || `name:${(p.name || '').toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          combinedForPanel.push(p);
        }
      }
      console.log('[FRONTEND] fetchPatients: Combined post-dedupe count:', combinedForPanel.length);

      // Limit Patients Panel to only patients who have an appointment today (now includes first-time)
      setPatients(combinedForPanel);
      if (!searchTerm) {
        setFilteredPatients(combinedForPanel);
      } else {
        const lower = searchTerm.toLowerCase();
        setFilteredPatients(
          combinedForPanel.filter(p =>
            (p.name && p.name.toLowerCase().includes(lower)) ||
            (p.phone && p.phone.includes(lower)) ||
            (p.date_of_birth && p.date_of_birth.includes(lower))
          )
        );
      }
      console.log('[FRONTEND] fetchPatients: Filtered count:', searchTerm ? (Array.isArray(combinedForPanel) ? combinedForPanel.filter(p =>
        (p.name && p.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.phone && p.phone.includes(searchTerm.toLowerCase())) ||
        (p.date_of_birth && p.date_of_birth.includes(searchTerm.toLowerCase()))
      ).length : 0) : combinedForPanel.length);
    } catch (error) {
      setFilteredPatients([]);
      addNotification('Erreur lors de la recherche des patients', 'error');
      console.error('[FRONTEND] fetchPatients: Error:', error);
    } finally {
      setSearchLoading(false);
    }
  };

  // Detect first-time patients with appointments
  const detectFirstTimePatientsWithAppointments = async (appointments, existingPatients) => {
    try {
      const firstTimePatients = [];
      
      // Get today's date
      const today = getTodayLocalYMD();
      
      // Get all appointments for new patients (without patient_id), but ONLY for today
      const newPatientAppointments = appointments.filter(apt => 
        (!apt.patient_id || apt.patient_id === '') && 
        apt.appointment_date === today
      );
      console.log('[FRONTEND] detectFirstTimePatientsWithAppointments: Orphan appts today count:', newPatientAppointments.length);
      
      for (const appointment of newPatientAppointments) {
        // Check if this patient name already exists in the database (patients list)
        const existingPatient = existingPatients.find(p => 
          p.name.toLowerCase() === appointment.patient_name.toLowerCase()
        );
        
        // If patient doesn't exist in the database, they are first-time
        if (!existingPatient) {
          // Check if we already have this patient in our first-time list
          const alreadyAdded = firstTimePatients.find(p => 
            p.name.toLowerCase() === appointment.patient_name.toLowerCase()
          );
          
          if (!alreadyAdded) {
            // Create a first-time patient object
            const firstTimePatient = {
              id: `first_time_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: appointment.patient_name,
              phone: appointment.phone || '',
              email: appointment.email || '',
              date_of_birth: appointment.date_of_birth || '',
              reason_for_visit: appointment.reason || appointment.appointment_reason || '',
              appointment_date: appointment.appointment_date,
              appointment_time: appointment.appointment_time,
              isFirstTime: true,
              appointment_id: appointment.id
            };
            
            firstTimePatients.push(firstTimePatient);
          }
        }
      }
      console.log('[FRONTEND] detectFirstTimePatientsWithAppointments: First-time constructed count:', firstTimePatients.length);
      return firstTimePatients;
    } catch (error) {
      console.error('Error detecting first-time patients:', error);
      return [];
    }
  };

  // Detect existing patients with appointments (for transfer button)
  // A patient is considered "existing" if their ID follows the existing patient format
  // New patient ID: name + last 3 digits of phone (e.g., "oussema100")
  // Existing patient ID: year_of_birth + name + 2 digits before last (e.g., "2003_oussema_10")
  const detectExistingPatientsWithAppointments = async (appointments, existingPatients) => {
    try {
      const existingPatientsWithAppointments = [];
      
      // Get today's date
      const today = getTodayLocalYMD();
      
      // Get all appointments for patients with patient_id, but ONLY for today
      const patientAppointments = appointments.filter(apt => 
        apt.patient_id && 
        apt.patient_id !== '' && 
        apt.appointment_date === today
      );
      
      for (const appointment of patientAppointments) {
        // Find the patient in the database
        const patient = existingPatients.find(p => p.id === appointment.patient_id);
        if (patient) {
          // We consider any patient with an appointment today as existing for the panel display
          const alreadyAdded = existingPatientsWithAppointments.find(p => p.id === patient.id);
          if (!alreadyAdded) {
            existingPatientsWithAppointments.push({
              id: patient.id,
              appointment_reason: appointment.appointment_reason || appointment.reason || '',
              appointment_context: appointment.appointment_reason || appointment.reason || '',
              appointment_date: appointment.appointment_date,
              appointment_time: appointment.appointment_time,
              isExistingWithAppointment: true
            });
          }
        }
      }
      
      return existingPatientsWithAppointments;
    } catch (error) {
      console.error('Error detecting existing patients with appointments:', error);
      return [];
    }
  };

  useEffect(() => {
    // Store current scroll position before any state changes
    const currentScrollY = window.scrollY;

    // Prevent auto-scroll on state changes
    preventAutoScroll();
    
    fetchPatients(search);
    
    // Restore scroll position after state changes
    setTimeout(() => {
      if (window.scrollY !== currentScrollY) {
        window.scrollTo(0, currentScrollY);
      }
    }, 0);
    // eslint-disable-next-line
  }, [search]);

  useEffect(() => {
    if (!loading && nameInputRef.current) {
      safeFocus(nameInputRef.current);
    }
  }, [loading]);

  // On mount, if navigation is from appointments card with only name prefill, clear editing state
  useEffect(() => {
    if (location.state?.prefillPatientName && !location.state?.prefillPatientData && !hasProcessedNavigationState) {
      setEditingPatientId(null);
      setHasProcessedNavigationState(true);
      // Force enable inputs immediately when receiving prefill data
      setTimeout(() => {
        fixDashboardNavigationInputLocking();
        setLoading(false);
      }, 100);
    }
  }, [location.state, hasProcessedNavigationState]);

  useEffect(() => {
    if (location.state?.prefillPatientName && !hasProcessedNavigationState) {
      setPatientData(prev => ({
        ...prev,
        name: location.state.prefillPatientName || '',
        reason_for_visit: location.state.prefillReasonForVisit || prev.reason_for_visit
      }));
      // Focus the name input after prefill with enhanced timing
      setTimeout(() => {
        if (nameInputRef.current) {
          safeFocus(nameInputRef.current);
        }
        // Use the specific dashboard navigation fix
        fixDashboardNavigationInputLocking();
      }, 100);
      setLoading(false); // <-- Assure que le formulaire est débloqué
    }
  }, [location.state, hasProcessedNavigationState]);

  useEffect(() => {
    if (location.state?.prefillPatientData && !hasProcessedNavigationState) {
      const toStr = (v) => (v === null || v === undefined ? '' : v);
      const pd = location.state.prefillPatientData || {};
      // Normalize incoming values to avoid null/undefined in controlled inputs
      setPatientData(prev => ({
        ...prev,
        name: toStr(pd.name ?? prev.name),
        phone: toStr(pd.phone ?? prev.phone),
        email: toStr(pd.email ?? prev.email),
        urgent_contact: toStr(pd.urgent_contact ?? prev.urgent_contact),
        convention: toStr(pd.convention ?? prev.convention),
        insurances: toStr(pd.insurances ?? prev.insurances),
        reason_for_visit: toStr(pd.reason_for_visit ?? prev.reason_for_visit),
        medical_history: toStr(pd.medical_history ?? prev.medical_history),
        date_of_birth: toStr(pd.date_of_birth ?? prev.date_of_birth),
        consultation_price: toStr(pd.consultation_price ?? prev.consultation_price),
        year_of_birth: toStr(pd.year_of_birth ?? prev.year_of_birth),
        id: pd.id ?? prev.id
      }));
      if (location.state.prefillPatientData.id) {
        setEditingPatientId(location.state.prefillPatientData.id);
      }
      // Enhanced timing for input enabling when receiving full patient data
      setTimeout(() => {
        fixDashboardNavigationInputLocking();
        if (nameInputRef.current) {
          safeFocus(nameInputRef.current);
        }
      }, 100);
      setLoading(false); // <-- Assure que le formulaire est débloqué
      // Mark as processed after we have applied the full prefill
      setHasProcessedNavigationState(true);
    }
  }, [location.state, hasProcessedNavigationState]);

  // Handle input changes
  const handleInputChange = (e) => {
    setPatientData({
      ...patientData,
      [e.target.name]: e.target.value
    });
  };

  // Handle file selection
  const handleFileSelect = async () => {
    try {
      const filePaths = await window.electronAPI.selectFiles();
      if (filePaths && filePaths.length > 0) {
        setSelectedFiles(prev => [...prev, ...filePaths]);
      }
    } catch (error) {
      alert('Erreur lors de la sélection des fichiers');
    }
  };

  // Remove a file from the list
  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    // Prevent re-entrancy before React state updates apply
    if (isSavingRef.current) {
      console.log('[DEBUG] handleSubmit ignored: already saving');
      return;
    }
    
    // Validate BEFORE setting loading state
    if (!patientData.name || !patientData.date_of_birth) {
      addNotification('Le nom et la date de naissance sont requis', 'error');
      return;
    }
    // Do NOT set isSaving/loading yet. Wait until after any confirmation.
    // Track what we did to emit a single success notification at the end
    let actionType = null; // 'create' | 'update'
    
    try {
      const yearOfBirth = parseInt(patientData.date_of_birth.split('-')[0]);
      const namePart = patientData.name.toLowerCase().replace(/\s+/g, '');
      const phoneSuffix = getPhoneSuffix(patientData.phone);
      const patientId = `${yearOfBirth}_${namePart}_${phoneSuffix}`;
      
      // Check if a patient already exists with the basic ID format (from appointments)
      const phoneDigits = patientData.phone.replace(/\D/g, '');
      const last3 = phoneDigits.slice(-3);
      const basicPatientId = `${last3}_${namePart}`;
      
      console.log('[DEBUG] Patient ID generation:', {
        fullPatientId: patientId,
        basicPatientId: basicPatientId,
        editingPatientId: editingPatientId,
        patientName: patientData.name,
        phone: patientData.phone,
        yearOfBirth: yearOfBirth
      });
      
      // Check if we're editing an existing patient
      if (editingPatientId) {
        const isIdChanged = patientId !== editingPatientId;
        let shouldDeleteOld = false;
        let hasBeenEdited = true; // Always set to true for any edit
        
        if (isIdChanged) {
          shouldDeleteOld = true;
        }
        
        if (isIdChanged) {
          const confirmed = await confirm({
            title: 'Modifier l\'identifiant',
            message: 'Le nom ou l\'année de naissance a changé. Cela va modifier l\'identifiant du patient et mettre à jour ses rendez-vous. Continuer ?',
            confirmText: 'Continuer',
            cancelText: 'Annuler',
            variant: 'primary',
          });
          if (!confirmed) {
            // We haven't set loading yet; simply abort.
            return;
          }
          // Now we are proceeding with save operations
          isSavingRef.current = true;
          setLoading(true);
          console.log('setLoading(true) called in handleSubmit (after confirm, id changed)');
          // 1. Add new patient with new ID
          await window.electronAPI.addPatient({ ...patientData, id: patientId, yearOfBirth, status: 'existant', created_at: new Date().toISOString(), updatedAt: new Date().toISOString(), hasBeenEdited });
          actionType = 'update';
          // 2. Ensure the patient no longer appears on the appointments page by completing any of their appointments
          const appointments = await window.electronAPI.getAppointments();
          for (const apt of appointments) {
            if (apt.patient_id === editingPatientId && apt.status !== 'completed') {
              await window.electronAPI.updateAppointment({ ...apt, status: 'completed' });
            }
          }
          // 3. Save files to new patient
          if (selectedFiles.length > 0) {
            await window.electronAPI.savePatientFiles(patientId, selectedFiles);
          }
          // 4. Always delete the old patient after successful transfer
          await window.electronAPI.deletePatient(editingPatientId);
        } else {
          // Proceed to update existing patient without ID change
          isSavingRef.current = true;
          setLoading(true);
          console.log('setLoading(true) called in handleSubmit (update existing, id unchanged)');
          // Update existing patient
          await window.electronAPI.updatePatient({
            ...patientData,
            id: editingPatientId,
            yearOfBirth,
            status: 'existant',
            updatedAt: new Date().toISOString(),
            hasBeenEdited
          });
          actionType = 'update';
          // Save files for existing patient if any were selected
          if (selectedFiles.length > 0) {
            await window.electronAPI.savePatientFiles(editingPatientId, selectedFiles);
          }
        }
        // Refresh patient list
        await fetchPatients(search);
        // Do not auto-change appointment statuses on normal save.
        // Notify AllPatients page to refresh
        localStorage.setItem('allPatientsShouldRefresh', Date.now().toString());
      } else {
        console.log('[DEBUG] Creating new patient with full ID:', patientId);
        // Check if a patient already exists:
        // 1) Strong rule: same normalized name + same birth year (update that record)
        // 2) Fallback: a record with the basic ID format from appointments
        const existingPatients = await window.electronAPI.getPatients();

        // Helper to normalize names similarly across code paths
        const normalize = (s) => (s || '')
          .toString()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s]/g, '')
          .trim()
          .replace(/\s+/g, ' ');

        const targetYear = yearOfBirth;
        const targetName = normalize(patientData.name);

        // Prefer updating an existing patient with same name + birth year
        const existingByNameYear = existingPatients.find(p => {
          const existingYear = p.date_of_birth ? parseInt(String(p.date_of_birth).split('-')[0]) : p.year_of_birth;
          return existingYear === targetYear && normalize(p.name) === targetName;
        });

        // Fallback: legacy/basic ID record
        const existingPatient = existingByNameYear || existingPatients.find(p => p.id === basicPatientId);
        
        console.log('[DEBUG] Patient matching:', {
          basicPatientId: basicPatientId,
          existingPatientFound: !!existingPatient,
          existingPatientId: existingPatient?.id,
          totalPatients: existingPatients.length
        });
        
        if (existingPatient) {
          console.log('[DEBUG] Updating existing patient instead of creating duplicate. Target ID:', existingPatient.id);
          isSavingRef.current = true;
          setLoading(true);
          console.log('setLoading(true) called in handleSubmit (update existing by basic ID)');
          // Update the existing patient with the new information
          await window.electronAPI.updatePatient({
            ...patientData,
            id: existingPatient.id, // Keep the original (older) patient ID
            yearOfBirth,
            status: 'existant',
            updatedAt: new Date().toISOString(),
            hasBeenEdited: true
          });
          actionType = 'update';
          
          // Save files for existing patient if any were selected
          if (selectedFiles.length > 0) {
            await window.electronAPI.savePatientFiles(existingPatient.id, selectedFiles);
          }
          // Link today's appointment (without patient_id) to this patient
          await linkTodaysAppointmentsToPatient(existingPatient.id);
          
          await fetchPatients(search);
          // Notify AllPatients page to refresh
          localStorage.setItem('allPatientsShouldRefresh', Date.now().toString());
          
          // Switch to edit mode for the updated patient
          setEditingPatientId(existingPatient.id);
          setPatientData(prev => ({ ...prev, id: existingPatient.id, yearOfBirth }));
          try {
            const files = await window.electronAPI.getPatientFiles(existingPatient.id);
            setPatientFiles(files);
          } catch (error) {
            setPatientFiles([]);
          }
        } else {
          isSavingRef.current = true;
          setLoading(true);
          console.log('setLoading(true) called in handleSubmit (create new patient)');
          // Add new patient with the full ID format
          await window.electronAPI.addPatient({
            ...patientData,
            id: patientId,
            yearOfBirth,
            status: 'existant',
            created_at: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          actionType = 'create';
          
          // Save files for new patient if any were selected
          if (selectedFiles.length > 0) {
            await window.electronAPI.savePatientFiles(patientId, selectedFiles);
          }
          // Link today's appointment (without patient_id) to this new patient
          await linkTodaysAppointmentsToPatient(patientId);
          
          await fetchPatients(search);
          // Notify AllPatients page to refresh
          localStorage.setItem('allPatientsShouldRefresh', Date.now().toString());
          // --- Begin: Switch to edit mode for new patient and fetch files ---
          setEditingPatientId(patientId);
          setPatientData(prev => ({ ...prev, id: patientId, yearOfBirth }));
          try {
            const files = await window.electronAPI.getPatientFiles(patientId);
            setPatientFiles(files);
          } catch (error) {
            setPatientFiles([]);
          }
          // --- End: Switch to edit mode for new patient and fetch files ---
        }
      }
      
      // Auto-backup to Google Drive if enabled
      try {
        if (googleDriveService.isAutoBackupEnabled()) {
          const finalPatientId = editingPatientId || patientId || basicPatientId;
          console.log('[DEBUG] PatientPanel: Attempting to get patient with ID:', finalPatientId);
          console.log('[DEBUG] PatientPanel: window.electronAPI.getPatient available:', typeof window.electronAPI.getPatient);
          const updatedPatient = await window.electronAPI.getPatient(finalPatientId);
          if (updatedPatient) {
            await googleDriveService.autoBackupPatient(updatedPatient, editingPatientId ? 'update' : 'create');
          }
        }
      } catch (error) {
        console.error('Auto-backup failed:', error);
        // Don't show error to user as this is background operation
      }
      
      // Emit a single success notification based on action performed
      if (actionType === 'create') {
        addNotification(t('patientSaved'), 'success');
      } else if (actionType === 'update') {
        addNotification('Patient mis à jour avec succès', 'success');
      }

      // Do not inject saved patient into Patients Panel list.
      // Patients Panel shows only those with appointments today; other waiting cases appear in the Queue.

      // Reset loading state first
      setLoading(false);
      
      // Use setTimeout to ensure state updates are complete before resetting form
      setTimeout(() => {
        resetForm();
        setEditingPatientId(null);
      }, 50);
    } catch (error) {
      setLoading(false);
      addNotification('Erreur lors de l\'enregistrement du patient', 'error');
    } finally {
      // Always release the guard
      isSavingRef.current = false;
    }
  };

  // Transfer patient to doctor
  const handleTransferToDoctor = async () => {
    console.log('handleTransferToDoctor called', patientData);
    // Validate BEFORE setting loading state
    if (!patientData.name || !patientData.date_of_birth) {
      addNotification('Le nom et la date de naissance sont requis', 'error');
      return;
    }
    
    setLoading(true);
    console.log('setLoading(true) called in handleTransferToDoctor');
    
    try {
      const yearOfBirth = parseInt(patientData.date_of_birth.split('-')[0]);
      const namePart = patientData.name.toLowerCase().replace(/\s+/g, '');
      const phoneSuffix = getPhoneSuffix(patientData.phone);
      const patientId = `${yearOfBirth}_${namePart}_${phoneSuffix}`;
      
      // Check if a patient already exists with the basic ID format (from appointments)
      const phoneDigits = patientData.phone.replace(/\D/g, '');
      const last3 = phoneDigits.slice(-3);
      const basicPatientId = `${last3}_${namePart}`;
      
      console.log('[DEBUG] Transfer - Patient ID generation:', {
        fullPatientId: patientId,
        basicPatientId: basicPatientId,
        editingPatientId: editingPatientId,
        patientName: patientData.name,
        phone: patientData.phone,
        yearOfBirth: yearOfBirth
      });
      
      if (editingPatientId) {
        const isIdChanged = patientId !== editingPatientId;
        let hasBeenEdited = false;
        if (isIdChanged) hasBeenEdited = true;
        if (isIdChanged) {
          const confirmed = await confirm({
            title: 'Modifier l\'identifiant',
            message: 'Le nom ou l\'année de naissance a changé. Cela va modifier l\'identifiant du patient et mettre à jour ses rendez-vous. Continuer ?',
            confirmText: 'Continuer',
            cancelText: 'Annuler',
            variant: 'primary',
          });
          if (!confirmed) {
            setLoading(false);
            return;
          }
          // 1. Add new patient with new ID
          await window.electronAPI.addPatient({ ...patientData, id: patientId, yearOfBirth, status: 'existant', created_at: new Date().toISOString(), updatedAt: new Date().toISOString(), hasBeenEdited });
          // 2. Update today's appointment to use new patient ID
          const appointments = await window.electronAPI.getAppointments();
          for (const apt of appointments) {
            if (apt.patient_id === editingPatientId) {
              await window.electronAPI.deleteAppointment(apt.id);
              await window.electronAPI.addAppointment({ ...apt, patient_id: patientId });
            }
          }
          // 3. Save files to new patient
          if (selectedFiles.length > 0) {
            await window.electronAPI.savePatientFiles(patientId, selectedFiles);
          }
          // 4. Delete old patient
          await window.electronAPI.deletePatient(editingPatientId);
        } else {
          // If we're editing an existing patient, just update it
          await window.electronAPI.updatePatient({
            ...patientData,
            id: patientId,
            yearOfBirth,
            status: 'existant',
            updatedAt: new Date().toISOString(),
            hasBeenEdited
          });
        }
        // Refresh patient list
        await fetchPatients(search);
        setLoading(false);
        resetForm();
        setEditingPatientId(null);
        addNotification('Patient transféré au médecin avec succès', 'success');
      } else {
        // Check if a patient already exists with the basic ID format
        const existingPatients = await window.electronAPI.getPatients();
        const existingPatient = existingPatients.find(p => p.id === basicPatientId);
        
        if (existingPatient) {
          // Update the existing patient with the new information
          await window.electronAPI.updatePatient({
            ...patientData,
            id: basicPatientId, // Keep the original ID
            yearOfBirth,
            status: 'existant',
            updatedAt: new Date().toISOString(),
            hasBeenEdited: true
          });
        } else {
          // Only try to add if it's a new patient
          try {
            await window.electronAPI.addPatient({
              ...patientData,
              id: patientId,
              yearOfBirth,
              status: 'existant',
              created_at: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
          } catch (err) {
            if (err.message && err.message.includes('UNIQUE constraint failed')) {
              // Patient exists, update instead
              await window.electronAPI.updatePatient({
                id: patientId,
                hasBeenEdited: true,
                updatedAt: new Date().toISOString(),
                status: 'existant'
              });
              window.dispatchEvent(new CustomEvent('patientsUpdated'));
            } else {
              throw err;
            }
          }
        }
      }
      
      if (selectedFiles.length > 0) {
        let targetPatientId;
        if (editingPatientId) {
          targetPatientId = editingPatientId;
        } else {
          const existingPatients = await window.electronAPI.getPatients();
          const existingPatient = existingPatients.find(p => p.id === basicPatientId);
          targetPatientId = existingPatient ? basicPatientId : patientId;
        }
        await window.electronAPI.savePatientFiles(targetPatientId, selectedFiles);
      }
      
      // Add debug log before calling sendPatientData
      let targetPatientId;
      if (editingPatientId) {
        targetPatientId = editingPatientId;
      } else {
        const existingPatients = await window.electronAPI.getPatients();
        const existingPatient = existingPatients.find(p => p.id === basicPatientId);
        targetPatientId = existingPatient ? basicPatientId : patientId;
      }
      console.log('About to call sendPatientData', { patientData, files: selectedFiles, patientId: targetPatientId });
      await window.electronAPI.sendPatientData({ patientData, files: selectedFiles, patientId: targetPatientId });
      
      // Remove the transferred patient from the local list
      if (editingPatientId) {
        // Remove existing patient from both patients and filteredPatients lists
        setPatients(prevPatients => prevPatients.filter(p => p.id !== editingPatientId));
        setFilteredPatients(prevFiltered => prevFiltered.filter(p => p.id !== editingPatientId));
      } else {
        // For new patients, refresh the list to ensure it's up to date
        await fetchPatients(search);
      }
      
      // Set loading to false FIRST to re-enable fields
      setLoading(false);
      console.log('setLoading(false) called in handleTransferToDoctor');
      // Then reset form data
      resetForm();
      setEditingPatientId(null);
      addNotification('Patient transféré au médecin avec succès', 'success');
    } catch (error) {
      setLoading(false); // Reset loading state immediately on error
      addNotification('Erreur lors du transfert au médecin', 'error');
      console.error('Error during patient transfer:', error);
    }
  };



  // Add this function to handle patient selection
  const handlePatientClick = async (patient) => {
    setPatientData({
      name: patient.name || '',
      phone: patient.phone || '',
      email: patient.email || '',
      urgent_contact: patient.urgent_contact || '',
      convention: patient.convention || '',
      insurances: patient.insurances || '',
      reason_for_visit: patient.reason_for_visit || '',
      medical_history: patient.medical_history || '',
      date_of_birth: patient.date_of_birth || '',
      consultation_price: patient.consultation_price || '',
      year_of_birth: patient.year_of_birth || ''
    });
    setEditingPatientId(patient.id);
    setSelectedFiles([]); // Optionally clear selected files
    // Fetch files for this patient
    try {
      const files = await window.electronAPI.getPatientFiles(patient.id);
      setPatientFiles(files);
    } catch (error) {
      setPatientFiles([]);
    }
  };

  // Handle delete patient (Patients Panel only): do NOT delete from DB.
  // Instead, cancel today's appointments for this patient and remove from local panel lists.
  const handleDeletePatient = async (patientId) => {
    const confirmed = await confirm({
      title: 'Retirer du panneau',
      message: 'Voulez-vous retirer ce patient du panneau d\'aujourd\'hui ? Le patient NE sera PAS supprimé de la base. Seuls ses rendez-vous d\'aujourd\'hui seront annulés.',
      confirmText: 'Retirer',
      cancelText: 'Annuler',
      variant: 'danger',
    });
    if (confirmed) {
      try {
        setLoading(true); // Prevent UI interaction during operation

        // Cancel today's appointments for this patient
        const allAppointments = await window.electronAPI.getAppointments();
        const today = new Date().toISOString().split('T')[0];
        const todays = allAppointments.filter(a => a.patient_id === patientId && a.appointment_date === today);
        for (const apt of todays) {
          await window.electronAPI.updateAppointment({ ...apt, status: 'cancelled' });
        }

        // Remove notifications for this patient
        const removePatientNotifications = (patientId) => {
          // Remove from walkinNotifications (localStorage)
          let notifications = [];
          try {
            notifications = JSON.parse(localStorage.getItem('walkinNotifications') || '[]');
          } catch {}
          notifications = notifications.filter(n => n.patient_id !== patientId);
          localStorage.setItem('walkinNotifications', JSON.stringify(notifications));

          // Remove from prevUpcomingAppointments (sessionStorage)
          let prevUpcoming = [];
          try {
            prevUpcoming = JSON.parse(sessionStorage.getItem('prevUpcomingAppointments') || '[]');
          } catch {}
          prevUpcoming = prevUpcoming.filter(a => a.patient_id !== patientId);
          sessionStorage.setItem('prevUpcomingAppointments', JSON.stringify(prevUpcoming));
        };
        removePatientNotifications(patientId);
        addNotification('Patient retiré du panneau (non supprimé de la base)', 'success');

        // Refresh the patient list (Patients Panel shows only today)
        await fetchPatients(search);
        
        // Clear any editing state first
        setEditingPatientId(null);
        setPatientFiles([]);
        setSelectedFiles([]);
        
        // Reset loading state and form with proper timing
        setLoading(false);
        
        // Use setTimeout to ensure state updates are complete before resetting form
        setTimeout(() => {
          resetForm();
        }, 50);
        
      } catch (error) {
        setLoading(false); // Also reset loading on error
        addNotification('Erreur lors de la suppression du patient', 'error');
        console.error('Error deleting patient:', error);
      } finally {
        // Use comprehensive Electron input locking fix
        try {
          // Run diagnostic to identify the issue
          console.log('[DEBUG] Running diagnostic before delete operation...');
          diagnoseInputBlocking();
          
          // Remove any blocking overlays first
          removeBlockingOverlays();
          
          // CRITICAL: Reset loading state to enable inputs
          setLoading(false);
          console.log('[DEBUG] Loading state reset to false after delete operation');
          
          // Wait a bit for React to finish rendering, then run diagnostic again
          setTimeout(() => {
            console.log('[DEBUG] Running diagnostic after React rendering...');
            diagnoseInputBlocking();
            
            // Only enable inputs on the current page
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
              const inputs = mainContent.querySelectorAll('input, textarea, select');
              inputs.forEach(input => {
                if (input.hasAttribute('disabled')) {
                  input.removeAttribute('disabled');
                }
              });
            }
            
            // CRITICAL: Force Electron window focus to unlock inputs
            forceElectronWindowFocus();
            
            // Run diagnostic again after the fix
            console.log('[DEBUG] Running diagnostic after delete operation...');
            diagnoseInputBlocking();
            
            console.log('[FOCUS] PatientPanel delete operation - targeted input fix completed');
          }, 100);
          
        } catch (error) {
          console.error('[FOCUS] PatientPanel delete operation - input fix failed:', error);
          // Ensure loading is reset even if there's an error
          setLoading(false);
        }
      }
    }
  };

  // Handle first-time patient click
  const handleFirstTimePatientClick = (patient) => {
    // Pre-fill the form with first-time patient data
    setPatientData({
      name: patient.name || '',
      phone: patient.phone || '',
      email: patient.email || '',
      urgent_contact: '',
      convention: '',
      insurances: '',
      reason_for_visit: patient.reason_for_visit || '',
      medical_history: '',
      date_of_birth: patient.date_of_birth || '',
      consultation_price: '',
      year_of_birth: patient.year_of_birth || ''
    });
    
    // Focus on the name input
    if (nameInputRef.current) {
      nameInputRef.current.focus();
    }
    
    // Scroll to the form using smart scroll
    setTimeout(() => {
      const formElement = document.querySelector('.card:last-child');
      if (formElement) {
        smartScrollToElement(formElement, { behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
  };

  // Handle adding first-time patient to database
  const handleAddFirstTimePatient = async (patient) => {
    try {
      // Pre-fill the form with first-time patient data
      setPatientData({
        name: patient.name || '',
        phone: patient.phone || '',
        email: patient.email || '',
        urgent_contact: '',
        convention: '',
        insurances: '',
        reason_for_visit: patient.reason_for_visit || '',
        medical_history: '',
        date_of_birth: patient.date_of_birth || '',
        consultation_price: '',
        year_of_birth: patient.year_of_birth || ''
      });
      
      // Remove from first-time patients list
      setFirstTimePatients(prev => prev.filter(p => p.id !== patient.id));
      
      // Focus on the name input
      if (nameInputRef.current) {
        nameInputRef.current.focus();
      }
      
      // Scroll to the form using smart scroll
      setTimeout(() => {
        const formElement = document.querySelector('.card:last-child');
        if (formElement) {
          smartScrollToElement(formElement, { behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
      
      addNotification(`Patient ${patient.name} ajouté au formulaire`, 'success');
    } catch (error) {
      console.error('Error adding first-time patient:', error);
      addNotification('Erreur lors de l\'ajout du patient', 'error');
    }
  };

  // Handle transferring existing patient to doctor
  const handleTransferExistingPatient = async (patient) => {
    try {
      if (!patient.id) {
        addNotification('Erreur: ID du patient manquant', 'error');
        return;
      }

      // Check if doctor is connected before transferring
      if (!isDoctorConnected) {
        addNotification('Le médecin n\'est pas connecté. Veuillez attendre la connexion du médecin.', 'error');
        return;
      }

      // Send plain text to doctor: "patient {nameOrId} {context}" (default context = 'controle')
      const rawName = (patient?.name || patient?.patient_name || '').toString().trim();
      const fallbackIdOrPhone = (patient && (patient.id || patient.phone)) ? String(patient.id || patient.phone).trim() : '';
      const nameOrId = rawName || fallbackIdOrPhone;
      const context = (patient.appointment_context || patient.appointment_reason || patient.reason_for_visit || '').toString().trim() || 'controle';
      const message = nameOrId ? `patient ${nameOrId} ${context}` : `patient ${context}`;
      await window.electronAPI.sendChatMessage(message.trim());
      
      // Exclude patient from Patients page after transfer
      setPatients(prev => prev.filter(p => p.id !== patient.id));
      setFilteredPatients(prev => prev.filter(p => p.id !== patient.id));
      // Also remove from existingPatientsWithAppointments badges list
      setExistingPatientsWithAppointments(prev => prev.filter(p => p.id !== patient.id));
      addNotification(`Patient ${patient.id || rawName || 'inconnu'} transféré au médecin (${context || 'sans contexte'})`, 'success');
    } catch (error) {
      console.error('Error transferring existing patient:', error);
      addNotification('Erreur lors du transfert au médecin', 'error');
    }
  };

// Handle placing a patient into the waiting queue (and removing from Patient Panel)
const handlePlaceInQueue = async (patient) => {
  try {
    if (!patient?.id) {
      addNotification('Erreur: ID du patient manquant', 'error');
      return;
    }

    // Attach ONLY the appointment context (no date/time) from today's existing-appointment mapping
    const aptInfo = existingPatientsWithAppointments.find(p => p.id === patient.id);
    const appointment_reason = (aptInfo?.appointment_reason || '').trim();
    const appointment_context = (aptInfo?.appointment_context || aptInfo?.appointment_reason || '').trim();
    const contextText = appointment_context || appointment_reason || '';

    // Update status to 'waiting' and mark edited so Queue will show it
    // Include only context fields for display in Queue
    await window.electronAPI.updatePatient({
      ...patient,
      status: 'waiting',
      hasBeenEdited: true,
      updatedAt: new Date().toISOString(),
      // enrich for Queue rendering without time/date
      isFromAppointment: !!contextText,
      appointment_reason,
      appointment_context,
      reason: contextText || patient.reason || patient.reason_for_visit || ''
    });

    // Optimistically remove from local lists
    setPatients(prev => prev.filter(p => p.id !== patient.id));
    setFilteredPatients(prev => prev.filter(p => p.id !== patient.id));
    setExistingPatientsWithAppointments(prev => prev.filter(p => p.id !== patient.id));

    addNotification('Patient placé dans la file d\'attente', 'success');
  } catch (error) {
    console.error('Error placing patient in queue:', error);
    addNotification('Erreur lors du placement dans la file d\'attente', 'error');
  }
};
  return (
    <div className="patient-panel">
      {/* Search Field */}
      <div className="form-group" style={{ marginBottom: '2rem' }}>
        <input
          type="text"
          id="search"
          className="form-input"
          placeholder="Nom, téléphone ou date de naissance..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>
      {/* Patient List */}
      {searchLoading ? (
        <div style={{ textAlign: 'center', margin: '1rem 0' }}>
          <span className="spinner" style={{ marginRight: '0.5rem' }}></span>Recherche en cours...
        </div>
      ) : (filteredPatients.length > 0 || firstTimePatients.length > 0) ? (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div className="card-header">
            <h3 className="card-title">
              Patients ({filteredPatients.length + firstTimePatients.length})
              {firstTimePatients.length > 0 && (
                <span style={{ 
                  marginLeft: '0.5rem', 
                  fontSize: '0.8rem', 
                  color: '#28a745',
                  fontWeight: 'normal'
                }}>
                  • {firstTimePatients.length} premier(s) rendez-vous
                </span>
              )}
            </h3>
          </div>
          <div 
            className="patient-list-container"
            style={{ 
              maxHeight: '400px', 
              overflowY: 'auto',
              border: '1px solid #e1e5e9',
              borderRadius: '8px',
              backgroundColor: '#f8f9fa'
            }}
          >
            <ul className="list-group" style={{ margin: 0, border: 'none' }}>
              {/* First-time patients with appointments */}
              {firstTimePatients.map(patient => (
                <li
                  key={patient.id}
                  className="list-group-item"
                  style={{ 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem',
                    borderBottom: '1px solid #e1e5e9',
                    margin: 0,
                    backgroundColor: 'white',
                    borderLeft: 'none',
                    position: 'relative'
                  }}
                >
                  <div 
                    style={{ flex: 1, cursor: 'pointer' }}
                    onClick={() => handleFirstTimePatientClick(patient)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <strong style={{ color: '#333' }}>{patient.name}</strong>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#666' }}>
                      {patient.phone && `${patient.phone} • `}
                      {patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString('fr-FR') : ''}
                      {patient.appointment_date && (
                        <span style={{ marginLeft: '0.5rem', color: '#28a745', fontWeight: 'bold' }}>
                          📅 RDV: {new Date(patient.appointment_date).toLocaleDateString('fr-FR')} à {patient.appointment_time}
                        </span>
                      )}
                    </div>
                    {patient.reason_for_visit && (
                      <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem', fontStyle: 'italic' }}>
                        Raison: {patient.reason_for_visit}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddFirstTimePatient(patient);
                      }}
                      style={{
                        padding: '0.5rem 0.75rem',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#218838'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = '#28a745'}
                    >
                      <i className="fas fa-user-plus" style={{ marginRight: '0.25rem' }}></i>
                      Ajouter
                    </button>
                  </div>
                </li>
              ))}
              
              {/* Existing patients */}
              {filteredPatients.map(patient => {
                const hasAppointmentToday = existingPatientsWithAppointments.some(p => p.id === patient.id);
                const matched = existingPatientsWithAppointments.find(p => p.id === patient.id);
                const contextLabel = matched?.appointment_context || matched?.appointment_reason || '';
                // Existing patient IDs follow pattern: YYYY_name_XX
                const isExistingId = /^[0-9]{4}_[a-z0-9]+_[0-9]{2}$/i.test(String(patient.id || ''));

                const rowBg = hasAppointmentToday && isExistingId ? 'rgba(40, 167, 69, 0.1)' : 'white';
                const rowBorderLeft = hasAppointmentToday && isExistingId ? '4px solid #28a745' : 'none';

                return (
                  <li key={patient.id} className="list-group-item" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid #e1e5e9', margin: 0, backgroundColor: rowBg, borderLeft: rowBorderLeft }}>
                    <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => handlePatientClick(patient)}>
                      {hasAppointmentToday && isExistingId ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <strong style={{ color: '#28a745' }}>ID: {patient.id}</strong>
                          <span style={{ fontSize: '0.85rem', color: '#2f855a' }}>
                            '{(contextLabel && contextLabel.trim()) || 'controle'}'
                          </span>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <strong style={{ color: '#333' }}>{patient.name}</strong>
                            {hasAppointmentToday && (
                              <span style={{
                                fontSize: '0.7rem',
                                padding: '0.2rem 0.4rem',
                                borderRadius: '12px',
                                backgroundColor: '#28a745',
                                color: 'white',
                                fontWeight: 'bold'
                              }}>
                                📅 RDV Aujourd'hui
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.85rem', color: '#666' }}>
                            {patient.phone && `${patient.phone} • `}
                            {patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString('fr-FR') : ''}
                            {hasAppointmentToday && (
                              <span style={{ marginLeft: '0.5rem', color: '#28a745', fontWeight: 'bold' }}>
                                📅 RDV: {new Date(existingPatientsWithAppointments.find(p => p.id === patient.id)?.appointment_date).toLocaleDateString('fr-FR')} à {existingPatientsWithAppointments.find(p => p.id === patient.id)?.appointment_time}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {hasAppointmentToday && isExistingId && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePlaceInQueue(patient); }}
                          style={{ padding: '0.5rem 0.75rem', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', transition: 'all 0.2s' }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#138496'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = '#17a2b8'}
                          title="Placer dans la file d'attente"
                        >
                          <i className="fas fa-people-arrows" style={{ marginRight: '0.25rem' }}></i>
                          Placer dans la file d'attente
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (matched) {
                            handleTransferExistingPatient(matched);
                          } else {
                            handleTransferAnyPatient(patient);
                          }
                        }}
                        style={{ padding: '0.5rem 0.75rem', backgroundColor: '#667eea', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', transition: 'all 0.2s' }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#5a67d8'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = '#667eea'}
                      >
                        <i className="fas fa-user-md" style={{ marginRight: '0.25rem' }}></i>
                        Transférer
                      </button>
                      <button
                        className="bin-button"
                        onClick={(e) => { e.stopPropagation(); handleDeletePatient(patient.id); }}
                        style={{ marginLeft: '0.5rem' }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 39 7" className="bin-top">
                          <line strokeWidth="4" stroke="white" y2="5" x2="6" y1="2" x1="6"></line>
                          <line strokeWidth="4" stroke="white" y2="6.5" x2="39" y1="2" x1="1"></line>
                        </svg>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 33 39" className="bin-bottom">
                          <path fill="black" d="m0 0h33v39h-33z"></path>
                          <path strokeWidth="4" stroke="white" d="m12 36v-12h9v12"></path>
                          <path strokeWidth="4" stroke="white" d="m21 24v-12h-9v12"></path>
                          <path strokeWidth="4" stroke="white" d="m24 36v-12h3v12"></path>
                          <path strokeWidth="4" stroke="white" d="m6 36v-12h-3v12"></path>
                          <path strokeWidth="4" stroke="white" d="m0 36h33"></path>
                          <path strokeWidth="4" stroke="white" d="m0 24h33"></path>
                        </svg>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 89 80" className="garbage">
                          <path d="m20.5 10.5l3 3 3-3"></path>
                          <path d="m26.5 10.5l3 3 3-3"></path>
                          <path d="m32.5 10.5l3 3 3-3"></path>
                          <path d="m20.5 16.5l3 3 3-3"></path>
                          <path d="m26.5 16.5l3 3 3-3"></path>
                          <path d="m32.5 16.5l3 3 3-3"></path>
                          <path d="m20.5 22.5l3 3 3-3"></path>
                          <path d="m26.5 22.5l3 3 3-3"></path>
                          <path d="m32.5 22.5l3 3 3-3"></path>
                          <path d="m20.5 28.5l3 3 3-3"></path>
                          <path d="m26.5 28.5l3 3 3-3"></path>
                          <path d="m32.5 28.5l3 3 3-3"></path>
                          <path d="m20.5 34.5l3 3 3-3"></path>
                          <path d="m26.5 34.5l3 3 3-3"></path>
                          <path d="m32.5 34.5l3 3 3-3"></path>
                          <path d="m20.5 40.5l3 3 3-3"></path>
                          <path d="m26.5 40.5l3 3 3-3"></path>
                          <path d="m32.5 40.5l3 3 3-3"></path>
                          <path d="m20.5 46.5l3 3 3-3"></path>
                          <path d="m26.5 46.5l3 3 3-3"></path>
                          <path d="m32.5 46.5l3 3 3-3"></path>
                          <path d="m20.5 52.5l3 3 3-3"></path>
                          <path d="m26.5 52.5l3 3 3-3"></path>
                          <path d="m32.5 52.5l3 3 3-3"></path>
                          <path d="m20.5 58.5l3 3 3-3"></path>
                          <path d="m26.5 58.5l3 3 3-3"></path>
                          <path d="m32.5 58.5l3 3 3-3"></path>
                          <path d="m20.5 64.5l3 3 3-3"></path>
                          <path d="m26.5 64.5l3 3 3-3"></path>
                          <path d="m32.5 64.5l3 3 3-3"></path>
                          <path d="m20.5 70.5l3 3 3-3"></path>
                          <path d="m26.5 70.5l3 3 3-3"></path>
                          <path d="m32.5 70.5l3 3 3-3"></path>
                          <path d="m20.5 76.5l3 3 3-3"></path>
                          <path d="m26.5 76.5l3 3 3-3"></path>
                          <path d="m32.5 76.5l3 3 3-3"></path>
                        </svg>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', margin: '1rem 0', color: '#888' }}>
          Aucun patient trouvé.
        </div>
      )}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-user-plus" style={{ marginRight: '10px' }}></i>
            Informations du Patient
            {loading && (
              <span style={{ 
                marginLeft: '10px', 
                fontSize: '0.8em', 
                color: '#667eea',
                display: 'inline-flex',
                alignItems: 'center'
              }}>
                <span className="spinner" style={{ marginRight: '5px', width: '12px', height: '12px' }}></span>
                Chargement...
              </span>
            )}
          </h3>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="name">{t('patientName')} *</label>
              <input 
                ref={nameInputRef} 
                type="text" 
                id="name" 
                name="name" 
                className="form-input" 
                value={patientData.name} 
                onChange={handleInputChange} 
                required 
                disabled={loading}
                style={{ 
                  opacity: loading ? 0.6 : 1,
                  cursor: loading ? 'not-allowed' : 'text'
                }}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="date_of_birth">{t('dateOfBirth')} *</label>
              <input type="date" id="date_of_birth" name="date_of_birth" className="form-input" value={patientData.date_of_birth} onChange={handleInputChange} required disabled={loading} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="phone">{t('phone')}</label>
              <input type="tel" id="phone" name="phone" className="form-input" value={patientData.phone} onChange={handleInputChange} disabled={loading} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="email">{t('email')}</label>
              <input type="email" id="email" name="email" className="form-input" value={patientData.email} onChange={handleInputChange} disabled={loading} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="urgent_contact">{t('urgentContact')}</label>
              <input type="text" id="urgent_contact" name="urgent_contact" className="form-input" value={patientData.urgent_contact} onChange={handleInputChange} disabled={loading} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="convention">{t('convention')}</label>
              <input type="text" id="convention" name="convention" className="form-input" value={patientData.convention} onChange={handleInputChange} disabled={loading} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="insurances">{t('insurances')}</label>
              <input type="text" id="insurances" name="insurances" className="form-input" value={patientData.insurances} onChange={handleInputChange} disabled={loading} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="consultation_price">{t('consultationPrice')}</label>
              <input type="number" id="consultation_price" name="consultation_price" className="form-input" value={patientData.consultation_price} onChange={handleInputChange} disabled={loading} step="0.01" min="0" placeholder="0.00" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="reason_for_visit">{t('reasonForVisit')}</label>
            <textarea id="reason_for_visit" name="reason_for_visit" className="form-input form-textarea" value={patientData.reason_for_visit} onChange={handleInputChange} rows="3" disabled={loading} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="medical_history">{t('medicalHistory')}</label>
            <textarea id="medical_history" name="medical_history" className="form-input form-textarea" value={patientData.medical_history} onChange={handleInputChange} rows="4" disabled={loading} />
          </div>
          {/* For existing patients: show attached files left, upload area right. For new: only upload area. */}
          {editingPatientId ? (
            <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', marginBottom: '2rem' }}>
              {/* Attached files on the left */}
              <div style={{ flex: 1 }}>
                <div className="file-list">
                  <h4 style={{ marginBottom: '1rem' }}>{t('attachedFiles') || 'Fichiers attachés'} ({patientFiles.length})</h4>
                  {patientFiles.length > 0 ? (
                    patientFiles.map((file, idx) => (
                      <FileItem
                        key={`attached-file-${idx}-${file.name}`}
                        file={file}
                        editingPatientId={editingPatientId}
                        setPatientFiles={setPatientFiles}
                        t={t}
                      />
                    ))
                  ) : (
                    <span style={{ color: '#888', fontSize: '0.95em' }}>{t('noFilesAttached') || 'Aucun fichier attaché.'}</span>
                  )}
                </div>
              </div>
              {/* Attach files area on the right */}
              <div style={{ minWidth: 220, maxWidth: 320 }}>
                <label className="form-label">{t('addFiles')}</label>
                <div className="file-upload" onClick={handleFileSelect} style={{ cursor: 'pointer', textAlign: 'center' }}>
                  <i className="fas fa-cloud-upload-alt" style={{ fontSize: '2rem', color: '#667eea', marginBottom: '1rem' }}></i>
                  <p>{t('selectFiles')}</p>
                  <p style={{ fontSize: '0.9rem', color: '#666' }}>Cliquez pour sélectionner des fichiers</p>
                </div>
                {selectedFiles.length > 0 && (
                  <div className="file-list">
                    <h4 style={{ marginBottom: '1rem' }}>{selectedFiles.length} {t('filesSelected')}</h4>
                    {selectedFiles.map((file, index) => (
                      <div key={`file-${index}-${file.split(/[/\\]/).pop()}`} className="file-item">
                        <span>{file.split(/[/\\]/).pop()}</span>
                        <button type="button" onClick={() => removeFile(index)} className="btn btn-danger btn-sm">
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">{t('addFiles')}</label>
              <div className="file-upload" onClick={handleFileSelect} style={{ cursor: 'pointer', textAlign: 'center' }}>
                <i className="fas fa-cloud-upload-alt" style={{ fontSize: '2rem', color: '#667eea', marginBottom: '1rem' }}></i>
                <p>{t('selectFiles')}</p>
                <p style={{ fontSize: '0.9rem', color: '#666' }}>Cliquez pour sélectionner des fichiers</p>
              </div>
              {selectedFiles.length > 0 && (
                <div className="file-list">
                  <h4 style={{ marginBottom: '1rem' }}>{selectedFiles.length} {t('filesSelected')}</h4>
                  {selectedFiles.map((file, index) => (
                    <div key={`file-${index}-${file.split(/[/\\]/).pop()}`} className="file-item">
                      <span>{file.split(/[/\\]/).pop()}</span>
                      <button type="button" onClick={() => removeFile(index)} className="btn btn-danger btn-sm">
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? (<><span className="spinner" style={{ marginRight: '0.5rem' }}></span>Enregistrement...</>) : (<><i className="fas fa-save" style={{ marginRight: '0.5rem' }}></i>{t('savePatient')}</>)}
            </button>
            <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={loading}>
              <i className="fas fa-undo" style={{ marginRight: '0.5rem' }}></i>Réinitialiser
            </button>
            <button type="button" className="btn btn-success" onClick={e => { console.log('Transfer button clicked'); handleTransferToDoctor(e); }} disabled={loading || !isDoctorConnected}>
              <i className="fas fa-paper-plane" style={{ marginRight: '0.5rem' }}></i>Transférer au Médecin
            </button>
          </div>
        </form>
      </div>
      {/* Notification */}
      {notification && (
        <div className="notification" style={{ background: '#4caf50', color: 'white', padding: '1rem', marginBottom: '1rem', borderRadius: '5px', textAlign: 'center' }}>
          {notification}
        </div>
      )}
    </div>
  );
}

export default PatientPanel;