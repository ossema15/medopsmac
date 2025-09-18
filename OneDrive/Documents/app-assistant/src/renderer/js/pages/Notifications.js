import React, { useEffect, useState, useRef } from 'react';
import Notification from '../components/Notification';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

function Notifications({ notifications: propNotifications, onRemove }) {
  const navigate = useNavigate();

  // Walk-in notifications state (sync with localStorage)
  const [walkinNotifications, setWalkinNotifications] = useState([]);
  useEffect(() => {
    function getStoredNotifications() {
      try {
        return JSON.parse(localStorage.getItem('walkinNotifications') || '[]');
      } catch {
        return [];
      }
    }
    setWalkinNotifications(getStoredNotifications());
    const onStorage = () => setWalkinNotifications(getStoredNotifications());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Missed appointments state
  const [missedAppointments, setMissedAppointments] = useState([]);
  useEffect(() => {
    // Load missed appointments
    async function loadMissedAppointments() {
      try {
        const appointments = await window.electronAPI.getAppointments();
        const now = new Date();
        const missed = appointments.filter(apt => {
          const aptDate = new Date(apt.appointment_date + 'T' + apt.appointment_time);
          return aptDate < now && apt.status === 'missed'; // Only show appointments marked as 'missed'
        });
        setMissedAppointments(missed);
      } catch (error) {
        // ignore
      }
    }
    loadMissedAppointments();
  }, []);

  // Highlight after restore
  const [showMissedHighlight, setShowMissedHighlight] = useState(false);
  useEffect(() => {
    if (localStorage.getItem('showMissedAfterRestore') === 'true') {
      setShowMissedHighlight(true);
      localStorage.removeItem('showMissedAfterRestore');
    }
  }, []);

  // Handle notification removal with new workflow
  const handleNotificationRemove = async (notificationId) => {
    const notification = walkinNotifications.find(n => n.id === notificationId);

    // Remove from localStorage
    const updated = walkinNotifications.filter(n => n.id !== notificationId);
    localStorage.setItem('walkinNotifications', JSON.stringify(updated));
    setWalkinNotifications(updated);

    // NEW WORKFLOW: If this was an expected patient notification, mark as missed
    if (notification && notification.type === 'expected_patient') {
      try {
        // Mark the appointment as missed
        await window.electronAPI.updateAppointment({ 
          ...notification.appointment, 
          status: 'missed' 
        });

        console.log(`Appointment ${notification.id} marked as missed after notification closed`);

        // Reload missed appointments to show the newly missed one
        const appointments = await window.electronAPI.getAppointments();
        const now = new Date();
        const missed = appointments.filter(apt => {
          const aptDate = new Date(apt.appointment_date + 'T' + apt.appointment_time);
          return aptDate < now && apt.status === 'missed';
        });
        setMissedAppointments(missed);
      } catch (error) {
        console.error('Error marking appointment as missed:', error);
      }
    }
  };

  // Merge propNotifications (if any) and walkinNotifications
  const allNotifications = [
    ...(propNotifications || []),
    ...walkinNotifications.filter(n => !propNotifications?.some(pn => pn.id === n.id))
  ];

  const cardBodyRef = useRef(null);
  useEffect(() => {
    if (cardBodyRef.current) {
      cardBodyRef.current.scrollTo({ top: cardBodyRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [allNotifications.length]);

  return (
    <div style={{ padding: '2rem 0 2rem 2rem', width: '100%', minHeight: '80vh', display: 'flex', justifyContent: 'flex-start' }}>
      <div className="card" style={{ width: '90vw', maxWidth: 1400, minWidth: 800, minHeight: '70vh', boxShadow: '0 2px 24px rgba(0,0,0,0.10)', borderRadius: 16, border: '2px solid #e1e5e9', background: '#fff', marginBottom: '2rem', marginLeft: 0 }}>
        <div className="card-header" style={{ borderBottom: '2px solid #e1e5e9', padding: '2.5rem 3rem', display: 'flex', alignItems: 'center', background: '#f8f9fa', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
          <h2 className="card-title" style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 14 }}>
            <i className="fas fa-bell" style={{ marginRight: 12, color: '#667eea', fontSize: '1.3rem' }}></i>
            Notifications
          </h2>
        </div>
        <div className="card-body" style={{ padding: '3rem', minHeight: '50vh', maxHeight: '60vh', overflowY: 'auto', scrollBehavior: 'smooth' }} ref={cardBodyRef}>
          {/* Clear All Button */}
          <button
            style={{ marginBottom: 24, padding: '0.7rem 1.5rem', fontSize: '1rem', borderRadius: 8, border: '1.5px solid #e53e3e', background: '#fff5f5', color: '#e53e3e', cursor: 'pointer', fontWeight: 600, float: 'right' }}
            onClick={() => onRemove && onRemove('all')}
            disabled={allNotifications.length === 0}
          >
            Tout effacer
          </button>
          <div style={{ clear: 'both' }} />

          {showMissedHighlight && missedAppointments.length > 0 && (
            <div style={{
              background: '#fff3cd',
              color: '#b26a00',
              border: '1px solid #ffe082',
              borderRadius: 7,
              padding: '0.7rem 1rem',
              marginBottom: 12,
              fontWeight: 600,
              fontSize: '1.05rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <i className="fas fa-exclamation-triangle" style={{ color: '#ff922b', marginRight: 8 }}></i>
              Des rendez-vous manqués ont été détectés après restauration !
            </div>
          )}

          {missedAppointments.length > 0 && missedAppointments.map(apt => (
            <div key={apt.id} style={{
              background: '#fff3cd',
              border: '1px solid #ffe082',
              color: '#b26a00',
              borderRadius: 7,
              padding: '0.7rem 1rem',
              marginBottom: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
              onClick={async () => {
                try {
                  const patient = await window.electronAPI.getPatient(apt.patient_id);
                  const patientData = patient ? {
                    id: patient.id,
                    name: patient.name || '',
                    phone: patient.phone || '',
                    email: patient.email || '',
                    urgent_contact: patient.urgent_contact || '',
                    reason_for_visit: patient.reason_for_visit || '',
                    medical_history: patient.medical_history || '',
                    year_of_birth: patient.year_of_birth || '',
                    date_of_birth: patient.date_of_birth || '',
                    convention: patient.convention || '',
                    insurances: patient.insurances || '',
                    consultation_price: patient.consultation_price || '',
                    status: patient.status || 'waiting'
                  } : {
                    id: apt.patient_id,
                    name: apt.patient_name || '',
                  };
                  navigate('/patients', { 
                    state: { 
                      patientData,
                      from: 'missed_appointment',
                      appointmentId: apt.id
                    } 
                  });
                } catch (e) {
                  // Fallback: minimal state
                  navigate('/patients', { state: { patientData: { id: apt.patient_id, name: apt.patient_name || '' }, from: 'missed_appointment', appointmentId: apt.id } });
                }
              }}
              title="Voir le patient"
            >
              <i className="fas fa-user-clock" style={{ marginRight: 8 }}></i>
              <b>RDV manqué:</b> {apt.patient_name} ({apt.patient_id}) — {apt.appointment_date} {apt.appointment_time}
            </div>
          ))}

          <AnimatePresence initial={false}>
            {allNotifications.map((notification, idx) => {
              let subText = 'Vous avez une nouvelle notification';
              if (notification.patient_id) {
                subText = `Patient ID: ${notification.patient_id}`;
              }
              if (notification.timestamp) {
                const date = new Date(notification.timestamp);
                subText += ` • ${date.toLocaleTimeString('fr-FR')}`;
              }

              return (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 100 }}
                  transition={{ duration: 0.3 }}
                  style={{ marginBottom: 16 }}
                >
                  <Notification
                    message={notification.message}
                    type={notification.type === 'expected_patient' ? 'warning' : 'info'}
                    subText={subText}
                    inline={true}
                    onClose={() => handleNotificationRemove(notification.id)}
                    onClick={async () => {
                      // Navigate to patient panel with prefilled data for appointment-driven notifications
                      if (notification.appointment && notification.patient_id) {
                        try {
                          const patient = await window.electronAPI.getPatient(notification.patient_id);
                          const patientData = patient ? {
                            id: patient.id,
                            name: patient.name || '',
                            phone: patient.phone || '',
                            email: patient.email || '',
                            urgent_contact: patient.urgent_contact || '',
                            reason_for_visit: patient.reason_for_visit || '',
                            medical_history: patient.medical_history || '',
                            year_of_birth: patient.year_of_birth || '',
                            date_of_birth: patient.date_of_birth || '',
                            convention: patient.convention || '',
                            insurances: patient.insurances || '',
                            consultation_price: patient.consultation_price || '',
                            status: patient.status || 'waiting'
                          } : { id: notification.patient_id };
                          navigate('/patients', { state: { patientData, from: 'notification' } });
                        } catch (e) {
                          navigate('/patients', { state: { patientData: { id: notification.patient_id }, from: 'notification' } });
                        }
                      }
                    }}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>

          {allNotifications.length === 0 && missedAppointments.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              <i className="fas fa-bell-slash" style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}></i>
              <p>Aucune notification</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Notifications; 