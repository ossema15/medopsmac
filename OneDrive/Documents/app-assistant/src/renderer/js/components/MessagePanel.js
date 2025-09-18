import React, { useState, useEffect, useRef } from 'react';
import { wasClickedOutsideApp, safeFocus } from '../utils/focusUtils';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';

function generateUniqueId() {
  // Use UUID v4 for guaranteed uniqueness
  return uuidv4();
}

// Generate or retrieve a unique client ID for this assistant instance
const getClientId = () => {
  let id = localStorage.getItem('assistantClientId');
  if (!id) {
    id = uuidv4();
    localStorage.setItem('assistantClientId', id);
  }
  return id;
};

function MessagePanel({ onClose, messages, onAddMessage }) {
  const { t } = useTranslation();
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRefocusing, setIsRefocusing] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const clientId = getClientId();

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus the input when the panel opens
  useEffect(() => {
    if (inputRef.current) {
      // Use a small delay to ensure the panel is fully rendered
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          console.log('[DEBUG] Initial focus set on input');
        }
      }, 100);
    }
  }, []);

  // Add a global focus handler to maintain focus
  useEffect(() => {
    const handleWindowFocus = () => {
      // Only refocus if the user actually clicked outside the app window
      if (wasClickedOutsideApp() && inputRef.current) {
        safeFocus(inputRef.current, 10);
      }
    };

    const handleDocumentClick = (e) => {
      // If clicking inside the message panel but not on the input, refocus the input
      if (e.target.closest('.message-panel') && e.target !== inputRef.current) {
        console.log('[DEBUG] Click inside panel, refocusing input');
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
          }
        }, 10);
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('click', handleDocumentClick);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('click', handleDocumentClick);
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!newMessage.trim()) return;
    
    setLoading(true);
    try {
      const messageData = {
        id: generateUniqueId(),
        sender: 'assistant',
        senderId: clientId,
        message: newMessage,
        timestamp: new Date().toISOString()
      };
      await window.electronAPI.sendChatMessage(messageData);
      // Add message locally immediately for better UX
      onAddMessage && onAddMessage(messageData);
      setNewMessage('');
      
      // Refocus the input after sending message with a longer delay
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          console.log('[DEBUG] Refocused input after sending message');
        }
      }, 200);
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Erreur lors de l\'envoi du message');
    } finally {
      setLoading(false);
    }
  };

  const handleSendFile = async () => {
    try {
      const filePaths = await window.electronAPI.selectFiles();
      if (filePaths && filePaths.length > 0) {
        let patientId = null;
        let patientName = '';
        let yearOfBirth = '';
        if (messages.length > 0 && messages[messages.length-1].patientId) {
          patientId = messages[messages.length-1].patientId;
        } else {
          patientName = prompt('Nom du patient pour ce fichier ?');
          yearOfBirth = prompt('Année de naissance du patient ?');
          if (!patientName || !yearOfBirth) {
            alert('Patient requis pour l\'envoi de fichiers.');
            return;
          }
          patientId = `${patientName.toLowerCase()}_${yearOfBirth}`;
        }
        for (const filePath of filePaths) {
          const fileName = filePath.split('\\').pop();
          await window.electronAPI.sendFile({ patientId, fileName, filePath });
        }
      }
    } catch (error) {
      console.error('Error sending file:', error);
      alert('Erreur lors de l\'envoi du fichier');
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="message-panel" onClick={(e) => {
      // Only refocus if clicking on the panel itself, not on interactive elements
      if (e.target === e.currentTarget || e.target.closest('.message-body')) {
        if (inputRef.current) {
          inputRef.current.focus();
          console.log('[DEBUG] Refocused input after panel click');
        }
      }
    }}>
      <div className="message-header">
        <div>
          <i className="fas fa-comments" style={{ marginRight: '8px' }}></i>
          {t('messages')}
        </div>
        <button className="message-close" onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}>
          <i className="fas fa-times"></i>
        </button>
      </div>

      <div className="message-body">
        {messages.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            color: '#666', 
            padding: '2rem',
            fontStyle: 'italic'
          }}>
            <i className="fas fa-comments" style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.5 }}></i>
            <p>Aucun message</p>
            <p style={{ fontSize: '0.9rem' }}>Commencez la conversation</p>
          </div>
        ) : (
          <div>
            {messages.map((message, idx) => (
              <div
                key={message.id}
                style={{
                  marginBottom: '1rem',
                  display: 'flex',
                  justifyContent: message.senderId === clientId ? 'flex-end' : 'flex-start'
                }}
              >
                <div
                  style={{
                    maxWidth: '70%',
                    padding: '0.75rem 1rem',
                    borderRadius: '18px',
                    background: message.senderId === clientId 
                      ? 'linear-gradient(135deg, #667eea, #764ba2)' 
                      : '#f1f3f4',
                    color: message.senderId === clientId ? 'white' : '#333',
                    position: 'relative'
                  }}
                >
                  <div style={{ marginBottom: '0.25rem' }}>
                    {message.isFile ? (
                      <>
                        {message.message}
                        <button
                          style={{
                            marginLeft: '0.5rem',
                            background: '#e2e8f0',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '2px 8px',
                            cursor: 'pointer',
                            fontSize: '0.85em'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            window.electronAPI.openFile && window.electronAPI.openFile(message.filePath);
                          }}
                        >
                          Ouvrir
                        </button>
                      </>
                    ) : message.message}
                  </div>
                  <div style={{
                    fontSize: '0.75rem',
                    opacity: 0.7,
                    textAlign: message.senderId === clientId ? 'right' : 'left'
                  }}>
                    {formatTime(message.timestamp)}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <form onSubmit={handleSendMessage} className="message-input" onClick={(e) => {
        e.stopPropagation();
        // Ensure input is focused when clicking on the form
        if (inputRef.current && document.activeElement !== inputRef.current) {
          inputRef.current.focus();
        }
      }}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Tapez votre message..."
          disabled={loading}
          style={{ flex: 1 }}
          ref={inputRef}
          onClick={(e) => {
            e.stopPropagation();
            console.log('[DEBUG] Input clicked, ensuring focus');
          }}
          onKeyDown={(e) => {
            // Handle Enter key to send message
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.stopPropagation();
              if (!loading && newMessage.trim()) {
                handleSendMessage(e);
              }
            }
          }}
          onFocus={() => {
            console.log('[DEBUG] Input focused');
          }}
          onBlur={() => {
            console.log('[DEBUG] Input blurred');
            // Only refocus if we're not already refocusing and the panel is still open
            if (!isRefocusing) {
              setIsRefocusing(true);
              setTimeout(() => {
                if (inputRef.current && document.activeElement !== inputRef.current) {
                  console.log('[DEBUG] Refocusing input after blur');
                  inputRef.current.focus();
                }
                setIsRefocusing(false);
              }, 10);
            }
          }}
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleSendFile();
          }}
          disabled={loading}
          style={{
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            marginRight: '0.5rem',
            opacity: loading ? 0.5 : 1
          }}
          title="Envoyer un fichier"
        >
          <i className="fas fa-paperclip"></i>
        </button>
        <button
          type="submit"
          onClick={(e) => {
            e.stopPropagation();
          }}
          disabled={loading || !newMessage.trim()}
          style={{
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            opacity: loading || !newMessage.trim() ? 0.5 : 1
          }}
        >
          {loading ? (
            <span className="spinner" style={{ width: '16px', height: '16px' }}></span>
          ) : (
            <i className="fas fa-paper-plane"></i>
          )}
        </button>
      </form>
    </div>
  );
}

export default MessagePanel; 