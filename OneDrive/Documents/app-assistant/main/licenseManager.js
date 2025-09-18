const { app } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

// Optional dependency; if unavailable, we fall back to reg.exe
let WinReg = null;
try { WinReg = require('winreg'); } catch {}
let dpapi = null;
try { dpapi = require('win-dpapi'); } catch {}

// Public key for license verification (Ed25519).
// Resolution order:
// 1) LICENSE_PUBKEY_PEM (PEM content)
// 2) LICENSE_PUBKEY_PATH (file path to PEM)
// 3) Local fallback file one level up from this file: ../ed25519-pub.pem (if present in packaged app dir)
const PUBLIC_KEY_PEM =
  process.env.LICENSE_PUBKEY_PEM
  || (process.env.LICENSE_PUBKEY_PATH ? safeRead(process.env.LICENSE_PUBKEY_PATH) : null)
  || safeRead(path.join(__dirname, '..', 'ed25519-pub.pem'))
  || null;
// Log which source we used for the public key to avoid mismatch confusion
const PUBKEY_SOURCE = process.env.LICENSE_PUBKEY_PEM
  ? 'env:LICENSE_PUBKEY_PEM'
  : (process.env.LICENSE_PUBKEY_PATH
      ? `file:${process.env.LICENSE_PUBKEY_PATH}`
      : path.join(__dirname, '..', 'ed25519-pub.pem'));
try {
  console.log('[LICENSE] Public key source:', PUBLIC_KEY_PEM ? PUBKEY_SOURCE : 'none');
} catch {}
function safeRead(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function b64urlToBuf(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  return Buffer.from(s + '='.repeat(pad), 'base64');
}

function bufToB64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// --- Secret material for local integrity (DPAPI-protected where available) ---
const SecretManager = {
  path: path.join(app.getPath('userData'), 'secret.bin'),
  getPepperFallback() {
    return process.env.LICENSE_PEPPER || 'MEDOPS_STATIC_PEPPER_2024_11';
  },
  getSecretBuffer() {
    // Prefer DPAPI to protect a random per-user secret
    if (dpapi) {
      try {
        if (fs.existsSync(this.path)) {
          const enc = fs.readFileSync(this.path);
          const dec = dpapi.unprotectData(enc, null, 'CurrentUser');
          return Buffer.from(dec);
        }
        const rnd = crypto.randomBytes(32);
        const enc = dpapi.protectData(rnd, null, 'CurrentUser');
        fs.writeFileSync(this.path, enc);
        return rnd;
      } catch {}
    }
    // Fallback to in-memory derived pepper (not written unprotected to disk)
    return Buffer.from(this.getPepperFallback(), 'utf8');
  }
};

function computeHmacStamp(payload, keyBuf) {
  const fp = String(payload.fingerprint || '');
  const exp = String(payload.expires_at || '');
  const lic = String(payload.license_id || '');
  return crypto.createHmac('sha256', keyBuf).update(`${fp}|${exp}|${lic}`).digest('hex');
}

function getStampFilePath() {
  const dataDir = path.join(app.getPath('userData'), 'Data');
  try { if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true }); } catch {}
  return path.join(dataDir, 'license.stamp');
}

// ProgramData mirror for resilience across reinstalls
const PROGRAM_DATA_DIR = process.env.PROGRAMDATA || 'C:\\ProgramData';
const PROGRAM_DATA_APP_DIR = path.join(PROGRAM_DATA_DIR, 'MedOps');
function getProgramDataStorePath() {
  return path.join(PROGRAM_DATA_APP_DIR, 'license.json');
}

// ProgramData ledger of consumed license IDs (per-machine, survives user profile wipes)
function getConsumedLedgerPath() {
  return path.join(PROGRAM_DATA_APP_DIR, 'consumed-licenses.json');
}

function readConsumedLedger() {
  try {
    const p = getConsumedLedgerPath();
    if (!fs.existsSync(p)) return { version: 1, license_ids: [] };
    const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!obj || !Array.isArray(obj.license_ids)) return { version: 1, license_ids: [] };
    return obj;
  } catch { return { version: 1, license_ids: [] }; }
}

function writeConsumedLedger(ledger) {
  try {
    if (!fs.existsSync(PROGRAM_DATA_APP_DIR)) fs.mkdirSync(PROGRAM_DATA_APP_DIR, { recursive: true });
    fs.writeFileSync(getConsumedLedgerPath(), JSON.stringify(ledger, null, 2));
  } catch {}
}

async function execAsync(cmd) {
  return new Promise((resolve) => {
    child_process.exec(cmd, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({ error, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

async function getMachineGuid() {
  // Prefer WinReg if available
  if (WinReg) {
    try {
      const regKey = new WinReg({ hive: WinReg.HKLM, key: '\\SOFTWARE\\Microsoft\\Cryptography' });
      const guid = await new Promise((resolve) => regKey.get('MachineGuid', (err, item) => resolve(err ? null : (item && item.value))));
      if (guid) return guid;
    } catch {}
  }
  // Fallback to reg.exe
  try {
    const res = await execAsync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid');
    const m = res.stdout.match(/MachineGuid\s+REG_[A-Z_]+\s+([\w-]+)/i);
    if (m) return m[1];
  } catch {}
  return null;
}

async function getCsProductUUID() {
  // Try PowerShell CIM first for reliability
  let res = await execAsync('powershell -NoProfile -Command "(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID"');
  if (!res.error) {
    const line = res.stdout.split(/\r?\n/).map(s => s.trim()).find(Boolean);
    if (line && /[0-9A-Fa-f-]{8,}/.test(line)) return line;
  }
  // Fallback to wmic
  res = await execAsync('wmic csproduct get uuid /value');
  if (!res.error) {
    const m = res.stdout.match(/UUID=([0-9A-Fa-f-]+)/);
    if (m) return m[1];
  }
  res = await execAsync('wmic csproduct get uuid');
  if (!res.error) {
    const lines = res.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const val = lines.find(l => /[0-9A-Fa-f-]{8,}/.test(l) && l.toLowerCase() !== 'uuid');
    if (val) return val;
  }
  return null;
}

async function getVolumeSerial() {
  // Use vol command for C:
  try {
    const res = await execAsync('cmd /c vol C:');
    const m = res.stdout.match(/Serial Number is ([\w-]+)/i);
    if (m) return m[1];
  } catch {}
  return null;
}

async function getMachineFingerprint() {
  const [guid, csuuid, vol] = await Promise.all([
    getMachineGuid(),
    getCsProductUUID(),
    getVolumeSerial(),
  ]);
  const parts = [];
  if (guid) parts.push(`guid:${guid}`);
  if (csuuid) parts.push(`csuuid:${csuuid}`);
  if (vol) parts.push(`vol:${vol}`);
  const material = parts.join('|');
  return sha256Hex(material);
}

// License format: base64url(JSON payload) + '.' + base64url(signature)
// Payload fields: { fingerprint, issued_at, expires_at, license_id, customer_id, edition, license_version }

function getStorePath() {
  return path.join(app.getPath('userData'), 'license.json');
}

function loadStored() {
  try {
    const p = getStorePath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return null; }
}

function saveStored(obj) {
  const p = getStorePath();
  const keyBuf = SecretManager.getSecretBuffer();
  // Attach/refresh HMAC stamp
  if (obj && obj.payload) {
    obj.stampHmac = computeHmacStamp(obj.payload, keyBuf);
  }
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
  // Write secondary stamp file for cross-check (best-effort)
  try {
    const stampPath = getStampFilePath();
    const content = JSON.stringify({ stampHmac: obj.stampHmac || null }, null, 2);
    fs.writeFileSync(stampPath, content);
  } catch {}
  // Mirror full license to ProgramData for recovery after reinstall (best-effort)
  try {
    if (!fs.existsSync(PROGRAM_DATA_APP_DIR)) {
      fs.mkdirSync(PROGRAM_DATA_APP_DIR, { recursive: true });
    }
    const pdPath = getProgramDataStorePath();
    fs.writeFileSync(pdPath, JSON.stringify(obj, null, 2));
  } catch {}
}

function verifySignatureEd25519(payloadJson, sigB64u) {
  try {
    if (!PUBLIC_KEY_PEM) {
      console.warn('[LICENSE] No public key available for verification');
      return false;
    }
    const keyObj = crypto.createPublicKey(PUBLIC_KEY_PEM);
    const sig = b64urlToBuf(sigB64u);
    const data = Buffer.from(payloadJson, 'utf8');
    const ok = crypto.verify(null, data, keyObj, sig); // Ed25519: algorithm null
    try { console.log('[LICENSE] verifySignatureEd25519', { dataLen: data.length, sigLen: sig.length, ok }); } catch {}
    return ok;
  } catch (e) {
    console.warn('[LICENSE] Signature verify failed:', e.message);
    return false;
  }
}

function nowUtcMs() { return Date.now(); }

function daysBetweenUtc(aMs, bMs) {
  return Math.floor((bMs - aMs) / (24 * 3600 * 1000));
}

// Parse and validate token, returning { payload, payloadJson, sigB64u } or null
function parseLicenseKey(key) {
  try {
    if (!key || typeof key !== 'string') return null;
    // Normalize Unicode and strip whitespace/hidden chars; normalize common Unicode dashes to ASCII '-'
    let s = key.normalize('NFKC').replace(/\s+/g, '');
    // Remove zero-width, BOM, and other formatting characters that can sneak in from copy/paste or terminals
    s = s.replace(/[\u200B-\u200D\uFEFF\u00AD\u2060\u180E]/g, '');
    s = s.replace(/[\u2010-\u2015\u2212]/g, '-');
    const dotIdx = s.indexOf('.');
    if (dotIdx <= 0 || dotIdx >= s.length - 1) {
      console.warn('[LICENSE] Malformed token: missing or invalid dot separator');
      return null;
    }
    let pB64u = s.slice(0, dotIdx);
    let sigB64u = s.slice(dotIdx + 1);
    // Validate characters: do NOT strip; reject if any non-base64url chars exist
    const invPayload = pB64u.match(/[^A-Za-z0-9_-]/g);
    const invSig = sigB64u.match(/[^A-Za-z0-9_-]/g);
    if (invPayload || invSig) {
      const toCodes = (arr) => (arr || []).slice(0, 8).map(ch => `U+${ch.codePointAt(0).toString(16).toUpperCase()}`);
      console.warn('[LICENSE] Malformed token: invalid_chars_in_parts', {
        invalidInPayload: toCodes(invPayload),
        invalidInSig: toCodes(invSig),
      });
      return null;
    }
    if (!pB64u || !sigB64u) {
      console.warn('[LICENSE] Malformed token: empty payload or signature');
      return null;
    }
    if (pB64u.length < 16 || sigB64u.length < 32) {
      console.warn('[LICENSE] Malformed token: suspicious part lengths', { payloadLen: pB64u.length, sigLen: sigB64u.length });
    }

    // Decode payload
    const payloadBuf = b64urlToBuf(pB64u);
    let payloadJson = Buffer.from(payloadBuf).toString('utf8');
    let payload;
    try {
      payload = JSON.parse(payloadJson);
    } catch {
      // Fallback: try direct base64 decode in case already normalized
      try {
        payloadJson = Buffer.from(pB64u, 'base64').toString('utf8');
        payload = JSON.parse(payloadJson);
      } catch {
        // Diagnostic: show a short, escaped preview to help identify stray characters
        const preview = JSON.stringify((payloadJson || '').slice(0, 120));
        // Additional diagnostics
        const looksLikeJson = payloadBuf && payloadBuf[0] === 0x7b; // '{'
        const hexSnippet = Buffer.from(payloadBuf.slice(0, 24)).toString('hex');
        const last20Payload = pB64u.slice(-20);
        const dashesPayload = (pB64u.match(/-/g) || []).length;
        const dashesSig = (sigB64u.match(/-/g) || []).length;
        console.warn('[LICENSE] Malformed token: payload JSON parse failed after decoding', {
          payloadB64uLen: pB64u.length,
          sigB64uLen: sigB64u.length,
          dashesInPayload: dashesPayload,
          dashesInSig: dashesSig,
          looksLikeJsonStart: looksLikeJson,
          payloadHexFirst24B: hexSnippet,
          payloadUtf8Preview: preview,
          payloadB64uTail: last20Payload,
        });
        return null;
      }
    }
    return { payload, payloadJson, sigB64u };
  } catch {
    console.warn('[LICENSE] Malformed token: unexpected parse error');
    return null;
  }
}

async function verifyLicenseKey(key) {
  const parsed = parseLicenseKey(key);
  if (!parsed) { console.warn('[LICENSE] verifyLicenseKey: malformed token'); return { ok: false, reason: 'malformed' }; }

  const { payload, payloadJson, sigB64u } = parsed;
  const okSig = verifySignatureEd25519(payloadJson, sigB64u);
  if (!okSig) { console.warn('[LICENSE] verifyLicenseKey: bad_signature'); return { ok: false, reason: 'bad_signature' }; }

  // Validate payload required fields
  for (const f of ['fingerprint', 'issued_at', 'expires_at', 'license_version']) {
    if (!payload[f]) { console.warn('[LICENSE] verifyLicenseKey: missing field', f); return { ok: false, reason: `missing_${f}` }; }
  }

  // Fingerprint must match
  const localFp = await getMachineFingerprint();
  if (!localFp || payload.fingerprint !== localFp) {
    console.warn('[LICENSE] verifyLicenseKey: fingerprint_mismatch', { payloadFp: payload.fingerprint, localFp });
    return { ok: false, reason: 'fingerprint_mismatch' };
  }

  // Time validity
  const now = nowUtcMs();
  if (now < Number(payload.issued_at) - 24 * 3600 * 1000) {
    console.warn('[LICENSE] verifyLicenseKey: not_yet_valid', { now, issued_at: Number(payload.issued_at) });
    return { ok: false, reason: 'not_yet_valid' };
  }
  if (now > Number(payload.expires_at)) {
    console.warn('[LICENSE] verifyLicenseKey: expired', { now, expires_at: Number(payload.expires_at) });
    return { ok: false, reason: 'expired' };
  }

  try { console.log('[LICENSE] verifyLicenseKey: ok', { exp: Number(payload.expires_at) }); } catch {}
  return { ok: true, payload };
}

async function activateLicense(key) {
  const res = await verifyLicenseKey(key);
  if (!res.ok) return res;
  const payload = res.payload;

  // Enforce per-machine single-use of a license_id: once activated on this machine, the same license_id
  // cannot be used to initialize a new activation again (e.g., after reinstall). This prevents reusing the
  // same key for another activation period.
  const existing = loadStored();
  try {
    const ledger = readConsumedLedger();
    const list = new Set(ledger.license_ids || []);
    const licId = payload.license_id || null;
    if (licId) {
      if (list.has(licId)) {
        // If we already have an installed license with the same ID, consider it already activated;
        // otherwise block reuse as consumed.
        if (existing && existing.payload && existing.payload.license_id === licId) {
          return { ok: false, reason: 'already_activated' };
        }
        return { ok: false, reason: 'license_consumed' };
      }
    }
  } catch {}
  const record = {
    key,
    payload,
    activated_at: nowUtcMs(),
    last_seen: nowUtcMs(),
    stamp: sha256Hex(`${payload.fingerprint}|${payload.expires_at}|${payload.license_id || ''}`),
    version: 1
  };
  saveStored(record);
  // Optionally mirror a small stamp in HKCU
  try {
    if (WinReg) {
      const regKey = new WinReg({ hive: WinReg.HKCU, key: '\\Software\\MedOps' });
      regKey.set('LicenseStamp', 'REG_SZ', record.stamp, () => {});
    }
  } catch {}
  return { ok: true, payload };
}

async function getStatus() {
  let stored = loadStored();
  // If userData store is missing (fresh reinstall), try ProgramData mirror
  if (!stored) {
    try {
      const pdPath = getProgramDataStorePath();
      if (fs.existsSync(pdPath)) {
        const candidate = JSON.parse(fs.readFileSync(pdPath, 'utf8'));
        if (candidate && candidate.key) {
          const v = await verifyLicenseKey(candidate.key);
          if (v && v.ok) {
            // Restore to userData and proceed
            saveStored(candidate);
            stored = candidate;
            try { console.log('[LICENSE] Restored license from ProgramData mirror'); } catch {}
          }
        }
      }
    } catch {}
  }
  if (!stored) return { state: 'unlicensed' };

  // Anti-rollback: if clock moved back more than 48h vs last_seen, invalidate
  const now = nowUtcMs();
  if (now + 48 * 3600 * 1000 < Number(stored.last_seen || 0)) {
    return { state: 'invalid', reason: 'clock_rollback' };
  }

  // Integrity checks: HMAC over critical payload fields
  try {
    const keyBuf = SecretManager.getSecretBuffer();
    if (!stored.payload) {
      return { state: 'invalid', reason: 'missing_payload' };
    }
    // Migration: if legacy record lacks stampHmac, compute and persist once
    if (!stored.stampHmac) {
      stored.stampHmac = computeHmacStamp(stored.payload, keyBuf);
      try { saveStored(stored); } catch {}
    }
    const expected = computeHmacStamp(stored.payload, keyBuf);
    if (stored.stampHmac !== expected) {
      return { state: 'invalid', reason: 'tamper_hmac' };
    }
    // Cross-check with secondary stamp file
    try {
      const sPath = getStampFilePath();
      if (fs.existsSync(sPath)) {
        const aux = JSON.parse(fs.readFileSync(sPath, 'utf8'));
        if (!aux || aux.stampHmac !== stored.stampHmac) {
          // Attempt auto-repair by rewriting the expected stamp
          try {
            fs.writeFileSync(sPath, JSON.stringify({ stampHmac: stored.stampHmac }, null, 2));
          } catch {}
        }
      } else {
        // Missing secondary stamp: best-effort repair instead of invalidating
        try {
          const content = JSON.stringify({ stampHmac: stored.stampHmac }, null, 2);
          fs.writeFileSync(sPath, content);
        } catch {}
      }
    } catch {
      // Ignore stampfile read/repair errors; continue if signature remains valid
    }
    // Cross-check with registry minimal stamp (best-effort): repair instead of invalidating
    try {
      if (WinReg) {
        const regKey = new WinReg({ hive: WinReg.HKCU, key: '\\Software\\MedOps' });
        const regVal = await new Promise((resolve) => regKey.get('LicenseStamp', (err, item) => resolve(err ? null : (item && item.value))));
        if (regVal && regVal !== stored.stamp) {
          try { regKey.set('LicenseStamp', 'REG_SZ', stored.stamp, () => {}); } catch {}
        } else if (!regVal) {
          try { regKey.set('LicenseStamp', 'REG_SZ', stored.stamp, () => {}); } catch {}
        }
      }
    } catch {}
  } catch {
    return { state: 'invalid', reason: 'integrity_error' };
  }

  // Re-verify signature and fingerprint and expiry
  const v = await verifyLicenseKey(stored.key);
  if (!v.ok) return { state: 'invalid', reason: v.reason };

  // Update last_seen if moving forward by >= 1 hour
  if (now - Number(stored.last_seen || 0) > 3600 * 1000) {
    stored.last_seen = now;
    saveStored(stored);
  }

  const expires = Number(v.payload.expires_at);
  const daysLeft = Math.max(0, daysBetweenUtc(now, expires));
  const expired = now > expires;
  // If expired, mark this license_id as consumed in ProgramData so it cannot be used again on this machine
  if (expired) {
    try {
      const licId = (stored && stored.payload && stored.payload.license_id) || (v.payload && v.payload.license_id) || null;
      if (licId) {
        const ledger = readConsumedLedger();
        const set = new Set(ledger.license_ids || []);
        if (!set.has(licId)) {
          set.add(licId);
          writeConsumedLedger({ version: 1, license_ids: Array.from(set) });
        }
      }
    } catch {}
    return { state: 'expired', expires_at: expires, days_left: 0 };
  }
  return { state: 'valid', expires_at: expires, days_left: daysLeft, payload: v.payload };
}

module.exports = {
  getMachineFingerprint,
  verifyLicenseKey,
  activateLicense,
  getStatus,
};
