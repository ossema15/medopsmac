/**
 * Real-time Update Service
 * Provides live data synchronization, WebSocket connections, and real-time notifications
 */

class RealTimeUpdateService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
    this.maxReconnectDelay = 30000; // Max 30 seconds
    this.heartbeatInterval = null;
    this.heartbeatTimeout = null;
    this.subscribers = new Map();
    this.pendingUpdates = [];
    this.lastUpdateTimestamp = null;
    this.updateQueue = [];
    this.isProcessingQueue = false;
    
    // Update types
    this.updateTypes = {
      PATIENT_ADDED: 'patient_added',
      PATIENT_UPDATED: 'patient_updated',
      PATIENT_DELETED: 'patient_deleted',
      APPOINTMENT_ADDED: 'appointment_added',
      APPOINTMENT_UPDATED: 'appointment_updated',
      APPOINTMENT_DELETED: 'appointment_deleted',
      FIRST_TIME_PATIENT_DETECTED: 'first_time_patient_detected',
      SYSTEM_NOTIFICATION: 'system_notification',
      DATA_SYNC: 'data_sync'
    };

    // Connection states
    this.connectionStates = {
      DISCONNECTED: 'disconnected',
      CONNECTING: 'connecting',
      CONNECTED: 'connected',
      RECONNECTING: 'reconnecting',
      ERROR: 'error'
    };

    this.currentState = this.connectionStates.DISCONNECTED;
  }

  /**
   * Initialize the real-time service
   */
  async initialize(config = {}) {
    const {
      serverUrl = 'ws://localhost:3001',
      autoReconnect = true,
      heartbeatInterval = 30000, // 30 seconds
      maxReconnectAttempts = 5
    } = config;

    this.serverUrl = serverUrl;
    this.autoReconnect = autoReconnect;
    this.heartbeatIntervalMs = heartbeatInterval;
    this.maxReconnectAttempts = maxReconnectAttempts;

    try {
      await this.connect();
      this.setupHeartbeat();
      this.setupEventListeners();
      console.log('[RealTime] Service initialized successfully');
    } catch (error) {
      console.error('[RealTime] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Connect to WebSocket server
   */
  async connect() {
    if (this.isConnected) return;

    this.currentState = this.connectionStates.CONNECTING;
    this.emitStateChange();

    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.serverUrl);
        
        this.socket.onopen = () => {
          console.log('[RealTime] Connected to server');
          this.isConnected = true;
          this.currentState = this.connectionStates.CONNECTED;
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          this.emitStateChange();
          // Emit clientAppConnect on every (re)connect
          this.send({
            type: 'clientAppConnect',
            clientId: getClientId(),
            timestamp: Date.now()
          });
          this.processPendingUpdates();
          resolve();
        };

        this.socket.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.socket.onclose = (event) => {
          console.log('[RealTime] Connection closed:', event.code, event.reason);
          this.isConnected = false;
          this.currentState = this.connectionStates.DISCONNECTED;
          this.emitStateChange();
          
          if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };

        this.socket.onerror = (error) => {
          console.error('[RealTime] WebSocket error:', error);
          this.currentState = this.connectionStates.ERROR;
          this.emitStateChange();
          reject(error);
        };

      } catch (error) {
        console.error('[RealTime] Connection failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    this.currentState = this.connectionStates.RECONNECTING;
    this.emitStateChange();
    
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
    
    console.log(`[RealTime] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (!this.isConnected) {
        this.connect().catch(error => {
          console.error('[RealTime] Reconnection failed:', error);
        });
      }
    }, delay);
  }

  /**
   * Setup heartbeat to keep connection alive
   */
  setupHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.sendHeartbeat();
      }
    }, this.heartbeatIntervalMs);
  }

  /**
   * Send heartbeat to server
   */
  sendHeartbeat() {
    if (this.isConnected) {
      this.send({
        type: 'heartbeat',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Setup event listeners for browser events
   */
  setupEventListeners() {
    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.onPageHidden();
      } else {
        this.onPageVisible();
      }
    });

    // Handle online/offline status
    window.addEventListener('online', () => {
      this.onOnline();
    });

    window.addEventListener('offline', () => {
      this.onOffline();
    });

    // Handle beforeunload
    window.addEventListener('beforeunload', () => {
      this.cleanup();
    });
  }

  /**
   * Handle incoming messages
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      console.log('[RealTime] Received message:', message);

      switch (message.type) {
        case 'heartbeat':
          this.handleHeartbeat(message);
          break;
        case 'data_update':
          this.handleDataUpdate(message);
          break;
        case 'notification':
          this.handleNotification(message);
          break;
        case 'sync_request':
          this.handleSyncRequest(message);
          break;
        default:
          console.warn('[RealTime] Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('[RealTime] Error parsing message:', error);
    }
  }

  /**
   * Handle heartbeat response
   */
  handleHeartbeat(message) {
    // Reset heartbeat timeout
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
    }
    
    this.heartbeatTimeout = setTimeout(() => {
      console.warn('[RealTime] Heartbeat timeout, reconnecting...');
      this.reconnect();
    }, this.heartbeatIntervalMs * 2);
  }

  /**
   * Handle data updates
   */
  handleDataUpdate(message) {
    const { entity, action, data, timestamp } = message;
    
    // Add to update queue
    this.updateQueue.push({
      entity,
      action,
      data,
      timestamp,
      receivedAt: Date.now()
    });

    // Process queue if not already processing
    if (!this.isProcessingQueue) {
      this.processUpdateQueue();
    }

    // Notify subscribers
    this.notifySubscribers(entity, action, data);
  }

  /**
   * Process update queue
   */
  async processUpdateQueue() {
    if (this.isProcessingQueue || this.updateQueue.length === 0) return;

    this.isProcessingQueue = true;

    try {
      while (this.updateQueue.length > 0) {
        const update = this.updateQueue.shift();
        await this.processUpdate(update);
      }
    } catch (error) {
      console.error('[RealTime] Error processing update queue:', error);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Process individual update
   */
  async processUpdate(update) {
    const { entity, action, data, timestamp } = update;

    // Update last timestamp
    if (!this.lastUpdateTimestamp || timestamp > this.lastUpdateTimestamp) {
      this.lastUpdateTimestamp = timestamp;
    }

    // Emit update event
    this.emit('update', {
      entity,
      action,
      data,
      timestamp
    });

    // Handle specific entity updates
    switch (entity) {
      case 'patient':
        await this.handlePatientUpdate(action, data);
        break;
      case 'appointment':
        await this.handleAppointmentUpdate(action, data);
        break;
      case 'first_time_patient':
        await this.handleFirstTimePatientUpdate(action, data);
        break;
      default:
        console.warn('[RealTime] Unknown entity type:', entity);
    }
  }

  /**
   * Handle patient updates
   */
  async handlePatientUpdate(action, data) {
    switch (action) {
      case 'added':
        this.emit('patient:added', data);
        break;
      case 'updated':
        this.emit('patient:updated', data);
        break;
      case 'deleted':
        this.emit('patient:deleted', data);
        break;
    }
  }

  /**
   * Handle appointment updates
   */
  async handleAppointmentUpdate(action, data) {
    switch (action) {
      case 'added':
        this.emit('appointment:added', data);
        break;
      case 'updated':
        this.emit('appointment:updated', data);
        break;
      case 'deleted':
        this.emit('appointment:deleted', data);
        break;
    }
  }

  /**
   * Handle first-time patient updates
   */
  async handleFirstTimePatientUpdate(action, data) {
    switch (action) {
      case 'detected':
        this.emit('first_time_patient:detected', data);
        break;
      case 'processed':
        this.emit('first_time_patient:processed', data);
        break;
    }
  }

  /**
   * Handle notifications
   */
  handleNotification(message) {
    const { type, title, message: content, data } = message;
    
    this.emit('notification', {
      type,
      title,
      content,
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Handle sync requests
   */
  async handleSyncRequest(message) {
    const { entity, timestamp } = message;
    
    // Request fresh data from database
    try {
      let data;
      switch (entity) {
        case 'patients':
          data = await window.electronAPI.getPatients();
          break;
        case 'appointments':
          data = await window.electronAPI.getAppointments();
          break;
        case 'first_time_patients':
          data = await window.electronAPI.getFirstTimePatients();
          break;
        default:
          console.warn('[RealTime] Unknown sync entity:', entity);
          return;
      }

      // Send sync response
      this.send({
        type: 'sync_response',
        entity,
        data,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[RealTime] Sync request failed:', error);
    }
  }

  /**
   * Handle post-appointment patient data updates
   * This ensures patient records are properly updated after appointments
   */
  async handlePostAppointmentUpdate(appointmentData, patientData) {
    try {
      console.log('Handling post-appointment update for patient:', patientData.id);
      
      // Update patient status based on appointment completion
      if (appointmentData.status === 'completed') {
        await window.electronAPI.updatePatientStatus(patientData.id, 'completed');
      } else if (appointmentData.status === 'with_doctor') {
        await window.electronAPI.updatePatientStatus(patientData.id, 'with_doctor');
      }
      
      // Update patient record with any new information
      if (patientData) {
        await window.electronAPI.updatePatient({
          ...patientData,
          updated_at: new Date().toISOString()
        });
      }
      
      // Broadcast the update to all connected clients
      this.broadcastUpdate('patient', 'updated', {
        patientId: patientData.id,
        appointmentId: appointmentData.id,
        status: appointmentData.status
      });
      
      console.log('Post-appointment update completed successfully');
      
    } catch (error) {
      console.error('Error in post-appointment update:', error);
      throw error;
    }
  }

  /**
   * Ensure patient workflow exists for new appointments
   * This creates or updates patient records when new appointments are booked
   */
  async ensurePatientWorkflow(appointmentData) {
    try {
      console.log('Ensuring patient workflow for appointment:', appointmentData.patient_id);
      
      // Check if patient exists
      const existingPatients = await window.electronAPI.getPatients();
      const patient = existingPatients.find(p => p.id === appointmentData.patient_id);
      
      if (!patient) {
        // Create new patient record if it doesn't exist
        const newPatient = {
          id: appointmentData.patient_id,
          name: appointmentData.patient_name,
          status: 'waiting',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          reason_for_visit: appointmentData.reason || ''
        };
        
        await window.electronAPI.addPatient(newPatient);
        console.log('Created new patient record for appointment');
      } else {
        // Update existing patient status if needed
        if (patient.status !== 'waiting' && patient.status !== 'with_doctor') {
          await window.electronAPI.updatePatientStatus(appointmentData.patient_id, 'waiting');
          console.log('Updated existing patient status to waiting');
        }
      }
      
      // Broadcast the update
      this.broadcastUpdate('appointment', 'created', appointmentData);
      
    } catch (error) {
      console.error('Error ensuring patient workflow:', error);
      throw error;
    }
  }

  /**
   * Send message to server
   */
  send(message) {
    if (!this.isConnected || !this.socket) {
      // Queue message for later if not connected
      this.pendingUpdates.push(message);
      return false;
    }

    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('[RealTime] Failed to send message:', error);
      this.pendingUpdates.push(message);
      return false;
    }
  }

  /**
   * Process pending updates when reconnected
   */
  processPendingUpdates() {
    while (this.pendingUpdates.length > 0) {
      const message = this.pendingUpdates.shift();
      this.send(message);
    }
  }

  /**
   * Subscribe to updates
   */
  subscribe(event, callback) {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, []);
    }
    this.subscribers.get(event).push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscribers.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * Notify subscribers
   */
  notifySubscribers(event, action, data) {
    const callbacks = this.subscribers.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(action, data);
        } catch (error) {
          console.error('[RealTime] Subscriber callback error:', error);
        }
      });
    }
  }

  /**
   * Emit event to subscribers
   */
  emit(event, data) {
    this.notifySubscribers(event, 'emit', data);
  }

  /**
   * Request data sync
   */
  requestSync(entity) {
    this.send({
      type: 'sync_request',
      entity,
      timestamp: Date.now()
    });
  }

  /**
   * Broadcast update to other clients
   */
  broadcastUpdate(entity, action, data) {
    this.send({
      type: 'broadcast',
      entity,
      action,
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Get connection state
   */
  getConnectionState() {
    return {
      state: this.currentState,
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      lastUpdate: this.lastUpdateTimestamp
    };
  }

  /**
   * Page visibility handlers
   */
  onPageHidden() {
    console.log('[RealTime] Page hidden, pausing heartbeat');
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  onPageVisible() {
    console.log('[RealTime] Page visible, resuming heartbeat');
    this.setupHeartbeat();
    
    // Request sync if been away for a while
    if (this.lastUpdateTimestamp && Date.now() - this.lastUpdateTimestamp > 60000) {
      this.requestSync('patients');
      this.requestSync('appointments');
    }
  }

  /**
   * Network status handlers
   */
  onOnline() {
    console.log('[RealTime] Network online, attempting reconnection');
    if (!this.isConnected) {
      this.connect().catch(error => {
        console.error('[RealTime] Reconnection failed:', error);
      });
    }
  }

  onOffline() {
    console.log('[RealTime] Network offline');
    this.currentState = this.connectionStates.ERROR;
    this.emitStateChange();
  }

  /**
   * Emit state change
   */
  emitStateChange() {
    this.emit('state:changed', this.getConnectionState());
  }

  /**
   * Reconnect manually
   */
  reconnect() {
    if (this.socket) {
      this.socket.close();
    }
    this.connect().catch(error => {
      console.error('[RealTime] Manual reconnection failed:', error);
    });
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
    }
    if (this.socket) {
      this.socket.close();
    }
    this.subscribers.clear();
    this.updateQueue = [];
    this.pendingUpdates = [];
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      connectionState: this.getConnectionState(),
      queueSize: this.updateQueue.length,
      pendingUpdates: this.pendingUpdates.length,
      subscribers: this.subscribers.size,
      lastUpdate: this.lastUpdateTimestamp
    };
  }
}

// Helper to get or generate a unique client ID for this assistant instance
function getClientId() {
  let id = localStorage.getItem('assistantClientId');
  if (!id) {
    // Use Math.random fallback if uuid is not available
    id = Math.random().toString(36).substr(2, 9);
    localStorage.setItem('assistantClientId', id);
  }
  return id;
}

export default new RealTimeUpdateService(); 