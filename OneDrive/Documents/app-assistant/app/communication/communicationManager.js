const { io } = require('socket.io-client');
const express = require('express');
const http = require('http');
const cors = require('cors');
const { encrypt, decrypt } = require('../utils/encryption');

process.stdout.write('[COMM MANAGER] Module loaded (stdout)\n');
console.error('[COMM MANAGER] Module loaded (stderr)');

class CommunicationManager {
  constructor(database, fileManager) {
    this.database = database;
    this.fileManager = fileManager;
    this.socket = null;
    this.isConnected = false;
    this.doctorOnline = false;
    this._boundHandlers = null;
  }

  async initialize() {
    try {
      // Prevent multiple initializations
      if (this.socket) {
        console.log('[COMM MANAGER] ⚠️ Socket already exists, cleaning up first...');
        await this.cleanup();
      }
      
      console.log('[COMM MANAGER] 🔧 Communication manager initialized (connection will be established when needed)');
      
      // Don't connect immediately - external socket will be attached by networkManager
      this.socket = null;
      this.isConnected = false;
      this.doctorOnline = false;
    
          // Socket setup will be done when connection is established via Settings
     } catch (error) {
       console.error('[COMM MANAGER] ❌ Error during initialization:', error);
       console.log('[COMM MANAGER] ⚠️ Communication manager initialization failed, but app will continue to work');
       // Don't throw the error, just log it and continue
       this.socket = null;
       this.isConnected = false;
     }
  }

  async sendPatientData(encryptedData) {
    if (!this.isConnected) {
      console.error('[COMM MANAGER] About to throw "No doctor connected". isConnected:', this.isConnected);
      throw new Error('No doctor connected');
    }
    console.log('[COMM MANAGER] Emitting patient-data, isConnected:', this.isConnected);
    this.socket.emit('patient-data', encryptedData);

    console.log('[COMM MANAGER] patient-data event emitted');
    return { success: true };
  }

  async sendMessage(encryptedMessage) {
    if (!this.isConnected) {
      throw new Error('No doctor connected');
    }
    this.socket.emit('message', encryptedMessage);
    return { success: true };
  }

  async sendFile(patientId, fileName, filePath) {
    if (!this.isConnected) {
      throw new Error('No doctor connected');
    }
    
    try {
      // Read file and convert to base64
      const fileBuffer = require('fs').readFileSync(filePath);
      const fileData = fileBuffer.toString('base64');
      
      // Send file data
      this.socket.emit('file:data', {
        patientId,
        fileName,
        fileData,
        fileSize: fileBuffer.length
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error sending file:', error);
      throw error;
    }
  }

  async sendDashboardStatus(dashboardData) {
    if (!this.isConnected) {
      throw new Error('No doctor connected');
    }
    
    try {
      // Encrypt the dashboard data before sending
      const encryptedData = encrypt(JSON.stringify(dashboardData));
      
      console.log(`[COMM MANAGER] 🔐 Encrypted dashboard data (${encryptedData.length} characters)`);
      console.log(`[COMM MANAGER] 📊 Dashboard data summary: ${dashboardData.todayPatients} today's patients, ${dashboardData.waitingPatients} waiting patients`);
      
      this.socket.emit('dashboard-status', encryptedData);
      console.log('[COMM MANAGER] 📡 dashboard-status event emitted via socket');
      
      return { success: true };
    } catch (error) {
      console.error('[COMM MANAGER] ❌ Error sending dashboard status:', error);
      throw error;
    }
  }

  async sendWaitingPatientNames(waitingPatients) {
    if (!this.isConnected) {
      throw new Error('No doctor connected');
    }
    
    try {
      // Create simple list of waiting patient names
      const waitingNames = waitingPatients.map(p => ({
        id: p.id,
        name: p.name,
        appointmentTime: p.appointmentTime || null
      }));
      
      const waitingData = {
        timestamp: new Date().toISOString(),
        waitingCount: waitingNames.length,
        waitingPatients: waitingNames
      };
      
      console.log(`[COMM MANAGER] 👤 Waiting patients data prepared: ${waitingNames.length} patients`);
      if (waitingNames.length > 0) {
        waitingNames.forEach((p, index) => {
          console.log(`[COMM MANAGER]   ${index + 1}. ${p.name} (ID: ${p.id})`);
        });
      }
      
      // Encrypt the waiting names data before sending
      const encryptedData = encrypt(JSON.stringify(waitingData));
      
      console.log(`[COMM MANAGER] 🔐 Encrypted waiting patients data (${encryptedData.length} characters)`);
      this.socket.emit('waiting-patients', encryptedData);
      console.log('[COMM MANAGER] 📡 waiting-patients event emitted via socket');
      
      return { success: true };
    } catch (error) {
      console.error('[COMM MANAGER] ❌ Error sending waiting patient names:', error);
      throw error;
    }
  }

  async connectToDoctor(doctorIp = '192.168.0.20') {
    // No-op: networkManager owns the single socket. It will call attachExternalSocket() when ready.
    console.log('[COMM MANAGER] ℹ️ connectToDoctor called, but connection is managed by networkManager. Waiting for external socket attach.');
    return { success: true };
  }

  attachExternalSocket(externalSocket) {
    // Detach previous if any
    if (this.socket && this._boundHandlers) {
      this._detachHandlers();
    }
    this.socket = externalSocket;
    if (!this.socket) {
      this.isConnected = false;
      this.doctorOnline = false;
      console.log('[COMM MANAGER] ⚠️ attachExternalSocket called with null socket');
      return;
    }

    const onAny = (event, ...args) => console.log(`[COMM MANAGER] 📡 Socket event: ${event}`, args);
    const onConnect = () => {
      console.log('[COMM MANAGER] 🔗 External socket connected');
      // Identify once connected (handshake also performed in networkManager, but harmless to repeat if backend is idempotent)
      try {
        this.socket.emit('clientAppConnect', {
          clientType: 'assistant-app',
          clientId: 'medops',
          version: '1.0.0',
          timestamp: new Date().toISOString()
        });
      } catch {}
      this._recomputeConnected();
    };
    const onDisconnect = () => {
      console.log('[COMM MANAGER] 🔌 External socket disconnected');
      this._recomputeConnected();
    };
    const onDoctorPresence = async (data) => {
      console.log('[COMM MANAGER] 📨 doctorPresence event received:', data);
      this.doctorOnline = !!data.online;
      this._recomputeConnected();
      if (this.isConnected) {
        console.log('[COMM MANAGER] 🟢 Doctor online and socket connected - sending dashboard data');
        try {
          const result = await this.sendDashboardStatusOnConnection();
          if (result.success) {
            console.log('[COMM MANAGER] ✅ Dashboard status and waiting patients sent successfully on connection');
          } else {
            console.log('[COMM MANAGER] ⚠️ Dashboard status send failed on connection:', result.error);
          }
        } catch (error) {
          console.error('[COMM MANAGER] ❌ Error sending dashboard status on connection:', error);
        }
      }
    };
    const onNewMessage = async (decryptedMessage) => {
      try {
        console.log('[COMM MANAGER] 📨 Received new-message event:', decryptedMessage);
        const result = await this.database.addMessage(decryptedMessage);
        if (result.duplicate) {
          console.log('[COMM MANAGER] ⚠️ Duplicate message detected, not stored again');
        } else {
          console.log('[COMM MANAGER] ✅ Message stored successfully');
        }
      } catch (error) {
        console.error('[COMM MANAGER] ❌ Error storing received message:', error);
      }
    };
    const onPatientData = async (encryptedData) => {
      try {
        const decryptedData = JSON.parse(decrypt(encryptedData));
        console.log('[COMM MANAGER] Received patient data:', decryptedData.patient?.name);
        await this.database.addPatient(decryptedData.patient);
      } catch (error) {
        console.error('Error processing received patient data:', error);
      }
    };

    // Bind and register
    this._boundHandlers = { onAny, onConnect, onDisconnect, onDoctorPresence, onNewMessage, onPatientData };
    this.socket.onAny(onAny);
    this.socket.on('connect', onConnect);
    this.socket.on('disconnect', onDisconnect);
    this.socket.on('doctorPresence', onDoctorPresence);
    this.socket.on('new-message', onNewMessage);
    this.socket.on('patient-data', onPatientData);

    // Initialize state based on current socket status
    this._recomputeConnected();
  }

  _detachHandlers() {
    if (!this.socket || !this._boundHandlers) return;
    const { onAny, onConnect, onDisconnect, onDoctorPresence, onNewMessage, onPatientData } = this._boundHandlers;
    try { this.socket.offAny(onAny); } catch {}
    try { this.socket.off('connect', onConnect); } catch {}
    try { this.socket.off('disconnect', onDisconnect); } catch {}
    try { this.socket.off('doctorPresence', onDoctorPresence); } catch {}
    try { this.socket.off('new-message', onNewMessage); } catch {}
    try { this.socket.off('patient-data', onPatientData); } catch {}
    this._boundHandlers = null;
  }

  _recomputeConnected() {
    const transportConnected = !!(this.socket && this.socket.connected);
    const old = this.isConnected;
    this.isConnected = transportConnected && this.doctorOnline;
    if (old !== this.isConnected) {
      console.log(`[COMM MANAGER] 🔄 Connection state changed: ${old} -> ${this.isConnected} (transport=${transportConnected}, doctorOnline=${this.doctorOnline})`);
    }
  }

  async sendDashboardStatusOnConnection() {
    try {
      // Check connection status before proceeding
      if (!this.isConnected) {
        console.log('[COMM MANAGER] ⚠️ Cannot send dashboard status - not connected to doctor');
        return { success: false, error: 'Not connected to doctor' };
      }

      console.log('[COMM MANAGER] 📊 Starting to collect dashboard data...');
      
      // Build today's view using database helper to include appointments + walk-ins
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      console.log(`[COMM MANAGER] 📅 Today's date: ${todayStr}`);
      
      const todayPatients = await this.database.getTodayPatients();
      const appointmentsList = await this.database.getAppointments();
      const todaysAppointments = appointmentsList.filter(a => a.appointment_date === todayStr);
      
      console.log(`[COMM MANAGER] 📋 Found ${todayPatients.length} total patients for today and ${todaysAppointments.length} appointments for today`);
      
      // Queue source of truth: include only patients marked 'waiting' AND edited
      const waitingPatients = todayPatients.filter(p => p.status === 'waiting' && (p.hasBeenEdited === true || p.hasBeenEdited === 1));
      
      console.log(`[COMM MANAGER] ⏳ Found ${waitingPatients.length} waiting patients (status: waiting)`);
      
      if (waitingPatients.length > 0) {
        console.log('[COMM MANAGER] 👤 Waiting patients:');
        waitingPatients.forEach((p, index) => {
          console.log(`[COMM MANAGER]   ${index + 1}. ${p.name} (ID: ${p.id}) - Status: ${p.status}`);
        });
      }
      
      // Compute current week range and count of week patients (appointments and updated waiting)
      const weekStart = new Date(now);
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(now.getDate() - now.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const toDate = (s) => {
        if (!s) return null;
        const norm = typeof s === 'string' ? s.replace(' ', 'T') : s;
        const d = new Date(norm);
        return isNaN(d.getTime()) ? null : d;
      };

      const weekAppointments = appointmentsList.filter(a => {
        const d = new Date(a.appointment_date);
        return d >= weekStart && d <= weekEnd;
      });
      const weekPatientIds = new Set(weekAppointments.map(a => a.patient_id));
      const weekPatientsByAppt = (await this.database.getAllPatients()).filter(p => weekPatientIds.has(p.id));
      const allPatients = weekPatientsByAppt.length ? weekPatientsByAppt : await this.database.getAllPatients();
      const weekWaitingUpdated = allPatients.filter(p => {
        if (p.status !== 'waiting') return false;
        const u = toDate(p.updated_at) || toDate(p.created_at);
        if (!u) return false;
        const dOnly = new Date(u.getFullYear(), u.getMonth(), u.getDate());
        const ws = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
        const we = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate());
        return dOnly >= ws && dOnly <= we;
      });
      const weekMap = new Map();
      [...weekPatientsByAppt, ...weekWaitingUpdated].forEach(p => weekMap.set(p.id, p));
      const weekPatientsCount = Array.from(weekMap.values()).length;

      // Create dashboard status data
      const dashboardStatus = {
        timestamp: new Date().toISOString(),
        todayPatients: todayPatients.length,
        weekPatients: weekPatientsCount,
        waitingPatients: waitingPatients.length,
        waitingPatientsList: waitingPatients.map(p => ({
          id: p.id,
          name: p.name,
          age: p.age,
          gender: p.gender,
          appointmentTime: todaysAppointments.find(a => a.patient_id === p.id)?.appointment_time || null,
          status: p.status
        })),
        todayPatientsList: todayPatients.map(p => ({
          id: p.id,
          name: p.name,
          age: p.age,
          gender: p.gender,
          appointmentTime: todaysAppointments.find(a => a.patient_id === p.id)?.appointment_time || null,
          status: p.status
        }))
      };

      console.log(`[COMM MANAGER] 📊 Dashboard status prepared: ${todayPatients.length} today's patients, ${waitingPatients.length} waiting patients, ${weekPatientsCount} week patients`);

      // Double-check connection before sending
      if (!this.isConnected) {
        console.log('[COMM MANAGER] ⚠️ Connection lost while preparing dashboard data - aborting send');
        return { success: false, error: 'Connection lost while preparing data' };
      }

      // Send the dashboard status
      console.log('[COMM MANAGER] 📤 Sending dashboard-status event...');
      await this.sendDashboardStatus(dashboardStatus);
      console.log('[COMM MANAGER] ✅ dashboard-status event sent successfully');
      
      // Also send just the waiting patient names
      console.log('[COMM MANAGER] 📤 Sending waiting-patients event...');
      await this.sendWaitingPatientNames(waitingPatients);
      console.log('[COMM MANAGER] ✅ waiting-patients event sent successfully');
      
      console.log('[COMM MANAGER] 🎉 All dashboard data sent successfully to doctor app!');
      return { success: true, data: dashboardStatus };
    } catch (error) {
      console.error('[COMM MANAGER] ❌ Error sending dashboard status on connection:', error);
      // Don't throw the error, just return it as a result
      return { success: false, error: error.message };
    }
  }

  async updateConfiguration(settings) {
    // Update communication settings if needed
    if (settings.communication_mode) {
      console.log('Communication mode updated:', settings.communication_mode);
    }
  }

  async cleanup() {
    try {
      console.log('[COMM MANAGER] 🧹 Starting cleanup...');
      // Do not close the external socket (owned by networkManager). Just detach listeners.
      if (this.socket) {
        this._detachHandlers();
        this.socket = null;
      }
      this.isConnected = false;
      this.doctorOnline = false;
      console.log('[COMM MANAGER] ✅ Communication manager cleaned up');
    } catch (error) {
      console.error('[COMM MANAGER] ❌ Error during cleanup:', error);
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      connectedClients: this.isConnected ? 1 : 0, // Assuming 1 client for now
      port: 3001 // This port is for the server, not the client
    };
  }
}

module.exports = CommunicationManager; 