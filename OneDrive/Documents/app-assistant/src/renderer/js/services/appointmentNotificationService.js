// Global appointment notification service
// This service runs independently of which page the user is on

class AppointmentNotificationService {
  constructor() {
    this.isRunning = false;
    this.checkInterval = null;
    this.lastAppointments = [];
  }

  // Utility to persist notifications in localStorage
  getStoredNotifications() {
    try {
      return JSON.parse(localStorage.getItem('walkinNotifications') || '[]');
    } catch {
      return [];
    }
  }

  storeNotifications(notifications) {
    localStorage.setItem('walkinNotifications', JSON.stringify(notifications));
    // Dispatch custom event to notify App.js of the update
    window.dispatchEvent(new CustomEvent('walkinNotificationUpdate'));
  }

  // Utility to track appointments that have triggered notifications
  getNotifiedAppointments() {
    try {
      return JSON.parse(localStorage.getItem('notifiedAppointments') || '[]');
    } catch {
      return [];
    }
  }

  storeNotifiedAppointments(appointments) {
    localStorage.setItem('notifiedAppointments', JSON.stringify(appointments));
  }

  async start() {
    if (this.isRunning) return;
    
    console.log('[DEBUG] Starting global appointment notification service');
    this.isRunning = true;

    // Clear old notified appointments tracking when service starts
    const clearOldNotifiedAppointments = () => {
      const now = Date.now();
      const notifiedAppointments = this.getNotifiedAppointments();
      const recentNotified = notifiedAppointments.filter(apt => {
        // Keep only appointments from the last 24 hours
        return (now - (apt.timestamp || 0)) < 24 * 60 * 60 * 1000;
      });
      this.storeNotifiedAppointments(recentNotified);
    };
    
    clearOldNotifiedAppointments();

    // Initialize sessionStorage with current upcoming appointments to establish baseline
    await this.initializeUpcomingTracking();

    // Check immediately
    await this.checkAppointments();

    // Check every minute
    this.checkInterval = setInterval(() => {
      this.checkAppointments();
    }, 60000);
  }

  // Initialize upcoming appointments tracking
  async initializeUpcomingTracking() {
    try {
      const appointments = await window.electronAPI.getAppointments();
      const now = new Date();
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
      
      const upcoming = appointments.filter(appointment => {
        const appointmentDateTime = new Date(`${appointment.appointment_date}T${appointment.appointment_time}`);
        return (
          appointmentDateTime > now &&
          appointmentDateTime <= oneHourFromNow &&
          (appointment.status === 'scheduled' || !appointment.status)
        );
      });
      
      // Initialize sessionStorage with current upcoming appointments
      sessionStorage.setItem('prevUpcomingAppointments', JSON.stringify(upcoming));
      console.log('[DEBUG] Global service initialized upcoming tracking with', upcoming.length, 'appointments');
    } catch (error) {
      console.error('[DEBUG] Error initializing upcoming tracking:', error);
      sessionStorage.setItem('prevUpcomingAppointments', JSON.stringify([]));
    }
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('[DEBUG] Stopped global appointment notification service');
  }

  // Utility function to reset walk-in notification status for testing
  async resetWalkInNotificationStatus() {
    try {
      const appointments = await window.electronAPI.getAppointments();
      const today = new Date().toISOString().split('T')[0];
      
      for (const apt of appointments) {
        if (apt.appointment_date === today && apt.status === 'walk_in_notified') {
          await window.electronAPI.updateAppointment({ 
            ...apt, 
            status: 'scheduled' 
          });
          console.log('[DEBUG] Reset appointment', apt.id, 'status from walk_in_notified to scheduled');
        }
      }
      console.log('[DEBUG] Reset walk-in notification status for today\'s appointments');
    } catch (error) {
      console.error('[DEBUG] Error resetting walk-in notification status:', error);
    }
  }

  async checkAppointments() {
    try {
      console.log('[DEBUG] Global service: Checking appointments...');
      const appointments = await window.electronAPI.getAppointments();
      const patients = await window.electronAPI.getPatients();
      console.log('[DEBUG] Global service: Found', appointments.length, 'appointments');
      
      const now = new Date();
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
      
      const upcoming = appointments.filter(appointment => {
        const appointmentDateTime = new Date(`${appointment.appointment_date}T${appointment.appointment_time}`);
        const oneHourAfterAppointment = new Date(appointmentDateTime.getTime() + 60 * 60 * 1000); // 1 hour after appointment time
        return (
          appointmentDateTime <= oneHourAfterAppointment && // Include appointments that have passed their time but are within 1 hour
          appointmentDateTime <= oneHourFromNow &&
          (appointment.status === 'scheduled' || !appointment.status)
        );
      });

      console.log('[DEBUG] Global service: Current time:', now.toISOString());
      console.log('[DEBUG] Global service: One hour from now:', oneHourFromNow.toISOString());
      console.log('[DEBUG] Global service: Upcoming appointments details:', upcoming.map(a => ({
        id: a.id,
        name: a.patient_name,
        date: a.appointment_date,
        time: a.appointment_time,
        status: a.status,
        appointmentDateTime: new Date(`${a.appointment_date}T${a.appointment_time}`).toISOString()
      })));

      // --- Check for appointments that just reached "maintenant" status ---
      // REMOVED: No longer creating expected_patient notifications
      // We only want walk_in notifications that trigger 1 minute after appointment time
      
      // --- Check for appointments that have passed their scheduled time by 1 minute (for walk-in notifications) ---
      const walkInCandidates = appointments.filter(apt => {
        const appointmentDateTime = new Date(`${apt.appointment_date}T${apt.appointment_time}`);
        const oneMinuteAfterAppointment = new Date(appointmentDateTime.getTime() + 60 * 1000); // 1 minute after appointment time
        const hasPassedOneMinute = oneMinuteAfterAppointment <= now;
        const isScheduled = apt.status === 'scheduled' || !apt.status;
        const notAlreadyNotified = apt.status !== 'walk_in_notified';
        
        console.log('[DEBUG] Global service: Walk-in candidate', apt.patient_name, 'appointment time:', appointmentDateTime.toISOString(), 'one minute after:', oneMinuteAfterAppointment.toISOString(), 'has passed one minute:', hasPassedOneMinute, 'is scheduled:', isScheduled, 'not already notified:', notAlreadyNotified);
        return hasPassedOneMinute && isScheduled && notAlreadyNotified;
      });
      
      console.log('[DEBUG] Global service: Walk-in candidates after one minute filter:', walkInCandidates.length);
      
      if (walkInCandidates.length > 0) {
        console.log('[DEBUG] Global service creating walk-in notifications for:', walkInCandidates.map(a => a.patient_name));
        let notifications = this.getStoredNotifications();
        for (const apt of walkInCandidates) {
          // Check if a walk_in notification already exists for this appointment
          const existingWalkInNotification = notifications.find(n => n.id === apt.id && n.type === 'walk_in');
          if (!existingWalkInNotification) {
            const newNotification = {
              id: apt.id,
              patient_id: apt.patient_id,
              patient_name: apt.patient_name,
              message: `${apt.patient_name} (${apt.patient_id || 'N/A'}) is expected to walk in at any moment soon!`,
              timestamp: Date.now(),
              appointment: apt,
              type: 'walk_in'
            };
            notifications.push(newNotification);
            console.log('[DEBUG] Global service: Created walk_in notification:', {
              id: newNotification.id,
              patient_name: newNotification.patient_name,
              message: newNotification.message,
              type: newNotification.type,
              timestamp: new Date(newNotification.timestamp).toISOString()
            });
            
            // Mark the appointment as 'walk_in_notified' to prevent re-triggering
            try {
              await window.electronAPI.updateAppointment({ 
                ...apt, 
                status: 'walk_in_notified' 
              });
              console.log('[DEBUG] Global service: Marked appointment', apt.id, 'as walk_in_notified to prevent re-triggering');
            } catch (err) {
              console.error('[DEBUG] Global service: Failed to mark appointment as walk_in_notified:', err);
            }
          } else {
            console.log('[DEBUG] Global service: Skipping walk_in notification for', apt.patient_name, '- already exists');
          }
        }
        this.storeNotifications(notifications);
        console.log('[DEBUG] Global service created walk-in notification:', walkInCandidates.length, 'notifications');
        
        // Sound will be played globally in App.js when notification is detected
        console.log('[DEBUG] Global service: Walk-in notification created - sound will be played globally in App.js');
        console.log('[DEBUG] Global service: Dispatching walkinNotificationUpdate event to trigger sound in App.js');
      } else {
        console.log('[DEBUG] Global service: No walk-in notifications created - no appointments have passed one minute threshold yet');
      }
      
      sessionStorage.setItem('prevUpcomingAppointments', JSON.stringify(upcoming));

      // Set patient status to 'waiting' only after the appointment time has passed
      for (const appointment of appointments) {
        const appointmentDateTime = new Date(`${appointment.appointment_date}T${appointment.appointment_time}`);
        
        // Existing logic for setting patient status to 'waiting'
        if (appointment.patient_id) {
          if (appointmentDateTime <= now) {
            const patient = patients.find(p => p.id === appointment.patient_id);
            if (patient && patient.status !== 'waiting') {
              try {
                await window.electronAPI.updatePatientStatus(appointment.patient_id, 'waiting');
              } catch (err) {
                console.error('Failed to update patient status to waiting:', err);
              }
            }
          }
        }
        
        // Mark 'waiting' appointments as 'completed' after their time passes
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

    } catch (error) {
      console.error('[DEBUG] Global appointment notification service error:', error);
    }
  }
}

// Create singleton instance
const appointmentNotificationService = new AppointmentNotificationService();

export default appointmentNotificationService; 