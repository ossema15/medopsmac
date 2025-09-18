import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import AnimatedSeconds from '../components/AnimatedSeconds';
import UpcomingAppointments from '../components/UpcomingAppointments';
import Notification from '../components/Notification';
import StatCard from '../components/StatCard';
import SectionHeader from '../components/SectionHeader';
import QuickAction from '../components/QuickAction';

const WEATHER_API_KEY = '90b3330a8187796aa9a0198b09aa885c';
const WEATHER_CITY = 'Tunis,tn';

function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    todayPatients: 0,
    weekPatients: 0,
    waitingPatients: 0,
    withDoctorPatients: 0
  });
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  // Show highlight after restore
  const [showMissedHighlight, setShowMissedHighlight] = useState(false);

  useEffect(() => {
    loadDashboardStats();
    loadAppointments();
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    const refreshInterval = setInterval(() => {
      loadDashboardStats();
      loadAppointments();
    }, 8 * 60 * 1000);
    return () => {
      clearInterval(timeInterval);
      clearInterval(refreshInterval);
    };
  }, []);

  // Show highlight after restore
  useEffect(() => {
    if (localStorage.getItem('showMissedAfterRestore') === 'true') {
      setShowMissedHighlight(true);
      localStorage.removeItem('showMissedAfterRestore');
    }
  }, []);


  const loadDashboardStats = async () => {
    try {
      const patientsList = await window.electronAPI.getPatients();
      setPatients(patientsList);
      const appointmentsList = await window.electronAPI.getAppointments();
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      // Helper to parse various date formats from DB ("YYYY-MM-DDTHH:mm:ssZ" or "YYYY-MM-DD HH:mm:ss")
      const toDate = (s) => {
        if (!s) return null;
        const norm = typeof s === 'string' ? s.replace(' ', 'T') : s;
        const d = new Date(norm);
        return isNaN(d.getTime()) ? null : d;
      };

      // Strictly use backend to fetch only today's patients
      // This leverages database:get-today-patients which already includes patients with appointments today
      // and any necessary same-day logic, avoiding week leakage.
      const todayPatients = await window.electronAPI.getTodayPatients();

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
        // Compare by date-only within weekStart..weekEnd
        const dOnly = new Date(u.getFullYear(), u.getMonth(), u.getDate());
        const ws = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
        const we = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate());
        return dOnly >= ws && dOnly <= we;
      });
      const weekMap = new Map();
      [...weekPatientsByAppt, ...weekWaitingUpdated].forEach(p => weekMap.set(p.id, p));
      const weekPatients = Array.from(weekMap.values());

      // Waiting patients for today: only those with status 'waiting' and hasBeenEdited === true
      const waitingPatients = todayPatients.filter(p => p.status === 'waiting' && p.hasBeenEdited);
      // With doctor patients for today: only those with status 'with_doctor'
      const withDoctorPatients = todayPatients.filter(p => p.status === 'with_doctor');

      setStats({
        todayPatients: todayPatients.length,
        weekPatients: weekPatients.length,
        waitingPatients: waitingPatients.length,
        withDoctorPatients: withDoctorPatients.length
      });
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAppointments = async () => {
    try {
      const appointmentsList = await window.electronAPI.getAppointments();
      setAppointments(appointmentsList);
    } catch (error) {
      console.error('Error loading appointments:', error);
    }
  };



  // REMOVED: syncMissedAppointments logic - now handled by notification workflow

  if (loading) {
    return (
      <div className="page-header">
        <div className="page-title">{t('dashboard')}</div>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <span className="spinner"></span>
          <p>{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard" style={{width: '100%', maxWidth: '100vw', boxSizing: 'border-box', padding: 'clamp(1rem, 2vw, 2rem)'}}>
      <div className="page-header" style={{marginBottom: 'clamp(1rem, 2vw, 2rem)'}}>
        <h1 className="page-title" style={{fontSize: 'clamp(1.25rem, 4vw, 2.5rem)', wordWrap: 'break-word', lineHeight: 1.2}}>MedOps</h1>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 'clamp(1rem, 2vw, 2rem)', flexWrap: 'wrap', width: '100%', maxWidth: '100vw', boxSizing: 'border-box', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              color: '#3b5bdb',
              fontWeight: 700,
              fontSize: 'clamp(1rem, 2vw, 1.1rem)',
              borderRadius: '12px',
              marginBottom: 6,
              letterSpacing: 0.5
            }}>
              <i className="fas fa-calendar-alt" style={{ marginRight: 8, fontSize: '1.1em', color: '#ffd43b' }}></i>
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              color: '#333',
              fontWeight: 600
            }}>
              <i className="fas fa-clock" style={{ marginRight: 6, fontSize: '1em', color: '#ffd43b' }}></i>
              {currentTime.toLocaleTimeString('fr-FR')}
            </span>
          </div>
        </div>
      </div>
      <div className="grid--dashboard" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'clamp(0.75rem, 2vw, 1.25rem)', marginBottom: 'clamp(1rem, 2vw, 1.5rem)' }}>
        <StatCard
          color="#667eea"
          iconClass="fas fa-users"
          value={stats.todayPatients}
          label={t('todayPatients')}
        />
        <StatCard
          color="#28a745"
          iconClass="fas fa-calendar-week"
          value={stats.weekPatients}
          label={t('weekPatients')}
        />
        <StatCard
          color="#ff922b"
          iconClass="fas fa-clock"
          value={stats.waitingPatients}
          label={t('waitingPatients')}
        />
        <StatCard
          color="#6f42c1"
          iconClass="fas fa-user-md"
          value={stats.withDoctorPatients}
          label={t('withDoctor')}
        />
      </div>
      {/* Upcoming Appointments and Quick Actions side by side */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', marginBottom: '2rem' }}>
        {/* Upcoming Appointments Card */}
        <div className="card" style={{ flex: 1.2, minWidth: 280 }}>
          <div className="card-header">
            <SectionHeader iconClass="fas fa-bell" title="Rendez-vous à venir" />
          </div>
          <div className="dashboard-upcoming-appointments">
            <UpcomingAppointments appointments={appointments} reloadAppointments={loadAppointments} />
          </div>
        </div>
        {/* Quick Actions Card */}
        <div className="card" style={{ flex: 2, minWidth: 380, maxWidth: 600, alignSelf: 'flex-start', background: '#f8f9fa' }}>
          <div className="card-header">
            <SectionHeader iconClass="fas fa-bolt" title="Actions rapides" />
          </div>
          <div className="quick-actions">
            <QuickAction label="Nouveau patient" iconClass="fas fa-user-plus" onClick={() => navigate('/patients')} />
            <QuickAction label="Nouveau rendez-vous" iconClass="fas fa-calendar-plus" gradient="linear-gradient(135deg, #28a745 0%, #20c997 100%)" onClick={() => navigate('/appointments')} />
            <QuickAction label="Gérer la file d'attente" iconClass="fas fa-list-ol" gradient="linear-gradient(135deg, #ffc107 0%, #ff922b 100%)" onClick={() => navigate('/queue')} />
            <QuickAction label="Tous les patients" iconClass="fas fa-users" gradient="linear-gradient(135deg, #6f42c1 0%, #a259e6 100%)" onClick={() => navigate('/all-patients')} />
          </div>
        </div>
      </div>


      {/* Missed Appointments Card */}
      {appointments.filter(apt => {
        const aptDate = new Date(apt.appointment_date + 'T' + apt.appointment_time);
        return aptDate < new Date() && apt.status === 'missed';
      }).length > 0 && (
        <div className="card" style={{ marginBottom: '2rem', border: '2px solid #ff922b', background: '#fff8e1' }}>
          <div className="card-header" style={{ background: '#fff3cd' }}>
            <h3 className="card-title" style={{ color: '#ff922b' }}>
              <i className="fas fa-exclamation-triangle" style={{ marginRight: '10px', color: '#ff922b' }}></i>
              Rendez-vous manqués
            </h3>
          </div>
          <div style={{ padding: '1rem' }}>
            {appointments.filter(apt => {
              const aptDate = new Date(apt.appointment_date + 'T' + apt.appointment_time);
              return aptDate < new Date() && apt.status === 'missed';
            }).map(apt => (
              <div key={apt.id}
                style={{
                  background: '#fff3cd',
                  border: '1px solid #ffe082',
                  color: '#b26a00',
                  borderRadius: 7,
                  padding: '0.7rem 1rem',
                  marginBottom: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  // Find full patient record if it exists to enrich prefill
                  const match = patients.find(p => p.id === apt.patient_id);
                  const prefill = {
                    id: match?.id || apt.patient_id || '',
                    name: match?.name || apt.patient_name || '',
                    phone: match?.phone || apt.phone || '',
                    email: match?.email || apt.email || '',
                    date_of_birth: match?.date_of_birth || apt.date_of_birth || '',
                    reason_for_visit: (apt.appointment_reason || apt.reason || ''),
                    year_of_birth: match?.year_of_birth || (match?.date_of_birth ? String(match.date_of_birth).split('-')[0] : ''),
                    consultation_price: match?.consultation_price || '',
                    urgent_contact: match?.urgent_contact || '',
                    convention: match?.convention || '',
                    insurances: match?.insurances || '',
                    // Appointment context for linking/UX
                    appointment_id: apt.id,
                    appointment_date: apt.appointment_date,
                    appointment_time: apt.appointment_time
                  };
                  navigate('/patients', { state: { prefillPatientData: prefill } });
                }}
                title="Voir le patient"
              >
                <i className="fas fa-user-clock" style={{ marginRight: 8 }}></i>
                {apt.patient_name} ({apt.patient_id}) — {apt.appointment_date} {apt.appointment_time}
              </div>
            ))}
          </div>
        </div>
      )}



      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-bell" style={{ marginRight: '10px' }}></i>
          </h3>
        </div>
        <div style={{ padding: '1rem', background: '#f8f9fa', borderRadius: '8px' }}>
          <p style={{ color: '#666', fontStyle: 'italic' }}>
            Aucune notification récente
          </p>
        </div>
      </div>
    </div>
  );
}

export default Dashboard; 