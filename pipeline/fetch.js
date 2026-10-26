// Download the documents listed in sources.json into data/raw/<pack>/.
// SEC requires a User-Agent with a contact email: set SEC_USER_AGENT="Your Name you@example.com" in .env.
import fs from 'node:fs';
import { RAW, SOURCES } from './env.js';

const ua = process.env.SEC_USER_AGENT;
if (!ua) {
  console.error('Set SEC_USER_AGENT in .env, e.g. SEC_USER_AGENT="Jane Doe jane@example.com" (SEC fair-access policy).');
  process.exit(1);
}

const only = process.argv[2];
for (const pack of SOURCES.packs.filter((p) => !only || p.id === only)) {
  fs.mkdirSync(`${RAW}/${pack.id}`, { recursive: true });
  for (const doc of pack.docs) {
    const out = `${RAW}/${pack.id}/${doc.file}`;
    if (fs.existsSync(out)) { console.log(`skip  ${pack.id}/${doc.file} (exists)`); continue; }
    const res = await fetch(doc.url, { headers: { 'User-Agent': ua } });
    if (!res.ok) { console.error(`fail  ${pack.id}/${doc.file}: HTTP ${res.status}`); continue; }
    fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    console.log(`saved ${pack.id}/${doc.file} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
    await new Promise((r) => setTimeout(r, 300)); // stay well under SEC's 10 requests/second
  }
}
