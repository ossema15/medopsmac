import React, { useState, useEffect, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { preventAutoScroll } from './utils/scrollUtils';
import { initializeFocusManagement } from './utils/focusUtils';
import ScrollRestoration from './components/ScrollRestoration';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import PatientPanel from './pages/PatientPanel';
import AllPatients from './pages/AllPatients';
import Queue from './pages/Queue';
import Appointments from './pages/Appointments';
import Settings from './pages/Settings';
import FirstRun from './pages/FirstRun';
import Login from './pages/Login';
import MessagePanel from './components/MessagePanel';
import ChatIcon from './components/ChatIcon';

import Notification from './components/Notification';
import ErrorBoundary from './components/ErrorBoundary';
import Notifications from './pages/Notifications';
import MedOpsTextEffect from './components/MedOpsTextEffect';
import googleDriveService from './services/googleDriveService';
import appointmentNotificationService from './services/appointmentNotificationService';
import { notificationSoundManager } from './utils/focusUtils';
import { ConfirmProvider } from './context/ConfirmContext';

// Generate or retrieve a unique client ID for this assistant instance
const getClientId = () => {
  let id = localStorage.getItem('assistantClientId');
  if (!id) {
    id = Math.random().toString(36).substr(2, 9);
    localStorage.setItem('assistantClientId', id);
  }
  return id;
};

function App() {
  // All hooks at the top
  const { t, i18n } = useTranslation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [showMessagePanel, setShowMessagePanel] = useState(false);
  console.log('[DEBUG][App.js] Initial showMessagePanel state:', false);
  const [notifications, setNotifications] = useState([]);
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [processedMessageIds, setProcessedMessageIds] = useState(new Set());
  const processedMessageIdsRef = useRef(new Set());
  const isOpeningChatPanelRef = useRef(false);
  const currentProcessingMessageRef = useRef(null);
  const lastUnreadCountMessageRef = useRef(null);
  const prevShowMessagePanelRef = useRef(false);
  const showMessagePanelRef = useRef(false);
  const unreadCountRef = useRef(0);
  const [settings, setSettings] = useState({});
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [isDoctorConnected, setIsDoctorConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [showSplash, setShowSplash] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('medops-theme');
    return savedTheme === 'dark';
  });
  
  // Global walk-in notifications state
  const [walkinNotifications, setWalkinNotifications] = useState([]);

  // Global automatic reconnection state
  const [autoReconnectEnabled, setAutoReconnectEnabled] = useState(false);
  const [connectionLossCount, setConnectionLossCount] = useState(0);
  const [lastConnectionCheck, setLastConnectionCheck] = useState(Date.now());
  const maxAutoReconnectAttempts = 10; // Limit automatic reconnection attempts
  const retryingRef = useRef(false);
  const healthCheckIntervalRef = useRef(null);
  const [requireLicense, setRequireLicense] = useState(false);
  const enforceLicenseIntervalRef = useRef(null);

  // Route guard component to enforce staying on Settings
  const RequireLicenseGuard = () => {
    const location = useLocation();
    // location.pathname is available with HashRouter in React Router v6
    if (requireLicense && location.pathname !== '/settings') {
      return <Navigate to="/settings" replace />;
    }
    return null;
  };

  useEffect(() => {
    // When license is required (trial expired), force-navigation to Settings and prevent leaving
    if (!requireLicense) {
      // Cleanup any enforcement hooks
      if (enforceLicenseIntervalRef.current) {
        clearInterval(enforceLicenseIntervalRef.current);
        enforceLicenseIntervalRef.current = null;
      }
      return;
    }

    // Navigate to settings
    const ensureSettingsRoute = () => {
      const hash = window.location.hash || '';
      if (!hash.startsWith('#/settings')) {
        window.location.hash = '/settings';
      }
    };
    ensureSettingsRoute();

    const onHashChange = () => {
      if (requireLicense) ensureSettingsRoute();
    };
    window.addEventListener('hashchange', onHashChange);

    // Poll for activation every 3s while enforcing
    if (!enforceLicenseIntervalRef.current && window.electronAPI && window.electronAPI.getLicenseStatus) {
      enforceLicenseIntervalRef.current = setInterval(async () => {
        try {
          const st = await window.electronAPI.getLicenseStatus();
          const needs = st && !st.activated && !!st.expired;
          if (!needs) {
            setRequireLicense(false);
            if (enforceLicenseIntervalRef.current) {
              clearInterval(enforceLicenseIntervalRef.current);
              enforceLicenseIntervalRef.current = null;
            }
          }
        } catch (e) {
          // ignore transient errors; keep enforcing
        }
      }, 3000);
    }

    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [requireLicense]);

  // Also re-check license requirement on initial mount (if already authenticated)
  useEffect(() => {
    (async () => {
      if (isAuthenticated && window.electronAPI && window.electronAPI.getLicenseStatus) {
        try {
          const st = await window.electronAPI.getLicenseStatus();
          const needs = st && !!st.expired; // Enforce when expired, regardless of activation
          setRequireLicense(!!needs);
        } catch {}
      }
    })();
  }, [isAuthenticated]);
  // Apply theme class on body when dark mode toggles
  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
      localStorage.setItem('medops-theme', 'dark');
    } else {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('medops-theme', 'light');
    }
  }, [isDarkMode]);

  // Initialize focus management
  useEffect(() => {
    initializeFocusManagement();
  }, []);

  // Lightweight polling fallback to avoid stale sidebar status if events are missed
  useEffect(() => {
    let timer = null;
    const tick = async () => {
      try {
        if (window?.electronAPI?.getConnectionStatus) {
          const st = await window.electronAPI.getConnectionStatus();
          if (typeof st === 'string' && st !== connectionStatus) {
            setConnectionStatus(st);
          }
        }
      } catch {}
    };
    timer = setInterval(tick, 3000);
    // initial check as well
    tick();
    return () => { if (timer) clearInterval(timer); };
  }, [connectionStatus]);

  // Cleanup Google Drive auto-backup system on app unmount
  useEffect(() => {
    return () => {
      try {
        googleDriveService.cleanupAutoBackup();
      } catch (error) {
        console.error('Error cleaning up Google Drive auto-backup:', error);
      }
    };
  }, []);

  // Detect first-run setup (no credentials yet)
  useEffect(() => {
    (async () => {
      try {
        if (window.electronAPI && window.electronAPI.isFirstTimeSetup) {
          const first = await window.electronAPI.isFirstTimeSetup();
          setIsFirstRun(!!first);
        }
      } catch (e) {
        console.warn('[App] isFirstTimeSetup check failed:', e?.message);
        setIsFirstRun(false);
      }
    })();
  }, []);

  useEffect(() => {
    console.log('[DEBUG][App.js] Chat panel useEffect triggered - showMessagePanel:', showMessagePanel, 'prevShowMessagePanelRef.current:', prevShowMessagePanelRef.current);
    if (showMessagePanel) {
      setNotifications(prev => prev.filter(n => n.type !== 'chat'));
      // Only clear unread count if we're transitioning from closed to open
      if (!prevShowMessagePanelRef.current) {
        console.log('[DEBUG][App.js] About to clear unread count - current value:', unreadCount);
        console.log('[DEBUG][App.js] About to clear unread count - calling setUnreadCount(0)');
        console.trace('[DEBUG][App.js] Clear unread count stack trace');
        unreadCountRef.current = 0;
        setUnreadCount(0);
        console.log('[DEBUG][App.js] Chat panel opened - cleared unread count, ref updated to:', unreadCountRef.current);
      }
      prevShowMessagePanelRef.current = true;
    } else {
      // Clear processed message IDs when chat panel is closed to prevent memory leaks
      processedMessageIdsRef.current.clear();
      currentProcessingMessageRef.current = null;
      lastUnreadCountMessageRef.current = null;
      prevShowMessagePanelRef.current = false;
      console.log('[DEBUG][App.js] Cleared processed message IDs and current processing - chat panel closed');
    }
  }, [showMessagePanel]); // Removed unreadCount from dependencies to prevent infinite loop

  // Add a separate useEffect to track when showMessagePanel changes
  useEffect(() => {
    console.log('[DEBUG][App.js] showMessagePanel state changed to:', showMessagePanel);
    showMessagePanelRef.current = showMessagePanel;
  }, [showMessagePanel]);

  // Debug useEffect to track unread count changes
  useEffect(() => {
    console.log('[DEBUG][App.js] Unread count changed to:', unreadCount);
    console.log('[DEBUG][App.js] Current showMessagePanel state:', showMessagePanel);
    console.log('[DEBUG][App.js] Unread count should be displayed:', unreadCount > 0);
    
    // Add stack trace to see where the change is coming from
    console.trace('[DEBUG][App.js] Unread count change stack trace');
  }, [unreadCount, showMessagePanel]);

  // Global walk-in notifications system
  useEffect(() => {
    function getStoredNotifications() {
      try {
        return JSON.parse(localStorage.getItem('walkinNotifications') || '[]');
      } catch {
        return [];
      }
    }
    
    // Clear old notifications when app starts to prevent them from triggering on startup
    const clearOldNotifications = () => {
      const now = Date.now();
      const notifications = getStoredNotifications();
      const recentNotifications = notifications.filter(notif => {
        // Keep only notifications from the last 5 minutes
        return (now - notif.timestamp) < 5 * 60 * 1000;
      });
      localStorage.setItem('walkinNotifications', JSON.stringify(recentNotifications));
      return recentNotifications;
    };
    
    // Clear old notifications and set current ones
    const currentNotifications = clearOldNotifications();
    setWalkinNotifications(currentNotifications);
    
    // Listen for custom notification events
    const onNotificationUpdate = () => {
      console.log('[DEBUG] App.js received walkinNotificationUpdate event');
      setWalkinNotifications(getStoredNotifications());
    };
    window.addEventListener('walkinNotificationUpdate', onNotificationUpdate);
    
    // Also listen for storage changes (for cross-tab updates)
    const onStorage = () => setWalkinNotifications(getStoredNotifications());
    window.addEventListener('storage', onStorage);
    
    return () => {
      window.removeEventListener('walkinNotificationUpdate', onNotificationUpdate);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Play sound for new walk-in notifications globally
  useEffect(() => {
    console.log('[DEBUG] App.js walkinNotifications changed:', walkinNotifications.length, 'notifications');
    console.log('[DEBUG] App.js walkinNotifications details:', walkinNotifications);
    
    // Clear old notification IDs tracking when app starts
    const clearOldNotificationIds = () => {
      const now = Date.now();
      const currentIds = walkinNotifications.map(n => n.id);
      localStorage.setItem('lastWalkinNotificationIds', JSON.stringify(currentIds));
      return [];
    };
    
    // On first load, clear old tracking and don't play sounds
    if (walkinNotifications.length > 0 && localStorage.getItem('appInitialized') !== 'true') {
      clearOldNotificationIds();
      localStorage.setItem('appInitialized', 'true');
      return;
    }
    
    let lastIds = [];
    try {
      lastIds = JSON.parse(localStorage.getItem('lastWalkinNotificationIds') || '[]');
    } catch { lastIds = []; }
    const newIds = walkinNotifications.map(n => n.id);
    const newNotifs = walkinNotifications.filter(n => !lastIds.includes(n.id));
    
    console.log('[DEBUG] App.js lastIds:', lastIds);
    console.log('[DEBUG] App.js newIds:', newIds);
    console.log('[DEBUG] App.js newNotifs count:', newNotifs.length);
    
    if (newNotifs.length > 0) {
      console.log('[DEBUG] App.js found new notifications:', newNotifs.length);
      console.log('[DEBUG] App.js new notifications details:', newNotifs.map(n => ({
        id: n.id,
        type: n.type,
        patient_name: n.patient_name,
        message: n.message,
        timestamp: new Date(n.timestamp).toISOString()
      })));
      
      // Process new notifications using centralized sound manager
      (async () => {
        for (const notif of newNotifs) {
          console.log('[DEBUG] App.js processing notification:', {
            id: notif.id,
            type: notif.type,
            patient_name: notif.patient_name
          });
          
          if (notif.type === 'expected_patient') {
            // Skip playing sound for expected_patient notifications - no sound when reaching maintenant
            console.log('[DEBUG] App.js skipping sound for expected_patient notification - no sound when reaching maintenant');
          } else if (notif.type === 'walk_in') {
            // Use centralized sound manager to prevent duplicates
            await notificationSoundManager.playNotificationSound('expectpatient', notif.id);
            
            // Auto-remove walk_in notification after 3 seconds
            console.log('[DEBUG] App.js setting up auto-removal for walk_in notification', notif.id, 'after 3 seconds');
            setTimeout(() => {
              console.log('[DEBUG] App.js auto-removing walk_in notification', notif.id, 'after 3 seconds');
              removeWalkinNotification(notif.id);
            }, 3000);
          }
        }
      })();
    }
    localStorage.setItem('lastWalkinNotificationIds', JSON.stringify(newIds));
  }, [walkinNotifications]);

  const loadSettings = async () => {
    try {
      console.log('Loading settings...');
      const config = await window.electronAPI.getSettings();
      console.log('Settings loaded:', config);
      setSettings(config);
      
      // Set language
      if (config.language) {
        i18n.changeLanguage(config.language);
      }
      // Do NOT auto-connect to doctor here
      // if (config.doctor_ip) {
      //   console.log('Connecting to doctor at:', config.doctor_ip);
      //   window.electronAPI.networkConnect(config.doctor_ip);
      // } else {
      //   console.warn('No doctor_ip found in settings.');
      // }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };



  const setupCommunicationListeners = () => {
    try {
      // Listen for new messages (non-chat only)
      if (window.electronAPI && window.electronAPI.onNewMessage) {
        window.electronAPI.onNewMessage((message) => {
          // Only create a notification if this is NOT a chat message
          if (!message || message.type === 'chat' || message.senderId) return;
          addNotification(t('newMessage'), 'info');
        });
      }

      // Listen for appointment notifications
      if (window.electronAPI && window.electronAPI.onAppointmentNotification) {
        window.electronAPI.onAppointmentNotification((data) => {
          addNotification(`${data.patientName} ${t('needsAppointment')}`, 'warning');
        });
      }

      // Listen for "Book Appointment" notifications
      if (window.electronAPI && window.electronAPI.onBookAppointmentRequest) {
        window.electronAPI.onBookAppointmentRequest((data) => {
          const notification = {
            id: `appointment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'book-appointment',
            message: `#${data.patientName} needs a prochain RDV SVP`,
            patientName: data.patientName,
            patientId: data.patientId
          };
          setNotifications(prev => [...prev, notification]);
        });
      }
    } catch (error) {
      console.error('Error setting up communication listeners:', error);
      // App can work without communication features
    }
  };

  useEffect(() => {
    console.log('App component mounted');
    
    // Prevent auto-scroll globally and get cleanup function
    const cleanupScroll = preventAutoScroll();
    
    // Load settings and initialize language
    loadSettings();
    
    // Set up communication event listeners
    setupCommunicationListeners();

    console.log('Registering onNetworkStatus listener');
    if (window.electronAPI && window.electronAPI.onNetworkStatus) {
      window.electronAPI.onNetworkStatus((status) => {
        console.log('[Renderer] Network status:', status);
        // Keep UI in sync even if connection-status is missed
        if (status === 'connected' || status === 'connecting' || status === 'reconnecting' || status === 'disconnected') {
          setConnectionStatus(status === 'reconnecting' ? 'connecting' : status);
        }
      });
    }
    
    if (window.electronAPI && window.electronAPI.onNetworkStatusDebug) {
      window.electronAPI.onNetworkStatusDebug((msg) => {
        console.log('[Renderer] Network debug:', msg);
      });
    }

    // Chat message listener will be set up in a separate useEffect with proper dependencies
    
    // Cleanup function
    return () => {
      if (cleanupScroll) {
        cleanupScroll();
      }
      // Clean up event listeners to prevent duplicates
      if (window.electronAPI && window.electronAPI.removeAllListeners) {
        window.electronAPI.removeAllListeners('network-status');
        window.electronAPI.removeAllListeners('network-status-debug');
      }
    };
  }, []); // Removed showMessagePanel dependency

  // Re-sync connection status on window focus/visibility to avoid stale sidebar state
  useEffect(() => {
    const syncFromMain = async () => {
      try {
        if (window?.electronAPI?.getConnectionStatus) {
          const st = await window.electronAPI.getConnectionStatus();
          if (st && typeof st === 'string') {
            setConnectionStatus(st);
          }
        }
      } catch (e) {
        // noop
      }
    };
    const onFocus = () => syncFromMain();
    const onVis = () => { if (!document.hidden) syncFromMain(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    // immediate sync on mount
    syncFromMain();
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Separate useEffect for chat message listener with proper dependencies
  useEffect(() => {
    console.log('[DEBUG][App.js] Setting up chat message listener - useEffect triggered');
    console.log('[DEBUG][App.js] showMessagePanel:', showMessagePanel);
    console.log('[DEBUG][App.js] getClientId():', getClientId());
    
    if (window.electronAPI && window.electronAPI.onChatMessage) {
      // Remove any existing listeners to prevent duplicates
      window.electronAPI.removeAllListeners('chat-message');
      console.log('[DEBUG][App.js] Removed existing chat-message listeners');
      
      const chatMessageListener = (data) => {
        console.log('[DEBUG][App.js] Received chat message (callback invoked):', data.id, data.message);
        console.log('[DEBUG][App.js] Current processedMessageIdsRef size:', processedMessageIdsRef.current.size);
        console.log('[DEBUG][App.js] Current processedMessageIdsRef contents:', Array.from(processedMessageIdsRef.current));
        console.log('[DEBUG][App.js] Currently processing message:', currentProcessingMessageRef.current);
        
        // Check if this message is currently being processed
        if (currentProcessingMessageRef.current === data.id) {
          console.log('[DEBUG][App.js] Message is currently being processed, skipping:', data.id);
          return;
        }
        
        // Check if this message has already been processed using the ref
        if (processedMessageIdsRef.current.has(data.id)) {
          console.log('[DEBUG][App.js] Message already processed, skipping all state updates:', data.id);
          return; // Exit early
        }
        
        // Mark as currently being processed
        currentProcessingMessageRef.current = data.id;
        
        // Mark as processed using the ref
        processedMessageIdsRef.current.add(data.id);
        console.log('[DEBUG][App.js] Processing new message for state updates:', data.id);
        console.log('[DEBUG][App.js] Updated processedMessageIdsRef size:', processedMessageIdsRef.current.size);
        
        setMessages(prev => {
          if (prev.some(m => m.id === data.id)) {
            console.log('[DEBUG][App.js] Message already exists in messages state, skipping:', data.id);
            return prev;
          }
          console.log('[DEBUG][App.js] Adding new message to messages state:', data.id);
          return [...prev, data];
        });
        
        const notificationId = data.id || `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Combine notification creation and unread count increment into a single atomic update
        if (
          data.senderId !== getClientId()
        ) {
          // Always increment unread count for new messages (regardless of chat panel state)
          setUnreadCount(count => {
            // Check if we've already incremented the count for this message
            if (lastUnreadCountMessageRef.current === data.id) {
              console.log('[DEBUG][App.js] Unread count already incremented for this message, skipping:', data.id);
              return count;
            }
            
            console.log('[DEBUG][App.js] Incrementing unread count from', count, 'to', count + 1, 'for message:', data.id);
            console.trace('[DEBUG][App.js] Increment unread count stack trace');
            lastUnreadCountMessageRef.current = data.id;
            const newCount = count + 1;
            unreadCountRef.current = newCount;
            console.log('[DEBUG][App.js] Returning new count:', newCount, 'ref updated to:', unreadCountRef.current);
            return newCount;
          });
          
          // Only create notification if chat panel is not open
          if (!showMessagePanelRef.current) {
            setNotifications(prev => {
              // Check if notification already exists
              if (prev.some(n => n.id === notificationId)) {
                console.log('[DEBUG][App.js] Notification already exists, skipping:', notificationId);
                return prev;
              }
              
              console.log('[DEBUG][App.js] Creating notification for message:', data.id);
              const notification = {
                id: notificationId,
                message: data.message,
                type: 'chat',
                timestamp: data.timestamp || new Date().toISOString(),
                sender: data.sender || 'doctor'
              };
              
              return [...prev, notification];
            });
          } else {
            console.log('[DEBUG][App.js] Chat panel is open, skipping notification creation for message:', data.id);
          }
        } else {
          console.log('[DEBUG][App.js] Skipping notification creation for message:', data.id, 
            'showMessagePanel:', showMessagePanel, 
            'senderId:', data.senderId, 
            'getClientId():', getClientId());
        }
        
        // Clear the currently processing message ref after a short delay
        setTimeout(() => {
          currentProcessingMessageRef.current = null;
          lastUnreadCountMessageRef.current = null;
        }, 100);
        
        console.log('[DEBUG][App.js] <<< END onChatMessage callback invocation >>>', data.id);
      };

      window.electronAPI.onChatMessage(chatMessageListener);

      return () => {
        console.log('[DEBUG][App.js] Cleaning up chat message listener - useEffect cleanup');
        window.electronAPI.removeAllListeners('chat-message');
      };
    }
  }, [getClientId]); // Removed showMessagePanel from dependencies to prevent listener recreation

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onDoctorPresence) {
      window.electronAPI.onDoctorPresence((data) => {
        setIsDoctorConnected(!!data.online);
      });
    }
  }, []);

  // Connection status listener
  useEffect(() => {
    console.log('[DEBUG][App.js] Setting up connection status listener');
    if (window.electronAPI && window.electronAPI.onConnectionStatus) {
      console.log('[DEBUG][App.js] onConnectionStatus is available');
      window.electronAPI.onConnectionStatus((status) => {
        console.log('[DEBUG][App.js] Connection status update received:', status);
        setConnectionStatus(status);
        
        // Reset auto-reconnect counters on successful connection
        if (status === 'connected') {
          handleSuccessfulConnection();
        }
      });
    } else {
      console.error('[DEBUG][App.js] onConnectionStatus is NOT available');
    }
    
    // Get initial connection status
    if (window.electronAPI && window.electronAPI.getConnectionStatus) {
      console.log('[DEBUG][App.js] getConnectionStatus is available');
      window.electronAPI.getConnectionStatus().then((status) => {
        console.log('[DEBUG][App.js] Initial connection status received:', status);
        setConnectionStatus(status);
        
        // Reset auto-reconnect counters if already connected
        if (status === 'connected') {
          handleSuccessfulConnection();
        }
      }).catch((error) => {
        console.error('[DEBUG][App.js] Error getting initial connection status:', error);
      });
    } else {
      console.error('[DEBUG][App.js] getConnectionStatus is NOT available');
    }
  }, []);

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onConnectionSuccessPopup) {
      window.electronAPI.onConnectionSuccessPopup(() => {
        addNotification(t('loginSuccess') || 'Connexion réussie', 'success');
      });
    }
  }, []);

  // Global automatic reconnection setup
  useEffect(() => {
    console.log('[DEBUG][App.js] Setting up global connection loss detection and health checks');
    
    // If auto-reconnect is disabled, do not register timers or listeners
    if (!autoReconnectEnabled) {
      return;
    }
    
    // Setup periodic connection health check (every 30 seconds)
    const healthCheckInterval = setInterval(() => {
      checkConnectionHealth();
    }, 30000); // Check every 30 seconds
    
    healthCheckIntervalRef.current = healthCheckInterval;
    
    // Add a timeout to stop health checks after 10 minutes to prevent infinite retries
    const healthCheckTimeout = setTimeout(() => {
      console.log('[DEBUG][App.js] Health check timeout reached (10 minutes), stopping automatic reconnection');
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
        healthCheckIntervalRef.current = null;
      }
      setAutoReconnectEnabled(false);
      setConnectionStatus('disconnected');
    }, 600000); // 10 minutes timeout
    
    // Setup connection loss detection listeners
    const setupConnectionLossDetection = () => {
      // Listen for connection loss events from the main process
      if (window.electronAPI && window.electronAPI.onConnectionLost) {
        window.electronAPI.onConnectionLost(handleConnectionLoss);
      }
      
      // Listen for network status changes
      const handleOnline = () => {
        console.log('[DEBUG][App.js] Network online, checking connection health');
        setTimeout(() => checkConnectionHealth(), 2000);
      };
      
      const handleOffline = () => {
        console.log('[DEBUG][App.js] Network offline, marking as connection loss');
        handleConnectionLoss();
      };
      
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      
      // Return cleanup function
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        if (window.electronAPI && window.electronAPI.removeConnectionLostListener) {
          window.electronAPI.removeConnectionLostListener(handleConnectionLoss);
        }
      };
    };
    
    const cleanupConnectionDetection = setupConnectionLossDetection();
    
    // Cleanup function
    return () => {
      console.log('[DEBUG][App.js] Cleaning up global connection loss detection');
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
      }
      clearTimeout(healthCheckTimeout);
      cleanupConnectionDetection();
    };
  }, [autoReconnectEnabled, connectionLossCount]); // Re-run when auto-reconnect settings change

  useEffect(() => {
    if (isAuthenticated && window.electronAPI && window.electronAPI.sendFrontendReady) {
      window.electronAPI.sendFrontendReady();
      console.log('[Renderer] Emitted frontendReady');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    // Optionally, you can delay the splash for a minimum time
    // setTimeout(() => setShowSplash(false), 2000);
  }, []);

  // All functions (including handleLogin) here
  const handleLogin = async (credentials) => {
    console.log('[DEBUG] Submitted credentials:', credentials);
    if (window.electronAPI && window.electronAPI.verifyCredentials) {
      const valid = await window.electronAPI.verifyCredentials(credentials);
      if (valid) {
        setIsAuthenticated(true);
        console.log('[DEBUG] Login successful');

        // Start the global appointment notification service
        appointmentNotificationService.start();
        
        if (window.electronAPI && window.electronAPI.sendDoctorLoggedIn) {
          window.electronAPI.sendDoctorLoggedIn();
          console.log('[Renderer] Emitted doctorLoggedIn');
        }

        // Check license status after login and enforce if trial expired
        try {
          if (window.electronAPI && window.electronAPI.getLicenseStatus) {
            const st = await window.electronAPI.getLicenseStatus();
            const needs = st && !!st.expired; // Enforce when expired, regardless of activation
            setRequireLicense(!!needs);
          }
        } catch (e) {
          console.warn('[LICENSE][Renderer] getLicenseStatus failed:', e?.message);
        }
      } else {
        console.log('[DEBUG] Login failed');
        addNotification(t('loginError'), 'error');
      }
    } else {
      console.log('[DEBUG] electronAPI.verifyCredentials not available');
      addNotification(t('loginError'), 'error');
    }
  };

  // Add handleToggleDarkMode function
  const handleToggleDarkMode = () => setIsDarkMode(prev => !prev);

  // Add handleLogout function
  const handleLogout = () => {
    setIsAuthenticated(false);
    setNotifications(prev => [
      ...prev,
      {
        id: `logout-${Date.now()}`,
        message: t('logoutSuccess') || 'Déconnexion réussie',
        type: 'info',
      },
    ]);
  };

  // Global notification de-duplication (prevents rapid duplicates)
  const lastNotifRef = useRef({ key: null, time: 0 });
  // Add addNotification function
  const addNotification = (message, type = 'info', subText = '') => {
    const key = `${type}|${message}|${subText}`;
    const now = Date.now();
    const windowMs = 1500; // de-duplication window
    if (lastNotifRef.current && lastNotifRef.current.key === key && (now - lastNotifRef.current.time) < windowMs) {
      console.log('[Notification] Duplicate suppressed:', key);
      return;
    }
    lastNotifRef.current = { key, time: now };
    const id = `notification-${now}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('[Notification] Showing:', { id, type, message, subText });
    setNotifications(prev => [
      ...prev,
      { id, message, type, subText },
    ]);
  };

  // Handler for removing notifications from the Notifications page
  const handleRemoveNotification = (id) => {
    if (id === 'all') {
      setNotifications([]);
    } else {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }
  };

  // Global walk-in notification handlers
  const removeWalkinNotification = async (id) => {
    const notification = walkinNotifications.find(n => n.id === id);
    const updated = walkinNotifications.filter(n => n.id !== id);
    localStorage.setItem('walkinNotifications', JSON.stringify(updated));
    setWalkinNotifications(updated);

    // If this was an expected patient notification, mark as missed
    if (notification && notification.type === 'expected_patient') {
      try {
        // Mark the appointment as missed
        await window.electronAPI.updateAppointment({ 
          ...notification.appointment, 
          status: 'missed' 
        });
        console.log(`Appointment ${notification.id} marked as missed after notification closed`);
      } catch (error) {
        console.error('Error marking appointment as missed:', error);
      }
    }
    
    // If this was a walk_in notification, mark as missed
    if (notification && notification.type === 'walk_in') {
      try {
        // Mark the appointment as missed
        await window.electronAPI.updateAppointment({ 
          ...notification.appointment, 
          status: 'missed' 
        });
        console.log(`Appointment ${notification.id} marked as missed after walk_in notification closed`);
      } catch (error) {
        console.error('Error marking appointment as missed:', error);
      }
    }
  };

  const handleWalkinNotificationClick = (notif) => {
    // Navigate to patient page with available data
    window.location.hash = `/patients?id=${notif.patient_id}`;
  };



  // Handler to open chat and clear chat notifications
  const handleOpenChatFromNotification = () => {
    // Prevent notification sounds from playing when opening chat panel
    const preventNotificationSound = () => {
      // Temporarily disable notification sounds
      const originalSettings = window.electronAPI.getSettings();
      if (originalSettings && originalSettings.notification_sounds_enabled) {
        // We'll restore this after a short delay
        setTimeout(() => {
          // The notification sound prevention is handled in the Notification component
        }, 100);
      }
    };
    
    preventNotificationSound();
    isOpeningChatPanelRef.current = true;
    window.isOpeningChatPanel = true;
    
    // Temporarily disable notification sounds to prevent sound when opening from notification
    window.notificationSoundsDisabled = true;
    
    setShowMessagePanel(true);
    setNotifications(prev => prev.filter(n => n.type !== 'chat'));
    unreadCountRef.current = 0;
    setUnreadCount(0);
    // Reset the flag after a short delay
    setTimeout(() => {
      isOpeningChatPanelRef.current = false;
      window.isOpeningChatPanel = false;
      window.notificationSoundsDisabled = false;
    }, 500);
  };

  // Handler to close popup notification (soft close)
  const closePopupNotification = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, popupClosedAt: Date.now() } : n));
  };

  // Handler to add a new message to the messages state
  const handleAddMessage = (msg) => {
    setMessages(prev => {
      if (prev.some(m => m.id === msg.id)) {
        return prev;
      }
      return [...prev, msg];
    });
  };

  // Global automatic reconnection functions
  const checkConnectionHealth = async () => {
    if (!autoReconnectEnabled || retryingRef.current) {
      return; // Skip if auto-reconnect is disabled or already retrying
    }

    try {
      // Check if we're supposed to be connected but status shows disconnected
      if (connectionStatus === 'disconnected' && !retryingRef.current) {
        console.log('[DEBUG][App.js] Connection health check: Status is disconnected, checking if we should auto-reconnect');
        
        // Only auto-reconnect if we haven't exceeded max attempts
        if (connectionLossCount < maxAutoReconnectAttempts) {
          console.log(`[DEBUG][App.js] Auto-reconnecting (attempt ${connectionLossCount + 1}/${maxAutoReconnectAttempts})`);
          
          // Increment connection loss count
          setConnectionLossCount(prev => prev + 1);
          
          // Start automatic reconnection
          await startConnectionWithRetry();
        } else {
          console.log('[DEBUG][App.js] Max auto-reconnect attempts reached, stopping automatic reconnection');
          setAutoReconnectEnabled(false);
        }
      }
      
      setLastConnectionCheck(Date.now());
    } catch (error) {
      console.error('[DEBUG][App.js] Connection health check error:', error);
    }
  };

  const handleConnectionLoss = () => {
    console.log('[DEBUG][App.js] Connection loss detected');
    
    // Update status to disconnected
    setConnectionStatus('disconnected');
    
    // If auto-reconnect is enabled, start reconnection after a short delay
    if (autoReconnectEnabled && connectionLossCount < maxAutoReconnectAttempts) {
      setTimeout(() => {
        checkConnectionHealth();
      }, 3000); // Wait 3 seconds before attempting reconnection
    }
  };

  const handleSuccessfulConnection = () => {
    setConnectionLossCount(0);
    setAutoReconnectEnabled(true);
    console.log('[DEBUG][App.js] Connection successful, resetting auto-reconnect counters');
  };

  const startConnectionWithRetry = async () => {
    if (retryingRef.current) {
      console.log('[DEBUG][App.js] Already retrying, skipping');
      return;
    }

    // Check if we've exceeded the maximum retry attempts
    if (connectionLossCount >= maxAutoReconnectAttempts) {
      console.log(`[DEBUG][App.js] Maximum retry attempts (${maxAutoReconnectAttempts}) reached, stopping retry`);
      setConnectionStatus('disconnected');
      retryingRef.current = false;
      return;
    }

    retryingRef.current = true;
    console.log(`[DEBUG][App.js] Starting connection retry (attempt ${connectionLossCount + 1}/${maxAutoReconnectAttempts})`);

    try {
      // Get the current doctor IP from settings
      const settings = await window.electronAPI.getSettings();
      const doctorIp = settings.doctor_ip;

      if (!doctorIp) {
        console.log('[DEBUG][App.js] No doctor IP configured, skipping retry');
        retryingRef.current = false;
        return;
      }

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 10000); // 10 second timeout
      });

      // Attempt to connect with timeout
      const connectPromise = window.electronAPI.networkConnect({
        ip: doctorIp,
        clientId: getClientId(),
        machineId: 'medops-assistant'
      });

      const result = await Promise.race([connectPromise, timeoutPromise]);

      if (result.success) {
        console.log('[DEBUG][App.js] Connection retry successful');
        handleSuccessfulConnection();
      } else {
        console.log('[DEBUG][App.js] Connection retry failed:', result.message);
        // Increment retry count for failed attempts
        setConnectionLossCount(prev => prev + 1);
      }
    } catch (error) {
      console.error('[DEBUG][App.js] Connection retry error:', error);
      // Increment retry count for errors
      setConnectionLossCount(prev => prev + 1);
    } finally {
      retryingRef.current = false;
    }
  };

  // Place conditional returns only after all hooks
  if (showSplash) {
    return <MedOpsTextEffect onFinish={() => setShowSplash(false)} />;
  }
  if (!isAuthenticated) {
    if (isFirstRun) {
      return <FirstRun onSetupComplete={() => setIsFirstRun(false)} />;
    }
    return <Login onLogin={handleLogin} />;
  }

  // Restore original return block
  return (
    <ErrorBoundary>
      <ConfirmProvider>
      <Router>
        <ScrollRestoration />
        <RequireLicenseGuard />
        <div className={`app app-container${isDarkMode ? ' dark-mode' : ''}`}>
          <Sidebar 
            onLogout={handleLogout}
            notificationsCount={notifications.length}
            isDarkMode={isDarkMode}
            onToggleDarkMode={handleToggleDarkMode}
            connectionStatus={connectionStatus}
          />
          
          <div className="main-content">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/patients" element={<PatientPanel isDoctorConnected={connectionStatus === 'connected'} addNotification={addNotification} />} />
              <Route path="/all-patients" element={<AllPatients addNotification={addNotification} />} />
              <Route path="/queue" element={<Queue />} />
              <Route path="/appointments" element={<Appointments addNotification={addNotification} />} />
              <Route path="/settings" element={<Settings onSettingsUpdate={loadSettings} />} />
              <Route path="/notifications" element={<Notifications notifications={notifications} onRemove={handleRemoveNotification} />} />
      
            </Routes>
          </div>

          {/* Chat Icon */}
          <ChatIcon 
            key={`chat-icon-${unreadCount}`}
            unreadCount={unreadCount || unreadCountRef.current}
            onClick={() => {
              // Prevent notification sounds when opening chat panel
              isOpeningChatPanelRef.current = true;
              window.isOpeningChatPanel = true;
              
              // Temporarily disable notification sounds to prevent sound when clicking icon
              window.notificationSoundsDisabled = true;
              
              setShowMessagePanel(true);
              // Reset the flag after a short delay
              setTimeout(() => {
                isOpeningChatPanelRef.current = false;
                window.isOpeningChatPanel = false;
                window.notificationSoundsDisabled = false;
              }, 500);
            }}
            isVisible={!showMessagePanel}
          />

          {/* Message Panel */}
          {showMessagePanel && (
            <MessagePanel 
              onClose={() => setShowMessagePanel(false)}
              messages={messages}
              onAddMessage={handleAddMessage}
            />
          )}

          {/* Notifications */}
          {notifications.filter(n => !n.popupClosedAt).map(notification => {
            let subText = 'Vous avez une nouvelle notification';
            if (notification.type === 'chat') subText = 'Nouveau message';
            else if (notification.type === 'book-appointment') subText = 'Demande de rendez-vous';
            else if (notification.type === 'warning') subText = 'Alerte';
            else if (notification.type === 'error') subText = 'Erreur';
            else if (notification.type === 'success') subText = 'Succès';
            return (
              <Notification
                key={notification.id}
                id={notification.id}
                message={notification.message}
                type={notification.type}
                subText={notification.subText || subText}
                onClick={notification.type === 'chat' ? handleOpenChatFromNotification : undefined}
                onClose={() => closePopupNotification(notification.id)}
                duration={5000}
              />
            );
          })}



          {/* Global Walk-in Notifications */}
          {console.log('[DEBUG] Rendering walk-in notifications:', walkinNotifications.length)}
          {walkinNotifications && walkinNotifications.length > 0 && walkinNotifications.map(notif => (
            <Notification
              key={notif.id}
              id={notif.id}
              message={notif.message}
              type={notif.type === 'expected_patient' ? 'warning' : 'info'}
              subText={notif.patient_id ? `ID: ${notif.patient_id}` : ''}
              onClick={() => handleWalkinNotificationClick(notif)}
              onClose={() => removeWalkinNotification(notif.id)}
              autoHide={notif.type !== 'expected_patient'} // Don't auto-hide expected patient notifications
              duration={notif.type === 'expected_patient' ? 0 : 10000} // No auto-hide for expected patient notifications
            />
          ))}
        </div>
      </Router>
      </ConfirmProvider>
    </ErrorBoundary>
  );
}

export default App; 