import React, { useState, useEffect, useRef } from 'react';
import { notificationSoundManager } from '../utils/focusUtils';

function Notification({ id, message, subText = '', type = 'info', onClose, onClick, autoHide = true, duration = 10000, inline = false }) {
  const [isVisible, setIsVisible] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const soundPlayedRef = useRef(false);

  // Color and icon mapping for medical/notification types
  const typeStyles = {
    info:    { color: '#2563eb', bg: '#e7f0fd', icon: 'fa-info-circle' },
    warning: { color: '#ff922b', bg: '#fff4e6', icon: 'fa-exclamation-triangle' },
    error:   { color: '#e53e3e', bg: '#ffe5e5', icon: 'fa-heart-pulse' }, // medical
    success: { color: '#22c55e', bg: '#e6f9ee', icon: 'fa-check-circle' },
    chat:    { color: '#a259e6', bg: '#f3e8ff', icon: 'fa-comment-medical' }, // medical
    default: { color: '#64748b', bg: '#f1f5f9', icon: 'fa-bell' },
  };
  const style = typeStyles[type] || typeStyles.default;

  useEffect(() => {
    if (inline) return; // Don't auto-hide or animate inline notifications
    if (!isVisible) return;
    if (!autoHide) return; // Don't auto-hide if autoHide is false
    
    // Play sound if enabled and not a chat notification being opened
    const playNotificationSound = async () => {
      try {
        // Guard: ensure we only attempt once per notification instance
        if (soundPlayedRef.current) {
          return;
        }
        // Don't play sound for chat notifications when they're being opened
        if (type === 'chat' && onClick) {
          console.log('[DEBUG][Notification] Skipping sound for chat notification with onClick handler');
          return;
        }
        
        // Don't play sound if this notification is being clicked (opening chat panel)
        if (onClick && type === 'chat') {
          console.log('[DEBUG][Notification] Skipping sound for chat notification being clicked');
          return;
        }
        
        // Skip playing sound for expected patient notifications since sound is already played in App.js
        if (message && (message.toLowerCase().includes('est attendu maintenant') || message.toLowerCase().includes('expected to walk in'))) {
          console.log('[DEBUG][Notification] Skipping sound for expected patient notification - already played in App.js');
          return;
        }
        
        // Use centralized sound manager to prevent duplicates
        const soundType = message && message.toLowerCase().includes('expected to walk in') ? 'expectpatient' : 'normal';
        const notificationId = id || `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const played = await notificationSoundManager.playNotificationSound(soundType, notificationId);
        if (played) {
          soundPlayedRef.current = true;
        }
      } catch (err) {
        console.log('Could not play notification sound:', err);
      }
    };
    playNotificationSound();
    
    // Auto-hide after specified duration (default 2 seconds for regular notifications)
    const hideDelay = duration > 0 ? duration : 2000;
    const timer = setTimeout(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setIsVisible(false);
        if (onClose) onClose();
      }, 300); // Wait for fade-out animation to complete
    }, hideDelay);
    return () => clearTimeout(timer);
  }, [isVisible, message, inline, autoHide, duration, type, id]);

  if (!message || !isVisible) return null;

  if (inline) {
    // Inline notification styles
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        background: style.bg,
        border: `1.5px solid ${style.color}`,
        borderRadius: 8,
        padding: '1.1rem 1.5rem',
        marginBottom: 18,
        boxShadow: 'none',
        position: 'static',
        width: '100%',
        minHeight: 0,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border 0.2s, background 0.2s',
      }} onClick={onClick}>
        <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: style.color + '22', borderRadius: '50%' }}>
          <i className={`fas ${style.icon}`} style={{ color: style.color, fontSize: 18 }}></i>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 16, color: '#333' }}>{message}</div>
          {subText && <div style={{ fontSize: 14, color: '#888', marginTop: 2 }}>{subText}</div>}
        </div>
        {onClose && (
          <button onClick={e => { e.stopPropagation(); onClose(); }} style={{ background: 'none', border: 'none', color: '#888', fontSize: 18, cursor: 'pointer', marginLeft: 8 }} title="Fermer">&times;</button>
        )}
      </div>
    );
  }

  // Card and SVG styles
  const cardStyle = {
    width: '330px',
    height: '80px',
    borderRadius: '8px',
    boxSizing: 'border-box',
    padding: '10px 15px',
    backgroundColor: '#ffffff',
    boxShadow: 'rgba(149, 157, 165, 0.2) 0px 8px 24px',
    position: 'fixed',
    top: '2rem',
    right: '2rem',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    gap: '15px',
    zIndex: 9999,
    opacity: isAnimating ? 0 : 1,
    transform: isAnimating ? 'translateX(100%)' : 'translateX(0)',
    transition: 'all 0.3s ease-in-out',
    cursor: onClick ? 'pointer' : 'default',
  };
  const waveStyle = {
    position: 'absolute',
    transform: 'rotate(90deg)',
    left: '-31px',
    top: '32px',
    width: '80px',
    fill: '#4777ff3a',
    zIndex: 0,
  };
  const iconContainerStyle = {
    width: '35px',
    height: '35px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#4777ff48',
    borderRadius: '50%',
    marginLeft: '8px',
    zIndex: 1,
  };
  const iconStyle = {
    width: '17px',
    height: '17px',
    color: '#124fff',
  };
  const messageTextContainerStyle = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
    flexGrow: 1,
    zIndex: 1,
  };
  const messageTextStyle = {
    color: '#124fff',
    fontSize: '17px',
    fontWeight: 700,
    margin: 0,
    cursor: 'default',
  };
  const subTextStyle = {
    fontSize: '14px',
    color: '#555',
    margin: 0,
    cursor: 'default',
  };
  const crossIconStyle = {
    width: '18px',
    height: '18px',
    color: '#555',
    cursor: 'pointer',
    zIndex: 2,
  };

  return (
    <div style={cardStyle} className="card" onClick={onClick}>
      <svg className="wave" viewBox="0 0 1440 320" style={waveStyle} xmlns="http://www.w3.org/2000/svg">
        <path
          d="M0,256L11.4,240C22.9,224,46,192,69,192C91.4,192,114,224,137,234.7C160,245,183,235,206,213.3C228.6,192,251,160,274,149.3C297.1,139,320,149,343,181.3C365.7,213,389,267,411,282.7C434.3,299,457,277,480,250.7C502.9,224,526,192,549,181.3C571.4,171,594,181,617,208C640,235,663,277,686,256C708.6,235,731,149,754,122.7C777.1,96,800,128,823,165.3C845.7,203,869,245,891,224C914.3,203,937,117,960,112C982.9,107,1006,181,1029,197.3C1051.4,213,1074,171,1097,144C1120,117,1143,107,1166,133.3C1188.6,160,1211,224,1234,218.7C1257.1,213,1280,139,1303,133.3C1325.7,128,1349,192,1371,192C1394.3,192,1417,128,1429,96L1440,64L1440,320L1428.6,320C1417.1,320,1394,320,1371,320C1348.6,320,1326,320,1303,320C1280,320,1257,320,1234,320C1211.4,320,1189,320,1166,320C1142.9,320,1120,320,1097,320C1074.3,320,1051,320,1029,320C1005.7,320,983,320,960,320C937.1,320,914,320,891,320C868.6,320,846,320,823,320C800,320,777,320,754,320C731.4,320,709,320,686,320C662.9,320,640,320,617,320C594.3,320,571,320,549,320C525.7,320,503,320,480,320C457.1,320,434,320,411,320C388.6,320,366,320,343,320C320,320,297,320,274,320C251.4,320,229,320,206,320C182.9,320,160,320,137,320C114.3,320,91,320,69,320C45.7,320,23,320,11,320L0,320Z"
          fillOpacity="1"
        ></path>
      </svg>
      <div style={iconContainerStyle} className="icon-container">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          strokeWidth="0"
          fill="currentColor"
          stroke="currentColor"
          style={iconStyle}
          className="icon"
        >
          <path d="M13 7.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-3 3.75a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v4.25h.75a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1 0-1.5h.75V12h-.75a.75.75 0 0 1-.75-.75Z" />
          <path d="M12 1c6.075 0 11 4.925 11 11s-4.925 11-11 11S1 18.075 1 12 5.925 1 12 1ZM2.5 12a9.5 9.5 0 0 0 9.5 9.5 9.5 9.5 0 0 0 9.5-9.5A9.5 9.5 0 0 0 12 2.5 9.5 9.5 0 0 0 2.5 12Z" />
        </svg>
      </div>
      <div style={messageTextContainerStyle} className="message-text-container">
        <p style={messageTextStyle} className="message-text">{message}</p>
        {subText && <p style={subTextStyle} className="sub-text">{subText}</p>}
      </div>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 15 15"
        strokeWidth="0"
        fill="none"
        stroke="currentColor"
        style={crossIconStyle}
        className="cross-icon"
        onClick={e => { e.stopPropagation(); if (onClose) onClose(); }}
      >
        <path
          fill="currentColor"
          d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
          clipRule="evenodd"
          fillRule="evenodd"
        />
      </svg>
    </div>
  );
}

export default Notification; 