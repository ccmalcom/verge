import { existsSync } from 'node:fs';
import path from 'node:path';
import type { CloudVendor } from '../src/card/schema.js';
import { KEY_ENV } from '../src/providers.js';
import { PROXY_DIR } from './paths.js';

// Loads proxy/.env.local into process.env. Never print or log the values.
export function loadEnvLocal(dir: string = PROXY_DIR): void {
  const file = path.join(dir, '.env.local');
  if (existsSync(file)) process.loadEnvFile(file);
}

export function hasKey(vendor: CloudVendor): boolean {
  return Boolean(process.env[KEY_ENV[vendor]]?.trim());
}
