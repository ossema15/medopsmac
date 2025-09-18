import React, { useMemo, useState } from 'react';

export default function FirstRun({ onSetupComplete }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [showCodesModal, setShowCodesModal] = useState(false);

  // Simpler requirement: at least 6 characters
  const passwordStrongEnough = (pwd) => typeof pwd === 'string' && pwd.length >= 6;

  const strength = useMemo(() => {
    const len = password.length;
    if (!len) return { label: 'Enter a password', color: '#ccc', width: '0%' };
    if (len < 6) return { label: 'Too short', color: '#e55353', width: '25%' };
    if (len < 10) return { label: 'Good', color: '#2eb85c', width: '70%' };
    return { label: 'Strong', color: '#39f', width: '100%' };
  }, [password]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (!passwordStrongEnough(password)) {
      setError('Use at least 6 characters');
      return;
    }

    try {
      setBusy(true);
      const res = await window.electronAPI.saveCredentials({ username: username.trim(), password });
      const codes = res && res.recoveryCodes ? res.recoveryCodes : [];
      setRecoveryCodes(codes);
      setSuccess('Credentials saved. Please store your recovery codes.');
      setShowCodesModal(true);
    } catch (e) {
      setError(e?.message || 'Failed to save credentials');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 16px',
      background: 'linear-gradient(135deg, #0d6efd0d 0%, #6610f20f 100%)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: 540,
        background: '#fff',
        borderRadius: 16,
        boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        border: '1px solid #f1f3f5'
      }}>
        <div style={{ padding: 24, borderBottom: '1px solid #f1f3f5', background: 'linear-gradient(180deg,#ffffff 0,#fafbff 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg,#0d6efd,#6610f2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              boxShadow: '0 6px 14px rgba(13,110,253,0.25)'
            }}>
              <span style={{ fontSize: 22, fontWeight: 700 }}>M</span>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 0.2 }}>MedOps Setup</div>
              <div style={{ fontSize: 13, color: '#6c757d' }}>Create your administrator access</div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label style={{ fontWeight: 600, fontSize: 13 }}>Username</label>
            <input
              className="form-control"
              placeholder="e.g., admin"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label style={{ fontWeight: 600, fontSize: 13 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-control"
                placeholder="Minimum 6 characters"
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                required
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  border: '1px solid #e9ecef', background: '#f8f9fa', color: '#495057',
                  padding: '6px 10px', borderRadius: 8, cursor: 'pointer'
                }}
              >{showPwd ? 'Hide' : 'Show'}</button>
            </div>

            {/* Strength bar */}
            <div style={{ marginTop: 8 }}>
              <div style={{ height: 8, background: '#e9ecef', borderRadius: 999 }}>
                <div style={{ height: 8, width: strength.width, background: strength.color, borderRadius: 999, transition: 'width .25s' }} />
              </div>
              <div style={{ fontSize: 12, color: '#6c757d', marginTop: 6 }}>{strength.label}</div>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 6 }}>
            <label style={{ fontWeight: 600, fontSize: 13 }}>Confirm Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-control"
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={busy}
                required
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  border: '1px solid #e9ecef', background: '#f8f9fa', color: '#495057',
                  padding: '6px 10px', borderRadius: 8, cursor: 'pointer'
                }}
              >{showConfirm ? 'Hide' : 'Show'}</button>
            </div>
          </div>

          {error && <div className="alert alert-danger" style={{ marginTop: 10 }}>{error}</div>}
          {success && <div className="alert alert-success" style={{ marginTop: 10 }}>{success}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy}
              style={{ padding: '10px 16px', fontWeight: 600 }}
            >{busy ? 'Saving…' : 'Save and Continue'}</button>
          </div>
        </form>
      </div>
    </div>

    {showCodesModal && (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
      }}>
        <div style={{
          width: '100%', maxWidth: 520, background: '#fff', borderRadius: 14,
          boxShadow: '0 20px 40px rgba(0,0,0,0.18)', padding: 20, border: '1px solid #f1f3f5'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>Your recovery codes</h3>
          </div>
          <p style={{ color: '#6c757d', marginTop: 8 }}>Keep these codes safe. Each code can reset your password once if you forget it. We do not store them in plain text.</p>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr 1fr', marginTop: 12 }}>
            {(recoveryCodes || []).map((c, idx) => (
              <div key={idx} style={{
                border: '1px dashed #dee2e6', borderRadius: 10, padding: '12px 10px',
                textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, letterSpacing: 2, background: '#f8f9fa'
              }}>{c}</div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText((recoveryCodes || []).join('\n'));
                } catch {}
              }}
            >Copy</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setShowCodesModal(false);
                setTimeout(() => onSetupComplete && onSetupComplete(), 100);
              }}
            >I saved them</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
