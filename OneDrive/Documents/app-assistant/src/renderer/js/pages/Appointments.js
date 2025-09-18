import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { wasClickedOutsideApp, safeFocus, forceEnableFormInputs, fixElectronInputLocking, diagnoseInputBlocking, removeBlockingOverlays, forceElectronWindowFocus } from '../utils/focusUtils';
import { useLocation, useNavigate } from 'react-router-dom';
import holidayService from '../services/holidayService';
import { smartScrollToElement, preventAutoScroll } from '../utils/scrollUtils';
import realTimeUpdateService from '../services/realTimeUpdateService';
import googleDriveService from '../services/googleDriveService';
import Fuse from 'fuse.js';
import Modal from '../components/Modal';
import { useConfirm } from '../context/ConfirmContext';

function Appointments({ addNotification = (message, type) => console.log(`${type}: ${message}`) }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [appointmentData, setAppointmentData] = useState({
    patient_name: '',
    reason: '',
    patient_id: '',
    appointment_reason: ''
  });
  const [patientSuggestions, setPatientSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [recentPatients, setRecentPatients] = useState([]);
  const [searchMode, setSearchMode] = useState('all'); // 'all', 'name', 'id', 'year', 'phone'
  // New state for calendar navigation
  const today = new Date();
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  // Holiday-related state
  const [holidays, setHolidays] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState('TN');
  const [holidayLoading, setHolidayLoading] = useState(false);
  const [holidayDataSource, setHolidayDataSource] = useState({ source: 'local', reliable: true });
  const [appointmentSearch, setAppointmentSearch] = useState('');
  const [appointmentFilter, setAppointmentFilter] = useState('all'); // 'all', 'new', 'existing'
  
  // New state for patient action modal
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [selectedPatientForAction, setSelectedPatientForAction] = useState(null);
  const [selectedAppointmentForAction, setSelectedAppointmentForAction] = useState(null);
  const [rescheduleAppointmentId, setRescheduleAppointmentId] = useState(null);

  // Appointment time settings (configurable via Settings page)
  const [appointmentStartTime, setAppointmentStartTime] = useState('09:00');
  const [appointmentEndTime, setAppointmentEndTime] = useState('16:30');
  const [appointmentSlotMinutes, setAppointmentSlotMinutes] = useState(15);

  // 1. Add new state for patient type selection and new patient form
  const [showPatientTypeModal, setShowPatientTypeModal] = useState(false);
  const [patientType, setPatientType] = useState(null); // 'new' or 'existing'
  const [newPatientForm, setNewPatientForm] = useState({ name: '', phone: '', reason: '' });
  const [existingPatientForm, setExistingPatientForm] = useState({ id: '', name: '', reason: '' });

  // Add a new state to track if we are in reschedule mode
  const [isRescheduling, setIsRescheduling] = useState(false);
  // Add appointment context state for existing patients
  const [appointmentContext, setAppointmentContext] = useState(''); // empty by default; user selects if needed
  // UI for adding a custom context
  const [showAddContextModal, setShowAddContextModal] = useState(false);
  const [newContextText, setNewContextText] = useState('');
  const contextOptions = [
    'Contrôle',
    'Suivi',
    'Consultation',
    'Résultats',
    'Prescription'
  ];

  // Fuzzy search setup for patients
  const fuse = new Fuse(patients, {
    keys: [
      { name: 'id', weight: 0.5 },
      { name: 'name', weight: 0.4 },
      { name: 'phone', weight: 0.3 },
    ],
    threshold: 0.4,
    includeScore: true,
  });

  // Add refs for focus management
  const newPatientNameRef = useRef(null);
  const newPatientPhoneRef = useRef(null);
  const newPatientReasonRef = useRef(null);
  const existingPatientIdRef = useRef(null);
  // Track which field ("id" or "name") is currently showing suggestions inside the Existing Patient modal
  const [modalSuggestionField, setModalSuggestionField] = useState(null);
  const existingPatientReasonRef = useRef(null);

  useEffect(() => {
    // Store current scroll position before any state changes
    const currentScrollY = window.scrollY;
    
    // Prevent auto-scroll on state changes
    preventAutoScroll();
    
    console.log('[DEBUG] Main useEffect running with:', {
      selectedDate,
      selectedTime,
      isRescheduling,
      showPatientTypeModal: showPatientTypeModal
    });
    
    // Streamlined reschedule logic
    if (
      location.state?.reschedule &&
      location.state?.appointmentData &&
      !isRescheduling // Only set up if not already rescheduling
    ) {
      setAppointmentData({
        patient_name: location.state.appointmentData.patient_name,
        reason: location.state.appointmentData.reason || '',
        patient_id: location.state.appointmentData.patient_id,
        appointment_reason: location.state.appointmentData.appointment_reason || ''
      });
      setSelectedDate(location.state.appointmentData.appointment_date);
      setSelectedTime(location.state.appointmentData.appointment_time);
      setShowForm(true);
      setShowPatientTypeModal(false);
      setIsRescheduling(true);
    }
    
    // Restore scroll position after state changes
    setTimeout(() => {
      if (window.scrollY !== currentScrollY) {
        window.scrollTo(0, currentScrollY);
      }
    }, 0);
  }, [location.state]); // Only depend on location.state

  // Separate useEffect for initial form reset (only runs once on mount)
  useEffect(() => {
    console.log('[DEBUG] Initial form reset useEffect running');
    resetFormState();
  }, []); // Empty dependency array - only runs once

  // Separate useEffect for data loading (only runs once on mount)
  useEffect(() => {
    console.log('[DEBUG] Initial data loading useEffect running');
    loadData();
    loadRecentPatients();
  }, []); // Empty dependency array - only runs once

  // Ensure loading state is reset and form is ready
  useEffect(() => {
    console.log('[DEBUG] Loading state check - current loading:', loading);
    if (loading) {
      // Force reset loading state after a timeout to prevent it from getting stuck
      const timeout = setTimeout(() => {
        console.log('[DEBUG] Forcing loading state reset due to timeout');
        setLoading(false);
      }, 3000); // Reset after 3 seconds if still loading
      
      return () => clearTimeout(timeout);
    }
  }, [loading]);

  // Ensure form is ready when modal should be showing
  useEffect(() => {
    if (showPatientTypeModal && loading) {
      console.log('[DEBUG] Modal should be showing but loading is true - forcing reset');
      setLoading(false);
    }
  }, [showPatientTypeModal, loading]);

  // Listen for patient updates from other pages
  useEffect(() => {
      const onStorage = (e) => {
    console.log('[DEBUG] Appointments: Storage event received:', e.key, e.newValue);
    if (e.key === 'allPatientsShouldRefresh' || e.key === 'appointmentsShouldRefresh') {
      console.log('[DEBUG] Appointments: Refreshing data due to update');
      loadData();
    }
  };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Track modal state changes (log only on actual close transitions, skip initial mount)
  const prevShowPatientTypeModalRef = useRef(undefined);
  useEffect(() => {
    const prev = prevShowPatientTypeModalRef.current;
    if (prev !== undefined && prev === true && showPatientTypeModal === false) {
      console.log('[DEBUG] Modal was closed. Stack trace:', new Error().stack);
    }
    if (prev !== showPatientTypeModal) {
      console.log('[DEBUG] showPatientTypeModal changed to:', showPatientTypeModal);
    }
    prevShowPatientTypeModalRef.current = showPatientTypeModal;
  }, [showPatientTypeModal]);

  // 2. When both date and time are selected, show the patient type modal
  useEffect(() => {
    console.log('[DEBUG] Modal useEffect triggered with:', {
      selectedDate,
      selectedTime,
      isRescheduling,
      showPatientTypeModal: showPatientTypeModal
    });
    
    if (selectedDate && selectedTime && !isRescheduling && !showPatientTypeModal) {
      console.log('[DEBUG] Appointments: Showing patient type modal for date:', selectedDate, 'time:', selectedTime);
      setShowPatientTypeModal(true);
      setPatientType(null);
      setShowForm(false); // Hide the old form
    } else {
      console.log('[DEBUG] Modal useEffect: Conditions not met for showing modal');
    }
  }, [selectedDate, selectedTime, isRescheduling, showPatientTypeModal]);

  useEffect(() => {
    loadHolidays(calendarYear, selectedCountry);
  }, [calendarYear, selectedCountry]);

  // Initialize selectedCountry from persisted settings on mount
  useEffect(() => {
    (async () => {
      try {
        if (window?.electronAPI?.getSettings) {
          const s = await window.electronAPI.getSettings();
          if (s?.country) {
            setSelectedCountry(s.country);
          }
        }
      } catch (e) {
        console.warn('[Appointments] Failed to load settings for country:', e);
      }
    })();
  }, []);

  // React to settings updates (same-window) to change country dynamically
  useEffect(() => {
    const onSettingsUpdated = (evt) => {
      const updated = evt?.detail || {};
      if (updated.country && updated.country !== selectedCountry) {
        setSelectedCountry(updated.country);
      }
      // Update appointment time settings if provided
      if (updated.appointment_start_time) {
        setAppointmentStartTime(updated.appointment_start_time);
      }
      if (updated.appointment_end_time) {
        setAppointmentEndTime(updated.appointment_end_time);
      }
      if (updated.appointment_slot_minutes) {
        const m = parseInt(updated.appointment_slot_minutes, 10);
        if (!isNaN(m) && m > 0) setAppointmentSlotMinutes(m);
      }
    };
    window.addEventListener('app-settings-updated', onSettingsUpdated);
    return () => window.removeEventListener('app-settings-updated', onSettingsUpdated);
  }, [selectedCountry]);

  const loadData = async () => {
    try {
      const [appointmentsList, patientsList] = await Promise.all([
        window.electronAPI.getAppointments(),
        window.electronAPI.getPatients()
      ]);
      setAppointments(appointmentsList);
      setPatients(patientsList);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };



  const loadHolidays = async (year, country) => {
    setHolidayLoading(true);
    try {
      const holidaysData = await holidayService.fetchHolidays(year, country);
      setHolidays(holidaysData);
      
      // Get data source information
      const dataSourceInfo = holidayService.getDataSourceInfo(year, country);
      setHolidayDataSource(dataSourceInfo);
    } catch (error) {
      console.error('Error loading holidays:', error);
      setHolidays([]);
      setHolidayDataSource({ source: 'error', reliable: false });
    } finally {
      setHolidayLoading(false);
    }
  };

  const isHoliday = (dateStr) => {
    return holidays.find(holiday => holiday.date === dateStr);
  };

  const getHolidayStyle = (holiday) => {
    return {
      backgroundColor: 'rgba(255, 193, 7, 0.2)',
      borderColor: '#ffc107',
      color: '#856404'
    };
  };

  // Utility function to format dates consistently in local timezone
  const formatDateToLocalString = (year, month, day) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  // Highlight matching text in search results
  const highlightMatch = (text, searchTerm) => {
    if (!searchTerm || !text) return text;
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<strong>$1</strong>');
  };

  // Simple phonetic matching (handles common variations)
  const normalizeForSearch = (text) => {
    if (!text) return '';
    return text.toLowerCase()
      .replace(/[éèêë]/g, 'e')
      .replace(/[àâä]/g, 'a')
      .replace(/[îï]/g, 'i')
      .replace(/[ôö]/g, 'o')
      .replace(/[ûüù]/g, 'u')
      .replace(/[ç]/g, 'c')
      .replace(/[^a-z0-9\s]/g, '');
  };

  // Load recent patients from the database
  const loadRecentPatients = async () => {
    try {
      const recent = await window.electronAPI.getRecentPatients();
      setRecentPatients(recent);
    } catch (error) {
      console.error('Error loading recent patients:', error);
    }
  };

  // Add patient to recent list in the database
  const addToRecentPatients = async (patient) => {
    try {
      await window.electronAPI.addRecentPatient(patient);
      loadRecentPatients();
    } catch (error) {
      console.error('Error saving recent patients:', error);
    }
  };

  // Generate patient suggestions based on input with fuzzy search
  const generatePatientSuggestions = (input) => {
    if (!input || input.length < 1) {
      // Show recent patients when input is empty
      if (recentPatients.length > 0) {
        const recentSuggestions = recentPatients.map(patient => ({
          ...patient,
          score: 200, // High score for recent patients
          isRecent: true
        }));
        setPatientSuggestions(recentSuggestions);
        setShowSuggestions(true);
      } else {
        setPatientSuggestions([]);
        setShowSuggestions(false);
      }
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const lowerInput = input.toLowerCase().trim();
    const normalizedInput = normalizeForSearch(lowerInput);
    
    const suggestions = patients
      .filter(patient => {
        const patientId = patient.id || '';
        const patientName = patient.name || '';
        const dateOfBirth = patient.date_of_birth || '';
        const phone = patient.phone || '';
        const email = patient.email || '';
        
        // Extract year from date of birth
        const birthYear = dateOfBirth ? new Date(dateOfBirth).getFullYear().toString() : '';
        
        // Normalize patient data for phonetic matching
        const normalizedName = normalizeForSearch(patientName);
        const normalizedId = normalizeForSearch(patientId);
        
        // Multiple search criteria with fuzzy matching
        const matchesId = patientId.toLowerCase().includes(lowerInput) || normalizedId.includes(normalizedInput);
        const matchesName = patientName.toLowerCase().includes(lowerInput) || normalizedName.includes(normalizedInput);
        const matchesYear = birthYear.includes(lowerInput);
        const matchesPhone = phone.includes(lowerInput);
        const matchesEmail = email.toLowerCase().includes(lowerInput);
        
        // Check if input could be a year (4 digits)
        const isYearInput = /^\d{4}$/.test(lowerInput);
        const matchesBirthYear = isYearInput && birthYear === lowerInput;
        
        // Check if input could be a partial name
        const isPartialName = patientName.toLowerCase().split(' ').some(namePart => 
          namePart.startsWith(lowerInput) || namePart.includes(lowerInput)
        );
        
        // Check if input could be a partial ID (year_name format)
        const isPartialId = patientId.toLowerCase().includes(lowerInput);
        
        // Apply search mode filter
        if (searchMode === 'name' && !matchesName && !isPartialName) return false;
        if (searchMode === 'id' && !matchesId && !isPartialId) return false;
        if (searchMode === 'year' && !matchesYear && !matchesBirthYear) return false;
        if (searchMode === 'phone' && !matchesPhone) return false;
        
        return matchesId || matchesName || matchesYear || matchesBirthYear || isPartialName || isPartialId || matchesPhone || matchesEmail;
      })
      .map(patient => {
        const dateOfBirth = patient.date_of_birth;
        const birthYear = dateOfBirth ? new Date(dateOfBirth).getFullYear().toString() : '';
        
        // Create a relevance score for better sorting
        let score = 0;
        const patientId = patient.id || '';
        const patientName = patient.name || '';
        const phone = patient.phone || '';
        const email = patient.email || '';
        
        // Exact matches get higher scores
        if (patientId.toLowerCase() === lowerInput) score += 100;
        if (patientName.toLowerCase() === lowerInput) score += 100;
        if (birthYear === lowerInput) score += 100;
        if (phone === lowerInput) score += 100;
        if (email.toLowerCase() === lowerInput) score += 100;
        
        // Starts with matches
        if (patientId.toLowerCase().startsWith(lowerInput)) score += 50;
        if (patientName.toLowerCase().startsWith(lowerInput)) score += 50;
        if (birthYear.startsWith(lowerInput)) score += 50;
        if (phone.startsWith(lowerInput)) score += 50;
        if (email.toLowerCase().startsWith(lowerInput)) score += 50;
        
        // Contains matches
        if (patientId.toLowerCase().includes(lowerInput)) score += 25;
        if (patientName.toLowerCase().includes(lowerInput)) score += 25;
        if (birthYear.includes(lowerInput)) score += 25;
        if (phone.includes(lowerInput)) score += 25;
        if (email.toLowerCase().includes(lowerInput)) score += 25;
        
        // Partial name matches
        if (patientName.toLowerCase().split(' ').some(namePart => namePart.startsWith(lowerInput))) score += 30;
        
        return {
          id: patient.id,
          name: patient.name,
          date_of_birth: patient.date_of_birth,
          phone: phone,
          email: email,
          birthYear: birthYear,
          score: score,
          displayText: `${patient.id} - ${patient.name}`
        };
      })
      .sort((a, b) => b.score - a.score) // Sort by relevance score
      .slice(0, 8); // Show more suggestions for better user experience

    setPatientSuggestions(suggestions);
    setShowSuggestions(suggestions.length > 0);
    setSearchLoading(false);
  };

  // Debounced search function
  const debouncedSearch = (input) => {
    clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => {
      generatePatientSuggestions(input);
    }, 300));
  };

  // Handle patient ID input change
  const handlePatientIdChange = (e) => {
    const value = e.target.value;
    setAppointmentData({
      ...appointmentData,
      patient_id: value,
      // Clear patient_name when typing in ID field to avoid confusion
      patient_name: value ? '' : appointmentData.patient_name
    });
    debouncedSearch(value);
    setSelectedSuggestionIndex(-1);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!showSuggestions || patientSuggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev < patientSuggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev > 0 ? prev - 1 : patientSuggestions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedSuggestionIndex >= 0) {
          handleSuggestionSelect(patientSuggestions[selectedSuggestionIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
  };

  // Handle suggestion selection
  const handleSuggestionSelect = (suggestion) => {
    console.log('Selected existing patient:', suggestion);
    setAppointmentData({
      ...appointmentData,
      patient_id: suggestion.id, // This should be the proper patient ID like "2003_ghuilaine"
      patient_name: suggestion.name, // Use the exact name from database
      appointment_reason: (appointmentData.appointment_reason && appointmentData.appointment_reason.trim())
        ? appointmentData.appointment_reason.trim()
        : 'Contrôle'
    });
    setShowSuggestions(false);
    setPatientSuggestions([]);
    setSelectedSuggestionIndex(-1);
    
    // Add to recent patients
    addToRecentPatients(suggestion);
    
    // Log for debugging
    console.log('Appointment data after selection:', {
      patient_id: suggestion.id,
      patient_name: suggestion.name,
      isExistingPatient: !!suggestion.id
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');
    if (!selectedDate || !selectedTime || !appointmentData.patient_name) {
      alert('Veuillez sélectionner une date, un créneau horaire et saisir le nom du patient');
      return;
    }
    // Validate patient ID format for existing patients
    if (appointmentData.patient_id && !appointmentData.patient_id.includes('_')) {
      alert('L\'ID du patient doit être au format: année_naissance_nom (ex: 1990_marie)');
      return;
    }
    try {
      // Determine if this is an existing patient or new patient
      const isExistingPatient = appointmentData.patient_id && appointmentData.patient_id.includes('_');
      let contextValue = (appointmentData.appointment_reason && appointmentData.appointment_reason.trim())
        ? appointmentData.appointment_reason.trim()
        : '';
      // Default context for existing patients if not explicitly set
      if (!contextValue && isExistingPatient) {
        contextValue = 'Contrôle';
      }
      const appointment = {
        patient_name: appointmentData.patient_name,
        appointment_date: selectedDate,
        appointment_time: selectedTime,
        reason: appointmentData.reason,
        // For new patients, leave patient_id empty so Patients page shows them under today's first-time list
        patient_id: isExistingPatient ? appointmentData.patient_id : '',
        appointment_reason: contextValue,
        appointment_context: contextValue, // store explicit context here for dashboard gating
        status: 'scheduled'
      };
      console.log('Creating appointment:', {
        patient_name: appointment.patient_name,
        patient_id: appointment.patient_id,
        isExistingPatient,
        originalPatientId: appointmentData.patient_id
      });
      // If this was a reschedule, delete the old appointment FIRST
      if (rescheduleAppointmentId) {
        try {
          console.log('Deleting old appointment before creating new one:', rescheduleAppointmentId);
          // Show confirmation to user
          const proceed = await confirm({
            title: 'Reprogrammer le rendez-vous',
            message: 'Vous êtes en train de reprogrammer un rendez-vous. L\'ancien rendez-vous sera supprimé. Continuer ?',
            confirmText: 'Continuer',
            cancelText: 'Annuler',
            variant: 'primary',
          });
          if (!proceed) {
            console.log('User cancelled appointment reschedule');
            return;
          }
          const deleteResult = await window.electronAPI.deleteAppointment(rescheduleAppointmentId);
          if (!deleteResult.deleted) {
            throw new Error(deleteResult.reason || 'Failed to delete old appointment');
          }
          console.log('Old appointment deleted successfully during reschedule:', rescheduleAppointmentId);
          // Remove related walk-in notifications from localStorage
          let notifications = [];
          try {
            notifications = JSON.parse(localStorage.getItem('walkinNotifications') || '[]');
          } catch {}
          notifications = notifications.filter(n => n.id !== rescheduleAppointmentId && (!n.appointment || n.appointment.id !== rescheduleAppointmentId));
          localStorage.setItem('walkinNotifications', JSON.stringify(notifications));
        } catch (error) {
          console.error('Error deleting old appointment during reschedule:', error);
          // Check if it's a handler registration error
          if (error.message && error.message.includes('No handler registered')) {
            alert('Erreur: Le gestionnaire de suppression n\'est pas disponible. Veuillez redémarrer l\'application et réessayer.');
            return;
          }
          alert('Erreur lors de la suppression de l\'ancien rendez-vous. Le nouveau rendez-vous ne sera pas créé.');
          return; // Don't create new appointment if old one can't be deleted
        }
      }
      // Create the new appointment
      await window.electronAPI.addAppointment(appointment);
      
      // Ensure patient workflow exists
      try {
        await realTimeUpdateService.ensurePatientWorkflow(appointment);
      } catch (workflowError) {
        console.warn('Could not ensure patient workflow:', workflowError);
      }
      
      // Update patient status to 'waiting' if it's a new patient
      // if (!isExistingPatient) {
      //   try {
      //     await window.electronAPI.updatePatientStatus(appointment.patient_id, 'waiting');
      //   } catch (statusError) {
      //     console.warn('Could not update patient status:', statusError);
      //   }
      // }
      
      // Clear the reschedule ID after successful creation
      if (rescheduleAppointmentId) {
        setRescheduleAppointmentId(null);
        addNotification('Rendez-vous reprogrammé avec succès', 'success');
      } else {
        addNotification('Rendez-vous programmé avec succès', 'success');
      }
      // Reset form
      setAppointmentData({ patient_name: '', reason: '', patient_id: '', appointment_reason: '' });
      setSelectedDate('');
      setSelectedTime('');
      setShowForm(false);
      // Reload data
      await loadData();
      
      // Auto-backup appointments to Google Drive if enabled
      try {
        if (googleDriveService.isAutoBackupEnabled()) {
          const allAppointments = await window.electronAPI.getAppointments();
          await googleDriveService.autoBackupAppointments(allAppointments);
        }
      } catch (error) {
        console.error('Auto-backup appointments failed:', error);
        // Don't show error to user as this is background operation
      }
      
      alert(t('appointmentBooked'));
    } catch (error) {
      console.error('Error booking appointment:', error);
      alert('Erreur lors de la programmation du rendez-vous');
    } finally {
      setLoading(false);
    }
  };

  // Load appointment time settings from persisted settings on mount
  useEffect(() => {
    (async () => {
      try {
        if (window?.electronAPI?.getSettings) {
          const s = await window.electronAPI.getSettings();
          if (s?.appointment_start_time) setAppointmentStartTime(s.appointment_start_time);
          if (s?.appointment_end_time) setAppointmentEndTime(s.appointment_end_time);
          if (s?.appointment_slot_minutes) {
            const m = parseInt(s.appointment_slot_minutes, 10);
            if (!isNaN(m) && m > 0) setAppointmentSlotMinutes(m);
          }
        }
      } catch (e) {
        console.warn('[Appointments] Failed to load appointment time settings:', e);
      }
    })();
  }, []);

  const parseTimeToMinutes = (hhmm) => {
    if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return null;
    const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  };

  const minutesToTime = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const generateTimeSlots = () => {
    const slots = [];
    const start = parseTimeToMinutes(appointmentStartTime) ?? parseTimeToMinutes('09:00');
    const end = parseTimeToMinutes(appointmentEndTime) ?? parseTimeToMinutes('16:30');
    const step = Math.max(5, Number(appointmentSlotMinutes) || 15); // minimum 5 minutes
    if (start == null || end == null || start >= end) return slots;
    for (let tMin = start; tMin <= end; tMin += step) {
      const time = minutesToTime(tMin);
      slots.push(time);
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  const getAppointmentsForDate = (date) => {
    return appointments.filter(apt => apt.appointment_date === date);
  };

  const isTimeSlotBooked = (date, time) => {
    return appointments.some(apt => 
      apt.appointment_date === date && apt.appointment_time === time
    );
  };

  // Filter appointments based on search and filter criteria
  const getFilteredAppointments = () => {
    let filtered = appointments;

    // If a specific day is selected, only show appointments for that day
    if (selectedDate) {
      filtered = filtered.filter(apt => apt.appointment_date === selectedDate);
    }

    // Show only scheduled appointments (legacy records may have empty status)
    filtered = filtered.filter(apt => (apt.status === 'scheduled') || !apt.status);

    // Exclude appointments more than 30 minutes past their scheduled time
    const now = new Date();
    filtered = filtered.filter(apt => {
      const appointmentDateTime = new Date(apt.appointment_date + 'T' + apt.appointment_time);
      return appointmentDateTime.getTime() + 30 * 60 * 1000 > now.getTime();
    });

    // Exclude appointments whose patient is marked as 'existant'
    filtered = filtered.filter(apt => {
      const patient = patients.find(p => p.id === apt.patient_id);
      return !(patient && patient.status === 'existant');
    });

    // Apply filter (new vs existing patients)
    if (appointmentFilter === 'new') {
      filtered = filtered.filter(apt => !apt.patient_id || apt.patient_id === '');
    } else if (appointmentFilter === 'existing') {
      filtered = filtered.filter(apt => apt.patient_id && apt.patient_id !== '');
    }

    // Apply search (now includes phone and patient ID)
    if (appointmentSearch.trim()) {
      const searchTerm = appointmentSearch.toLowerCase().trim();
      filtered = filtered.filter(apt => 
        apt.patient_name.toLowerCase().includes(searchTerm) ||
        (apt.reason && apt.reason.toLowerCase().includes(searchTerm)) ||
        (apt.appointment_reason && apt.appointment_reason.toLowerCase().includes(searchTerm)) ||
        apt.appointment_date.includes(searchTerm) ||
        apt.appointment_time.includes(searchTerm) ||
        (apt.phone && apt.phone.toLowerCase().includes(searchTerm)) ||
        (apt.patient_id && apt.patient_id.toLowerCase().includes(searchTerm))
      );
    }

    return filtered.sort((a, b) => 
      new Date(a.appointment_date + ' ' + a.appointment_time) - 
      new Date(b.appointment_date + ' ' + b.appointment_time)
    );
  };

  // Patient action modal functions
  const handlePatientClick = (appointment) => {
    // Only show modal for new patients (not existing ones)
    if (!appointment.patient_id || appointment.patient_id === '') {
      setSelectedPatientForAction(appointment.patient_name);
      setSelectedAppointmentForAction(appointment);
      setShowPatientModal(true);
    }
  };

  const handleModifyAppointment = async () => {
    if (selectedAppointmentForAction) {
      try {
        // Delete the old appointment from database
        console.log('Deleting appointment for modification:', selectedAppointmentForAction.id);
        const deleteResult = await window.electronAPI.deleteAppointment(selectedAppointmentForAction.id);
        
        if (!deleteResult.deleted) {
          throw new Error(deleteResult.reason || 'Failed to delete appointment');
        }
        
        console.log('Appointment deleted successfully for modification');
        
        // Update local state
        const updatedAppointments = appointments.filter(apt => apt.id !== selectedAppointmentForAction.id);
        setAppointments(updatedAppointments);
        
        // Pre-fill the form with patient data
        setAppointmentData({
          patient_name: selectedAppointmentForAction.patient_name,
          reason: selectedAppointmentForAction.reason || '',
          patient_id: '',
          appointment_reason: selectedAppointmentForAction.appointment_reason || ''
        });
        
        // Close modal and show form
        setShowPatientModal(false);
        setShowForm(true);
        
        // Scroll to form using smart scroll
        setTimeout(() => {
          const formElement = document.querySelector('.card:last-child');
          if (formElement) {
            smartScrollToElement(formElement, { behavior: 'smooth', block: 'nearest' });
          }
        }, 100);
        
        addNotification('Rendez-vous supprimé, vous pouvez maintenant créer un nouveau rendez-vous', 'info');
      } catch (error) {
        console.error('Error deleting appointment for modification:', error);
        
        // Check if it's a handler registration error
        if (error.message && error.message.includes('No handler registered')) {
          alert('Erreur: Le gestionnaire de suppression n\'est pas disponible. Veuillez redémarrer l\'application et réessayer.');
          return;
        }
        
        alert('Erreur lors de la suppression du rendez-vous. Impossible de modifier.');
      }
    }
  };

  const handleGoToPatientsPage = () => {
    if (selectedPatientForAction) {
      // Navigate to patients page with pre-filled name
      navigate('/patients', { 
        state: { 
          prefillPatientName: selectedPatientForAction 
        } 
      });
    }
    setShowPatientModal(false);
  };

  const closePatientModal = () => {
    setShowPatientModal(false);
    setSelectedPatientForAction(null);
    setSelectedAppointmentForAction(null);
  };

  const handleRescheduleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Delete the old appointment
      if (location.state?.appointmentId) {
        await window.electronAPI.deleteAppointment(location.state.appointmentId);
      }
      // Add the new appointment with updated date/time
      await window.electronAPI.addAppointment({
        patient_name: appointmentData.patient_name,
        appointment_date: selectedDate,
        appointment_time: selectedTime,
        reason: appointmentData.reason,
        patient_id: appointmentData.patient_id,
        appointment_context: (appointmentData.appointment_reason && appointmentData.appointment_reason.trim()) ? appointmentData.appointment_reason.trim() : ''
      });
      setShowForm(false);
      setIsRescheduling(false);
      setSelectedDate('');
      setSelectedTime('');
      setAppointmentData({ patient_name: '', reason: '', patient_id: '', appointment_reason: '' });
      await loadData(); // Auto refresh the appointments list
      addNotification('Rendez-vous reprogrammé avec succès', 'success');
    } catch (error) {
      console.error('Error rescheduling appointment:', error);
      alert('Erreur lors de la reprogrammation du rendez-vous');
    } finally {
      setLoading(false);
    }
  };

  // Add a click handler for reschedule button
  const handleRescheduleButtonClick = (appointment) => {
    navigate('/appointments', {
      state: {
        reschedule: true,
        appointmentId: appointment.id,
        appointmentData: appointment
      }
    });
  };

  const handleConfirmReschedule = async () => {
    if (!rescheduleDate || !rescheduleTime) {
      alert('Veuillez sélectionner une nouvelle date et heure');
      return;
    }
    {
      const proceed = await confirm({
        title: 'Reprogrammer',
        message: 'Êtes-vous sûr de vouloir reprogrammer ce rendez-vous ?',
        confirmText: 'Reprogrammer',
        cancelText: 'Annuler',
        variant: 'primary',
      });
      if (!proceed) return;
    }
    setLoading(true);
    try {
      await window.electronAPI.deleteAppointment(rescheduleModal.appointment.id);
      await window.electronAPI.addAppointment({
        ...rescheduleModal.appointment,
        appointment_date: rescheduleDate,
        appointment_time: rescheduleTime
      });
      setRescheduleModal({ open: false, appointment: null });
      setRescheduleDate('');
      setRescheduleTime('');
      await loadData();
      addNotification('Rendez-vous reprogrammé avec succès', 'success');
    } catch (error) {
      alert('Erreur lors de la reprogrammation du rendez-vous');
    } finally {
      setLoading(false);
    }
  };

  // Add focus management for the modal
  useEffect(() => {
    if (showPatientTypeModal && patientType === 'new') {
      // Focus the first input when the new patient form is shown
      setTimeout(() => {
        if (newPatientNameRef.current) {
          newPatientNameRef.current.focus();
          console.log('[DEBUG] Focused new patient name input');
        }
      }, 100);
    }
  }, [showPatientTypeModal, patientType]);

  useEffect(() => {
    if (showPatientTypeModal && patientType === 'existing') {
      // Focus the first input when the existing patient form is shown
      setTimeout(() => {
        if (existingPatientIdRef.current) {
          existingPatientIdRef.current.focus();
          console.log('[DEBUG] Focused existing patient ID input');
        }
      }, 100);
    }
  }, [showPatientTypeModal, patientType]);

  // Add global focus handler for the modal
  useEffect(() => {
    if (!showPatientTypeModal) return;

    const handleModalClick = (e) => {
      // If clicking inside the modal but not on an input, focus the appropriate input
      if (e.target.closest('[style*="position: fixed"]') && !e.target.matches('input, select, button')) {
        if (patientType === 'new' && newPatientNameRef.current) {
          newPatientNameRef.current.focus();
          console.log('[DEBUG] Refocused new patient name input after modal click');
        } else if (patientType === 'existing' && existingPatientIdRef.current) {
          existingPatientIdRef.current.focus();
          console.log('[DEBUG] Refocused existing patient ID input after modal click');
        }
      }
    };

    const handleWindowFocus = () => {
      // Only refocus if the user actually clicked outside the app window
      if (wasClickedOutsideApp()) {
        // Refocus appropriate input when window regains focus from outside
        if (patientType === 'new' && newPatientNameRef.current) {
          safeFocus(newPatientNameRef.current, 50);
        } else if (patientType === 'existing' && existingPatientIdRef.current) {
          safeFocus(existingPatientIdRef.current, 50);
        }
      }
    };

    document.addEventListener('click', handleModalClick);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('click', handleModalClick);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [showPatientTypeModal, patientType]);

  // Add a function to reset the form state
  const resetFormState = () => {
    console.log('[DEBUG] resetFormState called with:', {
      selectedDate,
      selectedTime,
      isRescheduling,
      showPatientTypeModal: showPatientTypeModal
    });
    
    console.log('[DEBUG] resetFormState: Actually resetting form state');
    setNewPatientForm({ name: '', phone: '', reason: '' });
    setExistingPatientForm({ id: '', name: '', reason: '' });
    setPatientType(null);
    setSelectedDate('');
    setSelectedTime('');
    setAppointmentData({ patient_name: '', reason: '', patient_id: '', appointment_reason: '' });
    setShowPatientTypeModal(false);
    setShowForm(false);
    setIsRescheduling(false);
    setRescheduleAppointmentId(null);
  };



  if (loading) {
    return (
      <div className="page-header">
        <div className="page-title">{t('appointments')}</div>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <span className="spinner"></span>
          <p>{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('appointments')}</h1>
        <p className="page-subtitle">Gestion des rendez-vous</p>
      </div>



      {/* Appointments List */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-calendar-alt" style={{ marginRight: '10px' }}></i>
            Rendez-vous Programmes ({getFilteredAppointments().length} sur {appointments.length})
          </h3>
        </div>

        {/* Search and Filter Controls */}
        <div style={{ 
          padding: '1rem', 
          borderBottom: '1px solid #e1e5e9',
          backgroundColor: '#f8f9fa'
        }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ flex: 1, minWidth: '200px' }}>
              <input
                type="text"
                placeholder="Rechercher par nom, raison, date..."
                value={appointmentSearch}
                onChange={(e) => setAppointmentSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            {/* Filter Buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[
                { key: 'all', label: 'Tous', icon: '📋', color: '#667eea' },
                { key: 'new', label: 'Nouveaux patients', icon: '🆕', color: '#28a745' },
                { key: 'existing', label: 'Patients existants', icon: '👤', color: '#ffc107' }
              ].map(filter => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setAppointmentFilter(filter.key)}
                  style={{
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.85rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    backgroundColor: appointmentFilter === filter.key ? filter.color : '#f8f9fa',
                    color: appointmentFilter === filter.key ? 'white' : '#666',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  <span>{filter.icon}</span>
                  <span>{filter.label}</span>
                </button>
              ))}
            </div>

            {/* Clear Search */}
            {(appointmentSearch || appointmentFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setAppointmentSearch('');
                  setAppointmentFilter('all');
                }}
                style={{
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.85rem',
                  border: '1px solid #dc3545',
                  borderRadius: '6px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <i className="fas fa-times" style={{ marginRight: '0.25rem' }}></i>
                Effacer
              </button>
            )}
          </div>

          {/* Search Results Summary */}
          {appointmentSearch && (
            <div style={{ 
              marginTop: '0.75rem', 
              padding: '0.5rem', 
              backgroundColor: '#e3f2fd', 
              borderRadius: '4px',
              fontSize: '0.85rem',
              color: '#1976d2'
            }}>
              <i className="fas fa-search" style={{ marginRight: '0.5rem' }}></i>
              Recherche pour "{appointmentSearch}" : {getFilteredAppointments().length} résultat(s)
            </div>
          )}

          {/* Filter Summary */}
          {appointmentFilter !== 'all' && (
            <div style={{ 
              marginTop: '0.75rem', 
              padding: '0.5rem', 
              backgroundColor: '#fff3cd', 
              borderRadius: '4px',
              fontSize: '0.85rem',
              color: '#856404'
            }}>
              <i className="fas fa-filter" style={{ marginRight: '0.5rem' }}></i>
              Filtre actif : {appointmentFilter === 'new' ? 'Nouveaux patients uniquement' : 'Patients existants uniquement'}
            </div>
          )}
        </div>

        {getFilteredAppointments().length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
            <i className="fas fa-calendar-times" style={{ fontSize: '3rem', marginBottom: '1rem' }}></i>
            <p>
              {appointments.length === 0 
                ? 'Aucun rendez-vous programmé' 
                : appointmentSearch 
                  ? `Aucun rendez-vous trouvé pour "${appointmentSearch}"`
                  : appointmentFilter === 'new'
                    ? 'Aucun rendez-vous pour de nouveaux patients'
                    : 'Aucun rendez-vous pour des patients existants'
              }
            </p>
            {(appointmentSearch || appointmentFilter !== 'all') && (
              <button
                onClick={() => {
                  setAppointmentSearch('');
                  setAppointmentFilter('all');
                }}
                style={{
                  marginTop: '1rem',
                  padding: '0.5rem 1rem',
                  backgroundColor: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Effacer les filtres
              </button>
            )}
          </div>
        ) : (
          <div>
            {getFilteredAppointments().map(appointment => (
              <div key={appointment.id} className="queue-item">
                <div className="queue-info">
                  <div className="queue-name">
                    <span dangerouslySetInnerHTML={{ __html: highlightMatch(appointment.patient_name, appointmentSearch) }} />
                  </div>
                  {/* Cancel Button */}
                  <button
                    style={{
                      marginLeft: '1rem',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '0.3rem 0.7rem',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      const confirmed = await confirm({
                        title: 'Annuler le rendez-vous',
                        message: 'Êtes-vous sûr de vouloir annuler ce rendez-vous ?',
                        confirmText: 'Annuler le rendez-vous',
                        cancelText: 'Retour',
                        variant: 'danger',
                      });
                      if (confirmed) {
                        try {
                          await window.electronAPI.deleteAppointment(appointment.id);
                          // Also delete the associated patient if no other appointments remain
                          if (appointment.patient_id) {
                            try {
                              const remaining = await window.electronAPI.getAppointments();
                              const hasOther = remaining.some(a => a.patient_id === appointment.patient_id && a.id !== appointment.id);
                              if (!hasOther) {
                                await window.electronAPI.deletePatient(appointment.patient_id);
                                // Notify AllPatients to refresh
                                localStorage.setItem('allPatientsShouldRefresh', String(Date.now()));
                              }
                            } catch (err) {
                              console.warn('Failed to delete patient after cancel:', err);
                            }
                          }
                          await loadData();
                          addNotification('Rendez-vous annulé', 'success');
                        } finally {
                          // Use targeted input fix for current page only
                          try {
                            // Run diagnostic to identify the issue
                            console.log('[DEBUG] Running diagnostic before cancel operation...');
                            diagnoseInputBlocking();
                            // Remove any blocking overlays first
                            removeBlockingOverlays();
                            // CRITICAL: Reset loading state to enable inputs
                            setLoading(false);
                            console.log('[DEBUG] Loading state reset to false after cancel operation');
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
                              console.log('[DEBUG] Running diagnostic after cancel operation...');
                              diagnoseInputBlocking();
                              console.log('[FOCUS] Appointments cancel operation - targeted input fix completed');
                            }, 100);
                          } catch (error) {
                            console.error('[FOCUS] Appointments cancel operation - input fix failed:', error);
                            // Ensure loading is reset even if there's an error
                            setLoading(false);
                          }
                        }
                      }
                    }}
                  >
                    Annuler
                  </button>
                  <div className="queue-details">
                    <span>
                      <i className="fas fa-calendar" style={{ marginRight: '5px' }}></i>
                      {new Date(appointment.appointment_date).toLocaleDateString('fr-FR')}
                    </span>
                    <span>
                      <i className="fas fa-clock" style={{ marginRight: '5px', marginLeft: '10px' }}></i>
                      {appointment.appointment_time}
                    </span>
                    {appointment.reason && (
                      <span style={{ marginLeft: '10px' }}>
                        • {appointment.reason}
                      </span>
                    )}
                    {/* Show patient ID for existing patients */}
                    {appointment.patient_id && appointment.patient_id !== '' && (
                      <span style={{ marginLeft: '10px', color: '#666', fontSize: '0.85rem' }}>
                        • ID: <span dangerouslySetInnerHTML={{ __html: highlightMatch(appointment.patient_id, appointmentSearch) }} />
                      </span>
                    )}
                  </div>
                </div>
                <div className="queue-actions">
                  <span className="status-badge status-waiting">
                    <i className="fas fa-calendar-check" style={{ marginRight: '5px' }}></i>
                    Programmé
                  </span>
                  <button
                    className="btn btn-sm btn-warning"
                    style={{ marginLeft: '0.5rem' }}
                    title="Reprogrammer ce rendez-vous"
                    onClick={() => handleRescheduleButtonClick(appointment)}
                  >
                    <i className="fas fa-calendar-edit"></i> Replanifier
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Calendar View */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-calendar-week" style={{ marginRight: '10px' }}></i>
            {t('scheduleAppointment')}
          </h3>
        </div>

        <div style={{ padding: '1rem' }}>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            Sélectionnez une date puis un créneau horaire pour programmer un rendez-vous. 
            <span style={{ color: '#ffc107', fontWeight: 'bold' }}> Les jours fériés sont sélectionnables</span> 
            pour les médecins qui travaillent pendant ces périodes.
          </p>

          {/* Month navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', gap: '1rem' }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                if (calendarMonth === 0) {
                  setCalendarMonth(11);
                  setCalendarYear(calendarYear - 1);
                } else {
                  setCalendarMonth(calendarMonth - 1);
                }
              }}
              style={{ minWidth: 32 }}
              disabled={holidayLoading}
            >
              <i className="fas fa-chevron-left"></i>
            </button>
            <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
              {new Date(calendarYear, calendarMonth).toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}
            </span>
            <button
              className="btn btn-secondary"
              onClick={() => {
                if (calendarMonth === 11) {
                  setCalendarMonth(0);
                  setCalendarYear(calendarYear + 1);
                } else {
                  setCalendarMonth(calendarMonth + 1);
                }
              }}
              style={{ minWidth: 32 }}
              disabled={holidayLoading}
            >
              <i className="fas fa-chevron-right"></i>
            </button>
            {holidayLoading && (
              <div style={{ marginLeft: '1rem' }}>
                <span className="spinner" style={{ width: '16px', height: '16px' }}></span>
                <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem', color: '#666' }}>Chargement des jours fériés...</span>
              </div>
            )}
          </div>

          {/* Calendar grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
            
          {/* Calendar Legend */}
          <div style={{ 
            gridColumn: '1 / -1', 
            display: 'flex', 
            gap: '1rem', 
            alignItems: 'center', 
            marginBottom: '1rem',
            padding: '0.5rem',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ 
                width: '16px', 
                height: '16px', 
                backgroundColor: 'rgba(255, 193, 7, 0.2)', 
                border: '2px solid #ffc107',
                borderRadius: '4px' 
              }}></div>
              <span style={{ fontSize: '0.8rem' }}>Jour férié (sélectionnable)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ 
                width: '16px', 
                height: '16px', 
                backgroundColor: 'rgba(40, 167, 69, 0.1)', 
                border: '2px solid #e1e5e9',
                borderRadius: '4px' 
              }}></div>
              <span style={{ fontSize: '0.8rem' }}>Avec RDV</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ 
                width: '16px', 
                height: '16px', 
                backgroundColor: 'white', 
                border: '2px solid #667eea',
                borderRadius: '4px' 
              }}></div>
              <span style={{ fontSize: '0.8rem' }}>Sélectionné</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ 
                width: '16px', 
                height: '16px', 
                backgroundColor: '#f8f9fa', 
                border: '2px solid #ddd',
                borderRadius: '4px',
                opacity: 0.5
              }}></div>
              <span style={{ fontSize: '0.8rem', color: '#666' }}>Date passée</span>
            </div>
            
            {/* Holiday Data Source Indicator */}
            <div style={{ 
              marginLeft: 'auto', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              padding: '0.25rem 0.5rem',
              backgroundColor: holidayDataSource.source === 'local' ? '#d4edda' : 
                               holidayDataSource.source === 'api' ? '#d1ecf1' : '#f8d7da',
              borderRadius: '4px',
              fontSize: '0.75rem',
              color: holidayDataSource.source === 'local' ? '#155724' : 
                    holidayDataSource.source === 'api' ? '#0c5460' : '#721c24'
            }}>
              <i className={`fas ${holidayDataSource.source === 'local' ? 'fa-database' : 
                               holidayDataSource.source === 'api' ? 'fa-wifi' : 'fa-exclamation-triangle'}`}></i>
              <span>
                {holidayDataSource.source === 'local' ? 'Données locales (2020-2040)' :
                 holidayDataSource.source === 'api' ? 'Données en ligne' :
                 holidayDataSource.source === 'fallback' ? 'Données de secours' : 'Erreur de données'}
              </span>
            </div>
          </div>
            {[...Array(7)].map((_, i) => (
              <div key={i} style={{ textAlign: 'center', fontWeight: 'bold', color: '#667eea' }}>
                {new Date(2023, 0, i + 2).toLocaleDateString('fr-FR', { weekday: 'short' })}
              </div>
            ))}
            {/* Days of the month */}
            {(() => {
              const firstDay = new Date(calendarYear, calendarMonth, 1);
              const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
              const daysInMonth = lastDay.getDate();
              const startDay = (firstDay.getDay() + 6) % 7; // Monday as first day
              const cells = [];
              for (let i = 0; i < startDay; i++) {
                cells.push(<div key={'empty-' + i}></div>);
              }
              for (let d = 1; d <= daysInMonth; d++) {
                const dateObj = new Date(calendarYear, calendarMonth, d);
                // Use local date formatting to avoid timezone issues
                const dateStr = formatDateToLocalString(calendarYear, calendarMonth, d);
                const dayAppointments = getAppointmentsForDate(dateStr);
                const isPast = dateObj < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const holiday = isHoliday(dateStr);
                
                // Determine background color based on priority: selected > holiday > appointments > default
                let backgroundColor = 'white';
                let borderColor = selectedDate === dateStr ? '#667eea' : '#e1e5e9';
                
                if (selectedDate === dateStr) {
                  // Selected date takes priority
                  backgroundColor = holiday ? 'rgba(255, 193, 7, 0.4)' : '#667eea';
                  borderColor = '#667eea';
                } else if (holiday) {
                  backgroundColor = 'rgba(255, 193, 7, 0.2)';
                  borderColor = '#ffc107';
                } else if (dayAppointments.length > 0) {
                  backgroundColor = 'rgba(40, 167, 69, 0.1)';
                }
                
                cells.push(
                  <div
                    key={dateStr}
                    className="calendar-day"
                    style={{
                      border: `2px solid ${borderColor}`,
                      background: backgroundColor,
                      cursor: isPast ? 'not-allowed' : 'pointer',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      textAlign: 'center',
                      transition: 'all 0.2s ease',
                      opacity: isPast ? 0.5 : 1,
                      transform: 'translateY(0)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                    onMouseEnter={(e) => {
                      if (!isPast) {
                        e.target.style.transform = 'translateY(-2px)';
                        e.target.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isPast) {
                        e.target.style.transform = 'translateY(0)';
                        e.target.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                      }
                    }}
                    onClick={() => {
                      if (!isPast) {
                        console.log('[DEBUG] Date clicked:', dateStr);
                        setSelectedDate(dateStr);
                      }
                    }}
                  >
                    <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{d}</div>
                    {holiday && (
                      <div style={{ fontSize: '0.7rem', color: '#856404', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                        <i className="fas fa-star" style={{ marginRight: '2px' }}></i>
                        {holiday.name}
                      </div>
                    )}
                    {dayAppointments.length > 0 && (
                      <div style={{ fontSize: '0.8rem', color: '#28a745', marginTop: '0.25rem' }}>
                        {dayAppointments.length} RDV
                      </div>
                    )}
                  </div>
                );
              }
              return cells;
            })()}
          </div>

          {selectedDate && (
            <div style={{ marginTop: '2rem' }}>
              <h4>Créneaux pour le {new Date(selectedDate).toLocaleDateString('fr-FR')}</h4>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', 
                gap: '0.5rem',
                marginTop: '1rem'
              }}>
                {timeSlots.map(time => {
                  const isBooked = isTimeSlotBooked(selectedDate, time);
                  const isSelected = selectedTime === time;
                  return (
                    <div
                      key={time}
                      style={{
                        padding: '0.75rem',
                        borderRadius: '8px',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        cursor: isBooked ? 'not-allowed' : 'pointer',
                        backgroundColor: isSelected ? '#667eea' : (isBooked ? '#dc3545' : '#28a745'),
                        color: 'white',
                        border: isSelected ? '2px solid #4a5568' : 'none',
                        transition: 'all 0.2s ease',
                        opacity: isBooked ? 0.8 : 1,
                        boxShadow: isBooked ? 'none' : '0 2px 4px rgba(0,0,0,0.1)',
                        transform: isBooked ? 'none' : 'translateY(0)',
                        ':hover': {
                          transform: isBooked ? 'none' : 'translateY(-2px)',
                          boxShadow: isBooked ? 'none' : '0 4px 8px rgba(0,0,0,0.15)'
                        }
                      }}
                      onClick={() => {
                        if (!isBooked) {
                          console.log('[DEBUG] Time clicked:', time);
                          setSelectedTime(time);
                        }
                      }}
                    >
                      {time}
                      {isBooked && (
                        <i className="fas fa-times" style={{ marginLeft: '5px' }}></i>
                      )}
                      {!isBooked && (
                        <i className="fas fa-check" style={{ marginLeft: '5px' }}></i>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '2rem', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ 
                    width: '20px', 
                    height: '20px', 
                    backgroundColor: '#28a745', 
                    borderRadius: '4px' 
                  }}></div>
                  <span style={{ fontSize: '0.9rem' }}>Disponible</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ 
                    width: '20px', 
                    height: '20px', 
                    backgroundColor: '#667eea', 
                    borderRadius: '4px' 
                  }}></div>
                  <span style={{ fontSize: '0.9rem' }}>Sélectionné</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ 
                    width: '20px', 
                    height: '20px', 
                    backgroundColor: '#dc3545', 
                    borderRadius: '4px' 
                  }}></div>
                  <span style={{ fontSize: '0.9rem' }}>Réservé</span>
                </div>
              </div>
              {isRescheduling && selectedTime && (
                <div style={{ marginTop: '1rem', textAlign: 'right' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleRescheduleSubmit({ preventDefault: () => {} })}
                    disabled={loading}
                  >
                    {loading ? 'Reprogrammation…' : 'Confirmer la reprogrammation'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Patient Details Form (hidden during rescheduling) */}
          {selectedDate && selectedTime && !isRescheduling && (
            <div style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              <h4>Détails du rendez-vous</h4>
              <form onSubmit={isRescheduling ? handleRescheduleSubmit : handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="patient_name">
                      {t('patientName')} *
                      {appointmentData.patient_id && (
                        <span style={{ 
                          marginLeft: '0.5rem', 
                          fontSize: '0.8rem', 
                          color: '#28a745',
                          backgroundColor: '#e8f5e8',
                          padding: '0.2rem 0.4rem',
                          borderRadius: '12px',
                          fontWeight: 'normal'
                        }}>
                          ✅ Patient existant
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      id="patient_name"
                      name="patient_name"
                      className="form-input"
                      value={appointmentData.patient_name}
                      onChange={(e) => {
                        const value = e.target.value;
                        setAppointmentData({
                          ...appointmentData,
                          patient_name: value,
                          // Clear patient_id when typing in name field for new patients
                          patient_id: value ? '' : appointmentData.patient_id
                        });
                      }}
                      placeholder={appointmentData.patient_id ? "Nom du patient existant" : "Nom du patient (nouveau patient)"}
                      required
                      style={{
                        borderColor: appointmentData.patient_id ? '#28a745' : '#ddd',
                        backgroundColor: appointmentData.patient_id ? '#f8fff8' : '#fff'
                      }}
                    />
                    <small style={{ color: '#666', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
                      {appointmentData.patient_id ? (
                        <span style={{ color: '#28a745' }}>
                          ✅ Patient existant sélectionné: {appointmentData.patient_id}
                        </span>
                      ) : (
                        "💡 Utilisez ce champ pour les patients qui n'ont jamais eu de rendez-vous"
                      )}
                    </small>
                  </div>

                  <div className="form-group">
                    {!appointmentData.patient_id && (
                      <>
                        <label className="form-label" htmlFor="reason">
                          {t('reason')}
                        </label>
                        <input
                          type="text"
                          id="reason"
                          name="reason"
                          className="form-input"
                          value={appointmentData.reason}
                          onChange={(e) => setAppointmentData({
                            ...appointmentData,
                            reason: e.target.value
                          })}
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* Additional fields for existing patients */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1rem' }}>
                  <div className="form-group" style={{ position: 'relative' }}>
                    <label className="form-label" htmlFor="patient_id">
                      🔍 Rechercher un patient existant
                      <span style={{ 
                        marginLeft: '0.5rem', 
                        fontSize: '0.8rem', 
                        color: '#667eea',
                        backgroundColor: '#f0f4ff',
                        padding: '0.2rem 0.4rem',
                        borderRadius: '12px',
                        fontWeight: 'normal'
                      }}>
                        RECOMMANDÉ
                      </span>
                    </label>
                    
                    {/* Search Mode Buttons */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      {[
                        { key: 'all', label: 'Tout', icon: '🔍' },
                        { key: 'name', label: 'Nom', icon: '👤' },
                        { key: 'id', label: 'ID', icon: '🆔' },
                        { key: 'year', label: 'Année', icon: '📅' },
                        { key: 'phone', label: 'Téléphone', icon: '📞' }
                      ].map(mode => (
                        <button
                          key={mode.key}
                          type="button"
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.8rem',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            backgroundColor: searchMode === mode.key ? '#667eea' : '#f8f9fa',
                            color: searchMode === mode.key ? 'white' : '#666',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onClick={() => setSearchMode(mode.key)}
                        >
                          {mode.icon} {mode.label}
                        </button>
                      ))}
                    </div>
                    
                    <div style={{ position: 'relative' }} className="dropdown-container">
                      <input
                        type="text"
                        id="patient_id"
                        name="patient_id"
                        className="form-input"
                        placeholder="Rechercher un patient existant par nom, ID, année..."
                        value={appointmentData.patient_id}
                        onChange={handlePatientIdChange}
                        onKeyDown={handleKeyDown}
                        onFocus={() => {
                          if (appointmentData.patient_id.length >= 1) {
                            generatePatientSuggestions(appointmentData.patient_id);
                          }
                        }}
                        onBlur={() => {
                          // Delay hiding suggestions to allow clicking on them
                          setTimeout(() => setShowSuggestions(false), 200);
                        }}
                      />
                      {appointmentData.patient_id && (
                        <button
                          type="button"
                          onClick={() => {
                            setAppointmentData({
                              ...appointmentData,
                              patient_id: '',
                              patient_name: ''
                            });
                            setShowSuggestions(false);
                          }}
                          style={{
                            position: 'absolute',
                            right: '8px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            color: '#999',
                            cursor: 'pointer',
                            fontSize: '1.2rem',
                            padding: '4px'
                          }}
                          title="Effacer la sélection"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    
                    {/* Loading State */}
                    {searchLoading && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        backgroundColor: '#f8f9fa',
                        border: '1px solid #ddd',
                        borderRadius: '0 0 4px 4px',
                        padding: '0.75rem',
                        fontSize: '0.8rem',
                        color: '#666',
                        zIndex: 9999,
                        textAlign: 'center',
                        borderTop: 'none',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                      }}>
                        <span className="spinner" style={{ width: '16px', height: '16px', marginRight: '0.5rem' }}></span>
                        Recherche en cours...
                      </div>
                    )}
                    
                    {/* Search Tips */}
                    {showSuggestions && !searchLoading && patientSuggestions.length === 0 && appointmentData.patient_id.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        backgroundColor: '#f8f9fa',
                        border: '1px solid #ddd',
                        borderRadius: '0 0 4px 4px',
                        padding: '0.75rem',
                        fontSize: '0.8rem',
                        color: '#666',
                        zIndex: 9999,
                        borderTop: 'none',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                      }}>
                        💡 <strong>Conseils de recherche:</strong>
                        <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0 }}>
                          <li>Nom complet ou partiel (ex: "marie", "jean")</li>
                          <li>Année de naissance (ex: "1990", "1985")</li>
                          <li>Numéro de téléphone (ex: "0123456789")</li>
                          <li>Email (ex: "marie@email.com")</li>
                          <li>ID patient complet (ex: "1990_marie")</li>
                          <li>Partie de l'ID (ex: "1990_", "_marie")</li>
                        </ul>
                        <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#fff3cd', borderRadius: '4px', border: '1px solid #ffeaa7' }}>
                          <strong>Aucun patient trouvé</strong> - Essayez une recherche différente ou créez un nouveau patient.
                        </div>
                      </div>
                    )}
                    
                    {/* Suggestions Dropdown */}
                    {showSuggestions && patientSuggestions.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        backgroundColor: 'white',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        zIndex: 9999,
                        maxHeight: '250px',
                        overflowY: 'auto',
                        borderTop: 'none',
                        borderTopLeftRadius: '0',
                        borderTopRightRadius: '0'
                      }}>
                        {patientSuggestions.map((suggestion, index) => (
                          <div
                            key={suggestion.id}
                            style={{
                              padding: '0.75rem',
                              cursor: 'pointer',
                              borderBottom: index < patientSuggestions.length - 1 ? '1px solid #f0f0f0' : 'none',
                              backgroundColor: selectedSuggestionIndex === index ? '#e9ecef' : '#f8f9fa',
                              transition: 'background-color 0.2s',
                              borderLeft: suggestion.isRecent ? '3px solid #28a745' : 'none',
                              position: 'relative',
                              zIndex: 1
                            }}
                            onMouseEnter={() => setSelectedSuggestionIndex(index)}
                            onMouseLeave={() => setSelectedSuggestionIndex(-1)}
                            onClick={() => handleSuggestionSelect(suggestion)}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                              <div style={{ fontWeight: 'bold', color: '#667eea', fontSize: '0.9rem' }}
                                   dangerouslySetInnerHTML={{ 
                                     __html: highlightMatch(suggestion.id, appointmentData.patient_id) 
                                   }}>
                              </div>
                              {suggestion.isRecent && (
                                <span style={{ 
                                  fontSize: '0.7rem', 
                                  color: '#28a745', 
                                  backgroundColor: '#e8f5e8', 
                                  padding: '0.1rem 0.3rem', 
                                  borderRadius: '3px',
                                  fontWeight: 'bold'
                                }}>
                                  RÉCENT
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '1rem', color: '#333', marginBottom: '0.25rem' }}
                                 dangerouslySetInnerHTML={{ 
                                   __html: highlightMatch(suggestion.name, appointmentData.patient_id) 
                                 }}>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#666', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                              {suggestion.date_of_birth && (
                                <span>
                                  📅 {new Date(suggestion.date_of_birth).toLocaleDateString('fr-FR')}
                                </span>
                              )}
                              {suggestion.phone && (
                                <span>
                                  📞 {suggestion.phone}
                                </span>
                              )}
                              {suggestion.email && (
                                <span>
                                  ✉️ {suggestion.email}
                                </span>
                              )}
                              <span style={{ 
                                fontSize: '0.7rem', 
                                color: '#28a745', 
                                backgroundColor: '#e8f5e8', 
                                padding: '0.1rem 0.3rem', 
                                borderRadius: '3px' 
                              }}>
                                Score: {suggestion.score}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label className="form-label" htmlFor="appointment_reason" style={{ marginBottom: 0 }}>
                        Raison du Rendez-vous
                      </label>
                      <button
                        type="button"
                        className="btn btn-light btn-sm"
                        onClick={() => {
                          setNewContextText(appointmentData.appointment_reason || '');
                          setShowAddContextModal(true);
                        }}
                        title="Ajouter un autre contexte"
                      >
                        <i className="fas fa-plus"></i>
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <select
                        id="appointment_reason"
                        name="appointment_reason"
                        className="form-input"
                        value={appointmentData.appointment_reason || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '__custom__') {
                            setNewContextText('');
                            setShowAddContextModal(true);
                            return;
                          }
                          setAppointmentData({ ...appointmentData, appointment_reason: val });
                        }}
                      >
                        <option value="" disabled>Choisir un contexte…</option>
                        {contextOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                        <option value="__custom__">Autre…</option>
                      </select>
                    </div>
                  </div>
                  {/* Add Custom Context Modal */}
                  {showAddContextModal && (
                    <Modal
                      title="Ajouter un contexte"
                      onClose={() => setShowAddContextModal(false)}
                      closeOnBackdropClick={false}
                    >
                      <div className="form-group">
                        <label className="form-label" htmlFor="new_context_text">Nouveau contexte</label>
                        <input
                          type="text"
                          id="new_context_text"
                          className="form-input"
                          value={newContextText}
                          onChange={(e) => setNewContextText(e.target.value)}
                          placeholder="ex: Contrôle post-opératoire"
                          autoFocus
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setShowAddContextModal(false)}
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => {
                            const trimmed = (newContextText || '').trim();
                            if (trimmed) {
                              setAppointmentData({ ...appointmentData, appointment_reason: trimmed });
                            }
                            setShowAddContextModal(false);
                          }}
                        >
                          Ajouter
                        </button>
                      </div>
                    </Modal>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setAppointmentData({ patient_name: '', reason: '', patient_id: '', appointment_reason: '' });
                      setSelectedDate('');
                      setSelectedTime('');
                    }}
                  >
                    <i className="fas fa-times"></i>
                    {t('cancel')}
                  </button>
                  <button type="submit" className="btn btn-primary">
                    <i className="fas fa-save"></i>
                    {t('bookAppointment')}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Patient Action Modal */}
      {showPatientModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            animation: 'slideInUp 0.3s ease-out'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1.5rem'
            }}>
              <h3 style={{
                margin: 0,
                color: '#333',
                fontSize: '1.5rem',
                fontWeight: 'bold'
              }}>
                <i className="fas fa-user" style={{ marginRight: '0.5rem', color: '#667eea' }}></i>
                Actions pour {selectedPatientForAction}
              </h3>
              <button
                onClick={closePatientModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#666',
                  padding: '0.5rem',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <p style={{ color: '#666', marginBottom: '1rem' }}>
                Que souhaitez-vous faire avec ce patient ?
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Modify Appointment Option */}
                <button
                  onClick={handleModifyAppointment}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '1rem',
                    border: '2px solid #667eea',
                    borderRadius: '8px',
                    backgroundColor: '#667eea',
                    color: 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontSize: '1rem',
                    fontWeight: '500'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#5a6fd8';
                    e.target.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = '#667eea';
                    e.target.style.transform = 'translateY(0)';
                  }}
                >
                  <i className="fas fa-edit" style={{ fontSize: '1.2rem' }}></i>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 'bold' }}>Modifier le rendez-vous</div>
                    <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>
                      Supprimer l'ancien rendez-vous et en créer un nouveau
                    </div>
                  </div>
                </button>

                {/* Go to Patients Page Option */}
                <button
                  onClick={handleGoToPatientsPage}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '1rem',
                    border: '2px solid #28a745',
                    borderRadius: '8px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontSize: '1rem',
                    fontWeight: '500'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#218838';
                    e.target.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = '#28a745';
                    e.target.style.transform = 'translateY(0)';
                  }}
                >
                  <i className="fas fa-user-plus" style={{ fontSize: '1.2rem' }}></i>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 'bold' }}>Aller à la page Patients</div>
                    <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>
                      Créer le patient avec le nom pré-rempli
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '1rem',
              paddingTop: '1rem',
              borderTop: '1px solid #e1e5e9'
            }}>
              <button
                onClick={closePatientModal}
                style={{
                  padding: '0.75rem 1.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  backgroundColor: '#f8f9fa',
                  color: '#666',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#e9ecef'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#f8f9fa'}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Patient Type Modal */}
      {showPatientTypeModal && (
        <div 
          style={{
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            backgroundColor: 'rgba(0,0,0,0.5)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 10000
          }}
          onClick={(e) => {
            // Only close if clicking on the backdrop, not the modal content
            if (e.target === e.currentTarget) {
              console.log('[DEBUG] Modal backdrop clicked - calling resetFormState');
              resetFormState();
            }
          }}
        >
          <div 
            style={{ 
              backgroundColor: 'white', 
              borderRadius: '12px', 
              padding: '2rem', 
              maxWidth: '400px', 
              width: '90%' 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {!patientType && (
              <>
                <h3>Confirmer le type de patient</h3>
                <p>Ce rendez-vous est-il pour un nouveau patient ou un patient existant ?</p>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                  <button 
                    className="btn btn-success" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setPatientType('new');
                      // Ensure no context is carried over for new patients
                      setAppointmentData(prev => ({ ...prev, appointment_reason: '' }));
                      setNewPatientForm(prev => ({ ...prev, reason: '' }));
                    }}
                  >
                    Nouveau patient
                  </button>
                  <button 
                    className="btn btn-primary" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setPatientType('existing');
                    }}
                  >
                    Patient existant
                  </button>
                </div>
                <button 
                  className="btn btn-secondary" 
                  style={{ marginTop: '1.5rem' }} 
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log('[DEBUG] Cancel button clicked - calling resetFormState');
                    resetFormState();
                  }}
                >
                  Annuler
                </button>
              </>
            )}
            {patientType === 'new' && (
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!newPatientForm.name || !newPatientForm.phone) {
                  alert('Veuillez remplir le nom et le téléphone');
                  return;
                }
                // Generate patient ID: last 3 digits of phone + name
                const phoneDigits = newPatientForm.phone.replace(/\D/g, '');
                const last3 = phoneDigits.slice(-3);
                const patientId = `${last3}_${newPatientForm.name.toLowerCase().replace(/\s+/g, '')}`;
                // Save new patient to DB with placeholder year_of_birth and date_of_birth
                await window.electronAPI.addPatient({
                  id: patientId,
                  name: newPatientForm.name,
                  phone: newPatientForm.phone,
                  reason_for_visit: newPatientForm.reason,
                  year_of_birth: 0,
                  date_of_birth: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  status: 'waiting' // Set initial status
                });
                // Book appointment for new patient
                await window.electronAPI.addAppointment({
                  patient_name: newPatientForm.name,
                  appointment_date: selectedDate,
                  appointment_time: selectedTime,
                  reason: newPatientForm.reason,
                  patient_id: patientId,
                  // Do not default to 'Contrôle' for new patients; use provided reason if any
                  appointment_reason: (newPatientForm.reason && newPatientForm.reason.trim()) ? newPatientForm.reason.trim() : '',
                  appointment_context: (newPatientForm.reason && newPatientForm.reason.trim()) ? newPatientForm.reason.trim() : '',
                  status: 'scheduled'
                });
                
                // Ensure patient workflow exists
                try {
                  await realTimeUpdateService.ensurePatientWorkflow({
                    patient_id: patientId,
                    patient_name: newPatientForm.name,
                    reason: newPatientForm.reason,
                    status: 'scheduled'
                  });
                } catch (workflowError) {
                  console.warn('Could not ensure patient workflow:', workflowError);
                }

                resetFormState();
                await loadData();
                addNotification('Nouveau patient et rendez-vous ajoutés', 'success');
              }} autoComplete="off">
                <h4>Nouveau patient</h4>
                <div className="form-group">
                  <label>Nom *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={newPatientForm.name} 
                    onChange={e => setNewPatientForm(f => ({ ...f, name: e.target.value }))} 
                    required 
                    ref={newPatientNameRef}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newPatientForm.name && newPatientForm.phone) {
                          // Move to next field or submit
                          if (document.activeElement === newPatientNameRef.current) {
                            newPatientPhoneRef.current?.focus();
                          } else if (document.activeElement === newPatientPhoneRef.current) {
                            newPatientReasonRef.current?.focus();
                          }
                        }
                      }
                    }}
                    onBlur={() => {
                      // Refocus if clicking inside modal but not on another input
                      setTimeout(() => {
                        if (document.activeElement !== newPatientPhoneRef.current && 
                            document.activeElement !== newPatientReasonRef.current &&
                            !document.activeElement.matches('button, select')) {
                          newPatientNameRef.current?.focus();
                        }
                      }, 10);
                    }}
                  />
                </div>
                <div className="form-group">
                  <label>Téléphone *</label>
                  <input 
                    type="tel" 
                    className="form-input" 
                    value={newPatientForm.phone} 
                    onChange={e => setNewPatientForm(f => ({ ...f, phone: e.target.value }))} 
                    required 
                    ref={newPatientPhoneRef}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newPatientForm.name && newPatientForm.phone) {
                          newPatientReasonRef.current?.focus();
                        }
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        if (document.activeElement !== newPatientNameRef.current && 
                            document.activeElement !== newPatientReasonRef.current &&
                            !document.activeElement.matches('button, select')) {
                          newPatientPhoneRef.current?.focus();
                        }
                      }, 10);
                    }}
                  />
                </div>
                <div className="form-group">
                  <label>Raison de la visite *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={newPatientForm.reason} 
                    onChange={e => setNewPatientForm(f => ({ ...f, reason: e.target.value }))} 
                    ref={newPatientReasonRef}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newPatientForm.name && newPatientForm.phone) {
                          // Submit the form
                          const submitButton = e.target.closest('form').querySelector('button[type="submit"]');
                          submitButton?.click();
                        }
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        if (document.activeElement !== newPatientNameRef.current && 
                            document.activeElement !== newPatientPhoneRef.current &&
                            !document.activeElement.matches('button, select')) {
                          newPatientReasonRef.current?.focus();
                        }
                      }, 10);
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setPatientType(null);
                    }}
                  >
                    Retour
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-success"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    Valider
                  </button>
                </div>
              </form>
            )}
            {patientType === 'existing' && (
              <form onSubmit={async (e) => {
                e.preventDefault();
                // Try to auto-resolve ID from Name if not explicitly selected
                let form = { ...existingPatientForm };
                if (!form.id && form.name) {
                  // Prefer exact name match, otherwise take top Fuse result
                  const exact = patients.find(p => (p.name || '').toLowerCase().trim() === form.name.toLowerCase().trim());
                  if (exact) {
                    form = { ...form, id: exact.id, name: exact.name };
                    setExistingPatientForm(form);
                  } else {
                    const res = fuse.search(form.name);
                    if (res && res.length > 0) {
                      const p = res[0].item;
                      form = { ...form, id: p.id, name: p.name };
                      setExistingPatientForm(form);
                    }
                  }
                }
                const patientExists = patients.some(p => p.id === form.id);
                if (!form.id) {
                  await confirm({
                    title: 'Validation requise',
                    message: 'Veuillez sélectionner un patient existant (tapez le nom puis choisissez dans la liste).',
                    confirmText: 'OK',
                    cancelText: 'Fermer',
                    variant: 'primary'
                  });
                  return;
                }
                if (!patientExists) {
                  await confirm({
                    title: 'Patient introuvable',
                    message: 'Aucun patient correspondant. Veuillez vérifier le nom ou l\'identifiant.',
                    confirmText: 'OK',
                    cancelText: 'Fermer',
                    variant: 'danger'
                  });
                  return;
                }
                // Book appointment for existing patient
                await window.electronAPI.addAppointment({
                  patient_name: form.name || '',
                  appointment_date: selectedDate,
                  appointment_time: selectedTime,
                  reason: '',
                  patient_id: form.id,
                  appointment_reason: (appointmentContext && appointmentContext.trim()) ? appointmentContext.trim() : 'Contrôle',
                  appointment_context: (appointmentContext && appointmentContext.trim()) ? appointmentContext.trim() : 'Contrôle',
                  status: 'scheduled'
                });
                resetFormState();
                await loadData();
                addNotification('Rendez-vous ajouté pour patient existant', 'success');
              }} autoComplete="off">
                <h4>Patient existant</h4>
                {/* Name field with fuzzy suggestions */}
                <div className="form-group dropdown-container" style={{ position: 'relative' }}>
                  <label>Nom du patient</label>
                  <input
                    type="text"
                    className="form-input"
                    value={existingPatientForm.name}
                    onChange={e => setExistingPatientForm(f => ({ ...f, name: e.target.value }))}
                    onFocus={() => { setShowSuggestions(true); setModalSuggestionField('name'); }}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    autoComplete="off"
                  />
                  {/* Name suggestions dropdown */}
                  {showSuggestions && modalSuggestionField === 'name' && existingPatientForm.name && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: 'white',
                      border: '1px solid #ddd',
                      borderTop: 'none',
                      zIndex: 9999,
                      maxHeight: '250px',
                      overflowY: 'auto',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      borderTopLeftRadius: '0',
                      borderTopRightRadius: '0',
                      borderRadius: '0 0 4px 4px'
                    }}>
                      {(fuse.search(existingPatientForm.name).slice(0, 8)).map(({ item: p }) => (
                        <div
                          key={p.id}
                          style={{
                            padding: '0.75rem',
                            cursor: 'pointer',
                            background: p.name === existingPatientForm.name ? '#e6f7ff' : 'white',
                            borderBottom: '1px solid #f0f0f0',
                            fontSize: '0.97em',
                            transition: 'background-color 0.2s',
                            position: 'relative',
                            zIndex: 1
                          }}
                          onMouseDown={() => {
                            setExistingPatientForm(f => ({ ...f, id: p.id, name: p.name }));
                            setShowSuggestions(false);
                          }}
                        >
                          <div style={{ fontWeight: 600, color: '#333', marginBottom: '0.25rem' }}>{p.name}</div>
                          <div style={{ fontSize: '0.93em', color: '#555', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                            <span>ID: <span style={{ fontWeight: 500, color: '#667eea' }}>{p.id}</span></span>
                            {p.phone && <span>📞 {p.phone}</span>}
                            {p.date_of_birth && <span>📅 {p.date_of_birth}</span>}
                          </div>
                        </div>
                      ))}
                      {fuse.search(existingPatientForm.name).length === 0 && (
                        <div style={{ padding: '0.75rem', color: '#888', fontSize: '0.97em', textAlign: 'center' }}>
                          Aucun patient trouvé.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Removed separate ID field - selection via Name fills ID internally */}
                {/* Removed 'Raison de la visite' for existing patients */}
                {/* Add appointment context select for existing patients */}
                <div className="form-group">
                  <label>Contexte du rendez-vous</label>
                  <select className="form-input" value={appointmentContext} onChange={e => setAppointmentContext(e.target.value)}>
                    <option value="controle">Contrôle</option>
                    <option value="suivi">Suivi</option>
                    <option value="consultation">Consultation</option>
                    <option value="resultats">Résultats</option>
                    <option value="prescription">Prescription</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setPatientType(null);
                    }}
                  >
                    Retour
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-success"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    Valider
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Appointments; 