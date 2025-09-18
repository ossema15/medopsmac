import React, { useState, useEffect, useRef } from 'react';

import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';

function Sidebar({ onLogout, notificationsCount = 0, isDarkMode, onToggleDarkMode, connectionStatus = 'disconnected' }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Debug logging for connection status
  useEffect(() => {
    console.log('[DEBUG][Sidebar] Connection status prop received:', connectionStatus);
  }, [connectionStatus]);

  const [hoveredItem, setHoveredItem] = useState(null);
  const [showThemeToggle, setShowThemeToggle] = useState(false);
  const [focusedItem, setFocusedItem] = useState(null);
  const [clickedItem, setClickedItem] = useState(null);
  const [showBugForm, setShowBugForm] = useState(false);
  const [bugMessage, setBugMessage] = useState('');
  const [bugSending, setBugSending] = useState(false);
  const [bugSent, setBugSent] = useState(null); // null | 'ok' | 'error'
  const sidebarRef = useRef(null);
  const themeToggleRef = useRef(null);
  const dragHandleRef = useRef(null);
  const isDragging = useRef(false);

  // Internet connectivity
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Enhanced menu structure with categories
  const menuCategories = [
    {
      id: 'overview',
      label: 'Vue d\'ensemble',
      icon: 'fas fa-chart-pie',
      items: [
        { id: 'dashboard', path: '/dashboard', icon: 'fas fa-tachometer-alt', label: t('dashboard'), shortcut: 'Ctrl+D' }
      ]
    },
    {
      id: 'patients',
      label: 'Gestion des Patients',
      icon: 'fas fa-user-friends',
      items: [
        { id: 'patients', path: '/patients', icon: 'fas fa-user-injured', label: t('patients'), shortcut: 'Ctrl+P' },
        { id: 'all-patients', path: '/all-patients', icon: 'fas fa-users', label: t('archives'), shortcut: 'Ctrl+A' },
        { id: 'queue', path: '/queue', icon: 'fas fa-list-ol', label: t('queue'), shortcut: 'Ctrl+Q' }
      ]
    },
    {
      id: 'appointments',
      label: 'Rendez-vous',
      icon: 'fas fa-calendar-check',
      items: [
        { id: 'appointments', path: '/appointments', icon: 'fas fa-calendar-alt', label: t('appointments'), shortcut: 'Ctrl+R' }
      ]
    },
    {
      id: 'system',
      label: 'Système',
      icon: 'fas fa-cogs',
      items: [
        { id: 'notifications', path: '/notifications', customIcon: true, label: 'Notifications', shortcut: 'Ctrl+N' },
        { id: 'settings', path: '/settings', icon: 'fas fa-cog', label: t('settings'), shortcut: 'Ctrl+S' },
        
      ]
    }
  ];

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!sidebarRef.current) return;
      const focusableElements = sidebarRef.current.querySelectorAll(
        'button, a, [tabindex]:not([tabindex="-1"])'
      );
      const currentIndex = Array.from(focusableElements).findIndex(el => el === document.activeElement);
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          const nextIndex = (currentIndex + 1) % focusableElements.length;
          focusableElements[nextIndex]?.focus();
          break;
        case 'ArrowUp':
          e.preventDefault();
          const prevIndex = currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1;
          focusableElements[prevIndex]?.focus();
          break;
        case 'Home':
          e.preventDefault();
          focusableElements[0]?.focus();
          break;
        case 'End':
          e.preventDefault();
          focusableElements[focusableElements.length - 1]?.focus();
          break;
        case 'Escape':
          e.preventDefault();
          document.activeElement?.blur();
          break;
      }
    };
    const sidebar = sidebarRef.current;
    if (sidebar) {
      sidebar.addEventListener('keydown', handleKeyDown);
      return () => sidebar.removeEventListener('keydown', handleKeyDown);
    }
  }, []);

  // Initialize clicked item based on current location
  useEffect(() => {
    const currentItem = menuCategories.flatMap(category => category.items).find(item => item.path === location.pathname);
    if (currentItem) {
      setClickedItem(currentItem.id);
    }
  }, [location.pathname, menuCategories]);

  // Update sidebar width on window resize
  useEffect(() => {
    const handleResize = () => {
      // This useEffect is no longer needed as sidebar width is handled by CSS
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleNavigation = (path) => {
    navigate(path);
  };

  const getNotificationBadge = (categoryId) => {
    if (categoryId === 'patients' && notificationsCount > 0) {
      return (
        <div className="notification-badge-container" role="status" aria-live="polite">
          <span className="notification-badge pulse" aria-label={`${notificationsCount} notifications`}>
            {notificationsCount}
          </span>
        </div>
      );
    }
    return null;
  };

  const getItemIcon = (item) => {
    if (item.customIcon) {
      return (
        <span className="loader notification-icon" style={{ marginRight: 8, padding: 0, background: 'none' }}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            height="20"
            width="20"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className="w-6 h-6 text-gray-800 dark:text-white"
            style={{ color: 'inherit' }}
          >
            <path
              d="M12 5.365V3m0 2.365a5.338 5.338 0 0 1 5.133 5.368v1.8c0 2.386 1.867 2.982 1.867 4.175 0 .593 0 1.292-.538 1.292H5.538C5 18 5 17.301 5 16.708c0-1.193 1.867-1.789 1.867-4.175v-1.8A5.338 5.338 0 0 1 12 5.365ZM8.733 18c.094.852.306 1.54.944 2.112a3.48 3.48 0 0 0 4.646 0c.638-.572 1.236-1.26 1.33-2.112h-6.92Z"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              stroke="currentColor"
            ></path>
          </svg>
        </span>
      );
    }
    return <i className={item.icon} aria-hidden="true"></i>;
  };

  return (
    <div
      className={`sidebar ${isDarkMode ? 'dark-mode' : ''}`}
      ref={sidebarRef}
      role="navigation"
      aria-label="Navigation principale"
      style={{display: 'flex', flexDirection: 'column', height: '100vh'}}
    >
      {/* Enhanced Logo Section with Theme Toggle */}
      <div className="logo-section" style={{padding: '1.2rem 1rem 0.7rem', marginBottom: '1rem'}}>
        <div className="logo" style={{textAlign: 'center'}}>
          <h1 style={{fontSize: '1.2rem', marginBottom: '0.1rem'}}>MedOps</h1>
          <p style={{fontSize: '0.7rem', margin: 0}}>Medical Operations Assistant</p>
        </div>
        <div className="logo-decoration"></div>
        {/* Theme Toggle removed */}
      </div>
      {/* Enhanced Navigation */}
      <nav className="sidebar-nav" role="navigation" aria-label="Menu principal">
        {menuCategories.map((category, categoryIndex) => (
          <div key={category.id} className="nav-category">
            <div className="nav-menu" role="group">
              {category.items.map((item, itemIndex) => (
                <React.Fragment key={item.id}>
                  <a
                    href={item.path}
                    className={`nav-link ${clickedItem === item.id ? 'active' : ''} ${hoveredItem === item.id ? 'hovered' : ''}`}
                    onClick={e => {
                      e.preventDefault();
                      // Set the clicked item to make it permanently active
                      setClickedItem(item.id);
                      // Clear all states to prevent interference
                      setFocusedItem(null);
                      setHoveredItem(null);
                      // Force a re-render by briefly clearing hover state
                      setTimeout(() => {
                        setHoveredItem(null);
                      }, 0);
                      // Blur the current element to remove focus
                      e.target.blur();
                      handleNavigation(item.path);
                    }}
                    onFocus={() => setFocusedItem(item.id)}
                    onBlur={() => setFocusedItem(null)}
                    onMouseEnter={() => setHoveredItem(item.id)}
                    onMouseLeave={() => setHoveredItem(null)}
                    role="menuitem"
                    aria-current={clickedItem === item.id ? 'page' : undefined}
                    tabIndex={0}
                    style={{ animationDelay: `${(categoryIndex * 0.2) + (itemIndex * 0.1)}s` }}
                  >
                    <div className="nav-link-content">
                      <div className="nav-link-icon">{getItemIcon(item)}</div>
                      <span className="nav-link-label">{item.label}</span>
                    </div>
                    <div className="nav-link-hover-effect"></div>
                    {clickedItem === item.id && (
                      <div className="nav-link-active-indicator" aria-hidden="true"></div>
                    )}
                    <div className="nav-link-ripple"></div>
                  </a>
                  
                  {/* Connection Status Display - Show after Settings item */}
                  {item.id === 'settings' && (
                    <div className="connection-status-section" style={{
                      padding: '0.5rem 1rem',
                      marginTop: '0.5rem',
                      marginBottom: '0.5rem',
                      borderRadius: '8px'
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem' }}>
                        {/* Internet status */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ color: 'rgba(55, 65, 81, 0.9)', minWidth: 78 }}>Internet</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{
                              width: '8px', height: '8px', borderRadius: '50%',
                              backgroundColor: isOnline ? '#10b981' : '#ef4444'
                            }}></div>
                            <span style={{
                              color: isOnline ? '#10b981' : '#ef4444',
                              fontWeight: '500', fontSize: '0.75rem'
                            }}>
                              {isOnline ? 'En ligne' : 'Hors ligne'}
                            </span>
                          </div>
                        </div>

                        {/* Doctor connection status */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ color: 'rgba(55, 65, 81, 0.9)', minWidth: 78 }}>Médecin</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{
                              width: '8px', height: '8px', borderRadius: '50%',
                              backgroundColor: connectionStatus === 'connected' ? '#10b981' :
                                              connectionStatus === 'connecting' ? '#f59e0b' : '#ef4444',
                              animation: connectionStatus === 'connecting' ? 'pulse 2s infinite' : 'none'
                            }}></div>
                            <span style={{
                              color: connectionStatus === 'connected' ? '#10b981' :
                                     connectionStatus === 'connecting' ? '#f59e0b' : '#ef4444',
                              fontWeight: '500', fontSize: '0.75rem'
                            }}>
                              {connectionStatus === 'connected' ? 'Connecté' :
                               connectionStatus === 'connecting' ? 'Connexion...' : 'Déconnecté'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bug report trigger + form under the status section */}
                  {item.id === 'settings' && (
                    <div style={{ padding: '0 1rem', marginBottom: '0.5rem' }}>
                      <button
                        type="button"
                        className="bug-report-trigger"
                        onClick={() => {
                          setShowBugForm(v => !v);
                          setBugSent(null);
                        }}
                        title="Signaler un bug"
                        aria-label="Signaler un bug"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          background: 'transparent',
                          border: 'none',
                          color: 'inherit',
                          padding: 0,
                          cursor: 'pointer'
                        }}
                      >
                        <i className="fas fa-bug" aria-hidden="true" style={{ fontSize: '1rem' }}></i>
                        <span style={{ fontSize: '0.85rem' }}>Signaler un bug</span>
                      </button>

                      {showBugForm && (
                        <div className="bug-report-form" style={{ marginTop: '0.5rem' }}>
                          <textarea
                            value={bugMessage}
                            onChange={(e) => setBugMessage(e.target.value)}
                            placeholder="Décrivez le bug..."
                            rows={3}
                            style={{
                              width: '100%',
                              resize: 'vertical',
                              padding: '0.5rem',
                              fontSize: '0.85rem',
                              borderRadius: '6px',
                              border: '1px solid rgba(0,0,0,0.12)'
                            }}
                          />
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                            <button
                              type="button"
                              disabled={bugSending || bugMessage.trim().length === 0}
                              onClick={async () => {
                                try {
                                  setBugSending(true);
                                  setBugSent(null);
                                  const payload = { message: bugMessage.trim() };
                                  if (window.electronAPI && window.electronAPI.sendBugReport) {
                                    await window.electronAPI.sendBugReport(payload);
                                    setBugSent('ok');
                                    setBugMessage('');
                                    setShowBugForm(false);
                                  } else {
                                    console.warn('sendBugReport API not available');
                                    setBugSent('error');
                                  }
                                } catch (e) {
                                  console.error('Bug report send failed', e);
                                  setBugSent('error');
                                } finally {
                                  setBugSending(false);
                                }
                              }}
                              style={{
                                padding: '0.35rem 0.6rem',
                                fontSize: '0.85rem',
                                borderRadius: '6px',
                                border: 'none',
                                background: '#2563eb',
                                color: '#fff',
                                cursor: bugSending || bugMessage.trim().length === 0 ? 'not-allowed' : 'pointer'
                              }}
                            >
                              {bugSending ? 'Envoi...' : 'Envoyer'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowBugForm(false);
                                setBugMessage('');
                                setBugSent(null);
                              }}
                              style={{
                                padding: '0.35rem 0.6rem',
                                fontSize: '0.85rem',
                                borderRadius: '6px',
                                border: '1px solid rgba(0,0,0,0.12)',
                                background: 'transparent',
                                color: 'inherit',
                                cursor: 'pointer'
                              }}
                            >
                              Annuler
                            </button>
                          </div>
                          {bugSent === 'error' && (
                            <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.3rem' }}>
                              Échec de l'envoi du rapport.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </nav>
      {/* Enhanced Logout Section at the bottom */}
      <div style={{marginTop: 'auto'}}>
        <div className="sidebar-footer">
          <button
            className="btn btn-logout"
            onClick={(e) => {
              // Clear focus state before logout to prevent sticking
              setFocusedItem(null);
              setHoveredItem(null);
              // Blur the current element to remove focus
              e.target.blur();
              onLogout();
            }}
            onFocus={() => setFocusedItem('logout')}
            onBlur={() => setFocusedItem(null)}
            aria-label="Se déconnecter"
          >
            <div className="btn-content">
              <i className="fas fa-sign-out-alt" aria-hidden="true"></i>
              <span>{t('logout')}</span>
            </div>
            <div className="btn-hover-effect"></div>
            <div className="btn-ripple"></div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default Sidebar; 