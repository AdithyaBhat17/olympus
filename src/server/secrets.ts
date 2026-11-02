import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Secrets at rest (the Garmin personal API key): AES-256-GCM with a 32-byte
 * key from GARMIN_SECRET_KEY (base64), which lives only in the environment.
 *
 * Format: "v1.<iv>.<tag>.<ciphertext>", each part base64url. The user id is
 * bound in as additional data, so a ciphertext copied onto another user's
 * row doesn't decrypt.
 *
 * Generate a key with: openssl rand -base64 32
 */

const VERSION = "v1";

export class SecretKeyError extends Error {}

export function secretKeyFromEnv(env: Record<string, string | undefined> = process.env): Buffer {
  const raw = env.GARMIN_SECRET_KEY?.trim();
  if (!raw) throw new SecretKeyError("GARMIN_SECRET_KEY is not set (openssl rand -base64 32)");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new SecretKeyError("GARMIN_SECRET_KEY must be 32 bytes, base64-encoded");
  return key;
}

export function encryptSecret(plaintext: string, userId: string, key: Buffer = secretKeyFromEnv()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(sealed: string, userId: string, key: Buffer = secretKeyFromEnv()): string {
  const [version, iv, tag, ct] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || ct === undefined) throw new Error("Unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(userId, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
