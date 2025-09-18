import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import navigationLoadingService from '../services/navigationLoadingService';

/**
 * Custom hook to manage page loading states and prevent loading state issues
 * during navigation
 */
export const usePageLoading = (initialLoading = false) => {
  const [loading, setLoading] = useState(initialLoading);
  const [pageLoading, setPageLoading] = useState(false);
  const location = useLocation();
  const currentPath = location.pathname;
  const loadingTimeoutRef = useRef(null);
  const mountedRef = useRef(true);

  // Reset loading state when component mounts
  useEffect(() => {
    mountedRef.current = true;
    setLoading(false);
    setPageLoading(false);
    
    // Clear any existing timeouts
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }

    // Register this page with the navigation service
    navigationLoadingService.setPageLoadingState(currentPath, false);

    return () => {
      mountedRef.current = false;
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      // Clear page loading state when component unmounts
      navigationLoadingService.clearPageLoadingState(currentPath);
    };
  }, [currentPath]);

  // Listen for force reset events
  useEffect(() => {
    const handleForceReset = () => {
      if (mountedRef.current) {
        setLoading(false);
        setPageLoading(false);
        navigationLoadingService.setPageLoadingState(currentPath, false);
      }
    };

    window.addEventListener('forceResetLoadingStates', handleForceReset);
    return () => {
      window.removeEventListener('forceResetLoadingStates', handleForceReset);
    };
  }, [currentPath]);

  // Safety timeout to prevent stuck loading states
  useEffect(() => {
    if (loading || pageLoading) {
      loadingTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          console.log('[DEBUG] usePageLoading: Safety timeout triggered for', currentPath);
          setLoading(false);
          setPageLoading(false);
          navigationLoadingService.setPageLoadingState(currentPath, false);
        }
      }, 10000); // 10 second safety timeout
    }

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [loading, pageLoading, currentPath]);

  // Update navigation service when loading state changes
  useEffect(() => {
    if (mountedRef.current) {
      navigationLoadingService.setPageLoadingState(currentPath, loading || pageLoading);
    }
  }, [loading, pageLoading, currentPath]);

  const setLoadingState = (isLoading) => {
    if (mountedRef.current) {
      setLoading(isLoading);
      if (!isLoading) {
        setPageLoading(false);
      }
    }
  };

  const setPageLoadingState = (isLoading) => {
    if (mountedRef.current) {
      setPageLoading(isLoading);
      if (!isLoading) {
        setLoading(false);
      }
    }
  };

  const resetLoadingStates = () => {
    if (mountedRef.current) {
      setLoading(false);
      setPageLoading(false);
      navigationLoadingService.setPageLoadingState(currentPath, false);
    }
  };

  return {
    loading,
    pageLoading,
    setLoading: setLoadingState,
    setPageLoading: setPageLoadingState,
    resetLoadingStates,
    isLoading: loading || pageLoading
  };
}; 