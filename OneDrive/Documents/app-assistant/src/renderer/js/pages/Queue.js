import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';

function Queue() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({});
  const [movingToDoctorId, setMovingToDoctorId] = useState(null); // for drag-in animation into with_doctor
  const [movingDoneId, setMovingDoneId] = useState(null); // for drag-out animation from with_doctor
  const [movingFromWaitingId, setMovingFromWaitingId] = useState(null); // for drag-out animation from waiting when transferring

  console.log('Queue component rendered');

  useEffect(() => {
    console.log('Queue component useEffect triggered');
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [patientList, appointmentList] = await Promise.all([
        window.electronAPI.getTodayPatients(),
        window.electronAPI.getAppointments()
      ]);
      setPatients(patientList);
      setAppointments(appointmentList);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Mark consultation as done with drag-out animation from "Avec le Médecin"
  const handleMarkDone = async (patient) => {
    try {
      // trigger drag-out animation
      setMovingDoneId(patient.id);
      const ANIM_MS = 300;
      setTimeout(async () => {
        const todayStr = new Date().toISOString().split('T')[0];
        const todaysAppointments = appointments.filter(a => a.patient_id === patient.id && a.appointment_date === todayStr);
        // Pick the earliest by time (or the only one)
        const targetApt = todaysAppointments.sort((a, b) => (a.appointment_time || '').localeCompare(b.appointment_time || ''))[0];

        // Mark appointment as solved if found
        if (targetApt && window.electronAPI?.updateAppointment) {
          await window.electronAPI.updateAppointment({ ...targetApt, status: 'solved' });
        }

        // Update patient status to done (removed from queue)
        if (window.electronAPI?.updatePatientStatus) {
          await window.electronAPI.updatePatientStatus(patient.id, 'done');
        }

        // Reload data to refresh sections
        await loadData();

        // Push dashboard updates (best-effort)
        try {
          if (window.electronAPI?.sendDashboardStatus) await window.electronAPI.sendDashboardStatus();
        } catch (_e) {}
      }, ANIM_MS);
    } catch (error) {
      console.error('Error marking consultation done:', error);
      alert('Erreur lors du marquage comme terminé');
    } finally {
      // clear animation state slightly after to ensure class removal is applied
      setTimeout(() => setMovingDoneId(null), 350);
    }
  };

  // Patients state already contains today's patients from electronAPI.getTodayPatients()
  const getTodayPatients = () => patients;

  // Only show patients with status 'waiting' and hasBeenEdited === true
  const getWaitingPatients = () => {
    return getTodayPatients().filter(p => p.status === 'waiting' && p.hasBeenEdited);
  };

  const handleStatusUpdate = async (patientId, newStatus) => {
    try {
      // Find the patient in the list
      const patient = patients.find(p => p.id === patientId);
      if (newStatus === 'waiting' && (!patient || !patient.hasBeenEdited)) {
        alert('Le patient doit d\'abord être édité (année de naissance ou ID) avant de passer en attente.');
        return;
      }
      // Only update status in the database for cancel
      await window.electronAPI.updatePatientStatus(patientId, newStatus);
      await loadData(); // Reload the list
      // Proactively push updates to doctor app from Queue page
      try {
        if (window.electronAPI?.sendWaitingPatients) {
          await window.electronAPI.sendWaitingPatients();
        }
        if (window.electronAPI?.sendDashboardStatus) {
          await window.electronAPI.sendDashboardStatus();
        }
      } catch (pushErr) {
        console.warn('[Queue] Failed to push waiting/dashboard after status update:', pushErr);
      }
    } catch (error) {
      console.error('Error updating patient status:', error);
      alert('Erreur lors de la mise à jour du statut');
    }
  };

  // Transfer patient to doctor with coordinated animations (drag-out from waiting, drag-in to with_doctor)
  const handleTransferToDoctor = async (patient) => {
    console.log('handleTransferToDoctor called', patient);
    if (!patient.name || !patient.date_of_birth) {
      alert('Le nom et la date de naissance sont requis');
      return;
    }
    try {
      // Trigger drag-out animation on the source (waiting) card first
      setMovingFromWaitingId(patient.id);
      const ANIM_MS = 300;

      // After the drag-out finishes, perform the transfer and then drag-in on destination
      setTimeout(async () => {
        // Fetch fresh data to ensure we use the latest patient ID (in case it was renamed)
        const [todayPatientsList, appointmentList] = await Promise.all([
          window.electronAPI.getTodayPatients(),
          window.electronAPI.getAppointments()
        ]);

        // Resolve the freshest patient record
        const freshPatient =
          todayPatientsList.find(p =>
            p.id === patient.id ||
            (
              p.name === patient.name &&
              (
                (!!p.date_of_birth && !!patient.date_of_birth && p.date_of_birth === patient.date_of_birth) ||
                (!!p.phone && !!patient.phone && p.phone === patient.phone)
              )
            )
          ) || patient;

        const patientId = freshPatient.id; // always use DB-resolved current ID
        console.log('About to call sendPatientData', { patient: freshPatient, patientId });
        // Include existing patient files (images/documents) when sending
        const files = await window.electronAPI.getPatientFiles(patientId).catch(() => []);
        await window.electronAPI.sendPatientData({ patientData: { ...freshPatient }, files, patientId });

        // Also send a plain-text transfer message only if there is an explicit appointment_context
        try {
          const todayStr = new Date().toISOString().split('T')[0];
          const todaysAppointments = appointmentList.filter(a => a.patient_id === patientId && a.appointment_date === todayStr);
          const apt = todaysAppointments.sort((a, b) => (a.appointment_time || '').localeCompare(b.appointment_time || ''))[0] || {};
          const contextRaw = (apt.appointment_context || '').trim();
          if (contextRaw) {
            const time = apt.appointment_time ? ` à ${apt.appointment_time}` : '';
            const dob = freshPatient.date_of_birth || (freshPatient.year_of_birth ? String(freshPatient.year_of_birth) : '');
            const dobStr = dob ? ` (${dob})` : '';
            const msg = `Patient: ${freshPatient.name}${dobStr}${time} – Contexte: ${contextRaw}`;
            if (window.electronAPI?.sendChatMessage) {
              await window.electronAPI.sendChatMessage(msg);
            }
          }
        } catch (msgErr) {
          console.warn('[Queue] Failed to send transfer text message:', msgErr);
        }

        // Mark as with doctor in DB so it disappears from waiting and appears in with_doctor
        await window.electronAPI.updatePatientStatus(patientId, 'with_doctor');
        // Reload data to reflect accurate sections
        await loadData();

        // Clear source animation state
        setMovingFromWaitingId(null);
        // Trigger drag-in animation for destination card (use resolved current ID)
        setMovingToDoctorId(patientId);
        setTimeout(() => setMovingToDoctorId(null), 350);
      }, ANIM_MS);
    } catch (error) {
      alert('Erreur lors du transfert au médecin');
      console.error('Error during patient transfer from Queue:', error);
    } finally {
      // Proactively push updates to doctor app from Queue page
      try {
        if (window.electronAPI?.sendWaitingPatients) {
          await window.electronAPI.sendWaitingPatients();
        }
        if (window.electronAPI?.sendDashboardStatus) {
          await window.electronAPI.sendDashboardStatus();
        }
      } catch (pushErr) {
        console.warn('[Queue] Failed to push waiting/dashboard after transfer:', pushErr);
      }
    }
  };

  // Open modal with patient details
  const handlePatientClick = (patient) => {
    setSelectedPatient(patient);
    setFormData({
      name: patient.name || '',
      phone: patient.phone || '',
      email: patient.email || '',
      urgent_contact: patient.urgent_contact || '',
      reason_for_visit: patient.reason_for_visit || patient.reason || '',
      medical_history: patient.medical_history || '',
      date_of_birth: patient.date_of_birth || '',
      year_of_birth: patient.year_of_birth || ''
    });
    setIsEditing(false);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedPatient(null);
    setIsEditing(false);
    setFormData({});
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!selectedPatient) return;
    try {
      const payload = {
        ...selectedPatient,
        ...formData,
        // Ensure one of date_of_birth or year_of_birth is set
        year_of_birth: formData.date_of_birth ? parseInt(formData.date_of_birth.split('-')[0]) : (parseInt(formData.year_of_birth) || selectedPatient.year_of_birth),
        hasBeenEdited: 1,
      };
      await window.electronAPI.updatePatient(payload);
      await loadData();
      setIsEditing(false);
      closeModal();
    } catch (error) {
      console.error('Error saving patient:', error);
      alert('Erreur lors de l\'enregistrement du patient');
    }
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

  const getStatusIcon = (status) => {
    const icons = {
      waiting: 'fas fa-clock',
      with_doctor: 'fas fa-user-md',
      canceled: 'fas fa-times-circle'
    };
    return icons[status] || 'fas fa-question';
  };

  if (loading) {
    return (
      <div className="page-header">
        <div className="page-title">{t('queue')}</div>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <span className="spinner"></span>
          <p>{t('loading')}</p>
        </div>
      </div>
    );
  }

  const allPatients = getTodayPatients();
  const waitingPatients = getWaitingPatients();
  const withDoctorPatients = allPatients.filter(p => p.status === 'with_doctor');
  const canceledPatients = allPatients.filter(p => p.status === 'canceled');

  // Base card padding kept consistent
  const baseQueueItemStyle = {
    padding: '1rem 1.25rem'
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('patientQueue')}</h1>
        <p className="page-subtitle">
          Gestion de la file d'attente des patients du jour
        </p>
      </div>

      {/* Waiting Patients */}
      <div className="card" style={{ minHeight: '50vh', paddingBottom: '0.5rem' }}>
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-clock" style={{ marginRight: '10px', color: '#ffc107' }}></i>
            En Attente ({waitingPatients.length})
          </h3>
        </div>

        {waitingPatients.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
            <i className="fas fa-inbox" style={{ fontSize: '3rem', marginBottom: '1rem' }}></i>
            <p>Aucun patient en attente</p>
          </div>
        ) : (
          <div style={{ maxHeight: '60vh', overflowY: 'auto', scrollBehavior: 'smooth', padding: '0.5rem 0' }}>
            {waitingPatients.map(patient => (
              <div key={patient.id} className={`queue-item ${patient.id === movingFromWaitingId ? 'drag-out' : ''}`} style={baseQueueItemStyle}>
                <div 
                  className="queue-info"
                  onClick={() => handlePatientClick(patient)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="queue-name">
                    {patient.name}
                    {patient.isFromAppointment && patient.appointment_time && (
                      <span style={{ 
                        marginLeft: '0.5rem', 
                        fontSize: '0.8rem', 
                        color: '#17a2b8',
                        fontWeight: 'normal'
                      }}>
                        📅 {patient.appointment_time}
                      </span>
                    )}
                  </div>
                  <div className="queue-details">
                    <span>Né(e) le {patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString('fr-FR') : (patient.year_of_birth ? `en ${patient.year_of_birth}` : '')}</span>
                    {patient.phone && <span> • {patient.phone}</span>}
                    {patient.reason_for_visit && <span> • {patient.reason_for_visit}</span>}
                    {patient.isFromAppointment && patient.reason && (
                      <span> • RDV: {patient.reason}</span>
                    )}
                  </div>
                </div>
                <div className="queue-actions">
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => {
                      console.log('Transfer button clicked', patient);
                      handleTransferToDoctor(patient);
                    }}
                  >
                    <i className="fas fa-paper-plane"></i> Transférer au médecin
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleStatusUpdate(patient.id, 'canceled')}
                  >
                    <i className="fas fa-times"></i>
                    {t('cancelPatient')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* With Doctor Patients */}
      <div className="card" style={{ minHeight: '20vh' }}>
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-user-md" style={{ marginRight: '10px', color: '#28a745' }}></i>
            Avec le Médecin ({withDoctorPatients.length})
          </h3>
        </div>

        {withDoctorPatients.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
            <i className="fas fa-user-md" style={{ fontSize: '3rem', marginBottom: '1rem' }}></i>
            <p>Aucun patient avec le médecin</p>
          </div>
        ) : (
          <div>
            {withDoctorPatients.map(patient => (
              <div
                key={patient.id}
                className={`queue-item ${patient.id === movingToDoctorId ? 'drag-in' : ''} ${patient.id === movingDoneId ? 'drag-out' : ''}`}
              >
                <div 
                  className="queue-info"
                  onClick={() => handlePatientClick(patient)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="queue-name">{patient.name}</div>
                  <div className="queue-details">
                    <span>Né(e) le {patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString('fr-FR') : (patient.year_of_birth ? `en ${patient.year_of_birth}` : '')}</span>
                    {patient.phone && <span> • {patient.phone}</span>}
                    {patient.reason_for_visit && <span> • {patient.reason_for_visit}</span>}
                  </div>
                </div>
                <div className="queue-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span className="status-badge status-with-doctor">
                    <i className="fas fa-user-md" style={{ marginRight: '5px' }}></i>
                    {t('withDoctor')}
                  </span>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleMarkDone(patient)}
                    title="Marquer terminé"
                  >
                    <i className="fas fa-check" style={{ marginRight: '5px' }}></i>
                    Marquer terminé
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Canceled Patients */}
      {canceledPatients.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <i className="fas fa-times-circle" style={{ marginRight: '10px', color: '#dc3545' }}></i>
              Annulés ({canceledPatients.length})
            </h3>
          </div>

          <div>
            {canceledPatients.map(patient => (
              <div key={patient.id} className="queue-item">
                <div 
                  className="queue-info"
                  onClick={() => handlePatientClick(patient)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="queue-name">{patient.name}</div>
                  <div className="queue-details">
                    <span>Né(e) le {patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString('fr-FR') : (patient.year_of_birth ? `en ${patient.year_of_birth}` : '')}</span>
                    {patient.phone && <span> • {patient.phone}</span>}
                    {patient.reason_for_visit && <span> • {patient.reason_for_visit}</span>}
                  </div>
                </div>
                <div className="queue-actions">
                  <span className="status-badge status-canceled">
                    <i className="fas fa-times-circle" style={{ marginRight: '5px' }}></i>
                    {t('canceled')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-chart-pie" style={{ marginRight: '10px' }}></i>
            Résumé
          </h3>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div style={{ textAlign: 'center', padding: '1rem', background: '#fff3cd', borderRadius: '8px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#856404' }}>
              {waitingPatients.length}
            </div>
            <div style={{ color: '#856404' }}>En Attente</div>
          </div>
          
          <div style={{ textAlign: 'center', padding: '1rem', background: '#d4edda', borderRadius: '8px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#155724' }}>
              {withDoctorPatients.length}
            </div>
            <div style={{ color: '#155724' }}>Avec le Médecin</div>
          </div>
          
          <div style={{ textAlign: 'center', padding: '1rem', background: '#f8d7da', borderRadius: '8px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#721c24' }}>
              {canceledPatients.length}
            </div>
            <div style={{ color: '#721c24' }}>Annulés</div>
          </div>
          
          <div style={{ textAlign: 'center', padding: '1rem', background: '#e2e3e5', borderRadius: '8px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#383d41' }}>
              {patients.length}
            </div>
            <div style={{ color: '#383d41' }}>Total</div>
          </div>
        </div>
      </div>

      {/* Patient Details Modal */}
      <Modal isOpen={isModalOpen} onClose={closeModal} width="800px">
        {selectedPatient && (
          <div>
            <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Détails du patient</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Nom</label>
                <input type="text" className="form-input" name="name" value={formData.name || ''} onChange={handleChange} disabled={!isEditing} />
              </div>
              <div className="form-group">
                <label className="form-label">Téléphone</label>
                <input type="text" className="form-input" name="phone" value={formData.phone || ''} onChange={handleChange} disabled={!isEditing} />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-input" name="email" value={formData.email || ''} onChange={handleChange} disabled={!isEditing} />
              </div>
              <div className="form-group">
                <label className="form-label">Contact urgent</label>
                <input type="text" className="form-input" name="urgent_contact" value={formData.urgent_contact || ''} onChange={handleChange} disabled={!isEditing} />
              </div>
              <div className="form-group">
                <label className="form-label">Date de naissance</label>
                <input type="date" className="form-input" name="date_of_birth" value={formData.date_of_birth || ''} onChange={handleChange} disabled={!isEditing} />
              </div>
              <div className="form-group">
                <label className="form-label">Année de naissance</label>
                <input type="number" className="form-input" name="year_of_birth" value={formData.year_of_birth || ''} onChange={handleChange} disabled={!isEditing} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Raison de visite</label>
                <input type="text" className="form-input" name="reason_for_visit" value={formData.reason_for_visit || ''} onChange={handleChange} disabled={!isEditing} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Antécédents médicaux</label>
                <textarea className="form-input" name="medical_history" value={formData.medical_history || ''} onChange={handleChange} disabled={!isEditing} rows={3}></textarea>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              {!isEditing && (
                <button className="btn btn-secondary" onClick={() => setIsEditing(true)}>
                  <i className="fas fa-pen" style={{ marginRight: '0.5rem' }}></i>
                  Éditer
                </button>
              )}
              {isEditing && (
                <button className="btn btn-primary" onClick={handleSave}>
                  <i className="fas fa-save" style={{ marginRight: '0.5rem' }}></i>
                  Enregistrer
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default Queue;