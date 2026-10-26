// API layer: keeps the Anthropic key server-side and streams Claude output to the UI as SSE.
// Data room endpoints work without a key. Without a key, /api/health reports live:false and the UI uses offline mode.
import '../pipeline/env.js';
import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFS, runTool } from '../src/tools.js';
import { DEALS } from '../src/data.js';
import { listPacks, overview, sectionChunks, getChunk, getDefinition, getPage, searchPack, DATAROOM_TOOLS, runDataroomTool } from '../pipeline/dataroom.js';

export const MODEL = process.env.UNDERWRITE_MODEL || 'claude-opus-5-5';
export const live = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const client = live ? new Anthropic() : null;

const MEMO_SYSTEM = `You are an underwriter at a private credit fund drafting a short Investment Committee memo.
Write in plain, direct English. Short sentences. No jargon you don't need. Under 300 words total.

Rules:
- Use ONLY the facts in the provided deal package. Never invent numbers, names, or sources.
- When you use a checklist item, cite it exactly as [DOC p.PAGE], e.g. [D2 p.23].
- Use the deal's own EBITDA (not the sponsor's) as the main case.
- Output markdown with exactly these level-2 headings, in order: {SECTIONS}
- "Credit Stats" has one small table. "Key Risks" is a short bullet list of the red flags.
- "Recommendation" is one line: Approve, Approve with conditions, or Decline, and why.`;

const DEAL_CHAT_SYSTEM = (deal) => `You help a private credit deal team answer questions about one deal: ${deal.name} (deal_id "${deal.id}").
Answer with the tools. Look things up rather than relying on memory.
- For any leverage, coverage, covenant, LTV or what-if question, call get_credit_stats. Never do the arithmetic yourself.
- Cite sources exactly as the tools return them, e.g. [D2 p.23].
- If the tools don't have the answer, say so plainly.
- Keep answers short: 2-4 sentences or a few bullets. Plain English.`;

const ROOM_CHAT_SYSTEM = (name) => `You answer a private credit deal team's questions about the data room for ${name}: real legal and financial documents that have been parsed, chunked and indexed.
- Always look things up with the tools. Search with specific defined terms (e.g. "Consolidated EBITDA", "Change of Control", "Restricted Payments").
- Start with get_key_terms for headline terms; use get_definition when a clause depends on a defined term.
- Quote short phrases from the documents when the exact wording matters.
- Cite every fact exactly as the tools give it, e.g. [D2 p.141].
- If the documents don't answer the question, say so.
- Keep answers short: 2-5 sentences or a few bullets. Plain English.`;

function sse(res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  return (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

const json = (res, body, status = 200) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

async function readJson(req) {
  // Vercel may hand us an already-parsed body; the local server gives a raw stream.
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  let body = '';
  for await (const chunk of req) body += chunk;
  return JSON.parse(body || '{}');
}

async function streamClaude(res, { system, messages, effort, maxTokens }) {
  const send = sse(res);
  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort },
      system,
      messages,
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') send({ text: event.delta.text });
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') send({ error: 'The model declined this request.' });
    send({ done: true, model: final.model, usage: final.usage });
  } catch (err) {
    send({ error: err.message || String(err) });
  }
  res.end();
}

// Manual tool loop: stream text, run each tool call locally, feed results back, repeat until Claude is done.
async function toolChat(res, { system, tools, run, messages }) {
  const send = sse(res);
  const convo = [...messages];
  try {
    for (let turn = 0; turn < 8; turn++) {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system,
        tools: tools.map((t) => ({ ...t, strict: true })),
        messages: convo,
      });
      stream.on('text', (t) => send({ text: t }));
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') { send({ error: 'The model declined this request.' }); break; }
      if (msg.stop_reason === 'pause_turn') { convo.push({ role: 'assistant', content: msg.content }); continue; }
      const calls = msg.content.filter((b) => b.type === 'tool_use');
      if (msg.stop_reason !== 'tool_use' || !calls.length) break;
      convo.push({ role: 'assistant', content: msg.content });
      const results = calls.map((c) => {
        send({ tool: { id: c.id, name: c.name, input: c.input } });
        try {
          const result = run(c.name, c.input);
          send({ tool_result: { id: c.id, result } });
          return { type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(result) };
        } catch (err) {
          send({ tool_result: { id: c.id, result: { error: err.message } } });
          return { type: 'tool_result', tool_use_id: c.id, content: err.message, is_error: true };
        }
      });
      convo.push({ role: 'user', content: results });
      send({ text: '\n\n' });
    }
    send({ done: true });
  } catch (err) {
    send({ error: err.message || String(err) });
  }
  res.end();
}

// Data room (read-only, no API key needed): /api/dataroom[/<pack>[/search|/chunk|/page|/section|/definition]]
function dataroom(url, res) {
  const parts = url.pathname.split('/').filter(Boolean).slice(2).map(decodeURIComponent);
  const q = url.searchParams;
  const [pack, what] = parts;
  if (!pack) return json(res, listPacks());
  if (!listPacks().some((p) => p.pack === pack)) return json(res, { error: `No processed pack "${pack}". Run npm run ingest.` }, 404);
  if (!what) return json(res, overview(pack));
  if (what === 'search') return json(res, searchPack(pack, q.get('q') || '', Number(q.get('k')) || 8));
  if (what === 'chunk') return json(res, getChunk(pack, q.get('id')) || { error: 'not found' });
  if (what === 'section') return json(res, sectionChunks(pack, q.get('doc'), q.get('key')));
  if (what === 'definition') return json(res, getDefinition(pack, q.get('term') || '') || { error: 'not found' });
  if (what === 'page') return json(res, getPage(pack, q.get('doc'), Number(q.get('page'))) || { error: 'not found' });
  return json(res, { error: 'unknown endpoint' }, 404);
}

// One handler for every /api route. Used by the local server (server/index.js) and the Vercel function (api/index.js).
export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    // On Vercel, /api/* is rewritten to /api/index?route=*; restore the original path.
    if (url.searchParams.has('route')) { url.pathname = `/api/${url.searchParams.get('route')}`; url.searchParams.delete('route'); }
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, { live, model: MODEL, commit: (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7) });
    if (req.method === 'GET' && url.pathname.startsWith('/api/dataroom')) return dataroom(url, res);
    if (!live && url.pathname.startsWith('/api/')) return json(res, { error: 'No ANTHROPIC_API_KEY configured' }, 503);
    if (req.method === 'POST' && url.pathname === '/api/memo') {
      const { pkg, sections } = await readJson(req);
      return streamClaude(res, {
        system: MEMO_SYSTEM.replace('{SECTIONS}', sections.join(' | ')),
        messages: [{ role: 'user', content: `Deal package (JSON):\n${JSON.stringify(pkg, null, 2)}\n\nDraft the IC memo.` }],
        effort: 'medium',
        maxTokens: 16000,
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const { dealId, messages, edits } = await readJson(req);
      const deal = DEALS.find((d) => d.id === dealId);
      return toolChat(res, { system: DEAL_CHAT_SYSTEM(deal), tools: TOOL_DEFS, run: (n, i) => runTool(n, i, { edits }), messages });
    }
    if (req.method === 'POST' && url.pathname === '/api/dataroom-chat') {
      const { pack, messages } = await readJson(req);
      const report = listPacks().find((p) => p.pack === pack);
      if (!report) return json(res, { error: 'unknown pack' }, 404);
      return toolChat(res, { system: ROOM_CHAT_SYSTEM(report.name), tools: DATAROOM_TOOLS, run: (n, i) => runDataroomTool(pack, n, i), messages });
    }
    json(res, { error: 'not found' }, 404);
  } catch (err) {
    json(res, { error: err.message }, 500);
  }
}
