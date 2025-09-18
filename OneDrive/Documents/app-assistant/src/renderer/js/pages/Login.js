import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

console.log('[DEBUG] Login component loaded');

function Login({ onLogin }) {
  const { t } = useTranslation();
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [autoLogin, setAutoLogin] = useState(false);
  const [focusedField, setFocusedField] = useState('');
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [screenSize, setScreenSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  // Load auto-login preference on component mount
  useEffect(() => {
    const savedAutoLogin = localStorage.getItem('medops_auto_login');
    if (savedAutoLogin === 'true') {
      setAutoLogin(true);
      // Load saved credentials if auto-login is enabled
      const savedCredentials = localStorage.getItem('medops_saved_credentials');
      if (savedCredentials) {
        try {
          const parsed = JSON.parse(savedCredentials);
          setCredentials(parsed);
        } catch (error) {
          console.error('Error parsing saved credentials:', error);
        }
      }
    }
  }, []);

  // Check if this is first time setup
  useEffect(() => {
    const checkFirstTime = async () => {
      try {
        if (window.electronAPI && window.electronAPI.isFirstTimeSetup) {
          const firstTime = await window.electronAPI.isFirstTimeSetup();
          setIsFirstTime(firstTime);
        }
      } catch (error) {
        console.error('Error checking first time setup:', error);
      }
    };
    checkFirstTime();
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setScreenSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');
    try {
      // Save auto-login preference and credentials if checkbox is checked
      if (autoLogin) {
        localStorage.setItem('medops_auto_login', 'true');
        localStorage.setItem('medops_saved_credentials', JSON.stringify(credentials));
      } else {
        localStorage.removeItem('medops_auto_login');
        localStorage.removeItem('medops_saved_credentials');
      }

      // Use new credential system
      const valid = await window.electronAPI.verifyCredentials(credentials);
      if (!valid) {
        setLoginError(t('loginError') || 'Identifiants incorrects');
        setLoading(false);
        return;
      }
      await onLogin(credentials);
      setLoginError('');
    } catch (error) {
      setLoginError(t('loginError') || 'Identifiants incorrects');
      setLoading(false);
      return;
    }
    setLoading(false);
  };

  const handleChange = (e) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value
    });
    if (loginError) setLoginError('');
  };

  const handleAutoLoginChange = (e) => {
    setAutoLogin(e.target.checked);
  };

  const handleFieldFocus = (fieldName) => {
    setFocusedField(fieldName);
  };

  const handleFieldBlur = () => {
    setFocusedField('');
  };

  // Responsive calculations
  const isMobile = screenSize.width < 768;
  const isTablet = screenSize.width >= 768 && screenSize.width < 1024;
  const isDesktop = screenSize.width >= 1024;
  const isLandscape = screenSize.width > screenSize.height;
  const isFullscreen = window.innerHeight === screen.height;
  const isUltraWide = screenSize.width >= 1920;
  const isSmallHeight = screenSize.height < 600;

  // Dynamic sizing based on screen size
  const getCardStyles = () => {
    const baseStyles = {
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(20px)',
      borderRadius: '20px', // slightly smaller
      boxShadow: '0 18px 36px -10px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.08)',
      position: 'relative',
      overflow: 'hidden',
      animation: 'slideInUp 0.6s ease-out'
    };

    if (isMobile) {
      return {
        ...baseStyles,
        width: 'calc(100vw - 2rem)',
        maxWidth: '320px', // was 400px
        padding: '1.25rem 1rem', // was 2rem 1.5rem
        margin: '0.5rem',
        borderRadius: '12px' // was 16px
      };
    } else if (isTablet) {
      return {
        ...baseStyles,
        width: '100%',
        maxWidth: '340px', // was 450px
        padding: '1.5rem 1.25rem' // was 2.5rem 2rem
      };
    } else if (isUltraWide) {
      return {
        ...baseStyles,
        width: '100%',
        maxWidth: '360px', // was 500px
        padding: '2rem' // was 3.5rem
      };
    } else {
      return {
        ...baseStyles,
        width: '100%',
        maxWidth: '330px', // was 420px
        padding: '1.75rem' // was 3rem
      };
    }
  };

  const getInputStyles = () => {
    const baseInputStyles = {
      width: '100%',
      border: '2px solid #e2e8f0',
      borderRadius: '12px',
      fontSize: '1rem',
      background: 'white',
      transition: 'all 0.2s ease',
      outline: 'none'
    };

    if (isMobile) {
      return {
        ...baseInputStyles,
        padding: '0.875rem 0.875rem 0.875rem 2.75rem',
        fontSize: '16px', // Prevents zoom on iOS
        borderRadius: '10px'
      };
    } else if (isSmallHeight) {
      return {
        ...baseInputStyles,
        padding: '0.75rem 0.75rem 0.75rem 2.5rem',
        fontSize: '0.9rem'
      };
    } else {
      return {
        ...baseInputStyles,
        padding: '1rem 1rem 1rem 3rem'
      };
    }
  };

  const getIconStyles = () => {
    if (isMobile) {
      return {
        position: 'absolute',
        left: '0.875rem',
        top: '50%',
        transform: 'translateY(-50%)',
        color: '#a0aec0',
        fontSize: '1rem'
      };
    } else if (isSmallHeight) {
      return {
        position: 'absolute',
        left: '0.75rem',
        top: '50%',
        transform: 'translateY(-50%)',
        color: '#a0aec0',
        fontSize: '0.9rem'
      };
    } else {
      return {
        position: 'absolute',
        left: '1rem',
        top: '50%',
        transform: 'translateY(-50%)',
        color: '#a0aec0',
        fontSize: '1.1rem'
      };
    }
  };

  const getLogoStyles = () => {
    if (isMobile) {
      return {
        width: '36px', // was 60px
        height: '36px',
        borderRadius: '10px', // was 16px
        margin: '0 auto 0.5rem' // was 1rem
      };
    } else if (isSmallHeight) {
      return {
        width: '28px', // was 50px
        height: '28px',
        borderRadius: '8px', // was 12px
        margin: '0 auto 0.4rem' // was 0.75rem
      };
    } else if (isUltraWide) {
      return {
        width: '48px', // was 100px
        height: '48px',
        borderRadius: '12px', // was 24px
        margin: '0 auto 0.8rem' // was 2rem
      };
    } else {
      return {
        width: '40px', // was 80px
        height: '40px',
        borderRadius: '10px', // was 20px
        margin: '0 auto 0.7rem' // was 1.5rem
      };
    }
  };

  const getTitleStyles = () => {
    if (isMobile) {
      return {
        color: '#2d3748',
        fontSize: '1.75rem',
        fontWeight: '700',
        marginBottom: '0.25rem',
        letterSpacing: '-0.025em'
      };
    } else if (isSmallHeight) {
      return {
        color: '#2d3748',
        fontSize: '1.5rem',
        fontWeight: '700',
        marginBottom: '0.25rem',
        letterSpacing: '-0.025em'
      };
    } else if (isUltraWide) {
      return {
        color: '#2d3748',
        fontSize: '2.25rem',
        fontWeight: '700',
        marginBottom: '0.5rem',
        letterSpacing: '-0.025em'
      };
    } else {
      return {
        color: '#2d3748',
        fontSize: '2rem',
        fontWeight: '700',
        marginBottom: '0.5rem',
        letterSpacing: '-0.025em'
      };
    }
  };

  const getSubtitleStyles = () => {
    if (isMobile) {
      return {
        color: '#718096',
        fontSize: '0.9rem',
        margin: 0,
        fontWeight: '500'
      };
    } else if (isSmallHeight) {
      return {
        color: '#718096',
        fontSize: '0.85rem',
        margin: 0,
        fontWeight: '500'
      };
    } else if (isUltraWide) {
      return {
        color: '#718096',
        fontSize: '1.1rem',
        margin: 0,
        fontWeight: '500'
      };
    } else {
      return {
        color: '#718096',
        fontSize: '1rem',
        margin: 0,
        fontWeight: '500'
      };
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
      position: 'relative',
      overflow: 'hidden',
      padding: screenSize.width < 600 ? '0.5rem' : 'clamp(1rem, 4vw, 2rem)',
      width: '100%',
      maxWidth: '100vw',
      boxSizing: 'border-box'
    }}>
      {/* Animated background elements */}
      <div style={{
        position: 'absolute',
        top: '-50%',
        left: '-50%',
        width: '200%',
        height: '200%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)',
        backgroundSize: screenSize.width < 600 ? '30px 30px' : '50px 50px',
        animation: 'float 20s ease-in-out infinite',
        zIndex: 1
      }} />
      
      <div style={{
        position: 'absolute',
        top: screenSize.width < 600 ? '5%' : '10%',
        right: screenSize.width < 600 ? '5%' : '10%',
        width: screenSize.width < 600 ? 'clamp(60px, 20vw, 100px)' : 'clamp(100px, 20vw, 200px)',
        height: screenSize.width < 600 ? 'clamp(60px, 20vw, 100px)' : 'clamp(100px, 20vw, 200px)',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '50%',
        animation: 'pulse 4s ease-in-out infinite',
        zIndex: 1
      }} />
      
      <div style={{
        position: 'absolute',
        bottom: screenSize.width < 600 ? '10%' : '20%',
        left: screenSize.width < 600 ? '2%' : '5%',
        width: screenSize.width < 600 ? 'clamp(40px, 15vw, 80px)' : 'clamp(80px, 15vw, 150px)',
        height: screenSize.width < 600 ? 'clamp(40px, 15vw, 80px)' : 'clamp(80px, 15vw, 150px)',
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '50%',
        animation: 'pulse 6s ease-in-out infinite reverse',
        zIndex: 1
      }} />

      <div style={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        position: 'relative',
        zIndex: 2,
        padding: screenSize.width < 600 ? '0.5rem' : 'clamp(1rem, 4vw, 2rem)'
      }}>
        <div style={getCardStyles()}>
          {/* Card decoration */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, #667eea, #764ba2, #f093fb)',
            borderRadius: isMobile ? '16px 16px 0 0' : '24px 24px 0 0'
          }} />
          
          <div style={{
            position: 'absolute',
            top: isMobile ? '-30px' : '-50px',
            right: isMobile ? '-30px' : '-50px',
            width: isMobile ? '60px' : '100px',
            height: isMobile ? '60px' : '100px',
            background: 'linear-gradient(45deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1))',
            borderRadius: '50%',
            zIndex: -1
          }} />

          <div style={{ 
            textAlign: 'center', 
            marginBottom: isMobile ? '1.5rem' : isSmallHeight ? '1rem' : '2.5rem' 
          }}>
            <div style={{
              ...getLogoStyles(),
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 30px rgba(102, 126, 234, 0.3)',
              animation: 'float 3s ease-in-out infinite'
            }}>
              <span style={{
                fontSize: isMobile ? '1.5rem' : isSmallHeight ? '1.25rem' : isUltraWide ? '2.5rem' : '2rem',
                color: 'white',
                fontWeight: 'bold'
              }}>⚕</span>
            </div>
            
            <h1 style={getTitleStyles()}>
              MedOps
            </h1>
            
            <p style={getSubtitleStyles()}>
              Medical Practice Management
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ width: '100%' }}>
            <div style={{ 
              marginBottom: isMobile ? '1rem' : isSmallHeight ? '0.75rem' : '1.5rem' 
            }}>
              <div style={{
                position: 'relative',
                marginBottom: isMobile ? '0.75rem' : '1rem'
              }}>
                <input
                  placeholder="Enter your name"
                  type="text"
                  name="username"
                  value={credentials.username}
                  onChange={handleChange}
                  onFocus={() => handleFieldFocus('username')}
                  onBlur={handleFieldBlur}
                  required
                  autoFocus
                  style={{
                    ...getInputStyles(),
                    border: `2px solid ${focusedField === 'username' ? '#667eea' : '#e2e8f0'}`,
                    background: focusedField === 'username' ? '#f7fafc' : 'white',
                    boxShadow: focusedField === 'username' ? '0 0 0 3px rgba(102, 126, 234, 0.1)' : 'none'
                  }}
                />
                <span style={{
                  ...getIconStyles(),
                  color: focusedField === 'username' ? '#667eea' : '#a0aec0'
                }}>
                  <svg width={isMobile ? "18" : isSmallHeight ? "16" : "20"} height={isMobile ? "18" : isSmallHeight ? "16" : "20"} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M20.5899 22C20.5899 18.13 16.7399 15 11.9999 15C7.25991 15 3.40991 18.13 3.40991 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              </div>

              <div style={{
                position: 'relative'
              }}>
                <input
                  placeholder="Enter your password"
                  type="password"
                  name="password"
                  value={credentials.password}
                  onChange={handleChange}
                  onFocus={() => handleFieldFocus('password')}
                  onBlur={handleFieldBlur}
                  required
                  style={{
                    ...getInputStyles(),
                    border: `2px solid ${focusedField === 'password' ? '#667eea' : '#e2e8f0'}`,
                    background: focusedField === 'password' ? '#f7fafc' : 'white',
                    boxShadow: focusedField === 'password' ? '0 0 0 3px rgba(102, 126, 234, 0.1)' : 'none'
                  }}
                />
                <span style={{
                  ...getIconStyles(),
                  color: focusedField === 'password' ? '#667eea' : '#a0aec0'
                }}>
                  <svg width={isMobile ? "18" : isSmallHeight ? "16" : "20"} height={isMobile ? "18" : isSmallHeight ? "16" : "20"} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
                    <circle cx="12" cy="16" r="1" fill="currentColor"/>
                    <path d="M7 11V7C7 5.67392 7.52678 4.40215 8.46447 3.46447C9.40215 2.52678 10.6739 2 12 2C13.3261 2 14.5979 2.52678 15.5355 3.46447C16.4732 4.40215 17 5.67392 17 7V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              </div>
            </div>
            
            {/* Auto-login checkbox */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: isMobile ? '1rem' : isSmallHeight ? '0.75rem' : '1.5rem',
              padding: isMobile ? '0.5rem' : isSmallHeight ? '0.5rem' : '0.75rem',
              background: '#f7fafc',
              borderRadius: isMobile ? '6px' : '8px',
              border: '1px solid #e2e8f0'
            }}>
              <input
                type="checkbox"
                id="autoLogin"
                checked={autoLogin}
                onChange={handleAutoLoginChange}
                style={{
                  marginRight: isMobile ? '0.5rem' : '0.75rem',
                  transform: 'scale(1.2)',
                  accentColor: '#667eea'
                }}
              />
              <label htmlFor="autoLogin" style={{
                color: '#4a5568',
                fontSize: isMobile ? '0.8rem' : isSmallHeight ? '0.75rem' : '0.9rem',
                cursor: 'pointer',
                userSelect: 'none',
                fontWeight: '500'
              }}>
                Remember me and auto-login
              </label>
            </div>

            {/* Forgot password link */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginBottom: isMobile ? '0.75rem' : '1rem'
            }}>
              <button
                type="button"
                onClick={() => { setRecoveryError(''); setRecoveryCode(''); setShowRecoveryModal(true); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#667eea',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: isMobile ? '0.85rem' : isSmallHeight ? '0.8rem' : '0.95rem'
                }}
              >Forgot password?</button>
            </div>

            {loginError && (
              <div style={{
                background: '#fed7d7',
                color: '#c53030',
                padding: isMobile ? '0.5rem' : '0.75rem',
                borderRadius: isMobile ? '6px' : '8px',
                marginBottom: isMobile ? '0.75rem' : '1rem',
                fontSize: isMobile ? '0.8rem' : isSmallHeight ? '0.75rem' : '0.9rem',
                border: '1px solid #feb2b2',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span>⚠️</span>
                {loginError}
              </div>
            )}

            {isFirstTime && !loginError && (
              <div style={{
                background: '#e6fffa',
                color: '#234e52',
                padding: isMobile ? '0.5rem' : '0.75rem',
                borderRadius: isMobile ? '6px' : '8px',
                marginBottom: isMobile ? '0.75rem' : '1rem',
                fontSize: isMobile ? '0.8rem' : isSmallHeight ? '0.75rem' : '0.9rem',
                border: '1px solid #9ae6b4',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span>ℹ️</span>
                First time setup: Use username "admin" and password "admin" to create your account
              </div>
            )}
            
            <button 
              type="submit" 
              disabled={loading}
              style={{
                width: '100%',
                padding: isMobile ? '0.875rem' : isSmallHeight ? '0.75rem' : '1rem',
                background: loading ? '#a0aec0' : 'linear-gradient(135deg, #667eea, #764ba2)',
                color: 'white',
                border: 'none',
                borderRadius: isMobile ? '10px' : '12px',
                fontSize: isMobile ? '0.9rem' : isSmallHeight ? '0.85rem' : '1rem',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: loading ? 'none' : '0 4px 15px rgba(102, 126, 234, 0.3)',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 8px 25px rgba(102, 126, 234, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.3)';
                }
              }}
            >
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <div style={{
                    width: isMobile ? '14px' : isSmallHeight ? '12px' : '16px',
                    height: isMobile ? '14px' : isSmallHeight ? '12px' : '16px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTop: '2px solid white',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                  {t('loading') || 'Loading...'}
                </div>
              ) : (
                t('loginButton') || 'Sign In'
              )}
            </button>
          </form>
        </div>
      </div>
      
      <footer style={{
        width: '100%',
        textAlign: 'center',
        color: 'rgba(255,255,255,0.8)',
        fontSize: isMobile ? '0.75rem' : isSmallHeight ? '0.7rem' : '0.85rem',
        padding: isMobile ? '1rem 0' : isSmallHeight ? '0.75rem 0' : '1.5rem 0',
        letterSpacing: '0.02em',
        userSelect: 'none',
        position: 'relative',
        zIndex: 2
      }}>
        &copy; 2025 MedOps - Medical Operations Management System. All rights reserved.
      </footer>

      {showRecoveryModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{
            width: '100%', maxWidth: 460, background: '#fff', borderRadius: 14,
            boxShadow: '0 20px 40px rgba(0,0,0,0.18)', padding: 20, border: '1px solid #f1f3f5'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Use a recovery code</h3>
            </div>
            <p style={{ color: '#6c757d', marginTop: 8 }}>Enter one of the recovery codes you saved during first setup to reset your credentials. Your data will remain intact.</p>
            <input
              type="text"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
              placeholder="e.g. ABC123"
              style={{
                width: '100%', border: '1px solid #dee2e6', borderRadius: 10,
                padding: '12px 14px', fontFamily: 'monospace', fontWeight: 600, letterSpacing: 2
              }}
            />
            {recoveryError && (
              <div style={{
                marginTop: 10, background: '#fdeaea', color: '#b00020',
                border: '1px solid #f5c2c7', borderRadius: 8, padding: '8px 10px'
              }}>{recoveryError}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { if (!recoveryBusy) { setShowRecoveryModal(false); } }}
                disabled={recoveryBusy}
              >Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={recoveryBusy || !recoveryCode.trim()}
                onClick={async () => {
                  try {
                    setRecoveryBusy(true);
                    setRecoveryError('');
                    const res = await window.electronAPI.useRecoveryCode(recoveryCode.trim());
                    if (res && res.success) {
                      // Credentials removed; reload to trigger FirstRun
                      window.location.reload();
                    } else {
                      setRecoveryError(res && res.error ? res.error : 'Invalid or already-used code');
                    }
                  } catch (e) {
                    setRecoveryError(e?.message || 'Failed to use recovery code');
                  } finally {
                    setRecoveryBusy(false);
                  }
                }}
              >{recoveryBusy ? 'Verifying...' : 'Verify & Reset'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.1); }
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Responsive breakpoints */
        @media (max-width: 480px) {
          .login-container {
            padding: 0.25rem;
          }
        }

        @media (max-height: 500px) {
          .login-container {
            padding: 0.5rem;
          }
        }

        @media (min-width: 1920px) {
          .login-container {
            padding: 2rem;
          }
        }

        @media (orientation: landscape) and (max-height: 600px) {
          .login-container {
            padding: 0.5rem;
          }
        }

        /* Fullscreen mode adjustments */
        @media (display-mode: fullscreen) {
          .login-container {
            padding: 1rem;
          }
        }

        /* High DPI displays */
        @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
          .login-container {
            padding: 1rem;
          }
        }

        /* Reduced motion preferences */
        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }

        /* High contrast mode */
        @media (prefers-contrast: high) {
          .login-card {
            border: 2px solid #000;
          }
        }
      `}</style>
    </div>
  );
}

export default Login; 