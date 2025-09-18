import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Custom ScrollRestoration component that prevents auto-scrolling
 * This overrides React Router's default scroll behavior
 */
function ScrollRestoration() {
  const location = useLocation();

  useEffect(() => {
    // Disable scroll restoration completely
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    // Prevent any automatic scrolling on route changes
    const preventScroll = () => {
      // Store current scroll position
      const currentScrollY = window.scrollY;
      
      // Use requestAnimationFrame to restore position after React's render
      requestAnimationFrame(() => {
        if (window.scrollY !== currentScrollY) {
          window.scrollTo(0, currentScrollY);
        }
      });
    };

    // Apply prevention after a short delay to catch React Router's scroll
    const timeoutId = setTimeout(preventScroll, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [location]);

  // This component doesn't render anything
  return null;
}

export default ScrollRestoration; 