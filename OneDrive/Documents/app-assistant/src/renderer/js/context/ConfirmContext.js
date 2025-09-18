import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Modal from '../components/Modal';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState({
    open: false,
    title: '',
    message: '',
    confirmText: 'OK',
    cancelText: 'Annuler',
    variant: 'danger',
    showCancel: true,
    resolve: null,
  });

  // Guard to avoid immediately handling the triggering key/click event
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    if (state.open) {
      // Defer readiness to next tick so the event that opened the modal can't immediately confirm/cancel
      const t = setTimeout(() => setIsReady(true), 50);
      return () => clearTimeout(t);
    }
    setIsReady(false);
  }, [state.open]);

  const close = useCallback(() => setState(prev => ({ ...prev, open: false })), []);

  const confirm = useCallback(({
    title = 'Confirmation',
    message = '',
    confirmText = 'OK',
    cancelText = 'Annuler',
    variant = 'danger',
    showCancel = true,
  } = {}) => {
    return new Promise((resolve) => {
      console.debug('[Confirm] open', { title, message, confirmText, cancelText, variant, showCancel });
      setState({ open: true, title, message, confirmText, cancelText, variant, showCancel, resolve });
    });
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  const handleCancel = () => {
    console.debug('[Confirm] cancel');
    if (state.resolve) {
      console.debug('[Confirm] resolve', false);
      state.resolve(false);
    }
    close();
  };

  const handleConfirm = () => {
    console.debug('[Confirm] confirm');
    if (state.resolve) state.resolve(true);
    close();
  };

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal isOpen={state.open} onClose={handleCancel} width="520px" closeOnBackdropClick={false}>
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-message"
          onKeyDown={(e) => {
            // Ignore key handling until modal is fully ready
            if (!isReady) return;
            // Never auto-confirm on Enter to avoid instant dismissal
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            // Allow Escape to cancel
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              handleCancel();
            }
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}
        >
          {state.title ? (
            <h3 id="confirm-dialog-title" style={{ margin: 0 }}>{state.title}</h3>
          ) : null}
          <div id="confirm-dialog-message" style={{ whiteSpace: 'pre-wrap' }}>{state.message}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            {/* Autofocus the cancel button to avoid accidental confirmation when opening via Enter */}
            {state.showCancel ? (
              <button type="button" autoFocus onClick={handleCancel} style={{ padding: '0.6rem 1rem', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}>
                {state.cancelText}
              </button>
            ) : null}
            <button type="button" onClick={handleConfirm} style={{ padding: '0.6rem 1rem', borderRadius: 8, border: 'none', background: state.variant === 'danger' ? '#e53935' : '#1976d2', color: '#fff', cursor: 'pointer' }}>
              {state.confirmText}
            </button>
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx.confirm;
}
