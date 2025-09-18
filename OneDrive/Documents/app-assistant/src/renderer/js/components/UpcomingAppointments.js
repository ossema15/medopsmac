import React, { useState, useEffect } from 'react';
import { useConfirm } from '../context/ConfirmContext';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

function UpcomingAppointments({ appointments, reloadAppointments }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [isVisible, setIsVisible] = useState(false);
  const [patients, setPatients] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  // Track locally dismissed upcoming appointments (per day)
  const [dismissedIds, setDismissedIds] = useState(new Set());

  // Create a per-day key for persisting dismissed upcoming items
  const getDayKey = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `upcomingDismissed:${yyyy}-${mm}-${dd}`;
  };

  useEffect(() => {
    const loadPatients = async () => {
      try {
        const patientsList = await window.electronAPI.getPatients();
        setPatients(patientsList);
      } catch (error) {
        console.error('Error loading patients:', error);
      }
    };

    loadPatients();
    const onPatientsUpdated = () => loadPatients();
    window.addEventListener('patientsUpdated', onPatientsUpdated);
    return () => window.removeEventListener('patientsUpdated', onPatientsUpdated);
  }, []);

  useEffect(() => {
    const checkUpcomingAppointments = async () => {
      const now = new Date();
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
      
      const upcoming = appointments.filter(appointment => {
        const appointmentDateTime = new Date(`${appointment.appointment_date}T${appointment.appointment_time}`);
        return (
          appointmentDateTime > now &&
          appointmentDateTime <= oneHourFromNow &&
          (appointment.status === 'scheduled' || !appointment.status) &&
          // Exclude locally dismissed items (confirmed presence)
          !dismissedIds.has(appointment.id)
        );
      });

      setUpcomingAppointments(upcoming);
      setIsVisible(upcoming.length > 0);

      // Do not auto-set patient status to 'waiting' based on time.
      // Waiting must be explicitly chosen from the Patients/Queue flows.
      for (const appointment of appointments) {
        const appointmentDateTime = new Date(`${appointment.appointment_date}T${appointment.appointment_time}`);

        // Keep: mark 'waiting' appointments as 'completed' after their time passes
        if (
          appointment.status === 'waiting' &&
          appointmentDateTime <= now
        ) {
          try {
            await window.electronAPI.updateAppointment({ ...appointment, status: 'completed' });
          } catch (err) {
            console.error('Failed to update appointment to completed:', err);
          }
        }
      }
    };

    // Check immediately
    checkUpcomingAppointments();

    // Check every minute
    const interval = setInterval(checkUpcomingAppointments, 60000);

    return () => clearInterval(interval);
  }, [appointments, patients]);

  // Update current time every second for real-time countdown
  useEffect(() => {
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timeInterval);
  }, []);

  // Load dismissed IDs for today (refresh when the day changes)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(getDayKey());
      if (raw) {
        const arr = JSON.parse(raw);
        setDismissedIds(new Set(Array.isArray(arr) ? arr : []));
      } else {
        setDismissedIds(new Set());
      }
    } catch (e) {
      console.warn('[UpcomingAppointments] Failed to load dismissed IDs:', e);
      setDismissedIds(new Set());
    }
  }, [currentTime.toDateString()]);

  // Always show the component in dashboard, even if no upcoming appointments



  const formatTime = (time) => {
    return time.substring(0, 5); // Remove seconds if present
  };

  const getTimeUntilAppointment = (appointment) => {
    const appointmentDateTime = new Date(`${appointment.appointment_date}T${appointment.appointment_time}`);
    const diffMs = appointmentDateTime - currentTime;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes <= 0) return 'Maintenant';
    if (diffMinutes === 1) return 'Dans 1 minute';
    return `Dans ${diffMinutes} minutes`;
  };

  // Check if patient is first-time (has appointment but not in database)
  const isFirstTimePatient = (appointment) => {
    // If appointment has no patient_id, it's a new patient
    if (!appointment.patient_id || appointment.patient_id === '') {
      // Check if this patient name exists in the database
      const existingPatient = patients.find(p => 
        p.name.toLowerCase() === appointment.patient_name.toLowerCase()
      );
      // If patient doesn't exist in database, they are first-time
      return !existingPatient;
    }
    return false;
  };

  const getPatientStatus = (appointment) => {
    const patient = patients.find(p => p.id === appointment.patient_id);
    if (!patient || !patient.date_of_birth) {
      return 'Nouveau';
    }
    return 'Existant';
  };

  // Handle patient card click (confirm-and-wait only when there is context)
  const handlePatientCardClick = async (appointment) => {
    // Prefer appointment_context, but fallback to appointment_reason for robustness
    const contextText = (
      (appointment.appointment_context || appointment.appointment_reason || '')
    ).trim();

    // If appointment has explicit context, confirm presence then navigate to Patients page (no prefill)
    if (contextText) {
      const isPresent = await confirm({
        title: 'Confirmer présence',
        message: 'Le patient est-il présent ?',
        confirmText: 'Oui',
        cancelText: 'Non',
        variant: 'primary',
      });
      if (!isPresent) return;
      // If patient exists, ensure status is NOT 'waiting' so it appears on Patients page
      try {
        if (appointment.patient_id) {
          await window.electronAPI.updatePatientStatus(appointment.patient_id, 'existant');
          // let any listeners update cached lists
          window.dispatchEvent(new CustomEvent('patientsUpdated'));
        }
      } catch (e) {
        console.warn('[UpcomingAppointments] Failed to set patient status to existant:', e);
      }

      // Signal patient/pages to refresh if they listen to storage events (best-effort)
      try {
        localStorage.setItem('appointmentsShouldRefresh', String(Date.now()));
      } catch (e) {
        console.warn('[UpcomingAppointments] Failed to signal appointments refresh:', e);
      }

      // Locally dismiss this appointment from upcoming list for today only
      try {
        setDismissedIds(prev => {
          const next = new Set(prev);
          next.add(appointment.id);
          try {
            localStorage.setItem(getDayKey(), JSON.stringify(Array.from(next)));
          } catch (e) {
            console.warn('[UpcomingAppointments] Failed to persist dismissed IDs:', e);
          }
          return next;
        });
      } catch (e) {
        console.warn('[UpcomingAppointments] Failed to dismiss upcoming appointment:', e);
      }

      // Navigate to Patients page without prefilled data
      setTimeout(() => {
        navigate('/patients');
      }, 100);
      return;
    }

    // Navigate to patient panel with prefill (works for both with/without context)
    const patient = patients.find(p => p.id === appointment.patient_id);
    let state = {};
    if (patient) {
      state = {
        prefillPatientName: patient.name,
        prefillReasonForVisit: appointment.reason || appointment.appointment_reason || patient.reason_for_visit || '',
        prefillPatientData: {
          ...patient,
          name: patient.name || appointment.patient_name,
          date_of_birth: patient.date_of_birth || appointment.date_of_birth || '',
          phone: patient.phone || appointment.phone || '',
          email: patient.email || appointment.email || '',
          reason_for_visit: patient.reason_for_visit || appointment.reason || appointment.appointment_reason || '',
        }
      };
    } else {
      state = {
        prefillPatientName: appointment.patient_name,
        prefillReasonForVisit: appointment.reason || appointment.appointment_reason || '',
        prefillPatientData: {
          name: appointment.patient_name,
          date_of_birth: appointment.date_of_birth || '',
          phone: appointment.phone || '',
          email: appointment.email || '',
          reason_for_visit: appointment.reason || appointment.appointment_reason || '',
        }
      };
    }

    // Ensure dialog closed before navigation (only for no-context flow)
    setTimeout(() => {
      navigate('/patients', { state });
    }, 100);
  };

  return (
    <div className="dashboard-upcoming-appointments-container">
      {upcomingAppointments.length > 0 ? (
        <div className="upcoming-appointments-list">
          {upcomingAppointments.map((appointment, index) => {
            const patient = patients.find(p => p.id === appointment.patient_id);
            // Only treat explicit appointment context as context; hide 'reason of visit'
            const contextText = (
              appointment.appointment_reason ||
              appointment.appointment_context ||
              ''
            ).trim();
            const reasonText = (appointment.reason || appointment.appointment_reason || '').trim();
            const displayName = (appointment.patient_name || (patient && patient.name) || '').trim();
            const isFirstTime = isFirstTimePatient(appointment);
            return (
              <div 
                key={appointment.id} 
                className="upcoming-appointment-item"
                style={{ 
                  animationDelay: `${index * 0.1}s`,
                  backgroundColor: '#71be5d', // updated background color for upcoming appointment cards
                  borderLeft: isFirstTime ? '4px solid #28a745' : '4px solid #667eea',
                  cursor: 'pointer',
                  transition: 'transform 180ms ease, box-shadow 220ms ease',
                  minHeight: '60px',
                  padding: '10px 14px',
                  marginBottom: '8px',
                  borderRadius: '8px',
                  fontSize: '0.97rem',
                  boxShadow: '0 1px 4px rgba(102,126,234,0.07)'
                }}
                onClick={() => handlePatientCardClick(appointment)}
                role="button"
                tabIndex={0}
                aria-label={`Rendez-vous à ${formatTime(appointment.appointment_time)} pour ${displayName || 'patient'}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handlePatientCardClick(appointment);
                  }
                }}
                title={'Cliquez pour compléter les données du patient'}
              >
                <div className="appointment-time" aria-label={`Heure du rendez-vous ${formatTime(appointment.appointment_time)}`}>
                  <i className="fas fa-clock" aria-hidden="true"></i>
                  <span>{formatTime(appointment.appointment_time)}</span>
                </div>
                
                <div className="appointment-details">
                  <div className="patient-name" style={{ 
                    color: '#fff',
                    fontWeight: 600
                  }}>
                    {displayName || 'Patient'}
                  </div>
                  {/* Meta badges: new patient + reason/context */}
                  <div className="meta-badges">
                    {isFirstTime && (
                      <span className="badge badge--new" aria-label="Nouveau patient">Nouveau</span>
                    )}
                    {(contextText || reasonText) && (
                      <span className="badge badge--reason" title={contextText || reasonText}>
                        {contextText || reasonText}
                      </span>
                    )}
                  </div>
                  <div className="time-until">
                    <i className="fas fa-hourglass-half"></i>
                    {getTimeUntilAppointment(appointment)}
                  </div>
                </div>
                
                <div className="appointment-status">
                  <div className="status-indicator" style={{ backgroundColor: '#667eea' }}></div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="no-upcoming-appointments">
          <i className="fas fa-calendar-check" style={{ fontSize: '2rem', color: '#28a745', marginBottom: '1rem' }}></i>
          <p>Aucun rendez-vous dans l'heure à venir</p>
        </div>
      )}
    </div>
  );
}

export default UpcomingAppointments; 