const CryptoJS = require('crypto-js');

// Encryption key - in production, this should be stored securely
const ENCRYPTION_KEY = 'cabneo-secure-key-2024';

function encrypt(text) {
  try {
    return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

function decrypt(encryptedText) {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedText, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

function hashPassword(password) {
  try {
    return CryptoJS.SHA256(password).toString();
  } catch (error) {
    console.error('Password hashing error:', error);
    throw new Error('Failed to hash password');
  }
}

function verifyPassword(password, hash) {
  try {
    const passwordHash = CryptoJS.SHA256(password).toString();
    return passwordHash === hash;
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

module.exports = {
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword
}; 