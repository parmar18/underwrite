// Read side of the pipeline: loads data/processed/<pack>/ for the API server and the chat tools.
import fs from 'node:fs';
import path from 'node:path';
import { PROCESSED } from './env.js';
import { buildIndex, search, snippet } from './search.js';

const cache = new Map();
const read = (pack, file) => JSON.parse(fs.readFileSync(path.join(PROCESSED, pack, file), 'utf8'));

export function listPacks() {
  if (!fs.existsSync(PROCESSED)) return [];
  return fs.readdirSync(PROCESSED)
    .filter((p) => fs.existsSync(path.join(PROCESSED, p, 'report.json')))
    .map((p) => read(p, 'report.json'));
}

export function loadPack(pack) {
  const stamp = fs.statSync(path.join(PROCESSED, pack, 'report.json')).mtimeMs;
  const hit = cache.get(pack);
  if (hit && hit.stamp === stamp) return hit;
  const chunks = read(pack, 'chunks.json');
  const p = {
    stamp,
    report: read(pack, 'report.json'),
    documents: read(pack, 'documents.json'),
    fields: read(pack, 'fields.json'),
    chunks,
    byId: new Map(chunks.map((c) => [c.id, c])),
    defs: new Map(chunks.filter((c) => c.term && c.kind === 'definition').reverse().map((c) => [c.term.toLowerCase(), c])),
    index: buildIndex(chunks),
  };
  cache.set(pack, p);
  return p;
}

const meta = ({ text, ...c }) => c; // chunk without its body, for lists

export function overview(pack) {
  const p = loadPack(pack);
  const outline = p.documents.map((d) => {
    const sections = [];
    for (const c of p.chunks.filter((x) => x.doc_id === d.id)) {
      const key = c.path.join(' › ');
      let s = sections.find((x) => x.key === key);
      if (!s) { s = { key, path: c.path, section: c.section, title: c.path[c.path.length - 1], page: c.page_start, chunks: 0, definitions: 0, tables: 0 }; sections.push(s); }
      s.chunks++;
      if (c.kind === 'definition') s.definitions++;
      if (c.kind === 'table') s.tables++;
    }
    return { doc_id: d.id, sections };
  });
  return { report: p.report, documents: p.documents, fields: p.fields, outline };
}

export function sectionChunks(pack, docId, key) {
  return loadPack(pack).chunks.filter((c) => c.doc_id === docId && c.path.join(' › ') === key).map(meta);
}

export function getChunk(pack, id) {
  const p = loadPack(pack);
  const c = p.byId.get(id);
  if (!c) return null;
  const definitions = (c.uses || []).slice(0, 8).map((t) => p.defs.get(t.toLowerCase())).filter(Boolean).map((d) => ({ term: d.term, id: d.id, page: d.page_start, text: d.text.slice(0, 600) }));
  return { ...c, definitions };
}

export function getDefinition(pack, term) {
  const d = loadPack(pack).defs.get(term.toLowerCase());
  return d ? { term: d.term, id: d.id, doc_id: d.doc_id, page: d.page_start, text: d.text } : null;
}

export function getPage(pack, docId, page) {
  const file = path.join(PROCESSED, pack, 'pages', `${docId}.json`);
  if (!fs.existsSync(file)) return null;
  const pages = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { ...pages.find((p) => p.page === page), total: pages.length };
}

export function searchPack(pack, q, k = 8) {
  const p = loadPack(pack);
  return search(p.index, q, { k }).map(({ chunk, score }) => ({ ...meta(chunk), score: Math.round(score * 100) / 100, snippet: snippet(chunk.text, q) }));
}

// ---------- tools for the data-room chat (Claude calls these) ----------
const cite = (c) => `[${c.doc_id} p.${c.page_start}]`;

export const DATAROOM_TOOLS = [
  {
    name: 'search_documents',
    description: 'Keyword search over the parsed data room (credit agreement, 10-K…). Returns the best-matching chunks with their section, page and text. Use specific legal or financial terms.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'get_definition',
    description: 'Get the full text of a defined term from the credit agreement, e.g. "Consolidated EBITDA" or "Change of Control".',
    input_schema: { type: 'object', properties: { term: { type: 'string' } }, required: ['term'], additionalProperties: false },
  },
  {
    name: 'get_key_terms',
    description: 'Get the key credit terms already extracted and verified by the pipeline: facility sizes, maturity, pricing, financial covenant, EBITDA add-back cap, incremental capacity.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
];

export function runDataroomTool(pack, name, input) {
  if (name === 'search_documents') {
    return loadPack(pack) && search(loadPack(pack).index, input.query, { k: 5 }).map(({ chunk }) => ({
      citation: cite(chunk), where: chunk.context, text: chunk.text.slice(0, 1800),
    }));
  }
  if (name === 'get_definition') {
    const d = getDefinition(pack, input.term);
    return d ? { term: d.term, citation: `[${d.doc_id} p.${d.page}]`, text: d.text.slice(0, 4000) } : { error: `No definition of "${input.term}" found.` };
  }
  if (name === 'get_key_terms') {
    return loadPack(pack).fields.flatMap((f) => f.rules).map((r) => ({
      field: r.label, value: r.value, status: r.status, verified_quote: r.verified, citation: r.page ? `[${r.doc_id} p.${r.page}]` : null, note: r.note || undefined,
    }));
  }
  throw new Error(`Unknown tool ${name}`);
}
