/**
 * Focus management utilities to prevent focus issues
 */

// Track the last focused element before window blur
let lastFocusedElement = null;

/**
 * Initialize focus management
 */
export const initializeFocusManagement = () => {
  // Store the currently focused element when window loses focus
  window.addEventListener('blur', () => {
    lastFocusedElement = document.activeElement;
  });

  // Restore focus only when window regains focus from outside the app
  window.addEventListener('focus', () => {
    const wasOutsideApp = !lastFocusedElement || 
                         !lastFocusedElement.closest('.app-container') ||
                         lastFocusedElement === document.body;
    
    if (wasOutsideApp) {
      // Find the first focusable element in the app
      const firstFocusable = document.querySelector('.app-container input, .app-container button, .app-container select, .app-container textarea');
      if (firstFocusable) {
        setTimeout(() => {
          firstFocusable.focus();
        }, 50);
      }
    }
  });
};

/**
 * Check if an element is focusable
 */
export const isFocusable = (element) => {
  if (!element) return false;
  
  const tagName = element.tagName.toLowerCase();
  const type = element.type?.toLowerCase();
  
  // Input elements
  if (tagName === 'input') {
    return type !== 'hidden';
  }
  
  // Other focusable elements
  if (['button', 'select', 'textarea', 'a'].includes(tagName)) {
    return true;
  }
  
  // Contenteditable elements
  if (element.contentEditable === 'true') {
    return true;
  }
  
  // Elements with tabindex
  if (element.hasAttribute('tabindex') && element.tabIndex >= 0) {
    return true;
  }
  
  return false;
};

/**
 * Safely focus an element with error handling
 */
export const safeFocus = (element, delay = 0) => {
  if (!element) return;
  
  setTimeout(() => {
    try {
      if (isFocusable(element) && document.activeElement !== element) {
        element.focus();
        console.log('[FOCUS] Successfully focused element:', element.tagName, element.name || element.id);
      }
    } catch (error) {
      console.warn('[FOCUS] Failed to focus element:', error);
    }
  }, delay);
};

/**
 * Prevent focus issues in input fields
 */
export const preventFocusIssues = (inputElement) => {
  if (!inputElement) return;
  
  // Prevent any parent elements from stealing focus
  const preventFocusStealing = (e) => {
    if (e.target === inputElement) {
      e.stopPropagation();
    }
  };
  
  inputElement.addEventListener('focus', preventFocusStealing, true);
  inputElement.addEventListener('blur', preventFocusStealing, true);
  
  // Return cleanup function
  return () => {
    inputElement.removeEventListener('focus', preventFocusStealing, true);
    inputElement.removeEventListener('blur', preventFocusStealing, true);
  };
};

/**
 * Check if user clicked outside the app window
 */
export const wasClickedOutsideApp = () => {
  return !lastFocusedElement || 
         !lastFocusedElement.closest('.app-container') ||
         lastFocusedElement === document.body;
};

/**
 * Get the last focused element
 */
export const getLastFocusedElement = () => {
  return lastFocusedElement;
};

/**
 * Set the last focused element
 */
export const setLastFocusedElement = (element) => {
  lastFocusedElement = element;
};

/**
 * Enable all form inputs and restore focus to a specific element
 * This is specifically for fixing the PatientPanel focus issue
 */
export const enableFormInputsAndFocus = (targetElement = null, delay = 100) => {
  setTimeout(() => {
    try {
      // Enable all form inputs
      const inputs = document.querySelectorAll('input, textarea, select');
      inputs.forEach(input => {
        if (input.hasAttribute('disabled')) {
          input.removeAttribute('disabled');
        }
      });
      
      // Focus on target element if provided
      if (targetElement && isFocusable(targetElement)) {
        targetElement.focus();
        console.log('[FOCUS] Form inputs enabled and focused on:', targetElement.tagName, targetElement.name || targetElement.id);
      }
    } catch (error) {
      console.warn('[FOCUS] Failed to enable form inputs and focus:', error);
    }
  }, delay);
};

/**
 * Force enable all form inputs in the current page with enhanced Electron support
 */
export const forceEnableFormInputs = () => {
  try {
    const inputs = document.querySelectorAll('input, textarea, select, button');
    let enabledCount = 0;
    
    inputs.forEach(input => {
      // Remove disabled attribute
      if (input.hasAttribute('disabled')) {
        input.removeAttribute('disabled');
        enabledCount++;
      }
      
      // Remove readonly attribute that might be blocking inputs
      if (input.hasAttribute('readonly')) {
        input.removeAttribute('readonly');
      }
      
      // Ensure input is not blocked by CSS pointer-events
      if (input.style.pointerEvents === 'none') {
        input.style.pointerEvents = 'auto';
      }
      
      // Reset tabindex if it was set to -1
      if (input.tabIndex === -1) {
        input.tabIndex = 0;
      }
    });
    
    // Force a reflow to ensure changes are applied
    document.body.offsetHeight;
    
    console.log('[FOCUS] Force enabled', enabledCount, 'form inputs with enhanced Electron support');
    return enabledCount;
  } catch (error) {
    console.warn('[FOCUS] Failed to force enable form inputs:', error);
    return 0;
  }
};

/**
 * Force enable form inputs only on the current page/component
 * This is a more targeted approach that doesn't affect other pages
 */
export const forceEnableCurrentPageInputs = () => {
  try {
    // Only target inputs within the main content area
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) {
      console.warn('[FOCUS] No main-content found, falling back to global approach');
      return forceEnableFormInputs();
    }
    
    const inputs = mainContent.querySelectorAll('input, textarea, select, button');
    let enabledCount = 0;
    
    inputs.forEach(input => {
      // Remove disabled attribute
      if (input.hasAttribute('disabled')) {
        input.removeAttribute('disabled');
        enabledCount++;
      }
      
      // Remove readonly attribute that might be blocking inputs
      if (input.hasAttribute('readonly')) {
        input.removeAttribute('readonly');
      }
      
      // Ensure input is not blocked by CSS pointer-events
      if (input.style.pointerEvents === 'none') {
        input.style.pointerEvents = 'auto';
      }
      
      // Reset tabindex if it was set to -1
      if (input.tabIndex === -1) {
        input.tabIndex = 0;
      }
    });
    
    // Force a reflow to ensure changes are applied
    mainContent.offsetHeight;
    
    console.log('[FOCUS] Force enabled', enabledCount, 'form inputs on current page');
    return enabledCount;
  } catch (error) {
    console.warn('[FOCUS] Failed to force enable current page inputs:', error);
    return 0;
  }
};

/**
 * Comprehensive fix for Electron input locking after delete/cancel operations
 * This function addresses the specific issue where inputs become locked after
 * patient deletion or appointment cancellation
 */
export const fixElectronInputLocking = (targetSelector = null, delay = 100) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        console.log('[FOCUS] Starting comprehensive Electron input locking fix...');
        
        // Step 1: Force enable all form inputs with enhanced checks
        forceEnableFormInputs();
        
        // Step 2: Remove any overlay or modal backdrop that might be blocking inputs
        const overlays = document.querySelectorAll('.modal-backdrop, .overlay, .loading-overlay');
        overlays.forEach(overlay => {
          if (overlay.style.display !== 'none') {
            overlay.style.display = 'none';
          }
        });
        
        // Step 3: Ensure body and document are focusable
        document.body.style.pointerEvents = 'auto';
        document.documentElement.style.pointerEvents = 'auto';
        
        // Step 4: Clear any pending focus timeouts that might interfere
        if (window.focusTimeout) {
          clearTimeout(window.focusTimeout);
        }
        
        // Step 5: Force a DOM reflow to ensure all changes are applied
        document.body.offsetHeight;
        
        // Step 6: Restore focus to appropriate element
        let targetElement = null;
        
        if (targetSelector) {
          targetElement = document.querySelector(targetSelector);
        }
        
        if (!targetElement) {
          // Try common search inputs first
          const searchSelectors = [
            'input[placeholder*="Rechercher"]',
            'input[placeholder*="Nom, téléphone"]',
            'input[placeholder*="search"]',
            'input[type="search"]'
          ];
          
          for (const selector of searchSelectors) {
            targetElement = document.querySelector(selector);
            if (targetElement) break;
          }
        }
        
        if (!targetElement) {
          // Fallback to first visible, enabled input
          const inputs = document.querySelectorAll('input, textarea, select');
          for (const input of inputs) {
            if (input.offsetParent !== null && !input.disabled && !input.readOnly) {
              targetElement = input;
              break;
            }
          }
        }
        
        // Step 7: Focus the target element with multiple attempts
        if (targetElement) {
          // First attempt - immediate
          try {
            targetElement.focus();
            console.log('[FOCUS] Successfully focused target element:', targetElement.tagName, targetElement.placeholder || targetElement.name || targetElement.id);
          } catch (error) {
            console.warn('[FOCUS] First focus attempt failed:', error);
          }
          
          // Second attempt - with slight delay
          setTimeout(() => {
            try {
              if (document.activeElement !== targetElement) {
                targetElement.focus();
                console.log('[FOCUS] Second focus attempt successful');
              }
            } catch (error) {
              console.warn('[FOCUS] Second focus attempt failed:', error);
            }
          }, 50);
          
          // Third attempt - with longer delay as final fallback
          setTimeout(() => {
            try {
              if (document.activeElement !== targetElement) {
                targetElement.focus();
                targetElement.click(); // Sometimes click helps in Electron
                console.log('[FOCUS] Final focus attempt with click');
              }
            } catch (error) {
              console.warn('[FOCUS] Final focus attempt failed:', error);
            }
            
            // Resolve after all focus attempts are completed
            setTimeout(() => {
              resolve(true);
            }, 100);
          }, 150);
        } else {
          console.log('[FOCUS] No suitable target element found for focus');
          
          // Resolve after all focus attempts are completed
          setTimeout(() => {
            resolve(false);
          }, 250);
        }
        
        // Remove the Electron-specific workaround that causes window refresh
        // This was causing the window to blur and focus, which creates a refresh effect
        // The input enabling and focusing should be sufficient without this
        
        console.log('[FOCUS] Comprehensive Electron input locking fix completed');
        
      } catch (error) {
        console.error('[FOCUS] Error in comprehensive input locking fix:', error);
        resolve(false);
      }
    }, delay);
  });
};

/**
 * Specific fix for navigation from dashboard to PatientPanel
 * This function addresses the issue where inputs are locked after navigating
 * from the dashboard's upcoming appointments card
 */
export const fixDashboardNavigationInputLocking = (delay = 150) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        console.log('[FOCUS] Starting dashboard navigation input locking fix...');
        
        // Step 1: Force enable all form inputs on current page only
        forceEnableCurrentPageInputs();
        
        // Step 2: Remove any modal backdrops that might be blocking inputs
        const backdrops = document.querySelectorAll('.modal-backdrop, .overlay');
        backdrops.forEach(backdrop => {
          if (backdrop.style.display !== 'none') {
            backdrop.style.display = 'none';
          }
        });
        
        // Step 3: Ensure the window is properly focused
        if (window.electronAPI && typeof window.electronAPI.focusWindow === 'function') {
          window.electronAPI.focusWindow();
        }
        
        // Step 4: Force a DOM reflow
        document.body.offsetHeight;
        
        // Step 5: Find and focus the name input specifically
        const nameInput = document.querySelector('input[name="name"]');
        if (nameInput) {
          try {
            nameInput.focus();
            console.log('[FOCUS] Successfully focused name input after dashboard navigation');
          } catch (error) {
            console.warn('[FOCUS] Failed to focus name input:', error);
          }
        }
        
        // Step 6: Additional focus attempt with click
        setTimeout(() => {
          if (nameInput && document.activeElement !== nameInput) {
            try {
              nameInput.click();
              nameInput.focus();
              console.log('[FOCUS] Additional focus attempt with click');
            } catch (error) {
              console.warn('[FOCUS] Additional focus attempt failed:', error);
            }
          }
          
          resolve(true);
        }, 100);
        
        console.log('[FOCUS] Dashboard navigation input locking fix completed');
        
      } catch (error) {
        console.error('[FOCUS] Error in dashboard navigation input locking fix:', error);
        resolve(false);
      }
    }, delay);
  });
};

/**
 * Diagnostic function to identify what's blocking input fields across the app
 * This will help us understand why inputs are being disabled globally
 */
export const diagnoseInputBlocking = () => {
  console.log('[DIAGNOSTIC] Starting input blocking diagnosis...');
  
  // Check all input fields in the app - search more comprehensively
  const allInputs = document.querySelectorAll('input, textarea, select');
  const allButtons = document.querySelectorAll('button');
  const allFormElements = document.querySelectorAll('form');
  
  console.log('[DIAGNOSTIC] DOM Analysis:');
  console.log(`- Total input elements: ${allInputs.length}`);
  console.log(`- Total button elements: ${allButtons.length}`);
  console.log(`- Total form elements: ${allFormElements.length}`);
  
  // Check what's actually in the main content area
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    const mainInputs = mainContent.querySelectorAll('input, textarea, select');
    const mainButtons = mainContent.querySelectorAll('button');
    console.log(`- Inputs in .main-content: ${mainInputs.length}`);
    console.log(`- Buttons in .main-content: ${mainButtons.length}`);
    
    // Log the actual content of main-content
    console.log('[DIAGNOSTIC] Main content HTML structure:');
    console.log(mainContent.innerHTML.substring(0, 500) + '...');
  } else {
    console.log('[DIAGNOSTIC] No .main-content found!');
  }
  
  // Check the entire document body
  const bodyInputs = document.body.querySelectorAll('input, textarea, select');
  console.log(`- Inputs in entire document: ${bodyInputs.length}`);
  
  // Check if we're on a specific page
  const currentPage = document.querySelector('h1, h2, h3')?.textContent || 'Unknown page';
  console.log(`[DIAGNOSTIC] Current page: ${currentPage}`);
  
  const disabledInputs = [];
  const blockedInputs = [];
  
  allInputs.forEach((input, index) => {
    const computedStyle = window.getComputedStyle(input);
    const rect = input.getBoundingClientRect();
    
    // Check for disabled attribute
    if (input.disabled) {
      disabledInputs.push({
        element: input,
        reason: 'disabled attribute',
        index,
        tagName: input.tagName,
        name: input.name || input.id || `input-${index}`,
        page: input.closest('.main-content')?.querySelector('h1, h2, h3')?.textContent || 'Unknown page',
        placeholder: input.placeholder || 'No placeholder',
        type: input.type || 'unknown',
        visible: rect.width > 0 && rect.height > 0,
        position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      });
    }
    
    // Check for CSS blocking
    if (computedStyle.pointerEvents === 'none') {
      blockedInputs.push({
        element: input,
        reason: 'pointer-events: none',
        index,
        tagName: input.tagName,
        name: input.name || input.id || `input-${index}`,
        page: input.closest('.main-content')?.querySelector('h1, h2, h3')?.textContent || 'Unknown page',
        visible: rect.width > 0 && rect.height > 0,
        position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      });
    }
    
    // Check for visibility issues
    if (computedStyle.visibility === 'hidden' || computedStyle.display === 'none') {
      blockedInputs.push({
        element: input,
        reason: 'visibility/display issue',
        index,
        tagName: input.tagName,
        name: input.name || input.id || `input-${index}`,
        page: input.closest('.main-content')?.querySelector('h1, h2, h3')?.textContent || 'Unknown page',
        visible: rect.width > 0 && rect.height > 0,
        position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      });
    }
    
    // Check for positioning issues
    if (rect.width === 0 || rect.height === 0) {
      blockedInputs.push({
        element: input,
        reason: 'zero dimensions',
        index,
        tagName: input.tagName,
        name: input.name || input.id || `input-${index}`,
        page: input.closest('.main-content')?.querySelector('h1, h2, h3')?.textContent || 'Unknown page',
        visible: false,
        position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      });
    }
  });
  
  // Check for overlays or modals that might be blocking
  const overlays = document.querySelectorAll('.modal-backdrop, .overlay, .loading-overlay, [style*="position: fixed"]');
  const blockingOverlays = [];
  
  overlays.forEach(overlay => {
    const computedStyle = window.getComputedStyle(overlay);
    if (computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden') {
      blockingOverlays.push({
        element: overlay,
        zIndex: computedStyle.zIndex,
        position: computedStyle.position,
        display: computedStyle.display
      });
    }
  });
  
  // Check for global loading states
  const loadingElements = document.querySelectorAll('[class*="loading"], [style*="loading"]');
  const globalLoadingStates = [];
  
  loadingElements.forEach(element => {
    globalLoadingStates.push({
      element: element,
      className: element.className,
      style: element.style.cssText
    });
  });
  
  // Check for React loading states in the DOM
  const reactLoadingElements = document.querySelectorAll('[style*="opacity: 0.6"], [style*="cursor: not-allowed"]');
  const reactLoadingStates = [];
  
  reactLoadingElements.forEach(element => {
    reactLoadingStates.push({
      element: element,
      style: element.style.cssText
    });
  });
  
  console.log('[DIAGNOSTIC] Results:');
  console.log(`- Total inputs: ${allInputs.length}`);
  console.log(`- Disabled inputs: ${disabledInputs.length}`);
  console.log(`- Blocked inputs: ${blockedInputs.length}`);
  console.log(`- Blocking overlays: ${blockingOverlays.length}`);
  console.log(`- Global loading states: ${globalLoadingStates.length}`);
  console.log(`- React loading states: ${reactLoadingStates.length}`);
  
  if (disabledInputs.length > 0) {
    console.log('[DIAGNOSTIC] Disabled inputs:', disabledInputs);
  }
  
  if (blockedInputs.length > 0) {
    console.log('[DIAGNOSTIC] Blocked inputs:', blockedInputs);
  }
  
  if (blockingOverlays.length > 0) {
    console.log('[DIAGNOSTIC] Blocking overlays:', blockingOverlays);
  }
  
  if (globalLoadingStates.length > 0) {
    console.log('[DIAGNOSTIC] Global loading states:', globalLoadingStates);
  }
  
  if (reactLoadingStates.length > 0) {
    console.log('[DIAGNOSTIC] React loading states:', reactLoadingStates);
  }
  
  return {
    totalInputs: allInputs.length,
    disabledInputs,
    blockedInputs,
    blockingOverlays,
    globalLoadingStates,
    reactLoadingStates
  };
};

/**
 * Remove blocking overlays that might be preventing input interaction
 * This function specifically targets modals and overlays with high z-index
 */
export const removeBlockingOverlays = () => {
  try {
    console.log('[FOCUS] Removing blocking overlays...');
    
    // Find all potential blocking overlays
    const overlays = document.querySelectorAll('.modal-backdrop, .overlay, .loading-overlay, [style*="position: fixed"]');
    let removedCount = 0;
    
    overlays.forEach(overlay => {
      const computedStyle = window.getComputedStyle(overlay);
      const zIndex = parseInt(computedStyle.zIndex) || 0;
      
      // Remove overlays with high z-index that might be blocking
      if (zIndex >= 1000 && computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden') {
        try {
          overlay.style.display = 'none';
          overlay.style.visibility = 'hidden';
          overlay.style.pointerEvents = 'none';
          removedCount++;
          console.log('[FOCUS] Removed blocking overlay:', overlay.tagName, 'z-index:', zIndex);
        } catch (error) {
          console.warn('[FOCUS] Failed to remove overlay:', error);
        }
      }
    });
    
    // Also check for any modals that might be stuck open
    const modals = document.querySelectorAll('[style*="z-index: 10000"], [style*="z-index: 9999"]');
    modals.forEach(modal => {
      const computedStyle = window.getComputedStyle(modal);
      if (computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden') {
        try {
          modal.style.display = 'none';
          modal.style.visibility = 'hidden';
          modal.style.pointerEvents = 'none';
          removedCount++;
          console.log('[FOCUS] Removed stuck modal:', modal.tagName);
        } catch (error) {
          console.warn('[FOCUS] Failed to remove modal:', error);
        }
      }
    });
    
    console.log('[FOCUS] Removed', removedCount, 'blocking overlays/modals');
    return removedCount;
  } catch (error) {
    console.error('[FOCUS] Error removing blocking overlays:', error);
    return 0;
  }
};

/**
 * Force Electron window to regain focus and restore input functionality
 * This fixes the issue where inputs become "locked" until clicking outside and back
 */
export const forceElectronWindowFocus = () => {
  try {
    console.log('[FOCUS] Forcing Electron window focus...');
    
    // Method 1: Force focus on the main content area
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.focus();
      console.log('[FOCUS] Focused main-content area');
    }
    
    // Method 2: Force focus on the first input
    const firstInput = document.querySelector('input, textarea, select');
    if (firstInput) {
      firstInput.focus();
      console.log('[FOCUS] Focused first input:', firstInput.tagName, firstInput.name || firstInput.id);
    }
    
    // Method 3: Trigger window focus event
    window.dispatchEvent(new Event('focus'));
    console.log('[FOCUS] Dispatched window focus event');
    
    // Method 4: Force a reflow to refresh the DOM
    document.body.offsetHeight;
    console.log('[FOCUS] Forced DOM reflow');
    
    // Method 5: Simulate a click on the document to restore focus
    document.body.click();
    console.log('[FOCUS] Simulated document body click');
    
    // Method 6: Force all inputs to be interactive
    const allInputs = document.querySelectorAll('input, textarea, select');
    allInputs.forEach(input => {
      // Remove any pointer-events: none
      input.style.pointerEvents = 'auto';
      // Ensure tabindex is set
      if (!input.hasAttribute('tabindex')) {
        input.setAttribute('tabindex', '0');
      }
    });
    console.log('[FOCUS] Forced all inputs to be interactive');
    
    return true;
  } catch (error) {
    console.error('[FOCUS] Error forcing Electron window focus:', error);
    return false;
  }
};

/**
 * Centralized notification sound management to prevent duplicates
 */
class NotificationSoundManager {
  constructor() {
    this.playedSounds = new Set();
    this.isPlaying = false;
    this.audioQueue = [];
  }

  /**
   * Play notification sound with duplicate prevention
   * @param {string} soundType - 'expectpatient' or 'normal'
   * @param {string} notificationId - Unique ID to prevent duplicates
   * @returns {Promise<boolean>} - Whether sound was played
   */
  async playNotificationSound(soundType, notificationId = null) {
    try {
      // Check if notification sounds are enabled (handle boolean or string)
      const settings = await window.electronAPI.getSettings();
      const soundsEnabled = !!(settings && (settings.notification_sounds_enabled === true || settings.notification_sounds_enabled === 'true'));
      if (!soundsEnabled) {
        console.log('[SOUND] Notification sounds disabled in settings');
        return false;
      }

      // Check if sounds are globally disabled
      if (window.notificationSoundsDisabled) {
        console.log('[SOUND] Notification sounds globally disabled');
        return false;
      }

      // Check if chat panel is being opened
      if (window.isOpeningChatPanel) {
        console.log('[SOUND] Skipping sound - chat panel is being opened');
        return false;
      }

      // Prevent duplicate sounds for the same notification
      if (notificationId && this.playedSounds.has(notificationId)) {
        console.log('[SOUND] Skipping sound for notification', notificationId, '- already played');
        return false;
      }

      // Mark as played if ID provided
      if (notificationId) {
        this.playedSounds.add(notificationId);
      }

      // Determine sound file
      const soundFile = soundType === 'expectpatient' ? 'expectpatient.mp3' : 'normal.mp3';
      
      console.log('[SOUND] Playing', soundFile, 'for notification', notificationId || 'no-id');

      // Create and play audio
      const audio = new Audio(soundFile);
      
      // Add event listeners for debugging
      audio.addEventListener('loadstart', () => console.log('[SOUND] Audio loadstart event'));
      audio.addEventListener('canplay', () => console.log('[SOUND] Audio canplay event'));
      audio.addEventListener('play', () => console.log('[SOUND] Audio play event - sound should be playing now'));
      audio.addEventListener('error', (e) => console.error('[SOUND] Audio error:', e));
      audio.addEventListener('ended', () => {
        console.log('[SOUND] Audio ended event');
        this.isPlaying = false;
        this.playNextInQueue();
      });

      // If already playing, queue this sound
      if (this.isPlaying) {
        console.log('[SOUND] Already playing, queuing sound');
        this.audioQueue.push({ audio, soundFile, notificationId });
        return true;
      }

      this.isPlaying = true;
      await audio.play();
      return true;

    } catch (error) {
      console.error('[SOUND] Error playing notification sound:', error);
      this.isPlaying = false;
      return false;
    }
  }

  /**
   * Play next sound in queue
   */
  playNextInQueue() {
    if (this.audioQueue.length > 0) {
      const { audio, soundFile, notificationId } = this.audioQueue.shift();
      console.log('[SOUND] Playing queued sound:', soundFile, 'for notification', notificationId || 'no-id');
      this.isPlaying = true;
      audio.play().catch(error => {
        console.error('[SOUND] Error playing queued sound:', error);
        this.isPlaying = false;
        this.playNextInQueue();
      });
    }
  }

  /**
   * Clear played sounds tracking (useful for app restart)
   */
  clearPlayedSounds() {
    this.playedSounds.clear();
    console.log('[SOUND] Cleared played sounds tracking');
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isPlaying: this.isPlaying,
      queueLength: this.audioQueue.length,
      playedSoundsCount: this.playedSounds.size
    };
  }
}

// Create global instance
export const notificationSoundManager = new NotificationSoundManager();