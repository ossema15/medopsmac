// Debug script to identify why future appointments are appearing in PatientPanel
console.log('=== Debugging PatientPanel Issue ===');

async function debugPatientPanel() {
  try {
    console.log('1. Getting all data...');
    const [allPatients, allAppointments, todayPatients] = await Promise.all([
      window.electronAPI.getPatients(),
      window.electronAPI.getAppointments(),
      window.electronAPI.getTodayPatients()
    ]);
    
    const today = new Date().toISOString().split('T')[0];
    console.log('Today\'s date:', today);
    
    console.log('2. Analyzing data...');
    console.log('- Total patients:', allPatients.length);
    console.log('- Total appointments:', allAppointments.length);
    console.log('- Today\'s patients (from getTodayPatients):', todayPatients.length);
    
    // Check appointments by date
    const appointmentsByDate = {};
    allAppointments.forEach(apt => {
      const date = apt.appointment_date;
      if (!appointmentsByDate[date]) {
        appointmentsByDate[date] = [];
      }
      appointmentsByDate[date].push(apt);
    });
    
    console.log('3. Appointments by date:');
    Object.keys(appointmentsByDate).sort().forEach(date => {
      console.log(`- ${date}: ${appointmentsByDate[date].length} appointments`);
      appointmentsByDate[date].forEach(apt => {
        console.log(`  * ${apt.patient_name} (ID: ${apt.patient_id || 'new'}) - ${apt.appointment_time}`);
      });
    });
    
    // Check which patients in todayPatients have appointments for today
    const todayAppointments = appointmentsByDate[today] || [];
    const patientsWithTodayAppointments = todayPatients.filter(patient => 
      todayAppointments.some(apt => apt.patient_id === patient.id)
    );
    
    console.log('4. Analysis:');
    console.log('- Appointments for today:', todayAppointments.length);
    console.log('- Patients with today\'s appointments in todayPatients:', patientsWithTodayAppointments.length);
    
    if (patientsWithTodayAppointments.length > 0) {
      console.log('✅ Patients with today\'s appointments found in todayPatients:');
      patientsWithTodayAppointments.forEach(p => console.log(`  * ${p.name}`));
    }
    
    // Check for patients that shouldn't be there
    const patientsWithFutureAppointments = todayPatients.filter(patient => {
      const patientAppointments = allAppointments.filter(apt => apt.patient_id === patient.id);
      return patientAppointments.some(apt => apt.appointment_date !== today);
    });
    
    if (patientsWithFutureAppointments.length > 0) {
      console.log('❌ PROBLEM: Patients with future appointments found in todayPatients:');
      patientsWithFutureAppointments.forEach(patient => {
        const patientAppointments = allAppointments.filter(apt => apt.patient_id === patient.id);
        console.log(`  * ${patient.name}:`);
        patientAppointments.forEach(apt => {
          console.log(`    - ${apt.appointment_date} at ${apt.appointment_time}`);
        });
      });
    } else {
      console.log('✅ No patients with future appointments found in todayPatients');
    }
    
    // Check if the issue is in the database query or the frontend
    console.log('5. Database query test:');
    console.log('- getTodayPatients() returned:', todayPatients.length, 'patients');
    console.log('- Expected: Only patients with appointments for', today);
    
    return {
      todayPatients,
      allAppointments,
      todayAppointments,
      patientsWithFutureAppointments
    };
    
  } catch (error) {
    console.error('Error debugging PatientPanel:', error);
  }
}

// Run the debug
debugPatientPanel(); 