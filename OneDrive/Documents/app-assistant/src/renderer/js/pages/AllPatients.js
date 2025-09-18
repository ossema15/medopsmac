import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import { forceEnableFormInputs, safeFocus, fixElectronInputLocking, diagnoseInputBlocking, removeBlockingOverlays, forceElectronWindowFocus } from '../utils/focusUtils';
import { useConfirm } from '../context/ConfirmContext';

function AllPatients({ addNotification }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [patients, setPatients] = useState([]);
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [search, setSearch] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [patientFilter, setPatientFilter] = useState('all'); // 'all', 'with_appointments', 'without_appointments'
  const [selectedPatient, setSelectedPatient] = useState(null);
  // Track the specific patient being deleted to avoid blocking the whole page
  const [deletingId, setDeletingId] = useState(null);
  const [editData, setEditData] = useState({
    name: '',
    phone: '',
    email: '',
    urgent_contact: '',
    reason_for_visit: '',
    medical_history: '',
    year_of_birth: '',
    date_of_birth: '',
    convention: '',
    insurances: '',
    consultation_price: '',
    status: 'waiting'
  });
  const [editFiles, setEditFiles] = useState([]);
  const [patientFiles, setPatientFiles] = useState([]);
  
  // Reschedule modal state
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [selectedPatientForReschedule, setSelectedPatientForReschedule] = useState(null);
  const [selectedAppointmentForReschedule, setSelectedAppointmentForReschedule] = useState(null);

  // Selector for the search input used throughout focus fixes
  const SEARCH_INPUT_SELECTOR = 'input[placeholder*="Rechercher"], input[placeholder*="rechercher"], input[placeholder*="search"], input[type="search"]';

  // Robustly focus the search input
  const focusSearchInput = () => {
    try {
      const el = document.querySelector(SEARCH_INPUT_SELECTOR);
      if (el) {
        // Ensure it's interactable
        el.style.pointerEvents = 'auto';
        el.removeAttribute('disabled');
        el.tabIndex = 0;
        el.focus({ preventScroll: true });
        if (typeof el.select === 'function') el.select();
        return true;
      }
    } catch (e) {
      console.warn('[FOCUS] focusSearchInput failed:', e);
    }
    return false;
  };


  const fetchAllPatients = async (searchTerm = '') => {
    setSearchLoading(true);
    try {
      const [patientsResult, appointmentsResult] = await Promise.all([
        window.electronAPI.getPatients(),
        window.electronAPI.getAppointments()
      ]);
      
      setPatients(patientsResult);
      setAppointments(appointmentsResult);
      
      let filtered = patientsResult;
      
      // Apply search filter
      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        filtered = filtered.filter(p =>
          (p.name && p.name.toLowerCase().includes(lower)) ||
          (p.phone && p.phone.includes(lower)) ||
          (p.date_of_birth && p.date_of_birth.includes(lower)) ||
          (p.id && p.id.toLowerCase().includes(lower)) ||
          (p.email && p.email.toLowerCase().includes(lower)) ||
          (p.reason_for_visit && p.reason_for_visit.toLowerCase().includes(lower))
        );
      }
      
      // Apply patient filter
      if (patientFilter === 'with_appointments') {
        const patientIdsWithAppointments = new Set(appointmentsResult.map(apt => apt.patient_id).filter(Boolean));
        filtered = filtered.filter(p => patientIdsWithAppointments.has(p.id));
      } else if (patientFilter === 'without_appointments') {
        const patientIdsWithAppointments = new Set(appointmentsResult.map(apt => apt.patient_id).filter(Boolean));
        filtered = filtered.filter(p => !patientIdsWithAppointments.has(p.id));
      }
      
      setFilteredPatients(filtered);
    } catch (error) {
      setFilteredPatients([]);
      console.error('Error loading all patients:', error);
    } finally {
      setSearchLoading(false);
      setLoading(false);
    }
  };

  // Always fetch all patients on initial mount
  useEffect(() => {
    fetchAllPatients();
    // eslint-disable-next-line
  }, []);

  // Ensure loading state is reset when component mounts
  useEffect(() => {
    setLoading(false);
    console.log('[DEBUG] AllPatients: Loading state reset on mount');
  }, []);

  // Additional safety: reset loading state if it gets stuck
  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => {
        console.log('[DEBUG] AllPatients: Loading state timeout - forcing reset');
        setLoading(false);
      }, 5000); // Reset after 5 seconds if still loading
      
      return () => clearTimeout(timeout);
    }
  }, [loading]);

  // Insert mock patients for testing
  useEffect(() => {
    // Prefill edit modal if navigated with prefill data
    if (location.state && (location.state.prefillPatientName || location.state.prefillReasonForVisit)) {
      setEditData({
        name: location.state.prefillPatientName || '',
        phone: '',
        email: '',
        urgent_contact: '',
        reason_for_visit: location.state.prefillReasonForVisit || '',
        medical_history: '',
        year_of_birth: '',
        date_of_birth: '',
        convention: '',
        insurances: '',
        consultation_price: '',
        status: 'waiting',
      });
      setSelectedPatient({
        name: location.state.prefillPatientName || '',
        phone: '',
        email: '',
        urgent_contact: '',
        reason_for_visit: location.state.prefillReasonForVisit || '',
        medical_history: '',
        year_of_birth: '',
        date_of_birth: '',
        convention: '',
        insurances: '',
        consultation_price: '',
        status: 'waiting',
      });
    }
    // Listen for restore event
    const onStorage = (e) => {
      console.log('[DEBUG] AllPatients: Storage event received:', e.key, e.newValue);
      if (e.key === 'allPatientsShouldRefresh') {
        console.log('[DEBUG] AllPatients: Refreshing data due to patient update');
        fetchAllPatients(search);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // eslint-disable-next-line
  }, [search, patientFilter]);

  const handleRefresh = () => {
    fetchAllPatients(search);
  };

  // (Removed) Mock patient seeding utility

  const handlePatientClick = async (patient) => {
    setSelectedPatient(patient);
    setEditData({ ...patient });
    // Fetch files for this patient
    try {
      const files = await window.electronAPI.getPatientFiles(patient.id);
      setPatientFiles(files);
    } catch (error) {
      setPatientFiles([]);
    }
    setEditFiles([]);
  };

  const handleEditChange = (e) => {
    setEditData({ ...editData, [e.target.name]: e.target.value });
  };

  const handleEditFileSelect = async () => {
    try {
      const filePaths = await window.electronAPI.selectFiles();
      if (filePaths && filePaths.length > 0) {
        setEditFiles(prev => [...prev, ...filePaths]);
      }
    } catch (error) {
      alert('Erreur lors de la sélection des fichiers');
    }
  };

  const removeEditFile = (index) => {
    setEditFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Handle delete patient (avoid global loading state to prevent focus lock)
  const handleDeletePatient = async (patientId) => {
    const confirmed = await confirm({
      title: 'Supprimer le patient',
      message: 'Êtes-vous sûr de vouloir supprimer ce patient ? Cette action est irréversible.',
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      variant: 'danger',
    });

    // After our custom modal closes, ensure inputs are usable and refocus search
    try {
      removeBlockingOverlays();
      await fixElectronInputLocking(SEARCH_INPUT_SELECTOR, 0);
      forceElectronWindowFocus();
      if (!focusSearchInput()) {
        setTimeout(() => focusSearchInput(), 50);
      }
    } catch (e) {
      console.warn('[FOCUS] Post-confirm focus restore encountered an issue:', e);
    }

    if (!confirmed) {
      // User canceled, ensure no deleting state is set and inputs are usable
      setDeletingId(null);
      return;
    }

    try {
      // Only disable the clicked delete button instead of locking the whole UI
      setDeletingId(patientId);

      await window.electronAPI.deletePatient(patientId);
      // Remove related walk-in notifications from localStorage
      let notifications = [];
      try {
        notifications = JSON.parse(localStorage.getItem('walkinNotifications') || '[]');
      } catch {}
      notifications = notifications.filter(n => n.patient_id !== patientId && (!n.appointment || n.appointment.patient_id !== patientId));
      localStorage.setItem('walkinNotifications', JSON.stringify(notifications));
      addNotification('Patient supprimé avec succès', 'success');

      // Refresh the patient list
      await fetchAllPatients(search);

      // Close modal if the deleted patient was selected
      if (selectedPatient && selectedPatient.id === patientId) {
        setSelectedPatient(null);
        setEditData({
          name: '',
          phone: '',
          email: '',
          urgent_contact: '',
          reason_for_visit: '',
          medical_history: '',
          year_of_birth: '',
          date_of_birth: '',
          convention: '',
          insurances: '',
          consultation_price: '',
          status: 'waiting'
        });
        setPatientFiles([]);
        setEditFiles([]);
      }

      // Close reschedule modal if the deleted patient was selected for rescheduling
      if (selectedPatientForReschedule && selectedPatientForReschedule.id === patientId) {
        setShowRescheduleModal(false);
        setSelectedPatientForReschedule(null);
        setSelectedAppointmentForReschedule(null);
      }

      // Ensure all modals are closed to prevent UI blocking
      // This is a safety measure in case there are any other modal states
      setShowRescheduleModal(false);
      setSelectedPatientForReschedule(null);
      setSelectedAppointmentForReschedule(null);

      // After UI updates, proactively restore focus to the search input again
      try {
        removeBlockingOverlays();
        await fixElectronInputLocking(SEARCH_INPUT_SELECTOR, 0);
        forceElectronWindowFocus();
        if (!focusSearchInput()) {
          setTimeout(() => focusSearchInput(), 50);
        }
      } catch (e) {
        console.warn('[FOCUS] fixElectronInputLocking failed after delete:', e);
      }
    } catch (error) {
      addNotification('Erreur lors de la suppression du patient', 'error');
      console.error('Error deleting patient:', error);
    } finally {
      // Always clear per-row deleting state
      setDeletingId(null);
    }
  };

  // Add this function at the top-level of AllPatients
  const handleTransferToDoctor = async (patient, todayAppointment = null) => {
    try {
      const patientId = patient.id;
      if (!patientId) {
        addNotification('ID du patient manquant', 'error');
        return;
      }
      // If there is a today's appointment (existing patient with context), send plain text message
      if (todayAppointment) {
        const rawName = ((patient && patient.name) || (todayAppointment && todayAppointment.patient_name) || patient?.patient_name || '').toString().trim();
        const fallbackIdOrPhone = (patient && (patient.id || patient.phone)) ? String(patient.id || patient.phone).trim() : '';
        const name = rawName || fallbackIdOrPhone; // ensure non-empty identifier if possible
        const context = (todayAppointment.appointment_reason || todayAppointment.reason || patient?.reason_for_visit || '').toString().trim() || 'controle';
        const message = name ? `patient ${name} ${context}` : `patient ${context}`;
        await window.electronAPI.sendChatMessage(message.trim());
        addNotification('Patient transféré au médecin (message envoyé)', 'success');
      } else {
        // Old workflow unchanged: send full patient data
        // Include existing patient files (images/documents) when sending
        const files = await window.electronAPI.getPatientFiles(patientId).catch(() => []);
        await window.electronAPI.sendPatientData({
          patientData: patient,
          files,
          patientId
        });
        addNotification('Patient transféré au médecin avec succès', 'success');
      }
    } catch (error) {
      addNotification('Erreur lors du transfert au médecin', 'error');
      console.error('Error during patient transfer:', error);
    }
  };

  // Remove showNotification function

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editData.name || !editData.date_of_birth) {
      addNotification('Le nom et la date de naissance sont requis', 'error');
      return;
    }
    try {
      const oldId = selectedPatient.id;
      const yearOfBirth = parseInt(editData.date_of_birth.split('-')[0]);
      const namePart = editData.name.toLowerCase().replace(/\s+/g, '');
      const phoneSuffix = getPhoneSuffix(editData.phone);
      const newId = `${yearOfBirth}_${namePart}_${phoneSuffix}`;
      const isIdChanged = newId !== oldId;
      if (isIdChanged) {
        const proceed = await confirm({
          title: 'Modifier l\'identifiant',
          message: 'Le nom ou l\'année de naissance a changé. L\'identifiant sera mis à jour et toutes les références seront renommées. Continuer ?',
          confirmText: 'Continuer',
          cancelText: 'Annuler',
          variant: 'primary',
        });
        if (!proceed) {
          return;
        }
        // Atomic rename: update DB references and filesystem without creating duplicates
        const updateFields = {
          name: editData.name,
          phone: editData.phone,
          email: editData.email,
          urgent_contact: editData.urgent_contact,
          reason_for_visit: editData.reason_for_visit,
          medical_history: editData.medical_history,
          date_of_birth: editData.date_of_birth,
          year_of_birth: yearOfBirth,
          status: 'existant',
          updatedAt: new Date().toISOString(),
          hasBeenEdited: true,
        };
        await window.electronAPI.renamePatientId(oldId, newId, updateFields);

        // Save any newly attached files under the new ID (directory may have been moved/merged already)
        if (editFiles.length > 0) {
          await window.electronAPI.savePatientFiles(newId, editFiles);
        }

        // Refresh patient list and files
        await fetchAllPatients(search);
        const files = await window.electronAPI.getPatientFiles(newId);
        setPatientFiles(files);
        setEditFiles([]);
        setSelectedPatient({ ...editData, id: newId });
        addNotification('Patient mis à jour avec succès (ID renommé)', 'success');
      } else {
        let hasBeenEdited = true; // Always set to true for any edit
        await window.electronAPI.updatePatient({ ...editData, id: oldId, status: 'existant', updatedAt: new Date().toISOString(), hasBeenEdited });
        if (editFiles.length > 0) {
          await window.electronAPI.savePatientFiles(oldId, editFiles);
        }
        // Refresh patient list and files
        await fetchAllPatients(search);
        const files = await window.electronAPI.getPatientFiles(oldId);
        setPatientFiles(files);
        setEditFiles([]);
        addNotification('Patient mis à jour avec succès', 'success');
      }
    } catch (error) {
      addNotification('Erreur lors de la mise à jour du patient', 'error');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      // If the time is exactly 00:00:00 or 01:00:00, show only the date
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const seconds = date.getSeconds();
      if ((hours === 0 || hours === 1) && minutes === 0 && seconds === 0) {
        return date.toLocaleDateString('fr-FR');
      }
      // Otherwise, show date and time
      return (
        date.toLocaleDateString('fr-FR') +
        ' ' +
        date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      );
    } catch (error) {
      return dateString;
    }
  };

  // Get next scheduled appointment for a patient
  const getNextAppointment = (patientId) => {
    const now = new Date();
    const futureAppointments = appointments.filter(apt => 
      apt.patient_id === patientId && 
      new Date(apt.appointment_date + ' ' + apt.appointment_time) > now
    );
    
    if (futureAppointments.length === 0) return null;
    
    // Sort by date and time, return the earliest
    return futureAppointments.sort((a, b) => 
      new Date(a.appointment_date + ' ' + a.appointment_time) - 
      new Date(b.appointment_date + ' ' + b.appointment_time)
    )[0];
  };

  // Handle appointment rescheduling
  const handleRescheduleAppointment = (patientId) => {
    const patient = patients.find(p => p.id === patientId);
    const nextAppointment = getNextAppointment(patientId);
    
    if (patient && nextAppointment) {
      setSelectedPatientForReschedule(patient);
      setSelectedAppointmentForReschedule(nextAppointment);
      setShowRescheduleModal(true);
    } else {
      addNotification('Aucun rendez-vous trouvé pour ce patient', 'error');
    }
  };

  // Handle reschedule confirmation
  const handleConfirmReschedule = () => {
    if (selectedPatientForReschedule && selectedAppointmentForReschedule) {
      navigate('/appointments', { 
        state: { 
          patientId: selectedPatientForReschedule.id,
          reschedule: true,
          appointmentId: selectedAppointmentForReschedule.id, // Add appointment ID for deletion
          appointmentData: {
            patient_name: selectedPatientForReschedule.name,
            reason: selectedAppointmentForReschedule.reason || selectedAppointmentForReschedule.appointment_reason || '',
            patient_id: selectedPatientForReschedule.id,
            appointment_reason: selectedAppointmentForReschedule.appointment_reason || ''
          }
        } 
      });
      setShowRescheduleModal(false);
      setSelectedPatientForReschedule(null);
      setSelectedAppointmentForReschedule(null);
    }
  };

  // Close reschedule modal
  const closeRescheduleModal = () => {
    setShowRescheduleModal(false);
    setSelectedPatientForReschedule(null);
    setSelectedAppointmentForReschedule(null);
  };

  const getStatusBadge = (status) => {
    const statusClasses = {
      waiting: 'status-waiting',
      with_doctor: 'status-with-doctor',
      canceled: 'status-canceled'
    };

    return (
      <span className={`status-badge ${statusClasses[status] || 'status-waiting'}`}>
        {t(status)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="page-header">
        <div className="page-title">Tous les Patients</div>
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
        <h1 className="page-title">Tous les Patients</h1>
        <p className="page-subtitle">Base de données complète - Recherche et consultation</p>
      </div>
      {/* Enhanced Search and Filter Controls */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-search" style={{ marginRight: '10px' }}></i>
            Recherche et Filtres
          </h3>
        </div>
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
                placeholder="Rechercher par nom, téléphone, email, raison..."
                value={search}
                onChange={e => setSearch(e.target.value)}
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
                { key: 'all', label: 'Tous', icon: '👥', color: '#667eea' },
                { key: 'with_appointments', label: 'Avec RDV', icon: '📅', color: '#28a745' },
                { key: 'without_appointments', label: 'Sans RDV', icon: '⏰', color: '#ffc107' }
              ].map(filter => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setPatientFilter(filter.key)}
                  style={{
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.85rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    backgroundColor: patientFilter === filter.key ? filter.color : '#f8f9fa',
                    color: patientFilter === filter.key ? 'white' : '#666',
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

            {/* Refresh Button */}
            <button 
              type="button" 
              className="btn btn-info" 
              onClick={handleRefresh} 
              disabled={searchLoading}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.85rem',
                border: '1px solid #17a2b8',
                borderRadius: '6px',
                backgroundColor: '#17a2b8',
                color: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              {searchLoading ? <span className="spinner" style={{ width: '12px', height: '12px' }} /> : <i className="fas fa-sync-alt"></i>}
              <span>Rafraîchir</span>
            </button>

            {/* Removed: Seed Mock Patients Button */}

            {/* Clear Search */}
            {(search || patientFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setPatientFilter('all');
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
          {search && (
            <div style={{ 
              marginTop: '0.75rem', 
              padding: '0.5rem', 
              backgroundColor: '#e3f2fd', 
              borderRadius: '4px',
              fontSize: '0.85rem',
              color: '#1976d2'
            }}>
              <i className="fas fa-search" style={{ marginRight: '0.5rem' }}></i>
              Recherche pour "{search}" : {filteredPatients.length} résultat(s)
            </div>
          )}

          {/* Filter Summary */}
          {patientFilter !== 'all' && (
            <div style={{ 
              marginTop: '0.75rem', 
              padding: '0.5rem', 
              backgroundColor: '#fff3cd', 
              borderRadius: '4px',
              fontSize: '0.85rem',
              color: '#856404'
            }}>
              <i className="fas fa-filter" style={{ marginRight: '0.5rem' }}></i>
              Filtre actif : {patientFilter === 'with_appointments' ? 'Patients avec rendez-vous uniquement' : 'Patients sans rendez-vous uniquement'}
            </div>
          )}
        </div>
      </div>
      {/* Patient List */}
      <div style={{ display: 'flex', gap: '2rem' }}>
        <div style={{ flex: 1 }}>
          {searchLoading ? (
            <div style={{ textAlign: 'center', margin: '1rem 0' }}>
              <span className="spinner" style={{ marginRight: '0.5rem' }}></span>Recherche en cours...
            </div>
          ) : filteredPatients.length > 0 ? (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <i className="fas fa-users" style={{ marginRight: '10px' }}></i>
                  Patients ({filteredPatients.length} sur {patients.length})
                  {(search || patientFilter !== 'all') && (
                    <span style={{ 
                      fontSize: '0.8rem', 
                      color: '#666', 
                      fontWeight: 'normal',
                      marginLeft: '0.5rem'
                    }}>
                      • Filtres actifs
                    </span>
                  )}
                </h3>
              </div>
              <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                {filteredPatients.map(patient => (
                  <div
                    key={patient.id}
                    className="list-group-item"
                    style={{ 
                      cursor: 'pointer',
                      borderBottom: '1px solid #f0f0f0',
                      padding: '1rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: selectedPatient && selectedPatient.id === patient.id ? '#e6f7ff' : 'white'
                    }}
                    onClick={() => handlePatientClick(patient)}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <strong style={{ fontSize: '1.1rem' }}>{patient.name}</strong>
                        <span style={{ 
                          fontSize: '0.8rem', 
                          color: '#667eea', 
                          backgroundColor: '#f0f4ff', 
                          padding: '0.2rem 0.5rem', 
                          borderRadius: '4px',
                          fontWeight: 'bold'
                        }}>
                          ID: {patient.id || 'N/A'}
                        </span>
                        {/* Appointment status indicator removed as per requested workflow change */}
                      </div>
                      <div style={{ color: '#666', fontSize: '0.9rem' }}>
                        {patient.phone && <span style={{ marginRight: '1rem' }}>📞 {patient.phone}</span>}
                        {patient.date_of_birth && <span style={{ marginRight: '1rem' }}>📅 {formatDate(patient.date_of_birth)}</span>}
                        {patient.reason_for_visit && <span>💬 {patient.reason_for_visit}</span>}
                      </div>
                      
                      {/* All Appointments */}
                      {(() => {
                        const patientAppointments = appointments.filter(apt => apt.patient_id === patient.id);
                        if (patientAppointments.length > 0) {
                          return (
                            <div style={{ marginTop: '0.5rem' }}>
                              <span style={{ color: '#007bff', fontSize: '0.9rem', fontWeight: 'bold' }}>
                                📅 Rendez-vous :
                              </span>
                              <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem' }}>
                                {patientAppointments.map(apt => (
                                  <li key={apt.id} style={{ marginBottom: 2 }}>
                                    {formatDate(apt.appointment_date)} à {apt.appointment_time}
                                    {apt.reason && <span> — {apt.reason}</span>}
                                    {apt.appointment_reason && <span> — {apt.appointment_reason}</span>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        }
                        return null;
                      })()}
                      
                      {patient.created_at && (
                        <div style={{ color: '#999', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                          Créé le: {formatDate(patient.created_at)}
                        </div>
                      )}
                    </div>
                    <div style={{ marginLeft: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (deletingId === patient.id) return;
                          handleDeletePatient(patient.id);
                        }}
                        disabled={deletingId === patient.id}
                        aria-busy={deletingId === patient.id}
                        style={{ 
                          padding: '0.25rem 0.5rem', 
                          fontSize: '0.8rem',
                          backgroundColor: '#dc3545',
                          border: 'none',
                          borderRadius: '4px',
                          color: 'white',
                          cursor: deletingId === patient.id ? 'not-allowed' : 'pointer',
                          opacity: deletingId === patient.id ? 0.7 : 1
                        }}
                        title="Supprimer le patient"
                      >
                        {deletingId === patient.id ? (
                          <span className="spinner" style={{ width: '12px', height: '12px' }} />
                        ) : (
                          <i className="fas fa-trash"></i>
                        )}
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const confirmed = await confirm({
                            title: 'Transférer au médecin',
                            message: 'Voulez-vous transférer ce patient au médecin ? Cette action enverra les informations nécessaires au médecin.',
                            confirmText: 'Transférer',
                            cancelText: 'Annuler',
                            variant: 'primary',
                          });
                          if (!confirmed) return;
                          handleTransferToDoctor(patient, getNextAppointment(patient.id));
                        }}
                        style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.8rem',
                          backgroundColor: '#667eea',
                          border: 'none',
                          borderRadius: '4px',
                          color: 'white',
                          cursor: 'pointer'
                        }}
                        title="Transférer au médecin"
                        aria-label="Transférer au médecin"
                      >
                        <i className="fas fa-user-md" style={{ marginRight: '0.25rem' }}></i>
                        Transférer
                      </button>
                      <i className="fas fa-chevron-right" style={{ color: '#ccc' }}></i>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Aucun patient trouvé</h3>
              </div>
              <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                <i className="fas fa-search" style={{ fontSize: '3rem', marginBottom: '1rem', color: '#ccc' }}></i>
                <p>
                  {patients.length === 0 
                    ? 'Aucun patient dans la base de données' 
                    : search 
                      ? `Aucun patient trouvé pour "${search}"`
                      : patientFilter === 'with_appointments'
                        ? 'Aucun patient avec des rendez-vous'
                        : 'Aucun patient sans rendez-vous'
                  }
                </p>
                {(search || patientFilter !== 'all') && (
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => {
                      setSearch('');
                      setPatientFilter('all');
                    }}
                    style={{ marginTop: '1rem' }}
                  >
                    Effacer les filtres
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        {/* Patient Edit Form */}
        <Modal isOpen={!!selectedPatient} onClose={() => setSelectedPatient(null)} width="700px">
          {selectedPatient && editData && (
            <div>
              <div className="card-header">
                <h3 className="card-title">Modifier le Patient</h3>
              </div>
              <form onSubmit={handleEditSave} style={{ padding: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="name">Nom *</label>
                    <input type="text" id="name" name="name" className="form-input" value={editData.name} onChange={handleEditChange} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="date_of_birth">Date de naissance *</label>
                    <input type="date" id="date_of_birth" name="date_of_birth" className="form-input" value={editData.date_of_birth} onChange={handleEditChange} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="phone">Téléphone</label>
                    <input type="tel" id="phone" name="phone" className="form-input" value={editData.phone} onChange={handleEditChange} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="email">Email</label>
                    <input type="email" id="email" name="email" className="form-input" value={editData.email} onChange={handleEditChange} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="urgent_contact">Contact urgent</label>
                    <input type="text" id="urgent_contact" name="urgent_contact" className="form-input" value={editData.urgent_contact} onChange={handleEditChange} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="convention">Convention</label>
                    <input type="text" id="convention" name="convention" className="form-input" value={editData.convention} onChange={handleEditChange} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="insurances">Assurances</label>
                    <input type="text" id="insurances" name="insurances" className="form-input" value={editData.insurances} onChange={handleEditChange} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="consultation_price">{t('consultationPrice')}</label>
                    <input type="number" id="consultation_price" name="consultation_price" className="form-input" value={editData.consultation_price} onChange={handleEditChange} step="0.01" min="0" placeholder="0.00" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="reason_for_visit">Raison de visite</label>
                  <textarea id="reason_for_visit" name="reason_for_visit" className="form-input form-textarea" value={editData.reason_for_visit} onChange={handleEditChange} rows="3" />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="medical_history">Antécédents médicaux</label>
                  <textarea id="medical_history" name="medical_history" className="form-input form-textarea" value={editData.medical_history} onChange={handleEditChange} rows="4" />
                </div>
                {/* For existing patients: show attached files left, upload area right. For new: only upload area. */}
                {selectedPatient && selectedPatient.id ? (
                  <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', marginBottom: '2rem' }}>
                    {/* Attached files on the left */}
                    <div style={{ flex: 1 }}>
                      <div className="file-list">
                        <h4 style={{ marginBottom: '1rem' }}>Fichiers attachés ({patientFiles.length})</h4>
                        {patientFiles.length > 0 ? (
                          patientFiles.map((file, idx) => {
                            const [loading, setLoading] = useState(false);
                            const [error, setError] = useState('');
                            const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file.name);
                            const handleOpen = async () => {
                              setLoading(true);
                              setError('');
                              try {
                                await window.electronAPI.openFile(file.path);
                              } catch (e) {
                                setError('Impossible d\'ouvrir le fichier.');
                              }
                              setLoading(false);
                            };
                            const handleDelete = async () => {
                              const confirmed = await confirm({
                                title: 'Supprimer le fichier',
                                message: 'Supprimer ce fichier ?',
                                confirmText: 'Supprimer',
                                cancelText: 'Annuler',
                                variant: 'danger',
                              });
                              if (confirmed) {
                                try {
                                  await window.electronAPI.deletePatientFile(selectedPatient.id, file.name);
                                  setPatientFiles(prev => prev.filter(f => f.name !== file.name));
                                } catch (e) {
                                  setError('Erreur lors de la suppression.');
                                }
                              }
                            };
                            const handleDownload = async () => {
                              try {
                                await window.electronAPI.downloadFile(file.path);
                              } catch (e) {
                                setError('Erreur lors du téléchargement.');
                              }
                            };
                            return (
                              <div key={`attached-file-${idx}-${file.name}`} className="file-item">
                                {isImage && <img src={`file://${file.path}`} alt={file.name} style={{ width: 32, height: 32, objectFit: 'cover', marginRight: 8, borderRadius: 4 }} />}
                                <span
                                  className="file-link"
                                  role="button"
                                  tabIndex={0}
                                  onClick={handleOpen}
                                  onKeyPress={e => { if (e.key === 'Enter' || e.key === ' ') handleOpen(); }}
                                >
                                  {file.name}
                                </span>
                                {loading && <span className="file-spinner" />}
                                <button type="button" className="btn btn-danger btn-sm" style={{ marginLeft: 8 }} onClick={handleDelete} aria-label="Supprimer le fichier">
                                  <i className="fas fa-trash"></i>
                                </button>
                                <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 4 }} onClick={handleDownload} aria-label="Télécharger le fichier">
                                  <i className="fas fa-download"></i>
                                </button>
                                {error && <span style={{ color: 'red', marginLeft: 8 }}>{error}</span>}
                              </div>
                            );
                          })
                        ) : (
                          <span style={{ color: '#888', fontSize: '0.95em' }}>Aucun fichier attaché.</span>
                        )}
                      </div>
                    </div>
                    {/* Attach files area on the right */}
                    <div style={{ minWidth: 220, maxWidth: 320 }}>
                      <label className="form-label">Ajouter des fichiers</label>
                      <div className="file-upload" onClick={handleEditFileSelect} style={{ cursor: 'pointer', textAlign: 'center' }}>
                        <i className="fas fa-cloud-upload-alt" style={{ fontSize: '2rem', color: '#667eea', marginBottom: '1rem' }}></i>
                        <p>Sélectionner des fichiers</p>
                      </div>
                      {editFiles.length > 0 && (
                        <div className="file-list">
                          <h4 style={{ marginBottom: '1rem' }}>{editFiles.length} fichiers sélectionnés</h4>
                          {editFiles.map((file, index) => (
                            <div key={`edit-file-${index}-${file.split(/[/\\]/).pop()}`} className="file-item">
                              <span>{file.split(/[/\\]/).pop()}</span>
                              <button type="button" onClick={() => removeEditFile(index)} className="btn btn-danger btn-sm">
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
                    <label className="form-label">Ajouter des fichiers</label>
                    <div className="file-upload" onClick={handleEditFileSelect} style={{ cursor: 'pointer', textAlign: 'center' }}>
                      <i className="fas fa-cloud-upload-alt" style={{ fontSize: '2rem', color: '#667eea', marginBottom: '1rem' }}></i>
                      <p>Sélectionner des fichiers</p>
                    </div>
                    {editFiles.length > 0 && (
                      <div className="file-list">
                        <h4 style={{ marginBottom: '1rem' }}>{editFiles.length} fichiers sélectionnés</h4>
                        {editFiles.map((file, index) => (
                          <div key={`edit-file-${index}-${file.split(/[/\\]/).pop()}`} className="file-item">
                            <span>{file.split(/[/\\]/).pop()}</span>
                            <button type="button" onClick={() => removeEditFile(index)} className="btn btn-danger btn-sm">
                              <i className="fas fa-times"></i>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                  <button type="submit" className="btn btn-primary">Enregistrer</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setSelectedPatient(null)}>Fermer</button>
                </div>
              </form>
            </div>
          )}
        </Modal>

        {/* Reschedule Modal */}
        {showRescheduleModal && selectedPatientForReschedule && selectedAppointmentForReschedule && (
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
                  <i className="fas fa-calendar-alt" style={{ marginRight: '0.5rem', color: '#667eea' }}></i>
                  Reprogrammer le rendez-vous
                </h3>
                <button
                  onClick={closeRescheduleModal}
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
                <div style={{ 
                  padding: '1rem', 
                  backgroundColor: '#f8f9fa', 
                  borderRadius: '8px',
                  marginBottom: '1rem'
                }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#333' }}>
                    Patient: {selectedPatientForReschedule.name}
                  </h4>
                  <div style={{ fontSize: '0.9rem', color: '#666' }}>
                    <div><strong>Rendez-vous actuel:</strong></div>
                    <div>📅 {formatDate(selectedAppointmentForReschedule.appointment_date)} à {selectedAppointmentForReschedule.appointment_time}</div>
                    {selectedAppointmentForReschedule.reason && (
                      <div>💬 Raison: {selectedAppointmentForReschedule.reason}</div>
                    )}
                    {selectedAppointmentForReschedule.appointment_reason && (
                      <div>📝 Motif: {selectedAppointmentForReschedule.appointment_reason}</div>
                    )}
                  </div>
                </div>
                
                <p style={{ color: '#666', marginBottom: '1rem' }}>
                  Voulez-vous reprogrammer ce rendez-vous ? Vous serez redirigé vers la page des rendez-vous avec les informations pré-remplies.
                </p>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid #e1e5e9'
              }}>
                <button
                  onClick={closeRescheduleModal}
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
                <button
                  onClick={handleConfirmReschedule}
                  style={{
                    padding: '0.75rem 1.5rem',
                    border: '2px solid #667eea',
                    borderRadius: '6px',
                    backgroundColor: '#667eea',
                    color: 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontWeight: 'bold'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#5a6fd8';
                    e.target.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = '#667eea';
                    e.target.style.transform = 'translateY(0)';
                  }}
                >
                  <i className="fas fa-calendar-alt" style={{ marginRight: '0.5rem' }}></i>
                  Reprogrammer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Utility to extract 2 digits before the last digit from phone
function getPhoneSuffix(phone) {
  if (!phone) return '00';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 3) return digits.padStart(2, '0');
  return digits.slice(-3, -1); // 2 digits before last digit
}

export default AllPatients;