/**
 * Enhanced Error Handling Service
 * Provides structured error management, logging, and user-friendly error messages
 */

class ErrorHandlingService {
  constructor() {
    // Error categories
    this.errorCategories = {
      VALIDATION: 'validation',
      NETWORK: 'network',
      DATABASE: 'database',
      FILE: 'file',
      AUTHENTICATION: 'authentication',
      PERMISSION: 'permission',
      SYSTEM: 'system',
      UNKNOWN: 'unknown'
    };

    // Error severity levels
    this.severityLevels = {
      LOW: 'low',
      MEDIUM: 'medium',
      HIGH: 'high',
      CRITICAL: 'critical'
    };

    // Error message templates
    this.errorMessages = {
      // Database errors
      'database:connection-failed': {
        message: 'Impossible de se connecter à la base de données',
        suggestion: 'Vérifiez que l\'application a les permissions nécessaires',
        severity: this.severityLevels.CRITICAL
      },
      'database:query-failed': {
        message: 'Erreur lors de l\'exécution de la requête',
        suggestion: 'Vérifiez l\'intégrité de la base de données',
        severity: this.severityLevels.HIGH
      },
      'database:constraint-violation': {
        message: 'Données en conflit avec les contraintes de la base',
        suggestion: 'Vérifiez que les données respectent les règles de validation',
        severity: this.severityLevels.MEDIUM
      },

      // Network errors
      'network:connection-failed': {
        message: 'Impossible de se connecter au réseau',
        suggestion: 'Vérifiez votre connexion internet et réessayez',
        severity: this.severityLevels.MEDIUM
      },
      'network:timeout': {
        message: 'La connexion a expiré',
        suggestion: 'Vérifiez votre connexion et réessayez',
        severity: this.severityLevels.MEDIUM
      },
      'network:server-error': {
        message: 'Erreur du serveur distant',
        suggestion: 'Le service sera bientôt disponible, réessayez plus tard',
        severity: this.severityLevels.MEDIUM
      },

      // File errors
      'file:not-found': {
        message: 'Fichier introuvable',
        suggestion: 'Vérifiez que le fichier existe et que vous avez les permissions',
        severity: this.severityLevels.MEDIUM
      },
      'file:permission-denied': {
        message: 'Permission refusée pour accéder au fichier',
        suggestion: 'Vérifiez les permissions du dossier et réessayez',
        severity: this.severityLevels.HIGH
      },
      'file:disk-full': {
        message: 'Espace disque insuffisant',
        suggestion: 'Libérez de l\'espace sur votre disque',
        severity: this.severityLevels.HIGH
      },

      // Validation errors
      'validation:invalid-data': {
        message: 'Données invalides',
        suggestion: 'Vérifiez que tous les champs requis sont remplis correctement',
        severity: this.severityLevels.LOW
      },
      'validation:missing-required': {
        message: 'Champs requis manquants',
        suggestion: 'Remplissez tous les champs marqués comme obligatoires',
        severity: this.severityLevels.LOW
      },

      // Authentication errors
      'auth:invalid-credentials': {
        message: 'Identifiants invalides',
        suggestion: 'Vérifiez votre nom d\'utilisateur et mot de passe',
        severity: this.severityLevels.MEDIUM
      },
      'auth:session-expired': {
        message: 'Session expirée',
        suggestion: 'Connectez-vous à nouveau',
        severity: this.severityLevels.MEDIUM
      },

      // System errors
      'system:out-of-memory': {
        message: 'Mémoire insuffisante',
        suggestion: 'Fermez d\'autres applications et redémarrez',
        severity: this.severityLevels.CRITICAL
      },
      'system:unexpected': {
        message: 'Erreur système inattendue',
        suggestion: 'Redémarrez l\'application et réessayez',
        severity: this.severityLevels.HIGH
      }
    };

    // Recovery strategies
    this.recoveryStrategies = {
      [this.severityLevels.LOW]: ['retry', 'validate'],
      [this.severityLevels.MEDIUM]: ['retry', 'validate', 'check_network'],
      [this.severityLevels.HIGH]: ['retry', 'validate', 'check_permissions', 'restart'],
      [this.severityLevels.CRITICAL]: ['restart', 'check_system', 'contact_support']
    };

    // Error history for tracking patterns
    this.errorHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Handle and categorize an error
   */
  handleError(error, context = {}) {
    const errorInfo = this.analyzeError(error, context);
    
    // Log the error
    this.logError(errorInfo);
    
    // Add to history
    this.addToHistory(errorInfo);
    
    // Check for error patterns
    const patterns = this.detectErrorPatterns();
    
    return {
      ...errorInfo,
      patterns,
      recovery: this.getRecoverySuggestions(errorInfo, patterns)
    };
  }

  /**
   * Analyze error and extract relevant information
   */
  analyzeError(error, context) {
    const errorInfo = {
      id: this.generateErrorId(),
      timestamp: new Date().toISOString(),
      message: error.message || 'Erreur inconnue',
      stack: error.stack,
      category: this.categorizeError(error),
      severity: this.determineSeverity(error),
      context,
      userFriendly: this.getUserFriendlyMessage(error),
      technical: this.getTechnicalDetails(error)
    };

    // Try to match with known error patterns
    const knownError = this.matchKnownError(error);
    if (knownError) {
      errorInfo.userFriendly = knownError.message;
      errorInfo.suggestion = knownError.suggestion;
      errorInfo.severity = knownError.severity;
    }

    return errorInfo;
  }

  /**
   * Categorize error based on type and message
   */
  categorizeError(error) {
    const message = error.message?.toLowerCase() || '';
    const stack = error.stack?.toLowerCase() || '';

    if (message.includes('database') || message.includes('sql') || stack.includes('database')) {
      return this.errorCategories.DATABASE;
    }
    if (message.includes('network') || message.includes('fetch') || message.includes('http')) {
      return this.errorCategories.NETWORK;
    }
    if (message.includes('file') || message.includes('fs') || message.includes('path')) {
      return this.errorCategories.FILE;
    }
    if (message.includes('auth') || message.includes('login') || message.includes('password')) {
      return this.errorCategories.AUTHENTICATION;
    }
    if (message.includes('permission') || message.includes('access')) {
      return this.errorCategories.PERMISSION;
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return this.errorCategories.VALIDATION;
    }
    if (message.includes('memory') || message.includes('system')) {
      return this.errorCategories.SYSTEM;
    }

    return this.errorCategories.UNKNOWN;
  }

  /**
   * Determine error severity
   */
  determineSeverity(error) {
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('critical') || message.includes('fatal')) {
      return this.severityLevels.CRITICAL;
    }
    if (message.includes('permission') || message.includes('access denied')) {
      return this.severityLevels.HIGH;
    }
    if (message.includes('network') || message.includes('timeout')) {
      return this.severityLevels.MEDIUM;
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return this.severityLevels.LOW;
    }

    return this.severityLevels.MEDIUM;
  }

  /**
   * Match error with known error patterns
   */
  matchKnownError(error) {
    const message = error.message?.toLowerCase() || '';
    
    for (const [key, errorInfo] of Object.entries(this.errorMessages)) {
      if (message.includes(key.split(':')[1]) || this.matchesErrorPattern(error, key)) {
        return errorInfo;
      }
    }

    return null;
  }

  /**
   * Check if error matches a specific pattern
   */
  matchesErrorPattern(error, pattern) {
    const patterns = {
      'database:connection-failed': /connection|connect|database/i,
      'network:timeout': /timeout|timed out/i,
      'file:permission-denied': /permission|access denied/i,
      'validation:invalid-data': /invalid|validation/i
    };

    const regex = patterns[pattern];
    return regex && regex.test(error.message);
  }

  /**
   * Get user-friendly error message
   */
  getUserFriendlyMessage(error) {
    const knownError = this.matchKnownError(error);
    if (knownError) {
      return knownError.message;
    }

    // Generate generic user-friendly message
    const category = this.categorizeError(error);
    const messages = {
      [this.errorCategories.DATABASE]: 'Erreur de base de données',
      [this.errorCategories.NETWORK]: 'Erreur de connexion',
      [this.errorCategories.FILE]: 'Erreur de fichier',
      [this.errorCategories.AUTHENTICATION]: 'Erreur d\'authentification',
      [this.errorCategories.PERMISSION]: 'Erreur de permission',
      [this.errorCategories.VALIDATION]: 'Données invalides',
      [this.errorCategories.SYSTEM]: 'Erreur système',
      [this.errorCategories.UNKNOWN]: 'Erreur inattendue'
    };

    return messages[category] || 'Une erreur s\'est produite';
  }

  /**
   * Get technical details for debugging
   */
  getTechnicalDetails(error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      errno: error.errno
    };
  }

  /**
   * Log error with appropriate level
   */
  logError(errorInfo) {
    const logLevel = this.getLogLevel(errorInfo.severity);
    const logMessage = this.formatLogMessage(errorInfo);
    
    console[logLevel](logMessage);
    
    // In a real application, you might want to send to a logging service
    // this.sendToLoggingService(errorInfo);
  }

  /**
   * Get appropriate log level for severity
   */
  getLogLevel(severity) {
    const levels = {
      [this.severityLevels.LOW]: 'warn',
      [this.severityLevels.MEDIUM]: 'error',
      [this.severityLevels.HIGH]: 'error',
      [this.severityLevels.CRITICAL]: 'error'
    };
    return levels[severity] || 'error';
  }

  /**
   * Format log message
   */
  formatLogMessage(errorInfo) {
    return `[${errorInfo.category.toUpperCase()}] ${errorInfo.userFriendly} - ${errorInfo.message}`;
  }

  /**
   * Add error to history
   */
  addToHistory(errorInfo) {
    this.errorHistory.push({
      id: errorInfo.id,
      category: errorInfo.category,
      severity: errorInfo.severity,
      timestamp: errorInfo.timestamp,
      message: errorInfo.message
    });

    // Keep history size manageable
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  /**
   * Detect error patterns in history
   */
  detectErrorPatterns() {
    const patterns = [];
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Check for repeated errors in the last hour
    const recentErrors = this.errorHistory.filter(
      error => new Date(error.timestamp) > oneHourAgo
    );

    // Group by category and severity
    const grouped = this.groupErrors(recentErrors);
    
    for (const [key, errors] of Object.entries(grouped)) {
      if (errors.length >= 3) {
        patterns.push({
          type: 'repeated',
          category: key,
          count: errors.length,
          timeFrame: '1 hour',
          severity: this.getHighestSeverity(errors)
        });
      }
    }

    // Check for critical errors
    const criticalErrors = this.errorHistory.filter(
      error => error.severity === this.severityLevels.CRITICAL &&
               new Date(error.timestamp) > oneDayAgo
    );

    if (criticalErrors.length > 0) {
      patterns.push({
        type: 'critical',
        count: criticalErrors.length,
        timeFrame: '24 hours',
        severity: this.severityLevels.CRITICAL
      });
    }

    return patterns;
  }

  /**
   * Group errors by category and severity
   */
  groupErrors(errors) {
    const grouped = {};
    
    for (const error of errors) {
      const key = `${error.category}:${error.severity}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(error);
    }
    
    return grouped;
  }

  /**
   * Get highest severity from error list
   */
  getHighestSeverity(errors) {
    const severityOrder = [
      this.severityLevels.LOW,
      this.severityLevels.MEDIUM,
      this.severityLevels.HIGH,
      this.severityLevels.CRITICAL
    ];

    let highest = this.severityLevels.LOW;
    
    for (const error of errors) {
      const currentIndex = severityOrder.indexOf(error.severity);
      const highestIndex = severityOrder.indexOf(highest);
      
      if (currentIndex > highestIndex) {
        highest = error.severity;
      }
    }
    
    return highest;
  }

  /**
   * Get recovery suggestions based on error and patterns
   */
  getRecoverySuggestions(errorInfo, patterns) {
    const suggestions = [];
    const strategies = this.recoveryStrategies[errorInfo.severity] || [];

    for (const strategy of strategies) {
      const suggestion = this.getStrategySuggestion(strategy, errorInfo, patterns);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }

    return suggestions;
  }

  /**
   * Get suggestion for specific recovery strategy
   */
  getStrategySuggestion(strategy, errorInfo, patterns) {
    const suggestions = {
      retry: {
        action: 'Réessayer',
        description: 'L\'erreur peut être temporaire, réessayez l\'opération',
        priority: 1
      },
      validate: {
        action: 'Valider les données',
        description: 'Vérifiez que toutes les informations sont correctes',
        priority: 2
      },
      check_network: {
        action: 'Vérifier la connexion',
        description: 'Assurez-vous que votre connexion internet fonctionne',
        priority: 3
      },
      check_permissions: {
        action: 'Vérifier les permissions',
        description: 'Vérifiez que l\'application a les permissions nécessaires',
        priority: 4
      },
      restart: {
        action: 'Redémarrer l\'application',
        description: 'Fermez et rouvrez l\'application',
        priority: 5
      },
      check_system: {
        action: 'Vérifier le système',
        description: 'Vérifiez l\'espace disque et la mémoire disponible',
        priority: 6
      },
      contact_support: {
        action: 'Contacter le support',
        description: 'Si le problème persiste, contactez le support technique',
        priority: 7
      }
    };

    return suggestions[strategy];
  }

  /**
   * Generate unique error ID
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get error statistics
   */
  getErrorStats(timeFrame = '24h') {
    const now = new Date();
    let cutoff;

    switch (timeFrame) {
      case '1h':
        cutoff = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const filteredErrors = this.errorHistory.filter(
      error => new Date(error.timestamp) > cutoff
    );

    const stats = {
      total: filteredErrors.length,
      byCategory: {},
      bySeverity: {},
      mostCommon: this.getMostCommonErrors(filteredErrors)
    };

    // Count by category
    for (const error of filteredErrors) {
      stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1;
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
    }

    return stats;
  }

  /**
   * Get most common errors
   */
  getMostCommonErrors(errors) {
    const messageCount = {};
    
    for (const error of errors) {
      messageCount[error.message] = (messageCount[error.message] || 0) + 1;
    }

    return Object.entries(messageCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([message, count]) => ({ message, count }));
  }

  /**
   * Clear error history
   */
  clearHistory() {
    this.errorHistory = [];
  }
}

export default new ErrorHandlingService(); 