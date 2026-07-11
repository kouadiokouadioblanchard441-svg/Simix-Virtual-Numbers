/**
 * Chiffrement AES-256-GCM des clés API
 * Clé dérivée de ENCRYPTION_KEY (ou SESSION_SECRET en fallback).
 * Format stocké : base64(iv[12] + tag[16] + ciphertext)
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function getDerivedKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY ?? process.env.SESSION_SECRET;
  if (!secret) {
    // Fail loudly — ne pas utiliser un secret codé en dur en production
    throw new Error("[email-router] ENCRYPTION_KEY ou SESSION_SECRET requis pour chiffrer les clés API des fournisseurs email");
  }
  // SHA-256 → 32 bytes pour AES-256
  return createHash("sha256").update(secret).digest();
}

/** Chiffre une valeur en clair → chaîne base64 sécurisée */
export function encrypt(plaintext: string): string {
  if (!plaintext) return "";
  const key  = getDerivedKey();
  const iv   = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv (12) + tag (16) + ciphertext → base64
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/** Déchiffre une chaîne base64 → valeur en clair */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return "";
  try {
    const buf  = Buffer.from(ciphertext, "base64");
    const key  = getDerivedKey();
    const iv   = buf.subarray(0, 12);
    const tag  = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data) + decipher.final("utf8");
  } catch {
    // Clé changée ou données corrompues — retourne chaîne vide
    return "";
  }
}

/** Masque une clé API pour l'affichage frontend (ex: re_***...abc) */
export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return "****";
  return key.substring(0, 4) + "***" + key.substring(key.length - 4);
}
