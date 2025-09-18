/**
 * User Experience Service
 * Integrates all services to provide a seamless, optimized, and user-friendly experience
 */

import patientMatchingService from './patientMatchingService.js';
import dataValidationService from './dataValidationService.js';
import errorHandlingService from './errorHandlingService.js';
import realTimeUpdateService from './realTimeUpdateService.js';
import bulkActionsService from './bulkActionsService.js';
import performanceOptimizationService from './performanceOptimizationService.js';

class UserExperienceService {
  constructor() {
    this.isInitialized = false;
    this.activeModals = new Set();
    this.notifications = [];
    this.userPreferences = this.loadUserPreferences();
    this.sessionData = {
      startTime: Date.now(),
      actions: [],
      errors: [],
      performance: {}
    };

    // Service integrations
    this.services = {
      patientMatching: patientMatchingService,
      validation: dataValidationService,
      errorHandling: errorHandlingService,
      realTime: realTimeUpdateService,
      bulkActions: bulkActionsService,
      performance: performanceOptimizationService
    };

    // UX states
    this.states = {
      isLoading: false,
      isOffline: false,
      hasUnreadNotifications: false,
      lastActivity: Date.now()
    };

    // Event listeners
    this.eventListeners = new Map();
  }

  /**
   * Initialize the UX service
   */
  async initialize(config = {}) {
    if (this.isInitialized) return;

    try {
      // Initialize all services
      await this.initializeServices(config);
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Setup performance monitoring
      this.setupPerformanceMonitoring();
      
      // Setup real-time updates
      this.setupRealTimeUpdates();
      
      // Setup error handling
      this.setupErrorHandling();
      
      // Setup user activity tracking
      this.setupActivityTracking();
      
      // Preload critical resources
      this.preloadCriticalResources();
      
      this.isInitialized = true;
      console.log('[UX] Service initialized successfully');
      
    } catch (error) {
      console.error('[UX] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize all integrated services
   */
  async initializeServices(config) {
    // Initialize real-time service
    await this.services.realTime.initialize({
      serverUrl: config.realTimeServer || 'ws://localhost:3001',
      autoReconnect: true,
      heartbeatInterval: 30000
    });

    // Setup performance optimizations
    this.services.performance.preloadCriticalResources();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Window events
    window.addEventListener('beforeunload', () => this.handleBeforeUnload());
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    
    // Document events
    document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
    
    // Keyboard events for accessibility
    document.addEventListener('keydown', (e) => this.handleKeyboardEvent(e));
    
    // Mouse events for activity tracking
    document.addEventListener('mousemove', () => this.updateActivity());
    document.addEventListener('click', () => this.updateActivity());
    document.addEventListener('keypress', () => this.updateActivity());
  }

  /**
   * Setup performance monitoring
   */
  setupPerformanceMonitoring() {
    // Monitor page load performance
    window.addEventListener('load', () => {
      this.services.performance.endMeasure('page-load');
      this.recordPerformanceMetric('pageLoad', performance.now());
    });

    // Monitor navigation performance
    this.services.performance.startMeasure('navigation');
  }

  /**
   * Setup real-time updates
   */
  setupRealTimeUpdates() {
    // Subscribe to real-time updates
    this.services.realTime.subscribe('patient:added', (action, data) => {
      this.handlePatientUpdate('added', data);
    });

    this.services.realTime.subscribe('patient:updated', (action, data) => {
      this.handlePatientUpdate('updated', data);
    });

    this.services.realTime.subscribe('appointment:added', (action, data) => {
      this.handleAppointmentUpdate('added', data);
    });

    this.services.realTime.subscribe('notification', (action, data) => {
      this.showNotification(data);
    });

    // Monitor connection state
    this.services.realTime.subscribe('state:changed', (action, data) => {
      this.handleConnectionStateChange(data);
    });
  }

  /**
   * Setup error handling
   */
  setupErrorHandling() {
    // Global error handler
    window.addEventListener('error', (event) => {
      this.handleGlobalError(event.error);
    });

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      this.handleGlobalError(event.reason);
    });
  }

  /**
   * Setup activity tracking
   */
  setupActivityTracking() {
    // Track user activity
    setInterval(() => {
      this.checkInactivity();
    }, 60000); // Check every minute
  }

  /**
   * Preload critical resources
   */
  preloadCriticalResources() {
    // Preload critical pages
    this.services.performance.addResourceHint('/src/renderer/js/pages/Dashboard.js', 'prefetch');
    this.services.performance.addResourceHint('/src/renderer/js/pages/Patients.js', 'prefetch');
    this.services.performance.addResourceHint('/src/renderer/js/pages/Appointments.js', 'prefetch');
  }

  /**
   * Enhanced patient operations with validation and error handling
   */
  async addPatient(patientData, options = {}) {
    this.startOperation('add-patient');

    try {
      // Validate patient data
      const validation = this.services.validation.validatePatient(patientData);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Check for duplicates
      const existingPatients = await window.electronAPI.getPatients();
      const duplicates = this.services.patientMatching.detectDuplicates([...existingPatients, patientData]);
      
      if (duplicates.length > 0) {
        this.showWarning('Patient potentiellement dupliqué détecté', {
          details: duplicates[0].group.map(p => p.name).join(', '),
          action: 'Vérifiez les informations avant de continuer'
        });
      }

      // Add patient with optimized API call
      const result = await this.services.performance.optimizedApiCall(
        `patient_${patientData.id}`,
        () => window.electronAPI.addPatient(patientData),
        10 * 60 * 1000 // 10 minutes cache
      );

      // Broadcast update
      this.services.realTime.broadcastUpdate('patient', 'added', result);

      // Show success notification
      this.showNotification({
        type: 'success',
        title: 'Patient ajouté',
        content: `Le patient ${patientData.name} a été ajouté avec succès`
      });

      this.endOperation('add-patient');
      return result;

    } catch (error) {
      this.handleOperationError('add-patient', error);
      throw error;
    }
  }

  /**
   * Enhanced appointment operations
   */
  async addAppointment(appointmentData, options = {}) {
    this.startOperation('add-appointment');

    try {
      // Validate appointment data
      const validation = this.services.validation.validateAppointment(appointmentData);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Check for conflicts
      const conflicts = await this.checkAppointmentConflicts(appointmentData);
      if (conflicts.length > 0) {
        this.showWarning('Conflit de rendez-vous détecté', {
          details: conflicts.map(c => `${c.patient_name} - ${c.appointment_time}`).join(', '),
          action: 'Vérifiez les créneaux disponibles'
        });
      }

      // Add appointment
      const result = await this.services.performance.optimizedApiCall(
        `appointment_${Date.now()}`,
        () => window.electronAPI.addAppointment(appointmentData),
        5 * 60 * 1000 // 5 minutes cache
      );

      // Broadcast update
      this.services.realTime.broadcastUpdate('appointment', 'added', result);

      // Show success notification
      this.showNotification({
        type: 'success',
        title: 'Rendez-vous programmé',
        content: `Rendez-vous programmé pour ${appointmentData.patient_name}`
      });

      this.endOperation('add-appointment');
      return result;

    } catch (error) {
      this.handleOperationError('add-appointment', error);
      throw error;
    }
  }

  /**
   * Bulk operations with progress tracking
   */
  async bulkPatientImport(patients, options = {}) {
    const operationId = this.services.bulkActions.createOperation(
      this.services.bulkActions.operationTypes.PATIENT_IMPORT,
      patients,
      {
        validateData: true,
        showProgress: true,
        ...options
      }
    );

    // Subscribe to progress updates
    const unsubscribe = this.services.bulkActions.subscribeToOperation(operationId, (operation, event) => {
      switch (event) {
        case 'started':
          this.showNotification({
            type: 'info',
            title: 'Import en cours',
            content: `Import de ${patients.length} patients...`
          });
          break;
        case 'progress':
          this.updateProgressBar(operation.progress);
          break;
        case 'completed':
          this.showNotification({
            type: 'success',
            title: 'Import terminé',
            content: `${operation.completed} patients importés avec succès`
          });
          this.hideProgressBar();
          break;
        case 'failed':
          this.showNotification({
            type: 'error',
            title: 'Import échoué',
            content: `Erreur lors de l'import: ${operation.errors[0]?.message}`
          });
          this.hideProgressBar();
          break;
      }
    });

    return { operationId, unsubscribe };
  }

  /**
   * Enhanced search with caching and suggestions
   */
  async searchPatients(query, options = {}) {
    const cacheKey = `search_patients_${query}_${JSON.stringify(options)}`;
    
    return this.services.performance.optimizedApiCall(
      cacheKey,
      async () => {
        const patients = await window.electronAPI.getPatients();
        
        if (!query) return patients;

        // Use enhanced matching service
        const matches = this.services.patientMatching.matchPatient(
          { name: query },
          patients,
          { threshold: 0.7, useVariations: true }
        );

        return matches.map(match => match.patient);
      },
      2 * 60 * 1000 // 2 minutes cache
    );
  }

  /**
   * Smart notifications with context
   */
  showNotification(notification, options = {}) {
    const enhancedNotification = {
      id: this.generateId(),
      timestamp: Date.now(),
      priority: 'normal',
      autoDismiss: true,
      dismissDelay: 5000,
      ...notification,
      ...options
    };

    this.notifications.push(enhancedNotification);
    this.states.hasUnreadNotifications = true;

    // Emit notification event
    this.emit('notification:new', enhancedNotification);

    // Auto-dismiss if enabled
    if (enhancedNotification.autoDismiss) {
      setTimeout(() => {
        this.dismissNotification(enhancedNotification.id);
      }, enhancedNotification.dismissDelay);
    }

    return enhancedNotification.id;
  }

  showWarning(message, details = {}) {
    return this.showNotification({
      type: 'warning',
      title: 'Attention',
      content: message,
      details
    }, { dismissDelay: 8000 });
  }

  showError(message, details = {}) {
    return this.showNotification({
      type: 'error',
      title: 'Erreur',
      content: message,
      details
    }, { autoDismiss: false });
  }

  dismissNotification(notificationId) {
    const index = this.notifications.findIndex(n => n.id === notificationId);
    if (index > -1) {
      this.notifications.splice(index, 1);
      this.emit('notification:dismissed', notificationId);
    }
  }

  /**
   * Modal management
   */
  showModal(modalId, content, options = {}) {
    this.activeModals.add(modalId);
    this.emit('modal:show', { id: modalId, content, options });
  }

  hideModal(modalId) {
    this.activeModals.delete(modalId);
    this.emit('modal:hide', { id: modalId });
  }

  /**
   * Progress tracking
   */
  updateProgressBar(progress) {
    this.emit('progress:update', { progress });
  }

  hideProgressBar() {
    this.emit('progress:hide');
  }

  /**
   * Activity tracking
   */
  updateActivity() {
    this.states.lastActivity = Date.now();
    this.sessionData.actions.push({
      type: 'activity',
      timestamp: Date.now()
    });
  }

  checkInactivity() {
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
    const timeSinceActivity = Date.now() - this.states.lastActivity;

    if (timeSinceActivity > inactiveThreshold) {
      this.showNotification({
        type: 'info',
        title: 'Session inactive',
        content: 'Votre session sera bientôt expirée'
      });
    }
  }

  /**
   * Error handling
   */
  handleGlobalError(error) {
    const errorInfo = this.services.errorHandling.handleError(error, {
      context: 'global',
      timestamp: Date.now()
    });

    this.sessionData.errors.push(errorInfo);
    this.showError(errorInfo.userFriendly, {
      technical: errorInfo.technical,
      recovery: errorInfo.recovery
    });
  }

  handleOperationError(operation, error) {
    const errorInfo = this.services.errorHandling.handleError(error, {
      context: operation,
      timestamp: Date.now()
    });

    this.sessionData.errors.push(errorInfo);
    this.endOperation(operation, 'failed');
  }

  /**
   * Event handling
   */
  handleBeforeUnload() {
    // Save session data
    this.saveSessionData();
    
    // Cleanup services
    this.services.realTime.cleanup();
    this.services.performance.optimizeMemory();
  }

  handleOnline() {
    this.states.isOffline = false;
    this.showNotification({
      type: 'success',
      title: 'Connexion rétablie',
      content: 'Vous êtes de nouveau en ligne'
    });
  }

  handleOffline() {
    this.states.isOffline = true;
    this.showNotification({
      type: 'warning',
      title: 'Connexion perdue',
      content: 'Vous travaillez en mode hors ligne'
    });
  }

  handleVisibilityChange() {
    if (document.hidden) {
      this.emit('app:hidden');
    } else {
      this.emit('app:visible');
      this.updateActivity();
    }
  }

  handleKeyboardEvent(event) {
    // Only handle shortcuts when not in input fields, textareas, or contenteditable elements
    const target = event.target;
    const isInInput = target.tagName === 'INPUT' || 
                     target.tagName === 'TEXTAREA' || 
                     target.tagName === 'SELECT' ||
                     target.contentEditable === 'true' ||
                     target.closest('[contenteditable="true"]');
    
    // If user is typing in an input field, don't interfere with keyboard events
    if (isInInput) {
      return;
    }
    
    // Accessibility shortcuts - only when not in input fields
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 's':
          event.preventDefault();
          this.emit('shortcut:save');
          break;
        case 'f':
          event.preventDefault();
          this.emit('shortcut:search');
          break;
        case 'n':
          event.preventDefault();
          this.emit('shortcut:new');
          break;
      }
    }
  }

  handleConnectionStateChange(state) {
    this.emit('connection:stateChanged', state);
  }

  handlePatientUpdate(action, data) {
    this.emit('patient:updated', { action, data });
  }

  handleAppointmentUpdate(action, data) {
    this.emit('appointment:updated', { action, data });
  }

  /**
   * Utility methods
   */
  startOperation(operation) {
    this.services.performance.startMeasure(operation);
    this.states.isLoading = true;
    this.emit('operation:started', operation);
  }

  endOperation(operation, status = 'completed') {
    this.services.performance.endMeasure(operation);
    this.states.isLoading = false;
    this.emit('operation:ended', { operation, status });
  }

  async checkAppointmentConflicts(appointmentData) {
    const appointments = await window.electronAPI.getAppointments();
    return appointments.filter(apt => 
      apt.appointment_date === appointmentData.appointment_date &&
      apt.appointment_time === appointmentData.appointment_time
    );
  }

  generateId() {
    return `ux_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * User preferences
   */
  loadUserPreferences() {
    try {
      return JSON.parse(localStorage.getItem('ux_preferences')) || {
        theme: 'light',
        language: 'fr',
        notifications: true,
        autoSave: true,
        animations: true
      };
    } catch (error) {
      return {
        theme: 'light',
        language: 'fr',
        notifications: true,
        autoSave: true,
        animations: true
      };
    }
  }

  saveUserPreferences(preferences) {
    this.userPreferences = { ...this.userPreferences, ...preferences };
    localStorage.setItem('ux_preferences', JSON.stringify(this.userPreferences));
    this.emit('preferences:updated', this.userPreferences);
  }

  /**
   * Session data
   */
  saveSessionData() {
    this.sessionData.endTime = Date.now();
    this.sessionData.duration = this.sessionData.endTime - this.sessionData.startTime;
    
    // Save to localStorage for analytics
    const sessions = JSON.parse(localStorage.getItem('ux_sessions') || '[]');
    sessions.push(this.sessionData);
    
    // Keep only last 10 sessions
    if (sessions.length > 10) {
      sessions.shift();
    }
    
    localStorage.setItem('ux_sessions', JSON.stringify(sessions));
  }

  /**
   * Event system
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[UX] Event listener error for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      states: this.states,
      services: {
        realTime: this.services.realTime.getConnectionState(),
        performance: this.services.performance.getMetrics(),
        bulkActions: this.services.bulkActions.getStats()
      },
      session: {
        duration: Date.now() - this.sessionData.startTime,
        actions: this.sessionData.actions.length,
        errors: this.sessionData.errors.length
      }
    };
  }

  /**
   * Generate UX report
   */
  generateReport() {
    return {
      timestamp: new Date().toISOString(),
      status: this.getStatus(),
      performance: this.services.performance.generateReport(),
      session: this.sessionData,
      recommendations: this.generateRecommendations()
    };
  }

  generateRecommendations() {
    const recommendations = [];
    const status = this.getStatus();

    if (status.services.realTime.state !== 'connected') {
      recommendations.push('Vérifiez votre connexion réseau');
    }

    if (status.session.errors > 5) {
      recommendations.push('Trop d\'erreurs détectées, contactez le support');
    }

    if (status.services.performance.cache.hitRate < 0.5) {
      recommendations.push('Optimisez l\'utilisation du cache');
    }

    return recommendations;
  }
}

export default new UserExperienceService(); 