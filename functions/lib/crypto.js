function b64decode(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

async function importMasterKey(masterKeyBase64) {
  const raw = b64decode(masterKeyBase64);
  if (raw.length !== 32) throw new Error('MASTER_KEY must decode to 32 bytes');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
}

export async function decrypt(ciphertextBase64, ivBase64, masterKeyBase64) {
  if (!masterKeyBase64) throw new Error('MASTER_KEY not configured');
  const key = await importMasterKey(masterKeyBase64);
  const plaintextBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(ivBase64) },
    key,
    b64decode(ciphertextBase64)
  );
  return new TextDecoder().decode(plaintextBytes);
}
