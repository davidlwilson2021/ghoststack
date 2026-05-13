// Cryptographic primitives for the Worker.
//
// - hashPassword: PBKDF2 for password storage
// - generateToken: cryptographically random session tokens
// - encrypt / decrypt: AES-GCM for protecting user-supplied API keys
//   at rest in D1. The master key is a Worker secret (MASTER_KEY,
//   32 random bytes encoded as base64). Each encryption uses a fresh
//   12-byte IV; ciphertext + IV are both stored, key never leaves
//   the Worker environment.

export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

export function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function b64encode(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function b64decode(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

async function importMasterKey(masterKeyBase64) {
  const raw = b64decode(masterKeyBase64);
  if (raw.length !== 32) throw new Error('MASTER_KEY must decode to 32 bytes');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encrypt(plaintext, masterKeyBase64) {
  if (!masterKeyBase64) throw new Error('MASTER_KEY not configured');
  if (typeof plaintext !== 'string') throw new Error('encrypt expects a string');
  const key = await importMasterKey(masterKeyBase64);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return {
    ciphertext: b64encode(new Uint8Array(ciphertext)),
    iv: b64encode(iv),
  };
}

export async function decrypt(ciphertextBase64, ivBase64, masterKeyBase64) {
  if (!masterKeyBase64) throw new Error('MASTER_KEY not configured');
  if (!ciphertextBase64 || !ivBase64) throw new Error('decrypt requires ciphertext and iv');
  const key = await importMasterKey(masterKeyBase64);
  const plaintextBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(ivBase64) },
    key,
    b64decode(ciphertextBase64)
  );
  return new TextDecoder().decode(plaintextBytes);
}
