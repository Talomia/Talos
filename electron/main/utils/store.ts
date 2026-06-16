import ElectronStore from 'electron-store';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

/**
 * Generate or retrieve a per-machine encryption key for the electron store.
 * The key is stored in the app's userData directory and is unique per installation.
 * This prevents the key from being hardcoded in source code.
 */
function getOrCreateEncryptionKey(): string {
  const keyDir = app.getPath('userData');
  const keyPath = join(keyDir, '.store-key');

  if (existsSync(keyPath)) {
    return readFileSync(keyPath, 'utf-8').trim();
  }

  // Generate a cryptographically random key
  const key = randomBytes(32).toString('hex');

  mkdirSync(keyDir, { recursive: true });
  writeFileSync(keyPath, key, { mode: 0o600 });

  return key;
}

export const store = new ElectronStore<any>({ encryptionKey: getOrCreateEncryptionKey() });
