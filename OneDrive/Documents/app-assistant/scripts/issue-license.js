#!/usr/bin/env node
/*
Usage examples:
  node scripts/issue-license.js --priv C:\\secure\\ed25519-priv.pem --fingerprint <FP> --customer ACME --edition Pro --days 365

Outputs a license token to stdout and prints details.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
      args[key] = val;
    }
  }
  return args;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function stableStringify(obj) {
  const keys = Object.keys(obj).sort();
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return JSON.stringify(out);
}

function msNow() { return Date.now(); }

async function main() {
  const args = parseArgs(process.argv);
  // Default to ./ed25519-priv.pem if not explicitly provided
  const cwdPriv = path.resolve(process.cwd(), 'ed25519-priv.pem');
  const privPath = args.priv || args.key || process.env.PRIVATE_KEY_PATH || (fs.existsSync(cwdPriv) ? cwdPriv : undefined);
  const fingerprint = args.fingerprint || args.fp || process.env.MACHINE_FINGERPRINT;
  const days = parseInt(args.days || '365', 10);
  const licenseVersion = parseInt(args.license_version || '1', 10);
  const licenseId = args.license_id || `LIC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const customerId = args.customer || args.customer_id || '';
  const edition = args.edition || 'Pro';
  const issuedAt = args.issued_at ? Number(args.issued_at) : msNow();

  if (!privPath || !fs.existsSync(privPath)) {
    console.error('ERROR: Missing or invalid --priv path to ed25519 private key');
    process.exit(1);
  }
  if (!fingerprint || typeof fingerprint !== 'string' || fingerprint.length < 8) {
    console.error('ERROR: Missing or invalid --fingerprint');
    process.exit(2);
  }
  const expiresAt = issuedAt + days * 24 * 3600 * 1000;

  const privateKeyPem = fs.readFileSync(privPath, 'utf8');
  const privateKey = crypto.createPrivateKey(privateKeyPem);

  const payload = {
    edition,
    expires_at: expiresAt,
    fingerprint,
    issued_at: issuedAt,
    license_id: licenseId,
    license_version: licenseVersion,
    customer_id: customerId,
  };

  const payloadJson = stableStringify(payload);
  const sig = crypto.sign(null, Buffer.from(payloadJson, 'utf8'), privateKey); // Ed25519: algorithm null
  const token = `${b64url(Buffer.from(payloadJson, 'utf8'))}.${b64url(sig)}`;

  // Pretty segmented output for UX
  const segmented = token.replace(/(.{8})/g, '$1-').replace(/-$/,'');

  console.log('License Token:');
  console.log(token);
  console.log('\nSegmented (copy-friendly):');
  console.log(segmented);
  console.log('\nDetails:');
  console.log({ licenseId, customerId, edition, issuedAt, expiresAt, days });
}

main().catch((e) => {
  console.error('Failed to issue license:', e && e.message);
  process.exit(3);
});
