/**
 * Enhanced Patient Matching Service
 * Provides robust patient matching algorithms with multiple fallback strategies
 */

class PatientMatchingService {
  constructor() {
    // Common name variations and abbreviations
    this.nameVariations = {
      'mohamed': ['mohammed', 'muhammad', 'mohamad', 'mohd', 'md'],
      'ahmed': ['ahmad', 'ahmed', 'ahmet'],
      'fatima': ['fatma', 'fatimah'],
      'ali': ['aly', 'alii'],
      'sara': ['sarah', 'sarra'],
      'maria': ['marya', 'maria'],
      'jose': ['josef', 'joseph', 'jose'],
      'carlos': ['karlos', 'carl'],
      'ana': ['anna', 'annah'],
      'lucia': ['lucy', 'lucie', 'lucia']
    };

    // Common phone number patterns
    this.phonePatterns = {
      'TN': /^(\+216|216)?[0-9]{8}$/, // Tunisia
      'FR': /^(\+33|33)?[0-9]{9}$/,   // France
      'US': /^(\+1|1)?[0-9]{10}$/     // United States
    };

    // Date format patterns
    this.datePatterns = {
      'YYYY-MM-DD': /^\d{4}-\d{2}-\d{2}$/,
      'DD/MM/YYYY': /^\d{2}\/\d{2}\/\d{4}$/,
      'MM/DD/YYYY': /^\d{2}\/\d{2}\/\d{4}$/,
      'DD-MM-YYYY': /^\d{2}-\d{2}-\d{4}$/
    };
  }

  /**
   * Normalize text for comparison (remove accents, special chars, etc.)
   */
  normalizeText(text) {
    if (!text) return '';
    
    return text.toLowerCase()
      .trim()
      // Remove accents
      .replace(/[éèêë]/g, 'e')
      .replace(/[àâä]/g, 'a')
      .replace(/[îï]/g, 'i')
      .replace(/[ôö]/g, 'o')
      .replace(/[ûüù]/g, 'u')
      .replace(/[ç]/g, 'c')
      .replace(/[ñ]/g, 'n')
      // Remove special characters but keep spaces
      .replace(/[^a-z0-9\s]/g, '')
      // Normalize spaces
      .replace(/\s+/g, ' ');
  }

  /**
   * Calculate similarity between two strings using Levenshtein distance
   */
  calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const normalized1 = this.normalizeText(str1);
    const normalized2 = this.normalizeText(str2);
    
    if (normalized1 === normalized2) return 1;
    
    const matrix = [];
    const len1 = normalized1.length;
    const len2 = normalized2.length;
    
    // Initialize matrix
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }
    
    // Fill matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = normalized1[i - 1] === normalized2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // deletion
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }
    
    const distance = matrix[len1][len2];
    const maxLength = Math.max(len1, len2);
    return maxLength === 0 ? 1 : (maxLength - distance) / maxLength;
  }

  /**
   * Check for name variations and abbreviations
   */
  checkNameVariations(name1, name2) {
    const normalized1 = this.normalizeText(name1);
    const normalized2 = this.normalizeText(name2);
    
    // Direct match
    if (normalized1 === normalized2) return true;
    
    // Check variations
    for (const [baseName, variations] of Object.entries(this.nameVariations)) {
      if (normalized1 === baseName && variations.includes(normalized2)) return true;
      if (normalized2 === baseName && variations.includes(normalized1)) return true;
    }
    
    // Check if one is contained in the other (for abbreviations)
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      const shorter = normalized1.length < normalized2.length ? normalized1 : normalized2;
      const longer = normalized1.length >= normalized2.length ? normalized1 : normalized2;
      return shorter.length >= 3 && longer.includes(shorter);
    }
    
    return false;
  }

  /**
   * Validate and normalize phone numbers
   */
  validatePhoneNumber(phone, country = 'TN') {
    if (!phone) return { isValid: false, normalized: null };
    
    // Remove all non-digit characters except +
    const cleaned = phone.replace(/[^\d+]/g, '');
    
    // Check patterns
    const pattern = this.phonePatterns[country];
    if (pattern && pattern.test(cleaned)) {
      return { isValid: true, normalized: cleaned };
    }
    
    // Try without country code
    const withoutCountry = cleaned.replace(/^(\+216|216|\+33|33|\+1|1)/, '');
    if (pattern && pattern.test(withoutCountry)) {
      return { isValid: true, normalized: withoutCountry };
    }
    
    return { isValid: false, normalized: null };
  }

  /**
   * Parse and validate date formats
   */
  parseDate(dateString) {
    if (!dateString) return { isValid: false, parsed: null, year: null };
    
    // Try different date formats
    const formats = [
      { pattern: this.datePatterns['YYYY-MM-DD'], parser: (str) => new Date(str) },
      { pattern: this.datePatterns['DD/MM/YYYY'], parser: (str) => {
        const [day, month, year] = str.split('/');
        return new Date(year, month - 1, day);
      }},
      { pattern: this.datePatterns['MM/DD/YYYY'], parser: (str) => {
        const [month, day, year] = str.split('/');
        return new Date(year, month - 1, day);
      }},
      { pattern: this.datePatterns['DD-MM-YYYY'], parser: (str) => {
        const [day, month, year] = str.split('-');
        return new Date(year, month - 1, day);
      }}
    ];
    
    for (const format of formats) {
      if (format.pattern.test(dateString)) {
        try {
          const parsed = format.parser(dateString);
          if (!isNaN(parsed.getTime())) {
            return {
              isValid: true,
              parsed: parsed,
              year: parsed.getFullYear().toString()
            };
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    return { isValid: false, parsed: null, year: null };
  }

  /**
   * Generate patient ID based on name and birth year
   */
  generatePatientId(name, birthYear) {
    if (!name || !birthYear) return null;
    
    const normalizedName = this.normalizeText(name)
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    
    return `patient_${birthYear}_${normalizedName}`;
  }

  /**
   * Enhanced patient matching with multiple strategies
   */
  matchPatient(searchCriteria, existingPatients, options = {}) {
    const {
      threshold = 0.8,
      usePhonetic = true,
      useVariations = true,
      strictMode = false
    } = options;

    const matches = [];
    const searchData = this.normalizeSearchCriteria(searchCriteria);

    for (const patient of existingPatients) {
      const matchScore = this.calculatePatientMatchScore(patient, searchData, {
        usePhonetic,
        useVariations,
        strictMode
      });

      if (matchScore.total >= threshold) {
        matches.push({
          patient,
          score: matchScore.total,
          details: matchScore
        });
      }
    }

    // Sort by score (highest first)
    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Normalize search criteria for consistent matching
   */
  normalizeSearchCriteria(criteria) {
    return {
      name: this.normalizeText(criteria.name || ''),
      phone: criteria.phone ? this.validatePhoneNumber(criteria.phone).normalized : null,
      email: this.normalizeText(criteria.email || ''),
      dateOfBirth: criteria.dateOfBirth ? this.parseDate(criteria.dateOfBirth) : null,
      id: this.normalizeText(criteria.id || '')
    };
  }

  /**
   * Calculate comprehensive match score for a patient
   */
  calculatePatientMatchScore(patient, searchData, options) {
    const scores = {
      name: 0,
      phone: 0,
      email: 0,
      dateOfBirth: 0,
      id: 0,
      total: 0
    };

    // Name matching (highest weight)
    if (searchData.name && patient.name) {
      const nameSimilarity = this.calculateSimilarity(searchData.name, patient.name);
      const nameVariation = options.useVariations && this.checkNameVariations(searchData.name, patient.name);
      
      scores.name = Math.max(nameSimilarity, nameVariation ? 0.9 : 0);
    }

    // Phone matching
    if (searchData.phone && patient.phone) {
      const patientPhone = this.validatePhoneNumber(patient.phone).normalized;
      scores.phone = searchData.phone === patientPhone ? 1 : 0;
    }

    // Email matching
    if (searchData.email && patient.email) {
      const emailSimilarity = this.calculateSimilarity(searchData.email, patient.email);
      scores.email = emailSimilarity;
    }

    // Date of birth matching
    if (searchData.dateOfBirth && patient.date_of_birth) {
      const patientDate = this.parseDate(patient.date_of_birth);
      if (searchData.dateOfBirth.year === patientDate.year) {
        scores.dateOfBirth = 1;
      }
    }

    // ID matching
    if (searchData.id && patient.id) {
      const idSimilarity = this.calculateSimilarity(searchData.id, patient.id);
      scores.id = idSimilarity;
    }

    // Calculate weighted total
    const weights = {
      name: 0.4,
      phone: 0.25,
      email: 0.15,
      dateOfBirth: 0.15,
      id: 0.05
    };

    scores.total = Object.keys(weights).reduce((total, key) => {
      return total + (scores[key] * weights[key]);
    }, 0);

    return scores;
  }

  /**
   * Detect potential duplicate patients
   */
  detectDuplicates(patients, threshold = 0.85) {
    const duplicates = [];
    const processed = new Set();

    for (let i = 0; i < patients.length; i++) {
      if (processed.has(i)) continue;

      const group = [patients[i]];
      processed.add(i);

      for (let j = i + 1; j < patients.length; j++) {
        if (processed.has(j)) continue;

        const matchScore = this.calculatePatientMatchScore(
          patients[j],
          this.normalizeSearchCriteria(patients[i]),
          { usePhonetic: true, useVariations: true }
        );

        if (matchScore.total >= threshold) {
          group.push(patients[j]);
          processed.add(j);
        }
      }

      if (group.length > 1) {
        duplicates.push({
          group,
          confidence: group.reduce((sum, patient, idx) => {
            if (idx === 0) return 0;
            const score = this.calculatePatientMatchScore(
              patient,
              this.normalizeSearchCriteria(group[0]),
              { usePhonetic: true, useVariations: true }
            );
            return sum + score.total;
          }, 0) / (group.length - 1)
        });
      }
    }

    return duplicates;
  }

  /**
   * Validate patient data integrity
   */
  validatePatientData(patient) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!patient.name || patient.name.trim().length < 2) {
      errors.push('Le nom du patient est requis et doit contenir au moins 2 caractères');
    }

    if (!patient.date_of_birth) {
      errors.push('La date de naissance est requise');
    } else {
      const dateValidation = this.parseDate(patient.date_of_birth);
      if (!dateValidation.isValid) {
        errors.push('Format de date de naissance invalide');
      } else {
        const age = new Date().getFullYear() - dateValidation.parsed.getFullYear();
        if (age < 0 || age > 120) {
          warnings.push('L\'âge calculé semble incorrect');
        }
      }
    }

    // Phone validation
    if (patient.phone) {
      const phoneValidation = this.validatePhoneNumber(patient.phone);
      if (!phoneValidation.isValid) {
        warnings.push('Format de numéro de téléphone invalide');
      }
    }

    // Email validation
    if (patient.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(patient.email)) {
        warnings.push('Format d\'email invalide');
      }
    }

    // ID validation
    if (patient.id) {
      const expectedId = this.generatePatientId(patient.name, 
        this.parseDate(patient.date_of_birth).year);
      if (patient.id !== expectedId) {
        warnings.push('L\'ID du patient ne correspond pas au format attendu');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Suggest corrections for patient data
   */
  suggestCorrections(patient, existingPatients) {
    const suggestions = {};

    // Name suggestions
    if (patient.name) {
      const nameMatches = this.matchPatient(
        { name: patient.name },
        existingPatients,
        { threshold: 0.7, useVariations: true }
      );
      
      if (nameMatches.length > 0) {
        suggestions.name = nameMatches.slice(0, 3).map(match => ({
          value: match.patient.name,
          confidence: match.score,
          reason: 'Nom similaire trouvé dans la base de données'
        }));
      }
    }

    // Phone suggestions
    if (patient.phone) {
      const phoneValidation = this.validatePhoneNumber(patient.phone);
      if (!phoneValidation.isValid) {
        // Try to fix common phone number issues
        const cleaned = patient.phone.replace(/[^\d+]/g, '');
        if (cleaned.length === 8 && !cleaned.startsWith('+')) {
          suggestions.phone = [{
            value: `+216${cleaned}`,
            confidence: 0.8,
            reason: 'Ajout du préfixe tunisien'
          }];
        }
      }
    }

    return suggestions;
  }
}

export default new PatientMatchingService(); 