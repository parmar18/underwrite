// Local API server for `npm run dev`. On Vercel the same handler runs as a serverless function (api/index.js).
import http from 'node:http';
import handler, { live, MODEL } from './handler.js';
import { listPacks } from '../pipeline/dataroom.js';

const PORT = process.env.PORT || 8787;

http.createServer(handler).listen(PORT, () => {
  console.log(`Underwrite API on :${PORT} — ${live ? `live (${MODEL})` : 'offline mode (set ANTHROPIC_API_KEY in .env to enable Claude)'}`);
  const packs = listPacks();
  console.log(packs.length ? `Data room: ${packs.map((p) => `${p.pack} (${p.totals.chunks} chunks)`).join(', ')}` : 'Data room: empty — run `npm run fetch && npm run ingest`');
});
