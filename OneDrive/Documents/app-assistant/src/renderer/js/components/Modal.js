import React from 'react';

function Modal({ isOpen = true, onClose, children, width = '700px', height = 'auto', closeOnBackdropClick = true, closeOnEscape = true }) {
  if (!isOpen) return null;
  return (
    <div className="modal-backdrop" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0,0,0,0.45)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          padding: '2rem',
          minWidth: width,
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          position: 'relative',
        }}
        onKeyDown={(e) => {
          // Prevent Enter from submitting any parent form
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
          } else if (e.key === 'Escape' && closeOnEscape) {
            e.preventDefault();
            e.stopPropagation();
            if (onClose) onClose();
          }
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            color: '#888',
          }}
          aria-label="Fermer"
        >
          <i className="fas fa-times"></i>
        </button>
        {children}
      </div>
    </div>
  );
}

export default Modal; 