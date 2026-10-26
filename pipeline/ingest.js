// Run the document pipeline:  parse → clean → structure → chunk → link terms → extract + verify → index stats.
// Usage: npm run ingest [-- <pack>] [-- --llm]
// Reads data/raw/<pack>/*, writes data/processed/<pack>/{documents,chunks,fields,report}.json and pages/.
import fs from 'node:fs';
import path from 'node:path';
import { RAW, PROCESSED, SOURCES } from './env.js';
import { parseFile } from './parse.js';
import { chunkDocument } from './chunk.js';
import { buildIndex } from './search.js';
import { extractRules, extractLlm } from './extract.js';

const args = process.argv.slice(2);
const useLlm = args.includes('--llm');
const only = args.find((a) => !a.startsWith('--'));

function classify(file, firstText, hint) {
  if (hint) return hint;
  const t = firstText.slice(0, 6000).toUpperCase();
  if (/CREDIT AGREEMENT|LOAN AGREEMENT|FIRST LIEN|TERM LOAN/.test(t)) return 'credit_agreement';
  if (/FORM 10-K|ANNUAL REPORT/.test(t)) return 'annual_report';
  if (/QUALITY OF EARNINGS/.test(t)) return 'qoe';
  if (/CONFIDENTIAL INFORMATION MEMORANDUM/.test(t)) return 'cim';
  return 'other';
}

let client = null;
if (useLlm) {
  if (!process.env.ANTHROPIC_API_KEY) { console.error('--llm needs ANTHROPIC_API_KEY in .env'); process.exit(1); }
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  client = new Anthropic();
}
const model = process.env.UNDERWRITE_MODEL || 'claude-opus-5-5';

const packs = fs.existsSync(RAW) ? fs.readdirSync(RAW).filter((d) => fs.statSync(path.join(RAW, d)).isDirectory()) : [];
if (!packs.length) console.log(`No documents yet. Put files in ${RAW}/<pack>/ or run: npm run fetch`);

for (const pack of packs.filter((p) => !only || p === only)) {
  const meta = SOURCES.packs.find((p) => p.id === pack) || { id: pack, name: pack, docs: [] };
  const files = fs.readdirSync(path.join(RAW, pack)).filter((f) => /\.(pdf|html?|txt)$/i.test(f)).sort();
  if (!files.length) continue;
  console.log(`\n▸ ${meta.name} (${files.length} files)`);
  const out = path.join(PROCESSED, pack);
  fs.mkdirSync(path.join(out, 'pages'), { recursive: true });

  const documents = [];
  const allChunks = [];
  const pagesByDoc = {};
  const steps = { parse: 0, chunk: 0, extract: 0 };

  for (const [i, file] of files.entries()) {
    const src = meta.docs.find((d) => d.file === file) || {};
    let t = Date.now();
    const pages = await parseFile(path.join(RAW, pack, file));
    steps.parse += Date.now() - t;
    const firstText = pages.slice(0, 3).flatMap((p) => p.blocks.map((b) => b.text)).join(' ');
    const doc = {
      id: `D${i + 1}`, file, title: src.title || file, type: classify(file, firstText, src.type), url: src.url || null,
      pages: pages.length, blocks: pages.reduce((s, p) => s + p.blocks.length, 0),
      tables: pages.reduce((s, p) => s + p.blocks.filter((b) => b.type === 'table').length, 0),
      chars: pages.reduce((s, p) => s + p.blocks.reduce((a, b) => a + b.text.length, 0), 0),
    };
    t = Date.now();
    const { chunks, tocPages, headers, terms } = chunkDocument(doc, pages);
    steps.chunk += Date.now() - t;
    Object.assign(doc, {
      chunks: chunks.length, definitions: terms.length, toc_pages: tocPages.length, running_headers: headers,
      sections: new Set(chunks.filter((c) => c.section).map((c) => c.section)).size,
      avg_tokens: Math.round(chunks.reduce((s, c) => s + c.tokens, 0) / Math.max(1, chunks.length)),
      max_tokens: Math.max(0, ...chunks.map((c) => c.tokens)),
    });
    pagesByDoc[doc.id] = pages;
    fs.writeFileSync(path.join(out, 'pages', `${doc.id}.json`), JSON.stringify(pages));
    documents.push(doc);
    allChunks.push(...chunks);
    console.log(`  ${doc.id} ${file}: ${doc.type}, ${doc.pages} pages → ${doc.chunks} chunks (avg ${doc.avg_tokens} tok, max ${doc.max_tokens}), ${doc.sections} sections, ${doc.definitions} definitions, ${doc.tables} tables`);
  }

  // Extraction runs per credit agreement.
  let t = Date.now();
  const index = buildIndex(allChunks);
  const fields = [];
  for (const doc of documents.filter((d) => d.type === 'credit_agreement')) {
    const chunks = allChunks.filter((c) => c.doc_id === doc.id);
    const rules = extractRules(chunks, pagesByDoc);
    const llm = client ? await extractLlm(chunks, index, pagesByDoc, rules, { client, model }) : [];
    fields.push({ doc_id: doc.id, rules, llm });
    for (const r of rules) console.log(`    ${r.verified ? '✓' : r.status === 'not_found' ? '·' : '?'} ${r.label}: ${r.value ?? r.status}${r.page ? ` (p.${r.page})` : ''}`);
    for (const r of llm) console.log(`    ${r.verified ? '✓' : '✗'} [claude] ${r.label}: ${r.value ?? r.status}${r.agrees_with_rule ? ' — agrees with rule' : ''}`);
  }
  steps.extract = Date.now() - t;

  const report = {
    pack: meta.id, name: meta.name, about: meta.about || '', processed_at: new Date().toISOString(), llm: Boolean(client),
    totals: {
      documents: documents.length,
      pages: documents.reduce((s, d) => s + d.pages, 0),
      chunks: allChunks.length,
      definitions: documents.reduce((s, d) => s + d.definitions, 0),
      tables: allChunks.filter((c) => c.kind === 'table').length,
      fields_verified: fields.flatMap((f) => f.rules).filter((r) => r.verified).length,
      fields_total: fields.flatMap((f) => f.rules).length,
    },
    timings_ms: steps,
  };
  fs.writeFileSync(path.join(out, 'documents.json'), JSON.stringify(documents, null, 2));
  fs.writeFileSync(path.join(out, 'chunks.json'), JSON.stringify(allChunks));
  fs.writeFileSync(path.join(out, 'fields.json'), JSON.stringify(fields, null, 2));
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`  ✓ ${report.totals.chunks} chunks, ${report.totals.fields_verified}/${report.totals.fields_total} fields verified → data/processed/${pack}/`);
}
