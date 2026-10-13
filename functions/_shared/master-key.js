import { fromBase64Url, randomBytes, utf8 } from './cloud-sync.js';

async function importAesKey(base64url) {
  const raw = fromBase64Url(base64url);
  if (raw.length !== 32) throw new Error('Master key must be 32 bytes.');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptWithMasterKey(base64urlKey, plaintext, aadText) {
  const key = await importAesKey(base64urlKey);
  const iv = randomBytes(12);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8(aadText), tagLength: 128 },
    key,
    plaintext,
  ));
  return { iv, ciphertext };
}

export async function decryptWithMasterKey(base64urlKey, iv, ciphertext, aadText) {
  const key = await importAesKey(base64urlKey);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: utf8(aadText), tagLength: 128 },
    key,
    ciphertext,
  );
  return new Uint8Array(plaintext);
}
