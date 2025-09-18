// Navigation Loading State Management Service
// This service helps prevent loading state issues during page navigation

class NavigationLoadingService {
  constructor() {
    this.isNavigating = false;
    this.navigationTimeout = null;
    this.pageLoadStates = new Map();
    this.listeners = new Set();
  }

  // Start navigation loading state
  startNavigation() {
    this.isNavigating = true;
    this.notifyListeners('navigation-start');
    
    // Clear any existing timeout
    if (this.navigationTimeout) {
      clearTimeout(this.navigationTimeout);
    }
    
    // Set a safety timeout to reset navigation state
    this.navigationTimeout = setTimeout(() => {
      this.endNavigation();
    }, 10000); // 10 second safety timeout
  }

  // End navigation loading state
  endNavigation() {
    this.isNavigating = false;
    if (this.navigationTimeout) {
      clearTimeout(this.navigationTimeout);
      this.navigationTimeout = null;
    }
    this.notifyListeners('navigation-end');
  }

  // Set loading state for a specific page
  setPageLoadingState(pagePath, isLoading) {
    this.pageLoadStates.set(pagePath, isLoading);
    this.notifyListeners('page-loading-change', { pagePath, isLoading });
  }

  // Get loading state for a specific page
  getPageLoadingState(pagePath) {
    return this.pageLoadStates.get(pagePath) || false;
  }

  // Clear loading state for a specific page
  clearPageLoadingState(pagePath) {
    this.pageLoadStates.delete(pagePath);
    this.notifyListeners('page-loading-clear', { pagePath });
  }

  // Reset all loading states (useful for error recovery)
  resetAllLoadingStates() {
    this.pageLoadStates.clear();
    this.isNavigating = false;
    if (this.navigationTimeout) {
      clearTimeout(this.navigationTimeout);
      this.navigationTimeout = null;
    }
    this.notifyListeners('reset-all');
  }

  // Check if any page is currently loading
  isAnyPageLoading() {
    return Array.from(this.pageLoadStates.values()).some(isLoading => isLoading);
  }

  // Add listener for loading state changes
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // Notify all listeners
  notifyListeners(event, data = null) {
    this.listeners.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Error in navigation loading listener:', error);
      }
    });
  }

  // Force reset loading states for stuck pages
  forceResetStuckStates() {
    console.log('[DEBUG] NavigationLoadingService: Force resetting stuck loading states');
    this.resetAllLoadingStates();
    
    // Dispatch custom event to notify components
    window.dispatchEvent(new CustomEvent('forceResetLoadingStates'));
  }

  // Get current navigation state
  getNavigationState() {
    return {
      isNavigating: this.isNavigating,
      pageLoadStates: Object.fromEntries(this.pageLoadStates),
      hasStuckStates: this.isAnyPageLoading()
    };
  }
}

// Create singleton instance
const navigationLoadingService = new NavigationLoadingService();

// Make it available globally for debugging and manual reset
if (typeof window !== 'undefined') {
  window.navigationLoadingService = navigationLoadingService;
}

// Auto-reset stuck states after 30 seconds
setInterval(() => {
  if (navigationLoadingService.isAnyPageLoading()) {
    console.log('[DEBUG] NavigationLoadingService: Detected potentially stuck loading states');
    // Only force reset if states have been stuck for a while
    setTimeout(() => {
      if (navigationLoadingService.isAnyPageLoading()) {
        navigationLoadingService.forceResetStuckStates();
      }
    }, 5000); // Wait 5 more seconds before forcing reset
  }
}, 30000);

export default navigationLoadingService; 