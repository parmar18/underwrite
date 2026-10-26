// Deal lookup tools. Shared by the server (Claude calls them) and the browser (offline mode calls them).
// Every tool returns plain JSON. Numbers come from the credit engine, never from the model.
import { DEALS, DOCS, SOFR, checklistFor } from './data.js';
import { analyze } from './credit.js';

const STOPWORDS = new Set(['tell', 'give', 'show', 'explain', 'summarize', 'what', 'does', 'the', 'say', 'says', 'about', 'and', 'for', 'with', 'how', 'this', 'that', 'are', 'there', 'any', 'our', 'deal', 'credit', 'agreement', 'document', 'documents']);

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// Extra searchable passages from the sample data room (beyond the checklist quotes).
const PASSAGES = {
  meridian: [
    { doc: 'D1', page: 12, text: 'Meridian operates 142 outpatient physical therapy clinics across 9 states, with an average of 11 therapists per clinic.' },
    { doc: 'D1', page: 44, text: 'Management Adjusted EBITDA of $41.5M includes $7.2M of pro forma adjustments for new clinics, procurement savings and one-time costs.' },
    { doc: 'D2', page: 31, text: 'Therapist turnover was 28% in FY2025 compared with an industry range of 22–25%. Wage inflation trailed at 5.5%.' },
    { doc: 'D3', page: 58, text: 'Incremental Facilities may not exceed the greater of $40,000,000 and 100% of Consolidated EBITDA, subject to a 50 basis point MFN for 12 months.' },
    { doc: 'D3', page: 112, text: 'No Loan Party shall transfer Material Intellectual Property to any Unrestricted Subsidiary. Amendments to pro rata sharing require consent of Required Lenders only.' },
    { doc: 'D3', page: 96, text: 'Financial Covenant: Total Net Leverage Ratio shall not exceed 6.75:1.00, tested quarterly, stepping down to 6.25:1.00 from the eighth full fiscal quarter.' },
    { doc: 'D3', page: 3, text: 'Collateral: first-priority lien on substantially all assets of the Borrower and Guarantors. All clinic real estate is leased.' },
  ],
};

export const TOOL_DEFS = [
  {
    name: 'get_deal_terms',
    description: 'Get the loan terms for a deal: company, sponsor, stage, tranches, size, our hold, spread, OID, tenor, covenant level and yield.',
    input_schema: {
      type: 'object',
      properties: { deal_id: { type: 'string', description: 'Deal id, e.g. "meridian"' } },
      required: ['deal_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_credit_stats',
    description: 'Compute credit stats for a deal, optionally under stress. Use this for ANY leverage, coverage, LTV, covenant cushion or what-if question. Never compute these yourself.',
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string' },
        ebitda_basis: { type: 'string', enum: ['qoe', 'sponsor'], description: 'qoe = diligence-adjusted (default), sponsor = sponsor-adjusted' },
        ebitda_haircut_pct: { type: 'number', description: 'Percent drop in EBITDA to test, 0 for base case' },
        sofr_shock_bps: { type: 'number', description: 'Change in SOFR in basis points, 0 for base case' },
      },
      required: ['deal_id', 'ebitda_basis', 'ebitda_haircut_pct', 'sofr_shock_bps'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_diligence_findings',
    description: 'List due-diligence findings for a deal with their status and source citation.',
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string' },
        status: { type: 'string', enum: ['all', 'flag', 'open', 'done'], description: 'flag = red flags only' },
      },
      required: ['deal_id', 'status'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_documents',
    description: 'Keyword search over the deal data room. Returns matching passages with document and page, for citing.',
    input_schema: {
      type: 'object',
      properties: { deal_id: { type: 'string' }, query: { type: 'string' } },
      required: ['deal_id', 'query'],
      additionalProperties: false,
    },
  },
  {
    name: 'compare_pipeline',
    description: 'Compare all deals in the pipeline on leverage, pricing, yield and LTV.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
];

const findDeal = (id) => {
  const d = DEALS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown deal "${id}". Known: ${DEALS.map((x) => x.id).join(', ')}`);
  return d;
};

const cite = (c) => `[${c.doc} p.${c.page}]`;

const RUN = {
  get_deal_terms({ deal_id }) {
    const d = findDeal(deal_id);
    return {
      company: d.name, sponsor: d.sponsor, stage: d.stage, sector: d.sector,
      loan_size_m: d.size, our_hold_m: d.hold, spread_bps: d.spread, sofr_pct: SOFR, oid: d.oid, tenor_years: d.tenor,
      covenant_max_leverage: d.covenant, est_yield_pct: r2(analyze(d).yield),
      tranches: d.tranches.map((t) => ({ name: t.name, size_m: t.size, type: t.type })),
    };
  },
  get_credit_stats({ deal_id, ebitda_basis = 'qoe', ebitda_haircut_pct = 0, sofr_shock_bps = 0 }) {
    const d = findDeal(deal_id);
    const a = analyze(d, { basis: ebitda_basis, haircut: ebitda_haircut_pct, sofrShock: sofr_shock_bps });
    return {
      scenario: { ebitda_basis, ebitda_haircut_pct, sofr_shock_bps },
      ebitda_m: r1(a.ebitda), debt_m: d.size, all_in_rate_pct: r2(a.rate), annual_interest_m: r1(a.interest),
      leverage_x: r2(a.leverage), interest_coverage_x: r2(a.coverage), ltv_pct: Math.round(a.ltv * 100),
      covenant_max_leverage: d.covenant, covenant_cushion_pct: Math.round(a.cushion * 100), breaches_covenant: a.breach,
    };
  },
  get_diligence_findings({ deal_id, status = 'all' }) {
    findDeal(deal_id);
    return checklistFor(deal_id)
      .filter((c) => status === 'all' || c.status === status)
      .map((c) => ({ item: c.item, status: c.status, note: c.note, citation: cite(c.cite), source: DOCS[c.cite.doc] }));
  },
  search_documents({ deal_id, query }) {
    findDeal(deal_id);
    const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
    const pool = [
      ...checklistFor(deal_id).map((c) => ({ doc: c.cite.doc, page: c.cite.page, text: c.quote })),
      ...(PASSAGES[deal_id] || []),
    ];
    const scored = pool
      .map((p) => ({ p, score: words.filter((w) => p.text.toLowerCase().includes(w)).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    // Keep only passages close to the best match so weak one-word hits don't pad the answer.
    const best = scored[0]?.score || 0;
    return scored
      .filter((x) => x.score >= Math.max(1, best - 1))
      .slice(0, 3)
      .map(({ p }) => ({ citation: cite(p), document: DOCS[p.doc], text: p.text }));
  },
  compare_pipeline() {
    return DEALS.map((d) => {
      const a = analyze(d);
      return { deal_id: d.id, company: d.name, stage: d.stage, spread_bps: d.spread, leverage_x: r2(a.leverage), est_yield_pct: r2(a.yield), ltv_pct: Math.round(a.ltv * 100) };
    });
  },
};

export function runTool(name, input) {
  if (!RUN[name]) throw new Error(`Unknown tool ${name}`);
  return RUN[name](input || {});
}

// One-line label for showing a call in the chat, e.g. get_credit_stats(haircut 20%).
export function describeCall(name, input = {}) {
  const bits = [];
  if (input.ebitda_basis === 'sponsor') bits.push('sponsor EBITDA');
  if (input.ebitda_haircut_pct) bits.push(`EBITDA −${input.ebitda_haircut_pct}%`);
  if (input.sofr_shock_bps) bits.push(`SOFR ${input.sofr_shock_bps > 0 ? '+' : ''}${input.sofr_shock_bps}bps`);
  if (input.status && input.status !== 'all') bits.push(input.status);
  if (input.query) bits.push(`"${input.query}"`);
  return `${name}${bits.length ? ` · ${bits.join(', ')}` : ''}`;
}
