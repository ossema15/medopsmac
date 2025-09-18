import React from 'react';

const ChatIcon = ({ unreadCount, onClick, isVisible = true }) => {
  console.log('[DEBUG][ChatIcon] Rendering with unreadCount:', unreadCount, 'isVisible:', isVisible, 'type:', typeof unreadCount);
  
  if (!isVisible) {
    console.log('[DEBUG][ChatIcon] Not visible, returning null');
    return null;
  }

  return (
    <div 
      className="chat-icon-container"
      onClick={onClick}
    >
      {/* Main chat icon */}
      <div className="chat-icon-main">
        <i className="fas fa-comments"></i>
      </div>

      {/* Unread count badge */}
      {unreadCount > 0 && (
        <div 
          className={`chat-unread-badge ${unreadCount > 0 ? 'has-count' : ''}`}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </div>
      )}
    </div>
  );
};

export default ChatIcon; 