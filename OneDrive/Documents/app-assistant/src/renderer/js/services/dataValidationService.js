/**
 * Enhanced Data Validation Service
 * Provides comprehensive validation for patient and appointment data
 */

class DataValidationService {
  constructor() {
    // Validation rules
    this.rules = {
      patient: {
        name: {
          required: true,
          minLength: 2,
          maxLength: 100,
          pattern: /^[a-zA-ZÀ-ÿ\s'-]+$/,
          message: 'Le nom doit contenir entre 2 et 100 caractères et ne peut contenir que des lettres, espaces, tirets et apostrophes'
        },
        phone: {
          required: false,
          pattern: /^(\+216|216)?[0-9]{8}$/,
          message: 'Le numéro de téléphone doit être au format tunisien (8 chiffres avec ou sans préfixe)'
        },
        email: {
          required: false,
          pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
          message: 'L\'email doit être au format valide (exemple@domaine.com)'
        },
        date_of_birth: {
          required: true,
          pattern: /^\d{4}-\d{2}-\d{2}$/,
          message: 'La date de naissance doit être au format YYYY-MM-DD',
          custom: (value) => this.validateBirthDate(value)
        },
        reason_for_visit: {
          required: false,
          maxLength: 500,
          message: 'La raison de visite ne peut pas dépasser 500 caractères'
        },
        medical_history: {
          required: false,
          maxLength: 2000,
          message: 'Les antécédents médicaux ne peuvent pas dépasser 2000 caractères'
        },
        consultation_price: {
          required: false,
          pattern: /^\d+(\.\d{1,2})?$/,
          message: 'Le prix de consultation doit être un nombre positif avec maximum 2 décimales'
        }
      },
      appointment: {
        patient_name: {
          required: true,
          minLength: 2,
          maxLength: 100,
          message: 'Le nom du patient est requis et doit contenir entre 2 et 100 caractères'
        },
        appointment_date: {
          required: true,
          pattern: /^\d{4}-\d{2}-\d{2}$/,
          message: 'La date de rendez-vous doit être au format YYYY-MM-DD',
          custom: (value) => this.validateAppointmentDate(value)
        },
        appointment_time: {
          required: true,
          pattern: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
          message: 'L\'heure de rendez-vous doit être au format HH:MM',
          custom: (value) => this.validateAppointmentTime(value)
        },
        reason: {
          required: false,
          maxLength: 500,
          message: 'La raison du rendez-vous ne peut pas dépasser 500 caractères'
        }
      }
    };

    // Business hours (9:00 AM to 5:00 PM)
    this.businessHours = {
      start: 9,
      end: 17
    };

    // Time slot interval (15 minutes)
    this.timeSlotInterval = 15;
  }

  /**
   * Validate patient data
   */
  validatePatient(patient) {
    const errors = [];
    const warnings = [];
    const suggestions = [];

    // Validate each field
    for (const [field, rule] of Object.entries(this.rules.patient)) {
      const value = patient[field];
      const validation = this.validateField(value, rule, field);

      if (validation.errors.length > 0) {
        errors.push(...validation.errors);
      }
      if (validation.warnings.length > 0) {
        warnings.push(...validation.warnings);
      }
      if (validation.suggestions.length > 0) {
        suggestions.push(...validation.suggestions);
      }
    }

    // Cross-field validations
    const crossValidation = this.validatePatientCrossFields(patient);
    errors.push(...crossValidation.errors);
    warnings.push(...crossValidation.warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      score: this.calculateValidationScore(errors, warnings)
    };
  }

  /**
   * Validate appointment data
   */
  validateAppointment(appointment) {
    const errors = [];
    const warnings = [];
    const suggestions = [];

    // Validate each field
    for (const [field, rule] of Object.entries(this.rules.appointment)) {
      const value = appointment[field];
      const validation = this.validateField(value, rule, field);

      if (validation.errors.length > 0) {
        errors.push(...validation.errors);
      }
      if (validation.warnings.length > 0) {
        warnings.push(...validation.warnings);
      }
      if (validation.suggestions.length > 0) {
        suggestions.push(...validation.suggestions);
      }
    }

    // Cross-field validations
    const crossValidation = this.validateAppointmentCrossFields(appointment);
    errors.push(...crossValidation.errors);
    warnings.push(...crossValidation.warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      score: this.calculateValidationScore(errors, warnings)
    };
  }

  /**
   * Validate individual field
   */
  validateField(value, rule, fieldName) {
    const errors = [];
    const warnings = [];
    const suggestions = [];

    // Check if required
    if (rule.required && (!value || value.toString().trim() === '')) {
      errors.push(`${fieldName}: Ce champ est requis`);
      return { errors, warnings, suggestions };
    }

    // Skip validation if value is empty and not required
    if (!value || value.toString().trim() === '') {
      return { errors, warnings, suggestions };
    }

    const stringValue = value.toString().trim();

    // Check minimum length
    if (rule.minLength && stringValue.length < rule.minLength) {
      errors.push(`${fieldName}: ${rule.message || `Minimum ${rule.minLength} caractères requis`}`);
    }

    // Check maximum length
    if (rule.maxLength && stringValue.length > rule.maxLength) {
      errors.push(`${fieldName}: ${rule.message || `Maximum ${rule.maxLength} caractères autorisés`}`);
    }

    // Check pattern
    if (rule.pattern && !rule.pattern.test(stringValue)) {
      errors.push(`${fieldName}: ${rule.message || 'Format invalide'}`);
    }

    // Custom validation
    if (rule.custom) {
      const customResult = rule.custom(stringValue);
      if (customResult && !customResult.isValid) {
        if (customResult.severity === 'error') {
          errors.push(`${fieldName}: ${customResult.message}`);
        } else {
          warnings.push(`${fieldName}: ${customResult.message}`);
        }
      }
      if (customResult && customResult.suggestion) {
        suggestions.push({
          field: fieldName,
          current: stringValue,
          suggested: customResult.suggestion,
          reason: customResult.reason
        });
      }
    }

    return { errors, warnings, suggestions };
  }

  /**
   * Validate birth date
   */
  validateBirthDate(dateString) {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const age = now.getFullYear() - date.getFullYear();

      if (isNaN(date.getTime())) {
        return { isValid: false, severity: 'error', message: 'Date invalide' };
      }

      if (date > now) {
        return { isValid: false, severity: 'error', message: 'La date de naissance ne peut pas être dans le futur' };
      }

      if (age < 0 || age > 120) {
        return { 
          isValid: false, 
          severity: 'warning', 
          message: `L'âge calculé (${age} ans) semble incorrect`,
          suggestion: 'Vérifiez la date de naissance'
        };
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, severity: 'error', message: 'Format de date invalide' };
    }
  }

  /**
   * Validate appointment date
   */
  validateAppointmentDate(dateString) {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      if (isNaN(date.getTime())) {
        return { isValid: false, severity: 'error', message: 'Date invalide' };
      }

      if (date < today) {
        return { isValid: false, severity: 'error', message: 'La date de rendez-vous ne peut pas être dans le passé' };
      }

      // Check if it's a weekend
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return { 
          isValid: false, 
          severity: 'warning', 
          message: 'Le rendez-vous est programmé un weekend',
          suggestion: 'Vérifiez si le cabinet est ouvert'
        };
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, severity: 'error', message: 'Format de date invalide' };
    }
  }

  /**
   * Validate appointment time
   */
  validateAppointmentTime(timeString) {
    try {
      const [hours, minutes] = timeString.split(':').map(Number);
      
      if (hours < this.businessHours.start || hours >= this.businessHours.end) {
        return { 
          isValid: false, 
          severity: 'warning', 
          message: `L'heure (${timeString}) est en dehors des heures d'ouverture (${this.businessHours.start}:00-${this.businessHours.end}:00)`,
          suggestion: 'Choisissez une heure entre 9:00 et 17:00'
        };
      }

      if (minutes % this.timeSlotInterval !== 0) {
        return { 
          isValid: false, 
          severity: 'warning', 
          message: `L'heure (${timeString}) ne correspond pas aux créneaux de 15 minutes`,
          suggestion: 'Choisissez une heure se terminant par :00, :15, :30 ou :45'
        };
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, severity: 'error', message: 'Format d\'heure invalide' };
    }
  }

  /**
   * Cross-field validation for patients
   */
  validatePatientCrossFields(patient) {
    const errors = [];
    const warnings = [];

    // Check if patient ID matches expected format
    if (patient.id && patient.name && patient.date_of_birth) {
      const birthYear = new Date(patient.date_of_birth).getFullYear();
      const expectedId = `patient_${birthYear}_${patient.name.toLowerCase().replace(/\s+/g, '_')}`;
      
      if (patient.id !== expectedId) {
        warnings.push('L\'ID du patient ne correspond pas au format attendu');
      }
    }

    // Check for reasonable consultation price
    if (patient.consultation_price) {
      const price = parseFloat(patient.consultation_price);
      if (price < 0) {
        errors.push('Le prix de consultation ne peut pas être négatif');
      } else if (price > 1000) {
        warnings.push('Le prix de consultation semble élevé');
      }
    }

    return { errors, warnings };
  }

  /**
   * Cross-field validation for appointments
   */
  validateAppointmentCrossFields(appointment) {
    const errors = [];
    const warnings = [];

    // Check if appointment is not too far in the future
    if (appointment.appointment_date) {
      const appointmentDate = new Date(appointment.appointment_date);
      const now = new Date();
      const daysDiff = Math.ceil((appointmentDate - now) / (1000 * 60 * 60 * 24));

      if (daysDiff > 365) {
        warnings.push('Le rendez-vous est programmé plus d\'un an à l\'avance');
      }
    }

    // Check if patient name and ID are consistent
    if (appointment.patient_name && appointment.patient_id) {
      const nameInId = appointment.patient_id.toLowerCase().includes(appointment.patient_name.toLowerCase());
      if (!nameInId) {
        warnings.push('Le nom du patient ne correspond pas à l\'ID fourni');
      }
    }

    return { errors, warnings };
  }

  /**
   * Calculate validation score (0-100)
   */
  calculateValidationScore(errors, warnings) {
    const totalIssues = errors.length + warnings.length;
    if (totalIssues === 0) return 100;

    const errorWeight = 10;
    const warningWeight = 2;
    const totalPenalty = (errors.length * errorWeight) + (warnings.length * warningWeight);
    
    return Math.max(0, 100 - totalPenalty);
  }

  /**
   * Sanitize data for safe storage
   */
  sanitizeData(data) {
    const sanitized = {};

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        // Remove potentially dangerous characters but keep useful ones
        sanitized[key] = value
          .trim()
          .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
          .replace(/\s+/g, ' '); // Normalize whitespace
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Format validation results for display
   */
  formatValidationResults(validation) {
    return {
      isValid: validation.isValid,
      score: validation.score,
      summary: this.generateValidationSummary(validation),
      details: {
        errors: validation.errors.map(error => ({ type: 'error', message: error })),
        warnings: validation.warnings.map(warning => ({ type: 'warning', message: warning })),
        suggestions: validation.suggestions
      }
    };
  }

  /**
   * Generate validation summary
   */
  generateValidationSummary(validation) {
    const { errors, warnings, suggestions } = validation;
    
    if (errors.length === 0 && warnings.length === 0) {
      return '✅ Données valides';
    }

    let summary = '';
    if (errors.length > 0) {
      summary += `❌ ${errors.length} erreur(s) à corriger`;
    }
    if (warnings.length > 0) {
      summary += `${summary ? ' • ' : ''}⚠️ ${warnings.length} avertissement(s)`;
    }
    if (suggestions.length > 0) {
      summary += `${summary ? ' • ' : ''}💡 ${suggestions.length} suggestion(s)`;
    }

    return summary;
  }

  /**
   * Validate bulk data
   */
  validateBulkData(dataArray, type = 'patient') {
    const results = {
      valid: [],
      invalid: [],
      summary: {
        total: dataArray.length,
        valid: 0,
        invalid: 0,
        averageScore: 0
      }
    };

    let totalScore = 0;

    for (const item of dataArray) {
      const validation = type === 'patient' ? 
        this.validatePatient(item) : 
        this.validateAppointment(item);

      totalScore += validation.score;

      if (validation.isValid) {
        results.valid.push({
          data: item,
          validation
        });
        results.summary.valid++;
      } else {
        results.invalid.push({
          data: item,
          validation
        });
        results.summary.invalid++;
      }
    }

    results.summary.averageScore = Math.round(totalScore / dataArray.length);

    return results;
  }
}

export default new DataValidationService(); 