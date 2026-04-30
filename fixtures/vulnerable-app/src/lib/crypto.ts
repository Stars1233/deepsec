// VULN: insecure-crypto — MD5 for password hashing, Math.random for tokens

import crypto from "node:crypto";

export function hashPassword(password: string): string {
  // Vulnerable: MD5 is not suitable for password hashing
  return crypto.createHash("md5").update(password).digest("hex");
}

export function generateToken(): string {
  // Vulnerable: Math.random is not cryptographically secure
  return Math.random().toString(36).substring(2);
}

export function encryptData(data: string, key: string): string {
  // Vulnerable: createCipher is deprecated
  const cipher = crypto.createCipher("aes-256-cbc", key);
  return cipher.update(data, "utf8", "hex") + cipher.final("hex");
}
