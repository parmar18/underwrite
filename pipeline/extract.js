// Step 5: extract decision-critical fields and VERIFY each one against the page text.
// Rules run always. With an API key and --llm, Claude extracts the same fields from retrieved chunks;
// code then checks that Claude's quote really appears in the cited chunk, and compares the two reads.
import { search } from './search.js';

const norm = (s) => s.replace(/[“”]/g, '"').replace(/[’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
const sentenceAround = (text, idx, max = 320) => {
  const dot = text.lastIndexOf('. ', idx);
  const start = Math.max(dot === -1 ? 0 : dot + 2, idx - max / 2);
  const endDot = text.indexOf('. ', idx);
  const end = Math.min(text.length, endDot === -1 ? idx + max / 2 : endDot + 1, start + max);
  return text.slice(start, end).trim();
};
const money = /\$\s?[\d,]+(?:\.\d+)?(?:\s?(?:million|billion))?/i;

const DATE = /([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/;
const ORDINAL = '(?:first|second|third|fourth|fifth|sixth|seventh|eighth|\\d+(?:st|nd|rd|th))';
const isTerm = (re) => (c) => c.term && re.test(c.term);
const isSection = (re) => (c) => c.kind !== 'definition' && re.test(c.title || '');

// What we look for in a credit agreement. Each field has several `tries`, in priority order:
// a chunk filter (definition, section or cover page) and a value pattern. The first try that matches wins.
// `fmt` turns the regex match into a readable value.
export const CREDIT_FIELDS = [
  {
    key: 'agreement_date', label: 'Agreement date', query: 'credit agreement dated as of',
    tries: [{ where: (c) => c.kind === 'front', value: /(?:dated|effective)\s+as\s+of\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/i }],
  },
  {
    key: 'term_loan', label: 'Term loan size', query: 'Term Loan Facility aggregate principal amount',
    tries: [
      { where: (c) => c.kind === 'front', value: /(\$[\d,]+)\s+(?:Senior Secured\s+)?(?:Initial\s+)?Term(?: B)? Loan/i },
      { where: isTerm(/^(Initial |Closing Date )?Term (Loan )?Commitments?$/), value: /aggregate amount[^.]{0,120}?(\$[\d,]+)/i },
    ],
  },
  {
    key: 'revolver', label: 'Revolver size', query: 'Revolving Credit Facility aggregate amount',
    tries: [
      { where: (c) => c.kind === 'front', value: /(\$[\d,]+)\s+(?:Senior Secured\s+)?Revolving/i },
      { where: isTerm(/^(Aggregate |Initial )?Revolving (Credit )?(Facility )?Commitments?$/), value: /aggregate amount[^.]{0,120}?(\$[\d,]+)/i },
    ],
  },
  {
    key: 'maturity', label: 'Term loan maturity', query: 'Initial Term Loan Maturity Date anniversary',
    tries: [
      { where: isTerm(/^(Initial |Closing Date )?Term (Loan )?Maturity Date$/), value: new RegExp(`(${ORDINAL}\\s+anniversary[^.,;]{0,40}|${DATE.source})`, 'i') },
      { where: isTerm(/^Maturity Date$/), value: new RegExp(`(${ORDINAL}\\s+anniversary[^.,;]{0,40}|${DATE.source})`, 'i') },
      { where: isTerm(/^Revolving (Credit )?Maturity Date$/), value: new RegExp(`(${ORDINAL}\\s+anniversary[^.,;]{0,40}|${DATE.source})`, 'i'), note: 'revolver' },
    ],
  },
  {
    key: 'pricing', label: 'Pricing grid (top level)', query: 'Applicable Rate Margin Spread per annum',
    tries: [
      // Pricing grids are tables under the "Applicable Rate" definition; the first data row is the top of the grid.
      { where: (c) => c.kind === 'table' && /^Applicable (Rate|Margin)$/.test(c.term || ''), value: /^(?!Level)[^\n]*?(\d+\.\d+%)[^\n]*$/m, fmt: (m) => m[0].split(' | ').filter((x) => /%/.test(x)).join(' / ') },
      { where: isTerm(/^Applicable (Rate|Margin)$/), value: /(\d+\.\d+%)\s+per annum/ },
    ],
  },
  {
    key: 'covenant', label: 'Financial covenant', query: 'Financial Covenant Net Leverage Ratio greater than to 1.00',
    tries: [{ where: isSection(/financial .*covenant|leverage ratio|coverage ratio/i), value: /(?:Leverage|Coverage) Ratio[^.]{0,120}?(\d+\.\d{2})\s*(?:to|:)\s*1\.00/, fmt: (m) => `${m[1]}x` }],
  },
  {
    key: 'ebitda_cap', label: 'EBITDA add-back cap', query: 'Consolidated EBITDA cost savings synergies not to exceed percent',
    tries: [{ where: isTerm(/^Consolidated (Adjusted )?EBITDA$|^EBITDA$/), value: /(\d+(?:\.\d+)?%)\s+of\s+(?:Consolidated\s+)?(?:Adjusted\s+)?EBITDA/ }],
    missing: 'No percentage cap found in the EBITDA definition. Check for uncapped add-backs.',
  },
  {
    key: 'incremental', label: 'Incremental capacity', query: 'Incremental Cap greater of Consolidated EBITDA',
    tries: [
      { where: isTerm(/Incremental (Cap|Amount|Base Amount|Facility Amount|Limit)$|^Free and Clear Incremental Amount$|^Fixed Incremental Amount$/), value: /greater of\s*\(\w\)\s*(\$[\d,]+)(?:\s+and\s+\(\w\)\s+(\d+(?:\.\d+)?%) of)?/i },
      { where: isSection(/incremental/i), value: /greater of\s*\(\w\)\s*(\$[\d,]+)(?:\s+and\s+\(\w\)\s+(\d+(?:\.\d+)?%) of)?/i },
    ],
    fmt: (m) => (m[2] ? `greater of ${m[1]} and ${m[2]} of EBITDA` : m[1]),
  },
];

export function extractRules(chunks, pagesByDoc) {
  const out = [];
  for (const f of CREDIT_FIELDS) {
    let hit = null;
    let fallback = null;
    for (const t of f.tries) {
      const candidates = chunks.filter(t.where);
      fallback ||= candidates[0];
      for (const c of candidates) {
        const m = c.text.match(t.value);
        if (m) { hit = { c, m, t }; break; }
      }
      if (hit) break;
    }
    if (!hit && !fallback) { out.push({ key: f.key, label: f.label, status: 'not_found', method: 'rule' }); continue; }
    const c = hit ? hit.c : fallback;
    const m = hit?.m;
    const fmt = hit?.t.fmt || f.fmt;
    const quote = m ? sentenceAround(c.text, m.index) : c.text.slice(0, 300);
    out.push({
      key: f.key, label: f.label, method: 'rule',
      value: m ? (fmt ? fmt(m) : (m[1] || m[0]).trim()) : null,
      note: m ? hit.t.note || null : f.missing || 'Clause found, value needs a human read.',
      status: m ? 'found' : 'needs_review',
      quote, doc_id: c.doc_id, chunk_id: c.id, page: pageOf(c, quote, pagesByDoc), section: c.section, term: c.term,
      verified: Boolean(m) && verify(quote, c, pagesByDoc), // only a found value counts as verified
    });
  }
  return out;
}

// Which page holds this quote? Chunks can span pages, so check each.
function pageOf(chunk, quote, pagesByDoc) {
  const pages = pagesByDoc[chunk.doc_id] || [];
  const q = norm(quote).slice(0, 80);
  for (let p = chunk.page_start; p <= chunk.page_end; p++) {
    const page = pages.find((x) => x.page === p);
    if (page && norm(page.blocks.map((b) => b.text).join(' ')).includes(q)) return p;
  }
  return chunk.page_start;
}

// The check that matters: does the quoted text literally exist in the source?
export function verify(quote, chunk, pagesByDoc) {
  if (!quote) return false;
  const pages = (pagesByDoc[chunk.doc_id] || []).filter((p) => p.page >= chunk.page_start && p.page <= chunk.page_end);
  const hay = norm(pages.map((p) => p.blocks.map((b) => b.text).join(' ')).join(' '));
  return hay.includes(norm(quote));
}

// Optional: Claude reads the top retrieved chunks for each field. Code verifies the quote and compares with the rule read.
export async function extractLlm(chunks, index, pagesByDoc, rules, { client, model }) {
  const { z } = await import('zod');
  const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod');
  const Schema = z.object({
    found: z.boolean(),
    value: z.string(),
    quote: z.string(),
    chunk_id: z.string(),
  });
  const out = [];
  for (const f of CREDIT_FIELDS) {
    const ctx = search(index, f.query, { k: 4, filter: (c) => c.doc_id && chunks.includes(c) });
    const res = await client.messages.parse({
      model,
      max_tokens: 4000,
      output_config: { effort: 'low', format: zodOutputFormat(Schema) },
      system: 'You extract one field from a credit agreement. Use ONLY the passages given. "quote" must be copied verbatim from one passage (one sentence, under 300 characters) and must contain the value. If the passages do not contain it, set found=false and leave the other fields empty.',
      messages: [{
        role: 'user',
        content: `Field: ${f.label}\n\n${ctx.map(({ chunk }) => `<passage id="${chunk.id}" section="${chunk.context}">\n${chunk.text.slice(0, 6000)}\n</passage>`).join('\n\n')}`,
      }],
    });
    const r = res.parsed_output;
    const chunk = chunks.find((c) => c.id === r?.chunk_id);
    const rule = rules.find((x) => x.key === f.key);
    const verified = Boolean(r?.found && chunk && verify(r.quote, chunk, pagesByDoc));
    out.push({
      key: f.key, label: f.label, method: 'llm', value: r?.found ? r.value : null, status: r?.found ? 'found' : 'not_found',
      quote: r?.quote || null, doc_id: chunk?.doc_id, chunk_id: chunk?.id, page: chunk ? pageOf(chunk, r.quote, pagesByDoc) : null, section: chunk?.section,
      verified,
      agrees_with_rule: Boolean(rule?.value && r?.value && norm(r.value).includes(norm(rule.value).replace(/^\$\s?/, '').slice(0, 8))),
    });
  }
  return out;
}
