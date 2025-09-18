/**
 * Bulk Actions Service
 * Provides efficient handling of multiple operations with progress tracking and error handling
 */

class BulkActionsService {
  constructor() {
    this.activeOperations = new Map();
    this.operationQueue = [];
    this.isProcessing = false;
    this.maxConcurrentOperations = 3;
    this.batchSize = 10;
    this.retryAttempts = 3;
    this.retryDelay = 1000;
    
    // Operation types
    this.operationTypes = {
      PATIENT_IMPORT: 'patient_import',
      PATIENT_EXPORT: 'patient_export',
      PATIENT_DELETE: 'patient_delete',
      PATIENT_UPDATE: 'patient_update',
      APPOINTMENT_IMPORT: 'appointment_import',
      APPOINTMENT_EXPORT: 'appointment_export',
      APPOINTMENT_DELETE: 'appointment_delete',
      DATA_BACKUP: 'data_backup',
      DATA_RESTORE: 'data_restore',
      FIRST_TIME_PATIENT_PROCESS: 'first_time_patient_process'
    };

    // Operation status
    this.operationStatus = {
      PENDING: 'pending',
      PROCESSING: 'processing',
      COMPLETED: 'completed',
      FAILED: 'failed',
      CANCELLED: 'cancelled',
      PAUSED: 'paused'
    };
  }

  /**
   * Create a new bulk operation
   */
  createOperation(type, data, options = {}) {
    const operationId = this.generateOperationId();
    
    const operation = {
      id: operationId,
      type,
      data,
      status: this.operationStatus.PENDING,
      progress: 0,
      total: data.length || 1,
      completed: 0,
      failed: 0,
      errors: [],
      warnings: [],
      startTime: null,
      endTime: null,
      options: {
        batchSize: this.batchSize,
        retryAttempts: this.retryAttempts,
        retryDelay: this.retryDelay,
        validateData: true,
        showProgress: true,
        ...options
      },
      subscribers: new Set()
    };

    this.activeOperations.set(operationId, operation);
    this.operationQueue.push(operationId);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }

    return operationId;
  }

  /**
   * Process operation queue
   */
  async processQueue() {
    if (this.isProcessing) return;

    this.isProcessing = true;

    try {
      while (this.operationQueue.length > 0) {
        const activeOperations = Array.from(this.activeOperations.values())
          .filter(op => op.status === this.operationStatus.PROCESSING);

        if (activeOperations.length < this.maxConcurrentOperations) {
          const operationId = this.operationQueue.shift();
          const operation = this.activeOperations.get(operationId);
          
          if (operation && operation.status === this.operationStatus.PENDING) {
            this.processOperation(operation);
          }
        } else {
          // Wait for an operation to complete
          await this.waitForOperationCompletion();
        }
      }
    } catch (error) {
      console.error('[BulkActions] Queue processing error:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process individual operation
   */
  async processOperation(operation) {
    operation.status = this.operationStatus.PROCESSING;
    operation.startTime = Date.now();
    this.notifySubscribers(operation, 'started');

    try {
      switch (operation.type) {
        case this.operationTypes.PATIENT_IMPORT:
          await this.processPatientImport(operation);
          break;
        case this.operationTypes.PATIENT_EXPORT:
          await this.processPatientExport(operation);
          break;
        case this.operationTypes.PATIENT_DELETE:
          await this.processPatientDelete(operation);
          break;
        case this.operationTypes.PATIENT_UPDATE:
          await this.processPatientUpdate(operation);
          break;
        case this.operationTypes.APPOINTMENT_IMPORT:
          await this.processAppointmentImport(operation);
          break;
        case this.operationTypes.APPOINTMENT_EXPORT:
          await this.processAppointmentExport(operation);
          break;
        case this.operationTypes.APPOINTMENT_DELETE:
          await this.processAppointmentDelete(operation);
          break;
        case this.operationTypes.DATA_BACKUP:
          await this.processDataBackup(operation);
          break;
        case this.operationTypes.DATA_RESTORE:
          await this.processDataRestore(operation);
          break;
        case this.operationTypes.FIRST_TIME_PATIENT_PROCESS:
          await this.processFirstTimePatientProcess(operation);
          break;
        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }

      operation.status = this.operationStatus.COMPLETED;
      operation.endTime = Date.now();
      this.notifySubscribers(operation, 'completed');

    } catch (error) {
      console.error(`[BulkActions] Operation ${operation.id} failed:`, error);
      operation.status = this.operationStatus.FAILED;
      operation.errors.push({
        message: error.message,
        timestamp: Date.now()
      });
      operation.endTime = Date.now();
      this.notifySubscribers(operation, 'failed');
    }

    // Clean up completed operations after a delay
    setTimeout(() => {
      this.cleanupOperation(operation.id);
    }, 30000); // 30 seconds
  }

  /**
   * Process patient import
   */
  async processPatientImport(operation) {
    const { data, options } = operation;
    const batches = this.createBatches(data, options.batchSize);

    for (let i = 0; i < batches.length; i++) {
      if (operation.status === this.operationStatus.CANCELLED) {
        break;
      }

      const batch = batches[i];
      await this.processBatch(batch, async (patient) => {
        // Validate patient data
        if (options.validateData) {
          const validation = await this.validatePatientData(patient);
          if (!validation.isValid) {
            throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
          }
        }

        // Add patient to database
        await window.electronAPI.addPatient(patient);
        return patient;
      }, operation);

      operation.progress = ((i + 1) / batches.length) * 100;
      this.notifySubscribers(operation, 'progress');
    }
  }

  /**
   * Process patient export
   */
  async processPatientExport(operation) {
    const { data, options } = operation;
    
    // Get all patients if no specific data provided
    const patients = data.length > 0 ? data : await window.electronAPI.getPatients();
    operation.total = patients.length;

    const exportData = [];
    const batches = this.createBatches(patients, options.batchSize);

    for (let i = 0; i < batches.length; i++) {
      if (operation.status === this.operationStatus.CANCELLED) {
        break;
      }

      const batch = batches[i];
      await this.processBatch(batch, async (patient) => {
        // Add patient files if requested
        if (options.includeFiles) {
          try {
            const files = await window.electronAPI.getPatientFiles(patient.id);
            patient.files = files;
          } catch (error) {
            operation.warnings.push(`Could not load files for patient ${patient.id}: ${error.message}`);
          }
        }

        exportData.push(patient);
        return patient;
      }, operation);

      operation.progress = ((i + 1) / batches.length) * 100;
      this.notifySubscribers(operation, 'progress');
    }

    // Create export file
    const exportBlob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(exportBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patients_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    operation.result = { exportedCount: exportData.length };
  }

  /**
   * Process patient delete
   */
  async processPatientDelete(operation) {
    const { data, options } = operation;
    const batches = this.createBatches(data, options.batchSize);

    for (let i = 0; i < batches.length; i++) {
      if (operation.status === this.operationStatus.CANCELLED) {
        break;
      }

      const batch = batches[i];
      await this.processBatch(batch, async (patientId) => {
        // Delete patient files if requested
        if (options.deleteFiles) {
          try {
            const files = await window.electronAPI.getPatientFiles(patientId);
            for (const file of files) {
              await window.electronAPI.deletePatientFile(patientId, file.name);
            }
          } catch (error) {
            operation.warnings.push(`Could not delete files for patient ${patientId}: ${error.message}`);
          }
        }

        // Delete patient
        await window.electronAPI.deletePatient(patientId);
        return patientId;
      }, operation);

      operation.progress = ((i + 1) / batches.length) * 100;
      this.notifySubscribers(operation, 'progress');
    }
  }

  /**
   * Process patient update
   */
  async processPatientUpdate(operation) {
    const { data, options } = operation;
    const batches = this.createBatches(data, options.batchSize);

    for (let i = 0; i < batches.length; i++) {
      if (operation.status === this.operationStatus.CANCELLED) {
        break;
      }

      const batch = batches[i];
      await this.processBatch(batch, async (patient) => {
        // Validate patient data
        if (options.validateData) {
          const validation = await this.validatePatientData(patient);
          if (!validation.isValid) {
            throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
          }
        }

        // Update patient
        await window.electronAPI.updatePatient(patient);
        return patient;
      }, operation);

      operation.progress = ((i + 1) / batches.length) * 100;
      this.notifySubscribers(operation, 'progress');
    }
  }

  /**
   * Process appointment operations
   */
  async processAppointmentImport(operation) {
    const { data, options } = operation;
    const batches = this.createBatches(data, options.batchSize);

    for (let i = 0; i < batches.length; i++) {
      if (operation.status === this.operationStatus.CANCELLED) {
        break;
      }

      const batch = batches[i];
      await this.processBatch(batch, async (appointment) => {
        await window.electronAPI.addAppointment(appointment);
        return appointment;
      }, operation);

      operation.progress = ((i + 1) / batches.length) * 100;
      this.notifySubscribers(operation, 'progress');
    }
  }

  async processAppointmentExport(operation) {
    const { data, options } = operation;
    const appointments = data.length > 0 ? data : await window.electronAPI.getAppointments();
    operation.total = appointments.length;

    const exportData = [];
    const batches = this.createBatches(appointments, options.batchSize);

    for (let i = 0; i < batches.length; i++) {
      if (operation.status === this.operationStatus.CANCELLED) {
        break;
      }

      const batch = batches[i];
      await this.processBatch(batch, async (appointment) => {
        exportData.push(appointment);
        return appointment;
      }, operation);

      operation.progress = ((i + 1) / batches.length) * 100;
      this.notifySubscribers(operation, 'progress');
    }

    // Create export file
    const exportBlob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(exportBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `appointments_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    operation.result = { exportedCount: exportData.length };
  }

  async processAppointmentDelete(operation) {
    const { data, options } = operation;
    const batches = this.createBatches(data, options.batchSize);

    for (let i = 0; i < batches.length; i++) {
      if (operation.status === this.operationStatus.CANCELLED) {
        break;
      }

      const batch = batches[i];
      await this.processBatch(batch, async (appointmentId) => {
        await window.electronAPI.deleteAppointment(appointmentId);
        return appointmentId;
      }, operation);

      operation.progress = ((i + 1) / batches.length) * 100;
      this.notifySubscribers(operation, 'progress');
    }
  }

  /**
   * Process data backup/restore
   */
  async processDataBackup(operation) {
    const { data, options } = operation;
    
    try {
      const backup = await window.electronAPI.createBackup();
      
      if (options.saveToFile) {
        const exportBlob = new Blob([JSON.stringify(backup, null, 2)], {
          type: 'application/json'
        });
        
        const url = URL.createObjectURL(exportBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `medops_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }

      operation.result = { backup };
      operation.progress = 100;
      this.notifySubscribers(operation, 'progress');

    } catch (error) {
      throw new Error(`Backup failed: ${error.message}`);
    }
  }

  async processDataRestore(operation) {
    const { data, options } = operation;
    
    try {
      // Validate backup data
      if (!data.patients || !data.appointments) {
        throw new Error('Invalid backup data format');
      }

      // Clear existing data if requested
      if (options.clearExisting) {
        await window.electronAPI.deleteAllPatients();
      }

      // Restore patients
      if (data.patients.length > 0) {
        await this.processPatientImport({
          ...operation,
          data: data.patients,
          type: this.operationTypes.PATIENT_IMPORT
        });
      }

      // Restore appointments
      if (data.appointments.length > 0) {
        await this.processAppointmentImport({
          ...operation,
          data: data.appointments,
          type: this.operationTypes.APPOINTMENT_IMPORT
        });
      }

      operation.result = { 
        restoredPatients: data.patients.length,
        restoredAppointments: data.appointments.length
      };

    } catch (error) {
      throw new Error(`Restore failed: ${error.message}`);
    }
  }

  /**
   * Process first-time patient operations
   */
  async processFirstTimePatientProcess(operation) {
    const { data, options } = operation;
    const batches = this.createBatches(data, options.batchSize);

    for (let i = 0; i < batches.length; i++) {
      if (operation.status === this.operationStatus.CANCELLED) {
        break;
      }

      const batch = batches[i];
      await this.processBatch(batch, async (firstTimePatient) => {
        await window.electronAPI.updateFirstTimePatientStatus(
          firstTimePatient.id,
          'processed',
          options.processedBy || 'system',
          options.notes
        );
        return firstTimePatient;
      }, operation);

      operation.progress = ((i + 1) / batches.length) * 100;
      this.notifySubscribers(operation, 'progress');
    }
  }

  /**
   * Process batch of items
   */
  async processBatch(batch, processor, operation) {
    const promises = batch.map(async (item, index) => {
      try {
        const result = await this.retryOperation(() => processor(item), operation.options.retryAttempts);
        operation.completed++;
        return { success: true, result };
      } catch (error) {
        operation.failed++;
        operation.errors.push({
          item,
          error: error.message,
          timestamp: Date.now()
        });
        return { success: false, error };
      }
    });

    await Promise.all(promises);
  }

  /**
   * Retry operation with exponential backoff
   */
  async retryOperation(operation, maxAttempts) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxAttempts) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Create batches from array
   */
  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Validate patient data
   */
  async validatePatientData(patient) {
    // Import validation service dynamically to avoid circular dependencies
    const validationService = await import('./dataValidationService.js');
    return validationService.default.validatePatient(patient);
  }

  /**
   * Subscribe to operation updates
   */
  subscribeToOperation(operationId, callback) {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      operation.subscribers.add(callback);
      
      // Return unsubscribe function
      return () => {
        operation.subscribers.delete(callback);
      };
    }
    return null;
  }

  /**
   * Notify operation subscribers
   */
  notifySubscribers(operation, event) {
    operation.subscribers.forEach(callback => {
      try {
        callback(operation, event);
      } catch (error) {
        console.error('[BulkActions] Subscriber callback error:', error);
      }
    });
  }

  /**
   * Cancel operation
   */
  cancelOperation(operationId) {
    const operation = this.activeOperations.get(operationId);
    if (operation && operation.status === this.operationStatus.PROCESSING) {
      operation.status = this.operationStatus.CANCELLED;
      this.notifySubscribers(operation, 'cancelled');
      return true;
    }
    return false;
  }

  /**
   * Pause operation
   */
  pauseOperation(operationId) {
    const operation = this.activeOperations.get(operationId);
    if (operation && operation.status === this.operationStatus.PROCESSING) {
      operation.status = this.operationStatus.PAUSED;
      this.notifySubscribers(operation, 'paused');
      return true;
    }
    return false;
  }

  /**
   * Resume operation
   */
  resumeOperation(operationId) {
    const operation = this.activeOperations.get(operationId);
    if (operation && operation.status === this.operationStatus.PAUSED) {
      operation.status = this.operationStatus.PROCESSING;
      this.notifySubscribers(operation, 'resumed');
      return true;
    }
    return false;
  }

  /**
   * Get operation status
   */
  getOperation(operationId) {
    return this.activeOperations.get(operationId);
  }

  /**
   * Get all active operations
   */
  getActiveOperations() {
    return Array.from(this.activeOperations.values());
  }

  /**
   * Wait for operation completion
   */
  async waitForOperationCompletion() {
    return new Promise(resolve => {
      const checkInterval = setInterval(() => {
        const activeOperations = Array.from(this.activeOperations.values())
          .filter(op => op.status === this.operationStatus.PROCESSING);
        
        if (activeOperations.length < this.maxConcurrentOperations) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Cleanup completed operation
   */
  cleanupOperation(operationId) {
    this.activeOperations.delete(operationId);
  }

  /**
   * Generate operation ID
   */
  generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get service statistics
   */
  getStats() {
    const operations = Array.from(this.activeOperations.values());
    
    return {
      activeOperations: operations.length,
      queueLength: this.operationQueue.length,
      isProcessing: this.isProcessing,
      operationsByStatus: operations.reduce((acc, op) => {
        acc[op.status] = (acc[op.status] || 0) + 1;
        return acc;
      }, {}),
      operationsByType: operations.reduce((acc, op) => {
        acc[op.type] = (acc[op.type] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

export default new BulkActionsService(); 