import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, SecretKeyError, secretKeyFromEnv } from "./secrets";

const key = randomBytes(32);

describe("secrets", () => {
  it("round-trips and never stores the plaintext", () => {
    const sealed = encryptSecret("garmin-key-123", "a@x.com", key);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("garmin-key-123");
    expect(decryptSecret(sealed, "a@x.com", key)).toBe("garmin-key-123");
  });

  it("uses a fresh IV every time", () => {
    expect(encryptSecret("k", "u", key)).not.toBe(encryptSecret("k", "u", key));
  });

  it("is bound to the user: a copied ciphertext won't open for someone else", () => {
    const sealed = encryptSecret("k", "a@x.com", key);
    expect(() => decryptSecret(sealed, "b@x.com", key)).toThrow();
  });

  it("detects tampering and a wrong key", () => {
    const sealed = encryptSecret("k", "u", key);
    const parts = sealed.split(".");
    parts[3] = Buffer.from("xx").toString("base64url");
    expect(() => decryptSecret(parts.join("."), "u", key)).toThrow();
    expect(() => decryptSecret(sealed, "u", randomBytes(32))).toThrow();
    expect(() => decryptSecret("v0.a.b.c", "u", key)).toThrow(/format/);
  });

  it("requires a 32-byte base64 key", () => {
    expect(() => secretKeyFromEnv({})).toThrow(SecretKeyError);
    expect(() => secretKeyFromEnv({ GARMIN_SECRET_KEY: Buffer.alloc(16).toString("base64") })).toThrow(/32 bytes/);
    expect(secretKeyFromEnv({ GARMIN_SECRET_KEY: key.toString("base64") }).equals(key)).toBe(true);
  });
});
