const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
// Load environment variables from .env if present
try { require('dotenv').config(); } catch (e) { /* dotenv optional */ }
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { google } = require('googleapis');

const DatabaseManager = require(path.join(__dirname, 'app', 'database', 'database'));
const FileManager = require(path.join(__dirname, 'app', 'utils', 'fileManager'));
// encryption utils no longer needed for simple trial storage
const CommunicationManager = require(path.join(__dirname, 'app', 'communication', 'communicationManager'));
const networkManagerPath = path.join(__dirname, 'main', 'networkManager');
console.log('>>> [DEBUG] networkManager loaded from:', networkManagerPath);
const networkManager = require(networkManagerPath);
const TCPClient = require(path.join(__dirname, 'main', 'tcpClient'));
const creds = require('./main/credentials');
const bcrypt = require('bcryptjs');
// Only import bcryptjs at the top if used in secure-login handler
const ADMIN_HASH = '$2a$10$wq6QwQn6QwQn6QwQn6QwQn6QwQn6QwQn6QwQn6QwQn6QwQn6QwQn6'; // bcrypt hash for 'admin'
// (No external license manager; using built-in trial placeholder)
// Real license manager (Ed25519 verification)
const licenseManager = require(path.join(__dirname, 'main', 'licenseManager'));

let mainWindow;
let database;
let fileManager;
let communicationManager;

// Provide Google OAuth config to renderer securely via IPC (reads from env)
ipcMain.handle('google-drive:get-config', async () => {
  return {
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    redirect_uris: [process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth/callback']
  };
});

// --- Trial Management (30 days, no license activation) ---
// Harden trial data against tampering: encrypt + bind to machine UUID + redundant registry stamp
const DPAPI_SERVICE = 'MedOpsTrialSecret';
const REGISTRY_KEY = '\\Software\\MedOps';
const REGISTRY_VALUE = 'TrialStamp';

function safeRequire(mod) {
  try { return require(mod); } catch { return null; }
}

// Prefer N-API DPAPI implementation to avoid NAN/V8 build issues on newer Electron
// Try a few known modules and normalize to { protectData(buf, _, scope), unprotectData(buf, _, scope) }
const dpapi = (() => {
  const p = safeRequire('@primno/dpapi');      // N-API, prebuilt for Windows
  const m1 = safeRequire('windows-dpapi');     // N-API, often ships prebuilt
  const m2 = safeRequire('win-dpapi');         // NAN-based
  const m3 = safeRequire('dpapi');             // Alternative naming
  const m = (p && (p.Dpapi || p)) || m1 || m2 || m3;
  if (!m) return null;
  // @primno/dpapi exports Dpapi with static methods
  const candidate = m.Dpapi ? m.Dpapi : m;
  if (typeof candidate.protectData === 'function' && typeof candidate.unprotectData === 'function') return candidate;
  // Adapt common alt API shapes
  if (typeof candidate.protect === 'function' && typeof candidate.unprotect === 'function') {
    return {
      protectData: (buf, _unused, scope) => candidate.protect(buf, scope === 'CurrentUser'),
      unprotectData: (buf, _unused, scope) => candidate.unprotect(buf, scope === 'CurrentUser'),
    };
  }
  return null;
})();
const WinReg = safeRequire('winreg');   // For redundancy stamp

function getLicenseStorePath() {
  const userDataDir = app.getPath('userData');
  return path.join(userDataDir, 'license.json');
}

// Resolve or create an app secret protected with DPAPI (per-user). Fallback to env or static pepper if DPAPI missing.
const SecretManager = {
  path: path.join(app.getPath('userData'), 'secret.bin'),
  getPepperFallback() {
    return process.env.LICENSE_PEPPER || 'MEDOPS_STATIC_PEPPER_2024_11';
  },
  getSecretBuffer() {
    // If DPAPI available, store protected secret on disk
    if (dpapi) {
      try {
        if (fs.existsSync(this.path)) {
          const enc = fs.readFileSync(this.path);
          const dec = dpapi.unprotectData(enc, null, 'CurrentUser');
          if (dec && dec.length >= 32) return Buffer.from(dec);
        }
        const fresh = crypto.randomBytes(32);
        const prot = dpapi.protectData(fresh, null, 'CurrentUser');
        fs.writeFileSync(this.path, Buffer.from(prot));
        return fresh;
      } catch (e) {
        console.warn('[TRIAL] DPAPI secret error, falling back to pepper:', e.message);
      }
    }
    // Fallback: derive from env/static pepper (not stored)
    return Buffer.from(crypto.createHash('sha256').update(this.getPepperFallback()).digest());
  }
};

async function getMachineUUID() {
  const platform = process.platform;
  const execAsync = (cmd) => new Promise((resolve) => {
    const { exec } = require('child_process');
    exec(cmd, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({ error, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
  try {
    if (platform === 'win32') {
      let uuid = '';
      let res = await execAsync('wmic csproduct get uuid /value');
      if (!res.error) {
        const m = res.stdout.match(/UUID=([0-9A-Fa-f-]+)/);
        if (m) uuid = m[1];
      }
      if (!uuid) {
        res = await execAsync('wmic csproduct get uuid');
        if (!res.error) {
          const lines = res.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          uuid = lines.find(l => /[0-9A-Fa-f-]{8,}/.test(l) && l.toLowerCase() !== 'uuid') || '';
        }
      }
      if (!uuid) {
        res = await execAsync('powershell -NoProfile -Command "(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID"');
        if (!res.error) {
          const line = res.stdout.split(/\r?\n/).map(s => s.trim()).find(Boolean);
          if (line && /[0-9A-Fa-f-]{8,}/.test(line)) uuid = line;
        }
      }
      return uuid || null;
    }
    // Other platforms (if any) unsupported in this app context
    return null;
  } catch (e) {
    console.warn('[TRIAL] getMachineUUID failed:', e.message);
    return null;
  }
}

function kdfKey(secretBuf, uuid, salt) {
  // Combine DPAPI secret + machine UUID so key is device-bound
  const material = Buffer.concat([secretBuf, Buffer.from(String(uuid || ''), 'utf8')]);
  // Strong scrypt params (N=2^14, r=8, p=1)
  return crypto.scryptSync(material, salt, 32, { N: 16384, r: 8, p: 1 }); // 256-bit key
}

function makeAAD(uuid) {
  const fpHash = sha256HexLocal(uuid || 'nouuid');
  const scope = 'machine';
  return Buffer.from(`medops:trial:v2|fp:${fpHash}|scope:${scope}`, 'utf8');
}

function encryptJSONWithKey(obj, key, salt, aadBuf) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  if (aadBuf && aadBuf.length) {
    try { cipher.setAAD(aadBuf); } catch {}
  }
  const pt = Buffer.from(JSON.stringify(obj), 'utf8');
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  // v2 adds AAD binding to machine fingerprint and scope
  return { v: 2, salt: salt.toString('base64'), nonce: nonce.toString('base64'), ct: Buffer.concat([ct, tag]).toString('base64') };
}

function decryptJSON(blob, key, aadBuf) {
  if (!blob || !blob.v || !blob.salt || !blob.nonce || !blob.ct) throw new Error('invalid-format');
  const salt = Buffer.from(blob.salt, 'base64');
  const nonce = Buffer.from(blob.nonce, 'base64');
  const raw = Buffer.from(blob.ct, 'base64');
  const ct = raw.slice(0, raw.length - 16);
  const tag = raw.slice(raw.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  if (blob.v >= 2 && aadBuf && aadBuf.length) {
    try { decipher.setAAD(aadBuf); } catch {}
  }
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString('utf8'));
}

let __trialReadWarnAt = 0;
// Dev-only in-memory simulation flags (not persisted)
const __devSim = { paidExpired: false };
const RegistryStamp = {
  async write(data, key) {
    if (!WinReg) return; // no-op if module missing
    try {
      const regKey = new WinReg({ hive: WinReg.HKCU, key: REGISTRY_KEY });
      await new Promise((resolve) => regKey.create(resolve));
      const salt = crypto.randomBytes(16);
      const uuid = await getMachineUUID();
      const aad = makeAAD(uuid);
      const enc = encryptJSONWithKey({ trialStart: data.trialStart, lastRun: data.lastRun }, key, salt, aad);
      await new Promise((resolve, reject) => regKey.set(REGISTRY_VALUE, WinReg.REG_SZ, JSON.stringify(enc), (err) => err ? reject(err) : resolve()));
    } catch (e) {
      // Treat ACCESS_DENIED as unavailable (non-tamper) and suppress noisy logs
      const msg = String(e && e.message || '').toLowerCase();
      if (msg.includes('access is denied') || msg.includes('permission')) return;
      console.warn('[TRIAL] Registry write failed:', e.message);
    }
  },
  async read(key) {
    if (!WinReg) return null;
    try {
      const regKey = new WinReg({ hive: WinReg.HKCU, key: REGISTRY_KEY });
      const str = await new Promise((resolve, reject) => regKey.get(REGISTRY_VALUE, (err, item) => err ? resolve(null) : resolve(item && item.value)));
      if (!str) return null;
      // Normalize potential legacy/garbled content
      const tryParses = [];
      let s = String(str);
      s = s.replace(/^\uFEFF/, '').replace(/\u0000/g, '').trim(); // strip BOM and NULs
      tryParses.push(s);
      // If value is a quoted JSON string (double-wrapped), unwrap once
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        try {
          const inner = JSON.parse(s);
          if (typeof inner === 'string') {
            let u = inner.replace(/^\uFEFF/, '').replace(/\u0000/g, '').trim();
            tryParses.push(u);
          }
        } catch {}
      }
      // Fallback: replace single quotes with double quotes (best-effort for legacy)
      if (s.includes("':") || s.includes("'{") || s.includes("}'")) {
        tryParses.push(s.replace(/'/g, '"'));
      }
      let blob = null;
      for (const candidate of tryParses) {
        try { blob = JSON.parse(candidate); break; } catch {}
      }
      if (!blob) throw new Error('invalid-registry-json');
      const uuid = await getMachineUUID();
      const aad = makeAAD(uuid);
      return decryptJSON(blob, key, blob.v >= 2 ? aad : null);
    } catch (e) {
      // Suppress noisy logs for known invalid JSON cases; it will be repaired on next write
      if (e && e.message !== 'invalid-registry-json') {
        const now = Date.now();
        if (now - __trialReadWarnAt > 60_000) {
          console.warn('[TRIAL] Registry read failed:', e.message);
          __trialReadWarnAt = now;
        }
      }
      return null;
    }
  }
};
const TRIAL_DAYS = 30;

// Additional plain, machine-bound stamp stored redundantly in HKCU and ProgramData
// This stamp is NOT dependent on the DPAPI secret so it survives wiping userData.
const PROGRAM_DATA_DIR = process.env.PROGRAMDATA || 'C:\\ProgramData';
const PROGRAM_DATA_APP_DIR = path.join(PROGRAM_DATA_DIR, 'MedOps');
function toDayString(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function sha256HexLocal(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
const PlainStamp = {
  pepper() { return process.env.LICENSE_PLAIN_PEPPER || 'MEDOPS_PLAIN_P_2024_11'; },
  hkcuKey: '\\Software\\MedOpsPlain',
  hkcuValue: 'PlainStamp',
  programDataPath() { return path.join(PROGRAM_DATA_APP_DIR, 'plain-stamp.json'); },
  deriveMacKey(fpHash) {
    try {
      return crypto.hkdfSync('sha256', Buffer.from(fpHash || '', 'utf8'), Buffer.from(this.pepper(), 'utf8'), Buffer.from('medops-plainstamp:v2', 'utf8'), 32);
    } catch {
      // Fallback: HMAC of (pepper || '') over fpHash to derive a pseudo-key
      return crypto.createHmac('sha256', this.pepper()).update(String(fpHash || '')).digest();
    }
  },
  makePayload({ fpHash, firstDay, lastDay }) {
    const key = this.deriveMacKey(fpHash);
    const mac = crypto.createHmac('sha256', key).update(`${fpHash}|${firstDay}|${lastDay}`).digest('hex');
    return { v: 2, fpHash, firstDay, lastDay, mac };
  },
  verifyPayload(obj) {
    if (!obj || !obj.fpHash || !obj.firstDay || !obj.lastDay || !obj.mac) return false;
    if (obj.v === 2) {
      const key = this.deriveMacKey(obj.fpHash);
      const mac = crypto.createHmac('sha256', key).update(`${obj.fpHash}|${obj.firstDay}|${obj.lastDay}`).digest('hex');
      return mac === obj.mac;
    }
    if (obj.v === 1) {
      const mac = crypto.createHmac('sha256', this.pepper()).update(`${obj.fpHash}|${obj.firstDay}|${obj.lastDay}`).digest('hex');
      return mac === obj.mac;
    }
    return false;
  },
  async writeAll({ fpHash, firstDay, lastDay }) {
    const payload = this.makePayload({ fpHash, firstDay, lastDay });
    // HKCU write (best-effort)
    try {
      if (WinReg) {
        const regKey = new WinReg({ hive: WinReg.HKCU, key: this.hkcuKey });
        await new Promise((resolve) => regKey.create(resolve));
        await new Promise((resolve, reject) => regKey.set(this.hkcuValue, WinReg.REG_SZ, JSON.stringify(payload), (err) => err ? reject(err) : resolve()));
      }
    } catch (e) { console.warn('[STAMP][HKCU] write failed:', e.message); }
    // ProgramData write (best-effort)
    try {
      if (!fs.existsSync(PROGRAM_DATA_APP_DIR)) fs.mkdirSync(PROGRAM_DATA_APP_DIR, { recursive: true });
      fs.writeFileSync(this.programDataPath(), JSON.stringify(payload, null, 2), 'utf8');
    } catch (e) { console.warn('[STAMP][ProgramData] write failed:', e.message); }
  },
  async readHKCU() {
    if (!WinReg) return null;
    try {
      const regKey = new WinReg({ hive: WinReg.HKCU, key: this.hkcuKey });
      const str = await new Promise((resolve) => regKey.get(this.hkcuValue, (err, item) => resolve(err ? null : (item && item.value))));
      if (!str) return null;
      try { return JSON.parse(String(str)); } catch { return null; }
    } catch { return null; }
  },
  readProgramData() {
    try {
      const p = this.programDataPath();
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      if (e && (e.code === 'EACCES' || e.code === 'EPERM')) return { __unavailable: true };
      return null;
    }
  }
};

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeJSON(file, data) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// Compute difference in calendar days (local time), ignoring time of day.
// Example: start=2025-08-09T14:30 -> end=2025-08-10T00:05 yields 1 day.
function daysBetween(startISO, endISO) {
  const a = new Date(startISO);
  const b = new Date(endISO);
  const startDay = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const endDay = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.floor((endDay - startDay) / (24 * 60 * 60 * 1000));
}


// Removed: redundant encrypted storage helpers (HWID/registry/hidden file)

const LicenseManager = {
  async loadDecrypted() {
    const p = getLicenseStorePath();
    const secretBuf = SecretManager.getSecretBuffer();
    const uuid = await getMachineUUID();
    const aad = makeAAD(uuid);

    // Read current file
    let raw = readJSON(p);
    if (!raw) raw = {};

    // If encrypted blob
    if (raw && raw.v >= 1 && raw.salt && raw.nonce && raw.ct) {
      try {
        const salt = Buffer.from(raw.salt, 'base64');
        const key = kdfKey(secretBuf, uuid, salt);
        const data = decryptJSON(raw, key, raw.v >= 2 ? aad : null);
        return { data, key, salt, uuid };
      } catch (e) {
        // Treat as first run if encrypted blob is unreadable: reset trial starting now
        const now = new Date().toISOString();
        const data = { trialStart: now, lastRun: now };
        const salt = crypto.randomBytes(16);
        const key = kdfKey(secretBuf, uuid, salt);
        const enc = encryptJSONWithKey(data, key, salt, aad);
        writeJSON(p, enc);
        return { data, key, salt, uuid, recovered: true };
      }
    }

    // Migrate plaintext -> encrypted
    let data = raw;
    if (!data || !data.trialStart) {
      const now = new Date().toISOString();
      data = { trialStart: now, lastRun: now };
    }

    const salt = crypto.randomBytes(16);
    const key = kdfKey(secretBuf, uuid, salt);
    const enc = encryptJSONWithKey(data, key, salt, aad);
    writeJSON(p, enc);
    return { data, key, salt, uuid, migrated: true };
  },
  saveEncrypted(data, key) {
    const p = getLicenseStorePath();
    const salt = crypto.randomBytes(16);
    // Recreate AAD using current machine UUID
    // Note: best-effort; if UUID unavailable, omit AAD (will fallback to v1 path on next write)
    const aad = makeAAD(global.___uuid_cache || '');
    const enc = encryptJSONWithKey(data, key, salt, aad);
    writeJSON(p, enc);
  },
  async getStatus() {
    const { data, key, uuid, tamper } = await this.loadDecrypted();
    let local = { ...data };
    const nowISO = new Date().toISOString();

    // Registry cross-check (encrypted, DPAPI-bound)
    let reg = null;
    try { reg = await RegistryStamp.read(key); } catch {}
    if (reg) {
      const mismatchStart = reg.trialStart !== local.trialStart;
      const rollback = new Date(local.lastRun) < new Date(reg.lastRun);
      if (mismatchStart || rollback) {
        local.clockIssue = true;
        local.tamper = true;
      }
    }

    // Clock rollback check
    if (local.lastRun && new Date(nowISO) < new Date(local.lastRun)) {
      local.clockIssue = true;
    }

    // --- PlainStamp (ProgramData authoritative, HKCU mirror) ---
    const uuid2 = await getMachineUUID();
    const fpHash = sha256HexLocal(uuid2 || 'nouuid');
    const firstDay = toDayString(local.trialStart);
    const currentDay = toDayString(nowISO);

    const hkcuPlain = await PlainStamp.readHKCU();
    const pdPlain = PlainStamp.readProgramData();
    const pdUnavailable = !!(pdPlain && pdPlain.__unavailable);
    const normPD = pdUnavailable ? null : pdPlain;

    const isCoreValid = (st) => {
      if (!st) return false;
      if (!PlainStamp.verifyPayload(st)) return false;
      if (st.fpHash !== fpHash) return false;
      if (st.firstDay !== firstDay) return false;
      return true; // do not fail on lastDay > currentDay; flag clockIssue later
    };

    let tamperHard = false;

    if (pdUnavailable) {
      // ProgramData not writable/accessible: validate HKCU only; do not force expire due to PD unavailability
      if (!hkcuPlain) {
        try { await PlainStamp.writeAll({ fpHash, firstDay, lastDay: currentDay }); } catch {}
      } else if (!isCoreValid(hkcuPlain)) {
        tamperHard = true;
      } else {
        // Advance HKCU lastDay forward if needed
        const maxLast = hkcuPlain.lastDay;
        const newLast = String(currentDay) > String(maxLast) ? currentDay : maxLast;
        if (newLast !== maxLast) {
          try { await PlainStamp.writeAll({ fpHash, firstDay, lastDay: newLast }); } catch {}
        }
        if (String(currentDay) < String(maxLast)) {
          local.clockIssue = true; // user clock moved back
        }
      }
    } else {
      // ProgramData available: treat as machine-wide ground truth
      if (!normPD) {
        // First run on this machine: create PD and HKCU
        try { await PlainStamp.writeAll({ fpHash, firstDay, lastDay: currentDay }); } catch {}
      } else if (!isCoreValid(normPD)) {
        tamperHard = true; // PD exists but invalid/mismatched
      } else {
        // PD valid. Ensure HKCU exists and matches core fields; not tamper on first run for new user
        if (!hkcuPlain) {
          try { await PlainStamp.writeAll({ fpHash, firstDay, lastDay: normPD.lastDay || currentDay }); } catch {}
        } else if (!isCoreValid(hkcuPlain)) {
          tamperHard = true;
        }
        // Advance lastDay forward across PD/HKCU/current
        const candidates = [normPD.lastDay, hkcuPlain && hkcuPlain.lastDay, currentDay].filter(Boolean);
        const maxLast = candidates.sort().slice(-1)[0];
        if (normPD.lastDay !== maxLast || (hkcuPlain && hkcuPlain.lastDay !== maxLast)) {
          try { await PlainStamp.writeAll({ fpHash, firstDay, lastDay: maxLast }); } catch {}
        }
        if (String(currentDay) < String(maxLast)) {
          local.clockIssue = true; // clock rollback relative to recorded lastDay
        }
      }
    }

    local.lastRun = nowISO;
    if (key) this.saveEncrypted(local, key);
    if (key) await RegistryStamp.write(local, key);

    const daysUsed = daysBetween(local.trialStart, nowISO);
    const daysLeft = Math.max(0, TRIAL_DAYS - daysUsed);
    // Do NOT force expire on tamper; surface tamper/clockIssue flags but keep expiry purely time-based
    const expired = (daysLeft <= 0);
    // Only mark expired when the actual trial period is over; tamper/clockIssue will be surfaced separately
    return {
      expired: !!expired,
      trialStart: local.trialStart,
      daysUsed,
      daysLeft,
      clockIssue: !!local.clockIssue,
      tamper: !!(local.tamper || tamperHard),
    };
  },
  async resetTrial() {
    const p = getLicenseStorePath();
    const secretBuf = SecretManager.getSecretBuffer();
    const uuid = await getMachineUUID();
    const now = new Date().toISOString();
    const data = { trialStart: now, lastRun: now };
    const salt = crypto.randomBytes(16);
    const key = kdfKey(secretBuf, uuid, salt);
    const enc = encryptJSONWithKey(data, key, salt);
    writeJSON(p, enc);
    try { await RegistryStamp.write(data, key); } catch {}
    return { ok: true, data };
  },
  async setTrialStart(dateISO) {
    const p = getLicenseStorePath();
    const secretBuf = SecretManager.getSecretBuffer();
    const uuid = await getMachineUUID();
    const base = readJSON(p);
    let current = { trialStart: dateISO, lastRun: new Date().toISOString() };
    try {
      if (base && base.v === 1 && base.salt && base.nonce && base.ct) {
        const salt = Buffer.from(base.salt, 'base64');
        const key = kdfKey(secretBuf, uuid, salt);
        const data = decryptJSON(base, key);
        current = { ...data, trialStart: dateISO };
      }
    } catch {}
    const salt = crypto.randomBytes(16);
    const key = kdfKey(secretBuf, uuid, salt);
    const enc = encryptJSONWithKey(current, key, salt);
    writeJSON(p, enc);
    try { await RegistryStamp.write(current, key); } catch {}
    return { ok: true, data: current };
  },
  async activate(_key) { return { success: true }; }
};

// Paths and storage helpers (use Electron's userData for persistence across updates)
function getPaths() {
  const userDataDir = app.getPath('userData');
  const dataPath = path.join(userDataDir, 'Data');
  const patientFilesPath = path.join(dataPath, 'PatientFiles');
  const dbPath = path.join(dataPath, 'medops.db');
  return { userDataDir, dataPath, patientFilesPath, dbPath };
}

function ensureDirectories(paths) {
  const { userDataDir, dataPath, patientFilesPath } = paths;
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
  if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true });
  if (!fs.existsSync(patientFilesPath)) fs.mkdirSync(patientFilesPath, { recursive: true });
}

function copyFileSafe(src, dest) {
  try {
    if (!fs.existsSync(src)) return;
    if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
      console.log(`[MIGRATE] Copied file`, { src, dest });
    } else {
      console.log(`[MIGRATE] Skipped existing file`, { dest });
    }
  } catch (e) {
    console.warn('[MIGRATE] Failed copying file', { src, dest, error: e.message });
  }
}

function copyDirMerge(srcDir, destDir) {
  try {
    if (!fs.existsSync(srcDir)) return;
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const ent of entries) {
      const s = path.join(srcDir, ent.name);
      const d = path.join(destDir, ent.name);
      if (ent.isDirectory()) {
        copyDirMerge(s, d);
      } else if (ent.isFile()) {
        if (!fs.existsSync(d)) {
          try { fs.copyFileSync(s, d); console.log(`[MIGRATE] Copied`, d); } catch (e) { console.warn(`[MIGRATE] Failed copying ${s} -> ${d}:`, e.message); }
        }
      }
    }
  } catch (e) {
    console.warn('[MIGRATE] Failed merging directory', { srcDir, destDir, error: e.message });
  }
}

function migrateLegacyData(paths) {
  const { dataPath, patientFilesPath, dbPath } = paths;
  // Known legacy roots used previously
  const legacyRoots = ['C\\MedOps', 'C\\Cabneo\\AssistantApp'];
  for (const root of legacyRoots) {
    try {
      const legacyData = path.join(root, 'Data');
      if (!fs.existsSync(legacyData)) continue;
      console.log('[MIGRATE] Found legacy data at', legacyData);

      // Copy DB file if present and missing at new location
      const legacyDb = path.join(legacyData, 'medops.db');
      if (!fs.existsSync(dbPath) && fs.existsSync(legacyDb)) {
        copyFileSafe(legacyDb, dbPath);
      }

      // Merge patient files
      const legacyPatients = path.join(legacyData, 'PatientFiles');
      if (fs.existsSync(legacyPatients)) {
        copyDirMerge(legacyPatients, patientFilesPath);
      }
    } catch (e) {
      console.warn('[MIGRATE] Error while migrating from root', root, e.message);
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    fullscreen: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'app', 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'medops.ico'),
    title: 'Cabneo Assistant',
    show: false,
    autoHideMenuBar: true
  });

  // Provide a hidden application menu so default shortcuts (e.g. Ctrl+Shift+I) work
  // Keep the menu bar hidden from view
  try {
    const template = [
      // Minimal cross-platform menus; View menu includes Toggle DevTools with default accelerator
      { role: 'fileMenu' },
      { role: 'viewMenu' },
      { role: 'help', submenu: [] }
    ];
    const appMenu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(appMenu);
  } catch {}
  try { mainWindow.setMenuBarVisibility(false); } catch {}

  const htmlPath = path.join(__dirname, 'app', 'public', 'index.html');
  console.log('Loading HTML file from:', htmlPath);
  console.log('File exists:', fs.existsSync(htmlPath));
  
  if (!fs.existsSync(htmlPath)) {
    console.error('HTML file not found at:', htmlPath);
    dialog.showErrorBox('File Not Found', `HTML file not found at: ${htmlPath}`);
    return;
  }
  
  mainWindow.loadFile(htmlPath).catch(err => {
    console.error('Failed to load HTML file:', err);
    dialog.showErrorBox('Load Error', `Failed to load HTML file: ${err.message}`);
  });

  mainWindow.once('ready-to-show', () => {
    console.log('Main window ready to show');
    mainWindow.show();
    console.log('[DEBUG][MAIN] Calling networkManager.setupIPC with mainWindow:', !!mainWindow);
    networkManager.setupIPC(mainWindow); // Ensure IPC handlers are registered
    
    // Send initial connection status
    setTimeout(() => {
      const currentStatus = networkManager.isConnected() ? 'connected' : 'disconnected';
      console.log('[DEBUG][MAIN] Sending initial connection status:', currentStatus);
      mainWindow.webContents.send('connection-status', currentStatus);
    }, 1000); // Small delay to ensure everything is initialized
  });

  mainWindow.on('show', () => {
    console.log('Main window shown');
  });

  mainWindow.on('closed', () => {
    console.log('Main window closed');
    mainWindow = null;
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
    console.error('Promise:', promise);
    
    // Log additional details for debugging
    if (reason instanceof Error) {
      console.error('Error stack:', reason.stack);
    }
    
    // Don't crash the app for unhandled rejections
    // Just log them and continue
    console.log('Continuing execution despite unhandled rejection...');
  });
}

// Append a row to developer Google Sheet about backup enable event
async function appendBackupEnableEventToSheet({ email, source = 'drive-backup', extra = {} }) {
  const {
    GOOGLE_SHEETS_SPREADSHEET_ID,
    GOOGLE_SHEETS_SHEET_NAME = 'Sheet1',
    GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, 'medops-467602-d4086c7d736a.json')
  } = process.env;

  if (!GOOGLE_SHEETS_SPREADSHEET_ID) {
    throw new Error('Missing GOOGLE_SHEETS_SPREADSHEET_ID env');
  }

  const credPath = path.isAbsolute(GOOGLE_APPLICATION_CREDENTIALS)
    ? GOOGLE_APPLICATION_CREDENTIALS
    : path.resolve(process.cwd(), GOOGLE_APPLICATION_CREDENTIALS);

  if (!fs.existsSync(credPath)) {
    throw new Error(`Service account JSON not found at ${credPath}`);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const timestamp = new Date().toISOString();
  let appVersion = 'unknown';
  let appName = 'app-assistant';
  try {
    const pkg = require(path.resolve(process.cwd(), 'package.json'));
    appVersion = pkg.version || 'unknown';
    appName = pkg.name || appName;
  } catch {}

  // Columns: Timestamp | App Name | App Version | Email | Source | Extra(JSON)
  const row = [timestamp, appName, appVersion, email || '', source, JSON.stringify(extra || {})];

  // Quote sheet/tab name to support spaces/special chars
  const safeSheetName = `'${(GOOGLE_SHEETS_SHEET_NAME || 'Sheet1').replace(/'/g, "''")}'`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID,
    range: `${safeSheetName}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
}

// Read the Google Sheet and return the most recent ISO timestamp for the given email, or null if none
async function getLastEmailLogFromSheet(email) {
  const {
    GOOGLE_SHEETS_SPREADSHEET_ID,
    GOOGLE_SHEETS_SHEET_NAME = 'Sheet1',
    GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, 'medops-467602-d4086c7d736a.json')
  } = process.env;

  if (!GOOGLE_SHEETS_SPREADSHEET_ID) {
    throw new Error('Missing GOOGLE_SHEETS_SPREADSHEET_ID env');
  }

  const credPath = path.isAbsolute(GOOGLE_APPLICATION_CREDENTIALS)
    ? GOOGLE_APPLICATION_CREDENTIALS
    : path.resolve(process.cwd(), GOOGLE_APPLICATION_CREDENTIALS);

  if (!fs.existsSync(credPath)) {
    throw new Error(`Service account JSON not found at ${credPath}`);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const safeSheetName = `'${(GOOGLE_SHEETS_SHEET_NAME || 'Sheet1').replace(/'/g, "''")}'`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID,
    range: `${safeSheetName}!A:F`
  });

  const rows = (res && res.data && Array.isArray(res.data.values)) ? res.data.values : [];
  let latestISO = null;
  for (const row of rows) {
    // Columns: [0]=Timestamp ISO, [1]=App Name, [2]=App Version, [3]=Email, [4]=Source, [5]=Extra
    const rEmail = (row[3] || '').trim();
    const ts = (row[0] || '').trim();
    if (rEmail && ts && rEmail.toLowerCase() === String(email).toLowerCase()) {
      // Validate parsable date
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        const iso = d.toISOString();
        if (!latestISO || new Date(iso).getTime() > new Date(latestISO).getTime()) {
          latestISO = iso;
        }
      }
    }
  }
  return latestISO; // may be null if not found
}

// Initialize application
async function initializeApp() {
  try {
    const paths = getPaths();
    ensureDirectories(paths);
    migrateLegacyData(paths);

    // Initialize database at persistent userData path
    database = new DatabaseManager(paths.dbPath);
    await database.initialize();

    // Initialize file manager with persistent patient files path
    fileManager = new FileManager(paths.patientFilesPath);
    
    // Initialize communication manager
    console.log('Initializing communication manager...');
    communicationManager = new CommunicationManager(database, fileManager);
    await communicationManager.initialize();
    
    // Make communication manager available globally for network manager
    global.communicationManager = communicationManager;
    console.log('🔧 [MAIN] Communication manager set globally:', !!global.communicationManager);
    console.log('Communication manager initialized successfully');
    
    // Initialize network manager (will be called after window is created)
    // networkManager.setupIPC(mainWindow);
    
    console.log('MedOps initialized successfully');
  } catch (error) {
    console.error('Failed to initialize application:', error);
    dialog.showErrorBox('Initialization Error', 'Failed to initialize the application. Please restart.');
  }
}

// (No activation modal needed for trial-only)

// Removed: showTrialExpiredOverlay and any UI modals for trial expiry (renderer will handle redirection)

// IPC Handlers
ipcMain.handle('license:get-status', async () => {
  try {
    // Dev simulation: force paid license expired for UI testing
    if (__devSim.paidExpired) {
      return { activated: true, expired: true, daysLeft: 0, sim: 'paidExpired' };
    }
    // Primary: signed license status
    const st = await licenseManager.getStatus();
    if (st && st.state === 'valid') {
      const dayMs = 24 * 3600 * 1000;
      const issued = Number(st.payload && st.payload.issued_at);
      const exp = Number(st.payload && st.payload.expires_at);
      const daysTotal = (isFinite(issued) && isFinite(exp) && exp > issued)
        ? Math.round((exp - issued) / dayMs)
        : undefined;
      return { activated: true, expired: false, daysLeft: st.days_left, daysTotal, payload: st.payload };
    }
    if (st && st.state === 'expired') {
      const p = st.payload || null;
      let daysTotal;
      if (p && p.issued_at && p.expires_at) {
        const dayMs = 24 * 3600 * 1000;
        daysTotal = Math.round((Number(p.expires_at) - Number(p.issued_at)) / dayMs);
      }
      return { activated: true, expired: true, daysLeft: 0, daysTotal };
    }
    // If signed license storage is invalid/tampered, fall back to trial
    // Only enforce expiry if the TRIAL is also expired
    if (st && st.state === 'invalid') {
      const trial = await LicenseManager.getStatus();
      return {
        activated: false,
        expired: !!(trial && trial.expired),
        daysLeft: trial ? trial.daysLeft : 0,
        daysUsed: trial ? trial.daysUsed : undefined,
        trialStart: trial ? trial.trialStart : undefined,
        clockIssue: trial ? trial.clockIssue : false,
        tamper: true,
        invalidReason: st.reason || 'invalid'
      };
    }
    // If unlicensed, fall back to internal trial manager for days/expiry
    const trial = await LicenseManager.getStatus();
    return {
      activated: false,
      expired: !!(trial && trial.expired),
      daysLeft: trial ? trial.daysLeft : 0,
      daysUsed: trial ? trial.daysUsed : undefined,
      trialStart: trial ? trial.trialStart : undefined,
      clockIssue: trial ? trial.clockIssue : false,
      tamper: trial ? trial.tamper : false,
    };
  } catch (e) {
    // If status can't be determined, allow app to continue but show warning
    return { activated: false, expired: false, daysLeft: 0, clockIssue: true };
  }
});

// (reverted) license:open-file handler removed per request

// Simple token-bucket rate limiter for activation attempts
const __ACTIVATE_LIMIT = {
  capacity: 10,
  tokens: 10,
  refillIntervalMs: 60_000,
  lastRefill: Date.now(),
};
function __tryConsumeActivationToken() {
  const now = Date.now();
  const elapsed = now - __ACTIVATE_LIMIT.lastRefill;
  if (elapsed > 0) {
    const refill = Math.floor((elapsed / __ACTIVATE_LIMIT.refillIntervalMs) * __ACTIVATE_LIMIT.capacity);
    if (refill > 0) {
      __ACTIVATE_LIMIT.tokens = Math.min(__ACTIVATE_LIMIT.capacity, __ACTIVATE_LIMIT.tokens + refill);
      __ACTIVATE_LIMIT.lastRefill = now;
    }
  }
  if (__ACTIVATE_LIMIT.tokens <= 0) return false;
  __ACTIVATE_LIMIT.tokens -= 1;
  return true;
}

ipcMain.handle('license:activate', async (event, key) => {
  try {
    // Rate limit
    if (!__tryConsumeActivationToken()) {
      return { success: false, error: 'rate_limited' };
    }

    // Normalize input
    let cleaned = String(key || '');
    cleaned = cleaned.replace(/\s+/g, '');
    cleaned = cleaned.replace(/[\u2024\u2027\u30FB\uFF0E]/g, '.');

    // Strict format checks
    const MAX_TOTAL = 2048;
    const MAX_SEG = 1500;
    if (!cleaned || cleaned.length > MAX_TOTAL) {
      return { success: false, error: 'invalid_format' };
    }
    // Only base64url chars and one dot
    if (!/^[A-Za-z0-9_\.-]+$/.test(cleaned)) {
      return { success: false, error: 'invalid_format' };
    }
    const parts = cleaned.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return { success: false, error: 'invalid_format' };
    }
    const [p, s] = parts;
    if (p.length > MAX_SEG || s.length > MAX_SEG) {
      return { success: false, error: 'invalid_format' };
    }
    // No padding allowed in base64url
    if (p.includes('=') || s.includes('=')) {
      return { success: false, error: 'invalid_format' };
    }
    // Only base64url chars in each segment
    if (!/^[A-Za-z0-9_-]+$/.test(p) || !/^[A-Za-z0-9_-]+$/.test(s)) {
      return { success: false, error: 'invalid_format' };
    }

    try {
      const diag = {
        totalLen: cleaned.length,
        payloadLen: p.length,
        sigLen: s.length,
        payloadHead: p.slice(0, 12),
        payloadTail: p.slice(-12),
        sigHead: s.slice(0, 12),
        sigTail: s.slice(-12),
      };
      console.log('[LICENSE][IPC] activate token diag:', diag);
    } catch {}

    const res = await licenseManager.activateLicense(cleaned);
    if (res && res.ok) return { success: true, payload: res.payload };
    return { success: false, error: (res && res.reason) || 'activation_failed' };
  } catch (e) {
    return { success: false, error: 'activation_failed' };
  }
});

ipcMain.handle('license:get-hwid', async () => {
  try {
    const hwid = await licenseManager.getMachineFingerprint();
    return { hwid };
  } catch (e) {
    return { hwid: null, error: e.message };
  }
});

ipcMain.handle('license:reset-trial', async () => {
  try {
    const res = await LicenseManager.resetTrial();
    return { success: true, trialStart: res.data.trialStart };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Dev-only: set trialStart to a specific ISO or by daysAgo
ipcMain.handle('license:set-trial-start', async (event, { dateISO, daysAgo }) => {
  try {
    let iso = dateISO;
    if (!iso && typeof daysAgo === 'number') {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      iso = d.toISOString();
    }
    if (!iso) return { success: false, error: 'Provide dateISO or daysAgo' };
    const res = await LicenseManager.setTrialStart(iso);
    return { success: true, trialStart: res.data.trialStart };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Dev-only: toggle simulation flags
ipcMain.handle('license:set-sim', async (event, flags) => {
  try {
    __devSim.paidExpired = !!(flags && flags.paidExpired);
    return { success: true, flags: { ...__devSim } };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('database:get-patients', async () => {
  try {
    return await database.getAllPatients();
  } catch (error) {
    console.error('Error getting patients:', error);
    throw error;
  }
});

// Telemetry: log backup email at most once every 3 months (checks Google Sheet; local file as fallback)
ipcMain.handle('telemetry:log-backup-email-once', async (event, payload) => {
  try {
    const { email, source = 'drive-backup', extra = {} } = payload || {};
    if (!email || typeof email !== 'string') {
      return { success: false, logged: false, error: 'Invalid or missing email' };
    }

    const storeDir = app.getPath('userData') || __dirname;
    const storePath = path.join(storeDir, 'telemetry.json');

    let state = { emailLogs: {} };
    try {
      if (fs.existsSync(storePath)) {
        const raw = fs.readFileSync(storePath, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        // migrate old format { loggedEmails: [] }
        if (Array.isArray(parsed.loggedEmails)) {
          state.emailLogs = {};
          for (const em of parsed.loggedEmails) {
            state.emailLogs[em] = new Date().toISOString();
          }
        } else if (parsed && typeof parsed.emailLogs === 'object') {
          state = { emailLogs: { ...parsed.emailLogs } };
        }
      }
    } catch (e) {
      console.warn('[Telemetry] Failed reading telemetry store, recreating:', e.message);
      state = { emailLogs: {} };
    }

    // Default: try Google Sheet to find last log timestamp for this email
    const threeMonthsMs = 90 * 24 * 3600 * 1000; // approx 3 months
    let shouldAppend = true;
    let lastIso = null;
    try {
      lastIso = await getLastEmailLogFromSheet(email);
      if (lastIso) {
        const lastMs = new Date(lastIso).getTime();
        if (isFinite(lastMs) && (Date.now() - lastMs) < threeMonthsMs) {
          shouldAppend = false;
        }
      }
    } catch (sheetErr) {
      console.warn('[Telemetry] Sheet read failed, using local fallback:', sheetErr.message);
      const localIso = state.emailLogs[email] || null;
      if (localIso) {
        const lastMs = new Date(localIso).getTime();
        if (isFinite(lastMs) && (Date.now() - lastMs) < threeMonthsMs) {
          shouldAppend = false;
        }
      }
    }

    if (!shouldAppend) {
      return { success: true, logged: false, reason: 'within-3-months', last: lastIso };
    }

    await appendBackupEnableEventToSheet({ email, source, extra });

    // update local cache with now
    state.emailLogs[email] = new Date().toISOString();
    try {
      fs.writeFileSync(storePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (e) {
      console.warn('[Telemetry] Failed writing telemetry store:', e.message);
    }

    return { success: true, logged: true };
  } catch (error) {
    console.error('[Telemetry] Failed to conditionally log backup email:', error);
    return { success: false, logged: false, error: error.message };
  }
});

// System: get primary MAC address
ipcMain.handle('system:get-mac-address', async () => {
  try {
    const ifaces = os.networkInterfaces();
    let mac = null;
    for (const [name, addrs] of Object.entries(ifaces)) {
      if (!Array.isArray(addrs)) continue;
      for (const info of addrs) {
        if (info.internal) continue;
        const m = (info.mac || '').toLowerCase();
        if (!m || m === '00:00:00:00:00:00') continue;
        mac = m;
        break;
      }
      if (mac) break;
    }
    if (!mac) {
      return { success: false, error: 'MAC address not found' };
    }
    return { success: true, mac };
  } catch (e) {
    console.error('[MAIN] Failed to get MAC address:', e);
    return { success: false, error: e.message };
  }
});

// Bug report: send silently via SMTP if configured, otherwise store locally
ipcMain.handle('bug-report:send', async (event, { message }) => {
  try {
    const subject = 'app assistant bug report';
    const to = 'ghuilaineo@gmail.com';
    const timestamp = new Date().toISOString();
    const content = `Time: ${timestamp}\nFrom: MedOps App\n\n${message || ''}`;

    // Try email via nodemailer if available and configured
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || smtpUser;

    let sent = false;
    try {
      if (smtpHost && smtpPort && smtpUser && smtpPass && smtpFrom) {
        let nodemailer;
        try {
          nodemailer = require('nodemailer');
        } catch (e) {
          nodemailer = null; // not installed; fallback to file
        }
        if (nodemailer) {
          const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465, // common heuristic
            auth: { user: smtpUser, pass: smtpPass },
          });
          await transporter.sendMail({ from: smtpFrom, to, subject, text: content });
          sent = true;
          console.log('[BUG REPORT] Email sent successfully');
        }
      }
    } catch (emailErr) {
      console.warn('[BUG REPORT] Email send failed, will fallback to file:', emailErr.message);
    }

    if (!sent) {
      try {
        const reportsDir = path.join(app.getPath('userData') || __dirname, 'bug-reports');
        if (!fs.existsSync(reportsDir)) {
          fs.mkdirSync(reportsDir, { recursive: true });
        }
        const fileName = `bug_${timestamp.replace(/[:.]/g, '-')}.txt`;
        fs.writeFileSync(path.join(reportsDir, fileName), content, 'utf8');
        console.log('[BUG REPORT] Saved locally at', path.join(reportsDir, fileName));
        return { success: true, stored: true };
      } catch (fileErr) {
        console.error('[BUG REPORT] Failed to store locally:', fileErr);
        throw fileErr;
      }
    }

    return { success: true, sent: true };
  } catch (err) {
    console.error('[BUG REPORT] Handler failed:', err);
    throw err;
  }
});

ipcMain.handle('database:get-all-patients', async () => {
  try {
    return await database.getAllPatients();
  } catch (error) {
    console.error('Error getting all patients:', error);
    throw error;
  }
});

ipcMain.handle('database:get-today-patients', async () => {
  try {
    return await database.getTodayPatients();
  } catch (error) {
    console.error('Error getting today\'s patients:', error);
    throw error;
  }
});

ipcMain.handle('database:get-patient', async (event, patientId) => {
  try {
    return await database.getPatient(patientId);
  } catch (error) {
    console.error('Error getting patient:', error);
    throw error;
  }
});

ipcMain.handle('database:add-patient', async (event, patientData) => {
  try {
    const patientId = `${patientData.name.toLowerCase()}_${patientData.yearOfBirth}`;
    const patient = {
      id: patientId,
      ...patientData,
      status: 'waiting',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await database.addPatient(patient);
    return patient;
  } catch (error) {
    console.error('Error adding patient:', error);
    throw error;
  }
});

ipcMain.handle('database:update-patient-status', async (event, { patientId, status }) => {
  try {
    await database.updatePatientStatus(patientId, status);
    return { success: true };
  } catch (error) {
    console.error('Error updating patient status:', error);
    throw error;
  }
});


// Electron focus workaround - focus webContents to avoid full window refresh
ipcMain.handle('blur-and-focus-window', async () => {
  try {
    console.log('[FOCUS] Focusing webContents to restore input without refresh');
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.focus();
    }
    return { success: true };
  } catch (error) {
    console.error('[FOCUS] Error in webContents focus workaround:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('database:get-appointments', async () => {
  try {
    return await database.getAppointments();
  } catch (error) {
    console.error('Error getting appointments:', error);
    throw error;
  }
});

ipcMain.handle('database:add-appointment', async (event, appointmentData) => {
  try {
    await database.addAppointment(appointmentData);
    return { success: true };
  } catch (error) {
    console.error('Error adding appointment:', error);
    throw error;
  }
});

ipcMain.handle('database:delete-appointment', async (event, appointmentId) => {
  try {
    console.log(`[MAIN] Deleting appointment with ID: ${appointmentId}`);
    const result = await database.deleteAppointment(appointmentId);
    console.log(`[MAIN] Appointment deletion result:`, result);
    return result;
  } catch (error) {
    console.error('[MAIN] Error deleting appointment:', error);
    throw error;
  }
});

ipcMain.handle('database:update-appointment', async (event, appointmentData) => {
  try {
    await database.updateAppointment(appointmentData);
    return { success: true };
  } catch (error) {
    console.error('Error updating appointment:', error);
    throw error;
  }
});

// System: Get machine UUID for licensing (Windows/macOS)
ipcMain.handle('system:get-machine-uuid', async () => {
  const platform = process.platform;
  const execAsync = (cmd) => new Promise((resolve) => {
    const { exec } = require('child_process');
    exec(cmd, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({ error, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });

  try {
    if (platform === 'win32') {
      let uuid = '';
      // Prefer value format for stable parsing
      let res = await execAsync('wmic csproduct get uuid /value');
      if (!res.error) {
        const m = res.stdout.match(/UUID=([0-9A-Fa-f-]+)/);
        if (m) uuid = m[1];
      }
      // Fallback to table format
      if (!uuid) {
        res = await execAsync('wmic csproduct get uuid');
        if (!res.error) {
          const lines = res.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          uuid = lines.find(l => /[0-9A-Fa-f-]{8,}/.test(l) && l.toLowerCase() !== 'uuid') || '';
        }
      }
      // Final fallback for systems where WMIC is unavailable
      if (!uuid) {
        res = await execAsync('powershell -NoProfile -Command "(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID"');
        if (!res.error) {
          const line = res.stdout.split(/\r?\n/).map(s => s.trim()).find(Boolean);
          if (line && /[0-9A-Fa-f-]{8,}/.test(line)) uuid = line;
        }
      }
      if (!uuid) return { success: false, error: 'UUID not found' };
      return { success: true, uuid };
    } else if (platform === 'darwin') {
      const res = await execAsync('system_profiler SPHardwareDataType | grep "Hardware UUID"');
      if (res.error) return { success: false, error: res.error.message || 'Command failed' };
      const match = res.stdout.match(/Hardware UUID:\s*([0-9A-Fa-f-]+)/);
      if (!match) return { success: false, error: 'UUID not found' };
      return { success: true, uuid: match[1] };
    }
    return { success: false, error: `Unsupported platform: ${platform}` };
  } catch (e) {
    console.error('[MAIN] system:get-machine-uuid failed:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('file:select-files', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (!result.canceled) {
      return result.filePaths;
    }
    return [];
  } catch (error) {
    console.error('Error selecting files:', error);
    throw error;
  }
});

ipcMain.handle('file:save-patient-files', async (event, { patientId, filePaths }) => {
  try {
    const savedFiles = await fileManager.savePatientFiles(patientId, filePaths);
    return savedFiles;
  } catch (error) {
    console.error('Error saving patient files:', error);
    throw error;
  }
});

ipcMain.handle('file:open-file', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    console.error('Error opening file:', error);
    throw error;
  }
});

ipcMain.handle('file:get-patient-files', async (event, patientId) => {
  try {
    const files = await fileManager.getPatientFiles(patientId);
    return files;
  } catch (error) {
    console.error('Error getting patient files:', error);
    throw error;
  }
});

ipcMain.handle('file:delete-patient-file', async (event, { patientId, fileName }) => {
  try {
    await fileManager.deletePatientFile(patientId, fileName);
    return { success: true };
  } catch (error) {
    console.error('Error deleting patient file:', error);
    throw error;
  }
});

ipcMain.handle('file:download-file', async (event, filePath) => {
  try {
    await shell.showItemInFolder(filePath);
    return { success: true };
  } catch (error) {
    console.error('Error downloading file:', error);
    throw error;
  }
});

ipcMain.handle('database:update-patient', async (event, patientData) => {
  try {
    await database.updatePatient(patientData);
    return { success: true };
  } catch (error) {
    console.error('Error updating patient:', error);
    throw error;
  }
});

ipcMain.handle('database:delete-patient', async (event, patientId) => {
  try {
    await database.deletePatient(patientId);
    return { success: true };
  } catch (error) {
    console.error('Error deleting patient:', error);
    throw error;
  }
});

ipcMain.handle('send-patient-data', async (event, { patientData, files, patientId }) => {
  try {
    console.log('Sending patient data to doctor:', { patientId, patientData, files });
    
    // Ensure patient exists in DB and has required fields before sending
    const existing = await database.getPatient(patientId);
    const nowIso = new Date().toISOString();
    let toSendPatient = null;
    if (!existing) {
      // Validate minimal required fields
      const name = patientData?.name || patientData?.patient_name;
      const dob = patientData?.date_of_birth || null;
      const yob = dob ? parseInt(dob.split('-')[0]) : (patientData?.year_of_birth ? parseInt(patientData.year_of_birth) : null);
      if (!name || !yob) {
        throw new Error(`Cannot create patient ${patientId}: name and year_of_birth/date_of_birth are required`);
      }
      const newPatient = {
        id: patientId,
        name,
        phone: patientData?.phone || '',
        email: patientData?.email || '',
        urgent_contact: patientData?.urgent_contact || '',
        convention: patientData?.convention || '',
        insurances: patientData?.insurances || '',
        reason_for_visit: patientData?.reason_for_visit || patientData?.appointment_reason || '',
        medical_history: patientData?.medical_history || '',
        year_of_birth: yob,
        date_of_birth: dob,
        consultation_price: patientData?.consultation_price || null,
        status: 'with_doctor',
        created_at: nowIso,
        updated_at: nowIso,
        hasBeenEdited: 1,
      };
      await database.addPatient(newPatient);
      toSendPatient = newPatient;
    } else {
      // Merge updates into existing and mark with_doctor
      const merged = {
        ...existing,
        ...patientData,
        // Normalize fields
        name: patientData?.name || patientData?.patient_name || existing.name,
        year_of_birth: patientData?.date_of_birth ? parseInt(patientData.date_of_birth.split('-')[0]) : (patientData?.year_of_birth || existing.year_of_birth),
        status: 'with_doctor',
        updated_at: nowIso,
      };
      await database.updatePatient(merged);
      toSendPatient = merged;
    }
    
    // Save files if provided
    if (files && files.length > 0) {
      await fileManager.savePatientFiles(patientId, files);
    }
    
    // Try to send via network if available
    if (networkManager && networkManager.isConnected()) {
      try {
        await networkManager.sendPatientData({ patientData: toSendPatient || patientData, files, patientId });
        console.log('Patient data sent via network successfully');
      } catch (networkError) {
        console.warn('Failed to send via network, but patient saved:', networkError);
      }
    } else {
      console.warn('Network manager not connected, skipping network transfer');
    }
    
    return { success: true, message: 'Patient data sent successfully' };
  } catch (error) {
    console.error('Error sending patient data:', error);
    throw error;
  }
});

ipcMain.handle('communication:ping-doctor', async (event, ip) => {
  try {
    // This would implement a ping to the doctor's IP
    // For now, just return success
    return { success: true, ip };
  } catch (error) {
    console.error('Error pinging doctor:', error);
    throw error;
  }
});

ipcMain.handle('communication:send-file', async (event, args) => {
  try {
    const { patientId, fileName, filePath } = args;
    // This would implement file sending logic
    // For now, just return success
    return { success: true, fileName };
  } catch (error) {
    console.error('Error sending file:', error);
    throw error;
  }
});



ipcMain.handle('settings:get-config', async () => {
  try {
    return await database.getSettings();
  } catch (error) {
    console.error('Error getting settings:', error);
    throw error;
  }
});

ipcMain.handle('settings:update-config', async (event, settings) => {
  try {
    await database.updateSettings(settings);
    return { success: true };
  } catch (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
});

// Only use bcryptjs in the secure-login handler
ipcMain.handle('secure-login', async (event, credentials) => {
  if (credentials.username === 'admin' && bcrypt.compareSync(credentials.password, ADMIN_HASH)) {
    return { success: true };
  } else {
    return { success: false, message: 'Invalid username or password' };
  }
});

ipcMain.handle('backup:select-drive', async () => {
  try {
    // Open custom backup selection modal instead of native dialog
    const { BrowserWindow, ipcMain: ipc } = require('electron');
    return await new Promise((resolve) => {
      const modal = new BrowserWindow({
        parent: mainWindow,
        modal: true,
        width: 480,
        height: 360,
        resizable: false,
        minimizable: false,
        maximizable: false,
        title: 'Select Backup Location',
        show: false,
        frame: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          preload: path.join(__dirname, 'app', 'backupModalPreload.js'),
        },
      });

      // Safety: single-use listeners
      const onChoose = (event, selectedPath) => {
        cleanup();
        try { modal.close(); } catch {}
        resolve(selectedPath || null);
      };
      const onCancel = () => {
        cleanup();
        try { modal.close(); } catch {}
        resolve(null);
      };
      const onClosed = () => {
        cleanup();
        resolve(null);
      };
      const cleanup = () => {
        ipc.removeListener('backup-modal:choose', onChoose);
        ipc.removeListener('backup-modal:cancel', onCancel);
        modal.removeListener('closed', onClosed);
      };

      ipc.once('backup-modal:choose', onChoose);
      ipc.once('backup-modal:cancel', onCancel);
      modal.once('closed', onClosed);

      modal.loadFile(path.join(__dirname, 'app', 'public', 'backup-modal.html')).then(() => {
        modal.show();
        modal.focus();
      }).catch((err) => {
        console.error('Failed to load backup modal:', err);
        onCancel();
      });
    });
  } catch (error) {
    console.error('Error selecting backup drive:', error);
    throw error;
  }
});

ipcMain.handle('backup:create-backup', async (event, backupPath) => {
  try {
    const backupData = await database.createBackup();
    const backupFile = path.join(backupPath, `cabneo_backup_${Date.now()}.json`);
    
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
    return { success: true, backupFile };
  } catch (error) {
    console.error('Error creating backup:', error);
    throw error;
  }
});

ipcMain.handle('backup:backup-patient', async (event, patient) => {
  try {
    return await database.backupPatient(patient);
  } catch (error) {
    console.error('Error backing up patient:', error);
    throw error;
  }
});

ipcMain.handle('backup:update-patient-backup', async (event, patient) => {
  try {
    return await database.updatePatientBackup(patient);
  } catch (error) {
    console.error('Error updating patient backup:', error);
    throw error;
  }
});

ipcMain.handle('backup:get-backup-files', async () => {
  try {
    return await database.getBackupFiles();
  } catch (error) {
    console.error('Error getting backup files:', error);
    throw error;
  }
});

ipcMain.handle('backup:restore-patient', async (event, backupFilePath) => {
  try {
    return await database.restorePatientFromBackup(backupFilePath);
  } catch (error) {
    console.error('Error restoring patient from backup:', error);
    throw error;
  }
});

ipcMain.handle('backup:restore-all-patients', async () => {
  try {
    return await database.restoreAllPatientsFromBackup();
  } catch (error) {
    console.error('Error restoring all patients from backup:', error);
    throw error;
  }
});

ipcMain.handle('backup:validate-path', async () => {
  try {
    return await database.validateAndUpdateBackupPath();
  } catch (error) {
    console.error('Error validating backup path:', error);
    throw error;
  }
});

ipcMain.handle('backup:get-path-status', async () => {
  try {
    return await database.getBackupPathStatus();
  } catch (error) {
    console.error('Error getting backup path status:', error);
    throw error;
  }
});
  

  // IPC test handler
  ipcMain.handle('test-ipc', async () => {
    console.log('>>> [DEBUG] Test IPC handler called!');
    return { success: true };
  });

  // Get current connection status
  ipcMain.handle('get-connection-status', async () => {
    console.log('[DEBUG][MAIN] get-connection-status called');
    const isConnected = networkManager.isConnected();
    const status = isConnected ? 'connected' : 'disconnected';
    console.log('[DEBUG][MAIN] networkManager.isConnected():', isConnected);
    console.log('[DEBUG][MAIN] Returning status:', status);
    return status;
  });

  // Send dashboard status to doctor app via communication manager
  ipcMain.handle('send-dashboard-status', async () => {
    try {
      console.log(' [MAIN] IPC: send-dashboard-status handler called');
      const patientsList = await database.getAllPatients();
      const appointmentsList = await database.getAppointments();

      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      const todaysAppointments = appointmentsList.filter(a => a.appointment_date === todayStr);
      const todayPatientIds = new Set(todaysAppointments.map(a => a.patient_id));
      const todayPatients = patientsList.filter(p => todayPatientIds.has(p.id));
      const waitingPatients = todayPatients.filter(p => String(p.status).toLowerCase() === 'waiting');

      // Simple counts
      const todayPatientsCount = todayPatients.length;
      const weekPatientsCount = 0; // optional: implement if needed

      const dashboardStatus = {
        timestamp: new Date().toISOString(),
        todayPatients: todayPatientsCount,
        weekPatients: weekPatientsCount,
        waitingPatients: waitingPatients.length,
        waitingPatientsList: waitingPatients.map(p => ({
          id: p.id,
          name: p.name,
          age: p.age,
          gender: p.gender,
          appointmentTime: todaysAppointments.find(a => a.patient_id === p.id)?.appointment_time || null,
          status: p.status,
        })),
        todayPatientsList: todayPatients.map(p => ({
          id: p.id,
          name: p.name,
          age: p.age,
          gender: p.gender,
          appointmentTime: todaysAppointments.find(a => a.patient_id === p.id)?.appointment_time || null,
          status: p.status,
        })),
      };

      if (communicationManager) {
        console.log(' [MAIN] Calling communicationManager.sendDashboardStatus()');
        await communicationManager.sendDashboardStatus(dashboardStatus);
        console.log(' [MAIN] Dashboard status sent successfully via communication manager');
      } else {
        console.error(' [MAIN] ERROR: communicationManager not available');
      }

      return { success: true, data: dashboardStatus };
    } catch (error) {
      console.error(' [MAIN] Error in send-dashboard-status handler:', error);
      throw error;
    }
  });

  // Send waiting patients list
  ipcMain.handle('send-waiting-patients', async () => {
    try {
      console.log(' [MAIN] IPC: send-waiting-patients handler called');

      const patientsList = await database.getAllPatients();
      const appointmentsList = await database.getAppointments();

      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      const todaysAppointments = appointmentsList.filter(a => a.appointment_date === todayStr);
      const todayPatientIds = new Set(todaysAppointments.map(a => a.patient_id));
      const todayPatients = patientsList.filter(p => todayPatientIds.has(p.id));

      // status strictly 'waiting' and optionally edited flag
      const waitingPatients = todayPatients.filter(p => String(p.status).toLowerCase() === 'waiting' && (p.hasBeenEdited ? true : true));

      const waitingData = {
        timestamp: new Date().toISOString(),
        waitingCount: waitingPatients.length,
        waitingPatients: waitingPatients.map(p => ({
          id: p.id,
          name: p.name,
          appointmentTime: todaysAppointments.find(a => a.patient_id === p.id)?.appointment_time || null,
        })),
      };

      if (communicationManager) {
        console.log(' [MAIN] Calling communicationManager.sendWaitingPatientNames()');
        await communicationManager.sendWaitingPatientNames(waitingPatients);
        console.log(' [MAIN] Waiting patients sent successfully via communication manager');
      } else {
        console.error(' [MAIN] ERROR: communicationManager not available');
      }

      return { success: true, data: waitingData };
    } catch (error) {
      console.error(' [MAIN] Error in send-waiting-patients handler:', error);
      throw error;
    }
  });

  // Manual test trigger to send dashboard status when connected
  ipcMain.handle('test-dashboard-status', async () => {
    try {
      console.log(' [MAIN] TEST: Manually triggering dashboard status send...');
      if (communicationManager && communicationManager.isConnected) {
        const result = await communicationManager.sendDashboardStatusOnConnection();
        return result?.success ? { success: true, message: 'Dashboard status sent successfully' } : { success: false, message: result?.error || 'Unknown error' };
      }
      return { success: false, message: 'Communication manager not available or not connected' };
    } catch (error) {
      console.error(' [MAIN] Error in test-dashboard-status:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle communication events
  ipcMain.on('communication:message-received', (event, message) => {
    if (mainWindow) {
      mainWindow.webContents.send('communication:new-message', message);
    }
  });

  ipcMain.on('communication:appointment-request', (event, data) => {
    if (mainWindow) {
      mainWindow.webContents.send('communication:appointment-notification', data);
    }
  });

// App lifecycle
app.on('ready', async () => {
  await initializeApp();
  createWindow();
  // Removed: trial overlay invocation. Renderer will redirect to Settings if trial is expired.
  // Setup networkManager IPC bridge
  // networkManager.setupIPC(mainWindow); // This line is removed as per the edit hint.
  // Listen for network status changes and log them
  ipcMain.on('network-status', (event, status) => {
    if (status === 'connected') {
      console.log('[NETWORK] Connected to doctor app');
    } else if (status === 'disconnected') {
      console.log('[NETWORK] Disconnected from doctor app');
    } else if (status === 'connecting') {
      console.log('[NETWORK] Connecting to doctor app...');
    }
  });
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (communicationManager) {
    await communicationManager.cleanup();
  }
  if (database) {
    await database.close();
  }
}); 

ipcMain.handle('database:add-recent-patient', async (event, patient) => {
  try {
    await database.addRecentPatient(patient);
    return { success: true };
  } catch (error) {
    console.error('Error adding recent patient:', error);
    throw error;
  }
});

ipcMain.handle('database:get-recent-patients', async () => {
  try {
    return await database.getRecentPatients();
  } catch (error) {
    console.error('Error getting recent patients:', error);
    throw error;
  }
});

ipcMain.handle('save-credentials', async (event, credsData) => {
  return await creds.saveCredentials(credsData);
});
ipcMain.handle('verify-credentials', async (event, credsData) => {
  return await creds.verifyCredentials(credsData);
});
ipcMain.handle('credentials-exist', () => {
  return creds.credentialsExist();
});

ipcMain.handle('is-first-time-setup', () => {
  return creds.isFirstTimeSetup();
});

// Recovery: verify a recovery code and reset only the credentials file
ipcMain.handle('credentials:use-recovery-code', async (event, code) => {
  try {
    const ok = await creds.useRecoveryCode(String(code || '').trim());
    return { success: !!ok };
  } catch (e) {
    console.error('[MAIN] use-recovery-code failed:', e);
    return { success: false, error: e?.message };
  }
});

// Google Drive authentication handler
ipcMain.handle('google-drive-auth', async (event, credentials) => {
  try {
    const { BrowserWindow, ipcMain: ipc } = require('electron');
    // Show a custom confirmation modal before starting OAuth
    const proceed = await new Promise((resolve) => {
      const modal = new BrowserWindow({
        parent: mainWindow,
        modal: true,
        width: 520,
        height: 380,
        resizable: false,
        minimizable: false,
        maximizable: false,
        title: 'Connect to Google Drive',
        show: false,
        frame: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          preload: path.join(__dirname, 'app', 'backupModalPreload.js'), // reuse same preload API
        },
      });

      const onProceed = () => { cleanup(); try { modal.close(); } catch {}; resolve(true); };
      const onCancel = () => { cleanup(); try { modal.close(); } catch {}; resolve(false); };
      const onClosed = () => { cleanup(); resolve(false); };
      const cleanup = () => {
        ipc.removeListener('google-connect:proceed', onProceed);
        ipc.removeListener('google-connect:cancel', onCancel);
        modal.removeListener('closed', onClosed);
      };
      ipc.once('google-connect:proceed', onProceed);
      ipc.once('google-connect:cancel', onCancel);
      modal.once('closed', onClosed);

      modal.loadFile(path.join(__dirname, 'app', 'public', 'google-connect-modal.html')).then(() => {
        modal.show();
        modal.focus();
      }).catch((err) => {
        console.error('Failed to load Google Connect modal:', err);
        onCancel();
      });
    });

    if (!proceed) {
      return { success: false, error: 'cancelled' };
    }

    const { BrowserWindow: BW } = require('electron');
    
    // Create OAuth window
    const authWindow = new BW({
      width: 500,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      },
      show: false
    });

    // Build OAuth URL with a custom redirect URI that we can handle
    const params = new URLSearchParams({
      client_id: credentials.client_id,
      redirect_uri: 'http://localhost:3000/oauth/callback',
      scope: credentials.scopes.join(' '),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent'
    });

    const authUrl = `${credentials.auth_uri}?${params.toString()}`;
    
    // Load the OAuth URL
    await authWindow.loadURL(authUrl);
    authWindow.show();

    return new Promise((resolve, reject) => {
      let hasResolved = false;
      
      // Handle navigation events
      authWindow.webContents.on('will-navigate', async (event, navigationUrl) => {
        if (hasResolved) return;
        
        const url = new URL(navigationUrl);
        
        if (url.searchParams.has('code')) {
          hasResolved = true;
          const code = url.searchParams.get('code');
          authWindow.close();
          
          try {
            // Exchange code for tokens
            const response = await fetch(credentials.token_uri, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                client_id: credentials.client_id,
                client_secret: credentials.client_secret,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: 'http://localhost:3000/oauth/callback'
              })
            });

            const data = await response.json();
            
            if (data.error) {
              reject(new Error(data.error_description || data.error));
            } else {
              // Fetch user info to get the authenticated email
              let email;
              try {
                const ures = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
                  headers: { Authorization: `Bearer ${data.access_token}` }
                });
                const ujson = await ures.json();
                email = ujson && (ujson.email || ujson.email_address);
              } catch (_) {}
              resolve({
                success: true,
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expires_in: data.expires_in,
                email
              });
            }
          } catch (error) {
            reject(error);
          }
        } else if (url.searchParams.has('error')) {
          hasResolved = true;
          const error = url.searchParams.get('error');
          authWindow.close();
          reject(new Error(error));
        }
      });

      // Handle redirect events
      authWindow.webContents.on('will-redirect', async (event, navigationUrl) => {
        if (hasResolved) return;
        
        const url = new URL(navigationUrl);
        
        if (url.searchParams.has('code')) {
          hasResolved = true;
          const code = url.searchParams.get('code');
          authWindow.close();
          
          try {
            // Exchange code for tokens
            const response = await fetch(credentials.token_uri, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                client_id: credentials.client_id,
                client_secret: credentials.client_secret,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: 'http://localhost:3000/oauth/callback'
              })
            });

            const data = await response.json();
            
            if (data.error) {
              reject(new Error(data.error_description || data.error));
            } else {
              // Fetch user info to get the authenticated email
              let email;
              try {
                const ures = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
                  headers: { Authorization: `Bearer ${data.access_token}` }
                });
                const ujson = await ures.json();
                email = ujson && (ujson.email || ujson.email_address);
              } catch (_) {}
              resolve({
                success: true,
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expires_in: data.expires_in,
                email
              });
            }
          } catch (error) {
            reject(error);
          }
        } else if (url.searchParams.has('error')) {
          hasResolved = true;
          const error = url.searchParams.get('error');
          authWindow.close();
          reject(new Error(error));
        }
      });

      // Handle window close
      authWindow.on('closed', () => {
        if (!hasResolved) {
          reject(new Error('Authentication window was closed'));
        }
      });
    });
  } catch (error) {
    console.error('Error in Google Drive authentication:', error);
    throw error;
  }
});



ipcMain.handle('getAppointments', async () => {
  try {
    const appointments = await database.getAppointments();
    return appointments;
  } catch (error) {
    console.error('Error getting appointments:', error);
    throw error;
  }
});
// IPC handlers for auto-backup functionality
ipcMain.handle('getAllPatients', async () => {
  try {
    const patients = await database.getAllPatients();
    return patients;
  } catch (error) {
    console.error('Error getting all patients:', error);
    throw error;
  }
});

ipcMain.handle('getSettings', async () => {
  try {
    const settings = await database.getSettings();
    return settings;
  } catch (error) {
    console.error('Error getting settings:', error);
    throw error;
  }
});

