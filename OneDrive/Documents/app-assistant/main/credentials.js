const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { app } = require('electron');
let argon2;
try {
  // Prefer Argon2id for password hashing if available
  argon2 = require('argon2');
} catch (e) {
  console.warn('[Credentials] argon2 not installed. Falling back to bcryptjs. Run: npm i argon2');
}

const credentialsPath = path.join(app.getPath('userData'), 'credentials.json');
console.log('Credentials path:', credentialsPath);

function credentialsExist() {
  return fs.existsSync(credentialsPath);
}

function isFirstTimeSetup() {
  return !credentialsExist();
}

function generateRecoveryCodes(n = 3, len = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoid ambiguous chars
  const codes = [];
  for (let i = 0; i < n; i++) {
    let c = '';
    for (let j = 0; j < len; j++) c += alphabet[Math.floor(Math.random() * alphabet.length)];
    codes.push(c);
  }
  return codes;
}

async function saveCredentials({ username, password }) {
  if (!username || !password) throw new Error('Missing username or password');
  let record;
  if (argon2) {
    // Argon2id parameters: moderate defaults
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456, // ~19MB
      timeCost: 2,
      parallelism: 1,
    });
    record = { username, algo: 'argon2id', hash };
  } else {
    const passwordHash = bcrypt.hashSync(password, 10);
    record = { username, algo: 'bcrypt', hash: passwordHash };
  }
  // Generate 3 recovery codes and store hashed versions
  const recoveryPlain = generateRecoveryCodes(3, 6);
  if (argon2) {
    record.recovery = {
      algo: 'argon2id',
      createdAt: Date.now(),
      codes: await Promise.all(recoveryPlain.map(async (c) => ({ hash: await argon2.hash(c, { type: argon2.argon2id }), used: false })))
    };
  } else {
    record.recovery = {
      algo: 'bcrypt',
      createdAt: Date.now(),
      codes: recoveryPlain.map((c) => ({ hash: bcrypt.hashSync(c, 10), used: false }))
    };
  }

  fs.writeFileSync(credentialsPath, JSON.stringify(record, null, 2));
  // Return the plaintext recovery codes ONCE to the caller for display/print
  return { recoveryCodes: recoveryPlain };
}

async function verifyCredentials({ username, password }) {
  // If no credentials exist, allow admin/admin for first-time setup and persist securely
  if (!credentialsExist()) {
    if (username === 'admin' && password === 'admin') {
      console.log('[Credentials] Bootstrap admin/admin detected. Persisting credentials securely.');
      await saveCredentials({ username, password });
      return true;
    }
    return false;
  }

  const raw = fs.readFileSync(credentialsPath, 'utf8');
  let stored;
  try {
    stored = JSON.parse(raw);
  } catch (e) {
    console.error('[Credentials] Corrupt credentials file, rejecting login');
    return false;
  }

  const storedUser = stored.username;
  const algo = stored.algo || (stored.passwordHash ? 'bcrypt' : undefined);
  const hash = stored.hash || stored.passwordHash; // support legacy field

  const userMatch = storedUser === username;
  if (!userMatch) {
    console.log('[Credentials] Username mismatch');
    return false;
  }

  let passMatch = false;
  if (algo === 'argon2id' && argon2) {
    try { passMatch = await argon2.verify(hash, password); } catch { passMatch = false; }
  } else if (algo === 'bcrypt') {
    try { passMatch = bcrypt.compareSync(password, hash); } catch { passMatch = false; }
    // Auto-migrate bcrypt -> argon2 on successful login if argon2 available
    if (passMatch && argon2) {
      try {
        await saveCredentials({ username, password });
        console.log('[Credentials] Migrated bcrypt hash to argon2id');
      } catch (e) {
        console.warn('[Credentials] Migration to argon2 failed, keeping bcrypt:', e.message);
      }
    }
  } else {
    // Unknown algorithm
    console.warn('[Credentials] Unknown or unsupported hash algorithm');
    return false;
  }

  console.log('Login attempt:', { username, userMatch, passMatch });
  return !!passMatch;
}

async function useRecoveryCode(code) {
  if (!credentialsExist()) return false;
  try {
    const raw = fs.readFileSync(credentialsPath, 'utf8');
    const stored = JSON.parse(raw);
    const rec = stored.recovery;
    if (!rec || !Array.isArray(rec.codes) || rec.codes.length === 0) return false;
    const algo = rec.algo || stored.algo;
    for (const entry of rec.codes) {
      const hash = entry.hash;
      let ok = false;
      if (algo === 'argon2id' && argon2) {
        try { ok = await argon2.verify(hash, code); } catch { ok = false; }
      } else if (algo === 'bcrypt') {
        try { ok = bcrypt.compareSync(code, hash); } catch { ok = false; }
      }
      if (ok) {
        // Valid recovery code: reset credentials file only (database untouched)
        try { fs.unlinkSync(credentialsPath); } catch {}
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error('[Credentials] useRecoveryCode error:', e);
    return false;
  }
}

module.exports = { credentialsExist, saveCredentials, verifyCredentials, isFirstTimeSetup, useRecoveryCode };