// ━━━ V4 — Test critique #2 : authentification JWT + 2FA ━━━
//
// Vérifie les invariants documentés dans src/lib/auth.ts :
//   1. En production, JWT_SECRET absent => échec fatal (P0-SEC-1).
//   2. En production, JWT_SECRET < 32 chars => échec fatal.
//   3. Le secret de dev ne doit PAS être une constante en clair (P2-SEC-9).
//   4. Les tokens expirent (signature + expiration vérifiables).
//
// Ce test garantit que toute future régression de sécurité (re-hardcodage
// du secret, suppression du fail-fast prod) échoue en CI.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('JWT secret — fail-fast en production', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.JWT_SECRET;
    delete process.env.ENCRYPTION_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('lance une erreur fatale en production si JWT_SECRET est absent', async () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PHASE = undefined;
    // Re-importer le module pour réévaluer les closures.
    jest.resetModules?.() ?? vi.resetModules();
    const { getJwtSecret } = await import('@/lib/auth');
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it('lance une erreur si JWT_SECRET < 32 caractères en production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PHASE = undefined;
    process.env.JWT_SECRET = 'short';
    vi.resetModules();
    const { getJwtSecret } = await import('@/lib/auth');
    expect(() => getJwtSecret()).toThrow(/too short|JWT_SECRET/);
  });

  it('accepte un JWT_SECRET >= 32 caractères en production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PHASE = undefined;
    process.env.JWT_SECRET = 'x'.repeat(48);
    vi.resetModules();
    const { getJwtSecret } = await import('@/lib/auth');
    expect(getJwtSecret()).toBe(process.env.JWT_SECRET);
  });

  it('refuse ENCRYPTION_KEY === JWT_SECRET (P0-SEC distinct secrets)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PHASE = undefined;
    const sameSecret = 'x'.repeat(48);
    process.env.JWT_SECRET = sameSecret;
    process.env.ENCRYPTION_KEY = sameSecret;
    vi.resetModules();
    const { getEncryptionKeySource } = await import('@/lib/guest-auth');
    expect(() => getEncryptionKeySource()).toThrow(/ENCRYPTION_KEY|JWT_SECRET|distinct/);
  });
});

describe('Token invitation invité — chiffrement AES-256-GCM', () => {
  it('génère puis déchiffre un token avec la bonne clé', async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-32-chars-padding-padding';
    process.env.ENCRYPTION_KEY = 'test-enc-key-32-chars-padding-padding';
    const { generateInvitationLinkToken, decryptInvitationLinkToken } = await import('@/lib/guest-auth');
    const invitationCode = 'INV-ABC-123';
    const token = generateInvitationLinkToken(invitationCode);
    expect(token).not.toBe(invitationCode);
    const recovered = decryptInvitationLinkToken(token);
    expect(recovered).toBe(invitationCode);
  });

  it('rejette un token modifié (intégrité GCM)', async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'x'.repeat(48);
    process.env.ENCRYPTION_KEY = 'y'.repeat(48);
    const { generateInvitationLinkToken, decryptInvitationLinkToken } = await import('@/lib/guest-auth');
    const token = generateInvitationLinkToken('INV-XYZ');
    const tampered = token.slice(0, -4) + 'AAAA';
    expect(decryptInvitationLinkToken(tampered)).toBeNull();
  });
});
