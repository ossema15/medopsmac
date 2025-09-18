#!/usr/bin/env node
const crypto = require('crypto');
const { exec } = require('child_process');

function sha256Hex(str) { return crypto.createHash('sha256').update(str).digest('hex'); }
function execAsync(cmd) { return new Promise((resolve) => exec(cmd, { windowsHide: true }, (error, stdout, stderr) => resolve({ error, stdout: String(stdout||''), stderr: String(stderr||'') }))); }

async function getMachineGuid() {
  try {
    const res = await execAsync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid');
    const m = res.stdout.match(/MachineGuid\s+REG_[A-Z_]+\s+([\w-]+)/i);
    return m ? m[1] : null;
  } catch { return null; }
}

async function getCsProductUUID() {
  let res = await execAsync('powershell -NoProfile -Command "(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID"');
  if (!res.error) {
    const line = res.stdout.split(/\r?\n/).map(s=>s.trim()).find(Boolean);
    if (line && /[0-9A-Fa-f-]{8,}/.test(line)) return line;
  }
  res = await execAsync('wmic csproduct get uuid /value');
  if (!res.error) {
    const m = res.stdout.match(/UUID=([0-9A-Fa-f-]+)/);
    if (m) return m[1];
  }
  res = await execAsync('wmic csproduct get uuid');
  if (!res.error) {
    const lines = res.stdout.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const val = lines.find(l => /[0-9A-Fa-f-]{8,}/.test(l) && l.toLowerCase() !== 'uuid');
    if (val) return val;
  }
  return null;
}

async function getVolumeSerial() {
  try {
    const res = await execAsync('cmd /c vol C:');
    const m = res.stdout.match(/Serial Number is ([\w-]+)/i);
    return m ? m[1] : null;
  } catch { return null; }
}

(async function main(){
  const [guid, csuuid, vol] = await Promise.all([getMachineGuid(), getCsProductUUID(), getVolumeSerial()]);
  const parts = [];
  if (guid) parts.push(`guid:${guid}`);
  if (csuuid) parts.push(`csuuid:${csuuid}`);
  if (vol) parts.push(`vol:${vol}`);
  const material = parts.join('|');
  if (!material) {
    console.error('Failed to gather fingerprint material');
    process.exit(1);
  }
  const fp = sha256Hex(material);
  console.log(fp);
})();
