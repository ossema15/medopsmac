/**
 * Scroll Utilities
 * Handles scroll position preservation and prevents unwanted auto-scrolling
 */

// Store scroll positions for different pages
const scrollPositions = new Map();

// Flag to prevent unwanted scrolls
let isPreventingScroll = false;
let lastScrollPosition = 0;

/**
 * Save the current scroll position for a specific page
 */
export const saveScrollPosition = (pageKey) => {
  if (typeof window !== 'undefined') {
    scrollPositions.set(pageKey, window.scrollY);
  }
};

/**
 * Restore the scroll position for a specific page
 */
export const restoreScrollPosition = (pageKey) => {
  if (typeof window !== 'undefined') {
    const savedPosition = scrollPositions.get(pageKey);
    if (savedPosition !== undefined) {
      setTimeout(() => {
        window.scrollTo(0, savedPosition);
      }, 0);
    }
  }
};

/**
 * Clear saved scroll position for a page
 */
export const clearScrollPosition = (pageKey) => {
  scrollPositions.delete(pageKey);
};

/**
 * Smart scroll to element that doesn't interfere with user's current scroll position
 */
export const smartScrollToElement = (element, options = {}) => {
  if (!element || typeof window === 'undefined') return;

  const {
    behavior = 'smooth',
    block = 'nearest',
    inline = 'nearest',
    offset = 100,
    onlyIfNeeded = true
  } = options;

  // If onlyIfNeeded is true, check if we need to scroll
  if (onlyIfNeeded) {
    const rect = element.getBoundingClientRect();
    const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
    
    // If element is already visible, don't scroll
    if (isVisible) return;
    
    // If we're already at the bottom and element is below, don't scroll
    const isAtBottom = window.scrollY + window.innerHeight >= document.body.scrollHeight - offset;
    if (isAtBottom && rect.top > window.innerHeight) return;
  }

  // Use scrollIntoView with the specified options
  element.scrollIntoView({
    behavior,
    block,
    inline
  });
};

/**
 * Prevent auto-scroll on state changes
 */
export const preventAutoScroll = () => {
  if (typeof window !== 'undefined') {
    // Override the default scroll restoration
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    
    // Store current scroll position
    lastScrollPosition = window.scrollY;
    
    // Set flag to prevent unwanted scrolls
    isPreventingScroll = true;
    
    // Prevent scroll restoration on next tick
    setTimeout(() => {
      if (window.scrollY !== lastScrollPosition) {
        window.scrollTo(0, lastScrollPosition);
      }
      isPreventingScroll = false;
    }, 100);
    
    // Also prevent on next animation frame
    requestAnimationFrame(() => {
      if (window.scrollY !== lastScrollPosition) {
        window.scrollTo(0, lastScrollPosition);
      }
    });
    
    // Add scroll event listener to prevent unwanted scrolls
    const handleScroll = () => {
      if (isPreventingScroll) {
        window.scrollTo(0, lastScrollPosition);
      } else {
        lastScrollPosition = window.scrollY;
      }
    };
    
    window.addEventListener('scroll', handleScroll, { passive: false });
    
    // Return cleanup function
    return () => {
      window.removeEventListener('scroll', handleScroll);
      isPreventingScroll = false;
    };
  }
};

/**
 * Enable auto-scroll (restore default behavior)
 */
export const enableAutoScroll = () => {
  if (typeof window !== 'undefined') {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'auto';
    }
  }
};

/**
 * Scroll to top smoothly
 */
export const scrollToTop = (behavior = 'smooth') => {
  if (typeof window !== 'undefined') {
    window.scrollTo({
      top: 0,
      behavior
    });
  }
};

/**
 * Scroll to bottom smoothly
 */
export const scrollToBottom = (behavior = 'smooth') => {
  if (typeof window !== 'undefined') {
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior
    });
  }
};

/**
 * Check if element is in viewport
 */
export const isElementInViewport = (element) => {
  if (!element) return false;
  
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
};

/**
 * Get current scroll position
 */
export const getCurrentScrollPosition = () => {
  if (typeof window !== 'undefined') {
    return window.scrollY;
  }
  return 0;
};

/**
 * Check if user is at the bottom of the page
 */
export const isAtBottom = (offset = 100) => {
  if (typeof window !== 'undefined') {
    return window.scrollY + window.innerHeight >= document.body.scrollHeight - offset;
  }
  return false;
};

/**
 * Check if user is at the top of the page
 */
export const isAtTop = (offset = 100) => {
  if (typeof window !== 'undefined') {
    return window.scrollY <= offset;
  }
  return false;
}; 