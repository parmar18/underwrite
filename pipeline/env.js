// Minimal .env loader shared by the pipeline scripts and the API server.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const envFile = new URL('../.env', import.meta.url);
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const RAW = `${ROOT}data/raw`;
export const PROCESSED = `${ROOT}data/processed`;
export const SOURCES = JSON.parse(fs.readFileSync(new URL('./sources.json', import.meta.url), 'utf8'));
