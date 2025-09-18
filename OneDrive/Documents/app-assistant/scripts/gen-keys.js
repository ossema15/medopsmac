#!/usr/bin/env node
const { generateKeyPairSync } = require('crypto');
const fs = require('fs');
const path = require('path');

const outDir = process.cwd();
const privPath = path.join(outDir, 'ed25519-priv.pem');
const pubPath  = path.join(outDir, 'ed25519-pub.pem');

if (fs.existsSync(privPath) || fs.existsSync(pubPath)) {
  console.error('Refusing to overwrite existing key files. Move or delete ed25519-*.pem first.');
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
fs.writeFileSync(privPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
fs.writeFileSync(pubPath,  publicKey.export({ type: 'spki',  format: 'pem' }));

console.log('Wrote:');
console.log('  ' + privPath);
console.log('  ' + pubPath);
console.log('\nIMPORTANT: Keep the private key secret and offline. Embed the PUBLIC key into main/licenseManager.js or set LICENSE_PUBKEY_* env.');
