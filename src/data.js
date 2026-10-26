// Demo data. Meridian, Brightwater, Atlas and Copperline are fictional.
// InnovAge is real: every value below comes from its public SEC filings (see `sources` and data/processed/innovage).

export const SOFR = 3.9; // % — assumed Term SOFR

export const DEALS = [
  {
    id: 'innovage',
    name: 'InnovAge',
    sector: 'Healthcare',
    description: 'PACE healthcare for seniors — 18 centers (FY2021)',
    sponsor: 'Apax / Welsh Carson',
    stage: 'Closed',
    real: true,
    pack: 'innovage',
    size: 75,
    hold: 75,
    spread: 175,
    spreadNote: 'Grid: L+200 above 2.50x secured net leverage, L+175 at or below',
    base: 'L',
    baseRate: 0.11, // % — assumed 1M LIBOR at closing (Mar 2021); other deals use SOFR
    baseRateNote: '1M LIBOR ~0.11% at closing',
    floor: null,
    oid: null,
    tenor: 5,
    maturity: '5th anniversary of closing (Mar 2026)',
    callProtection: 'None — prepayable at par',
    amortization: '1.25% per quarter',
    revenue: 637.8,
    sponsorEbitda: 85.3,
    ebitda: 85.3,
    ebitdaLabel: 'Company Adj. EBITDA',
    leverageLabel: 'Gross leverage',
    ev: null,
    covenant: 4.75,
    covenantName: 'Max secured net leverage',
    tranches: [
      { name: 'Term Loan', size: 75, funded: 75, type: 'Senior secured term loan' },
      { name: 'Revolver', size: 100, funded: 0, type: 'Senior secured revolver' },
    ],
    // Page citations for the values above: [doc, page] in this deal's documents.
    sources: {
      size: ['D2', 1], spread: ['D2', 10], maturity: ['D2', 37], amortization: ['D2', 77], callProtection: ['D2', 79],
      covenant: ['D2', 141], revenue: ['D1', 89], ebitda: ['D1', 77],
    },
  },
  {
    id: 'meridian',
    name: 'Meridian Health',
    sector: 'Healthcare',
    description: 'Physical therapy clinics — 142 locations in 9 states',
    sponsor: 'Halcyon Capital',
    stage: 'IC Review',
    size: 200,
    hold: 85,
    spread: 575,
    floor: 0.75,
    oid: 98.0,
    tenor: 6,
    maturity: 'Oct 2032',
    callProtection: '102 / 101',
    amortization: '1% per year',
    revenue: 312.4,
    sponsorEbitda: 41.5,
    ebitda: 37.9,
    ev: 540,
    covenant: 6.75,
    tranches: [
      { name: 'Term Loan', size: 200, funded: 200, type: 'First lien unitranche' },
      { name: 'Delayed Draw', size: 30, funded: 0, type: 'First lien, 24-month draw' },
      { name: 'Revolver', size: 15, funded: 0, type: 'Super senior' },
    ],
  },
  {
    id: 'brightwater',
    name: 'Brightwater Foods',
    sector: 'Food & Beverage',
    description: 'Private-label snacks for US grocers',
    sponsor: 'Oakmont Capital',
    stage: 'Term Sheet',
    size: 210,
    hold: 75,
    spread: 525,
    floor: 0.5,
    oid: 98.5,
    tenor: 6,
    maturity: 'Dec 2032',
    callProtection: '101 soft call, 6 months',
    amortization: '1% per year',
    revenue: 488.0,
    sponsorEbitda: 52.0,
    ebitda: 49.5,
    ev: 470,
    covenant: 6.0,
    tranches: [{ name: 'Term Loan', size: 210, funded: 210, type: 'First lien' }],
  },
  {
    id: 'atlas',
    name: 'Atlas Fleet Services',
    sector: 'Transportation',
    description: 'Maintenance for delivery van fleets',
    sponsor: 'Ridgeline Equity',
    stage: 'Due Diligence',
    size: 110,
    hold: 60,
    spread: 625,
    floor: 1.0,
    oid: 97.5,
    tenor: 5,
    maturity: 'Nov 2031',
    callProtection: 'Non-call 1, then 102 / 101',
    amortization: '1% per year',
    revenue: 205.0,
    sponsorEbitda: 24.0,
    ebitda: 22.6,
    ev: 216,
    covenant: 6.0,
    tranches: [{ name: 'Term Loan', size: 110, funded: 110, type: 'First lien' }],
  },
  {
    id: 'copperline',
    name: 'Copperline Software',
    sector: 'Software',
    description: 'Software for US city governments',
    sponsor: 'Vantage Growth',
    stage: 'Screening',
    size: 90,
    hold: 90,
    spread: 650,
    floor: 1.0,
    oid: 98.0,
    tenor: 5,
    maturity: 'Oct 2031',
    callProtection: 'Non-call 2, then 102 / 101',
    amortization: 'None',
    revenue: 64.0,
    sponsorEbitda: 9.5,
    ebitda: 8.8,
    ev: 520,
    covenant: 11.0,
    tranches: [{ name: 'Term Loan', size: 90, funded: 90, type: 'First lien, recurring revenue' }],
  },
];

// Document names per deal. Sample deals share a generic data room; InnovAge uses its real filings.
const SAMPLE_DOCS = {
  D1: 'Information Memorandum',
  D2: 'Quality of Earnings Report',
  D3: 'Credit Agreement (draft)',
  D4: 'Reimbursement Study',
};
const DOCS_BY_DEAL = {
  innovage: { D1: 'Form 10-K, FY ended June 30, 2021', D2: 'Credit Agreement (March 2021)' },
};
export const docsFor = (dealId) => DOCS_BY_DEAL[dealId] || SAMPLE_DOCS;

// Due-diligence checklist. `quote` is the source passage shown when a citation is clicked.
export const CHECKLIST = {
  innovage: [
    {
      item: 'EBITDA add-backs', status: 'flag',
      note: 'Before adjustments, EBITDA was −$5.9M: a $44.7M net loss plus $38.9M of interest, D&A and tax. Adjustments add $91.2M, led by $67.6M of M&A and transaction costs (mostly a one-off $45.4M option cancellation), $18.2M of contingent consideration and $14.5M of financing costs, less a $10.9M consolidation gain.',
      cite: { doc: 'D1', page: 77 },
      quote: 'Net income (loss) (44,740) · Interest expense, net 16,787 · Depreciation and amortization 12,294 · Provision for income tax 9,771 · M&A diligence, transaction and integration 67,606 · Gain on consolidation of equity investee (10,871) · Financing-related 14,479 · Contingent consideration 18,211 · Adjusted EBITDA 85,333 (in thousands, year ended June 30, 2021).',
    },
    {
      item: 'Loan document terms', status: 'flag',
      note: 'Synergy add-backs are capped at 35% of Consolidated EBITDA, looser than the 20–25% caps lenders often push for.',
      cite: { doc: 'D2', page: 21 },
      quote: 'provided that the aggregate amount of synergies added back pursuant to clauses (xiii), (xiv) and (xv) shall not exceed, for any Test Period, 35% of Consolidated EBITDA (after giving effect to such addbacks)',
    },
    {
      item: 'Incremental debt capacity', status: 'open',
      note: 'Incremental facilities up to the greater of $125M and 150% of Consolidated EBITDA, more than the $75M term loan itself.',
      cite: { doc: 'D2', page: 95 },
      quote: 'The aggregate amount of all such Incremental Facilities shall not exceed the sum of (A) the greater of (x) $125,000,000 and (y) 150% of Consolidated EBITDA',
    },
    {
      item: 'Financial covenant', status: 'done',
      note: 'Secured net leverage may not exceed 4.75x, tested quarterly on Consolidated EBITDA as the agreement defines it. With $201.5M of cash against the $75M term loan, InnovAge was net cash at FY2021, so the covenant was far from binding.',
      cite: { doc: 'D2', page: 141 },
      quote: 'The Borrower will not permit the Secured Net Leverage Ratio, calculated on the last day of each fiscal quarter listed below, to be greater than 4.75:1.00',
    },
    {
      item: 'Amortization and maturity', status: 'done',
      note: 'Term loan amortizes 1.25% a quarter and matures on the fifth anniversary of closing.',
      cite: { doc: 'D2', page: 37 },
      quote: '“Initial Term Loan Maturity Date” means the fifth anniversary of the Closing Date.',
    },
  ],
  meridian: [
    {
      item: 'Earnings quality', status: 'flag',
      note: '$3.6M of sponsor add-backs are not supported. We use $37.9M EBITDA, not $41.5M.',
      cite: { doc: 'D2', page: 23 },
      quote: 'We were unable to validate the run-rate contribution of new clinics ($2.1M) or the anticipated procurement savings ($1.5M). Diligence-adjusted EBITDA: $37.9M.',
    },
    {
      item: 'Medicare rate cut', status: 'flag',
      note: 'Proposed 2027 Medicare cut costs about $1.9M of EBITDA.',
      cite: { doc: 'D4', page: 12 },
      quote: 'Applying the proposed CY2027 reduction of approximately 2.8% implies an EBITDA impact of $1.9M.',
    },
    {
      item: 'Loan document terms', status: 'flag',
      note: 'Borrower can add unlimited "expected savings" to EBITDA. Ask for a 20% cap.',
      cite: { doc: 'D3', page: 41 },
      quote: '“Consolidated EBITDA” shall include … cost savings projected by the Borrower in good faith to be realized within 24 months … without limitation as to amount.',
    },
    {
      item: 'Revenue growth', status: 'done',
      note: 'Same-clinic visits up 6.8% a year since 2023.',
      cite: { doc: 'D1', page: 31 },
      quote: 'Same-clinic visits grew at a 6.8% CAGR from FY2023 to FY2025.',
    },
    {
      item: 'Customer mix', status: 'open',
      note: 'Medicare is 31% of revenue. No single private insurer above 9%.',
      cite: { doc: 'D4', page: 8 },
      quote: 'Payor mix (LTM): Medicare 31%, Commercial 52% (largest: 8.7%), Workers’ Compensation 11%, Other 6%.',
    },
  ],
};

// Status changes the deal team makes in the app: { dealId: { item: status } }. In memory for the demo.
const edits = {};
export const setItemStatus = (dealId, item, status) => { (edits[dealId] ||= {})[item] = status; };
export const editsFor = (dealId) => edits[dealId] || {};

// The checklist with the team's status changes applied. The server passes the browser's edits in.
export function checklistFor(dealId, changes = editsFor(dealId)) {
  return baseChecklist(dealId).map((c) => (changes[c.item] && changes[c.item] !== c.status ? { ...c, status: changes[c.item], was: c.status } : c));
}

function baseChecklist(dealId) {
  if (CHECKLIST[dealId]) return CHECKLIST[dealId];
  const d = DEALS.find((x) => x.id === dealId);
  return [
    {
      item: 'Earnings quality', status: 'flag',
      note: `QoE supports $${d.ebitda}M of EBITDA vs. sponsor's $${d.sponsorEbitda}M.`,
      cite: { doc: 'D2', page: 17 }, quote: `Diligence-adjusted EBITDA: $${d.ebitda}M.`,
    },
    { item: 'Revenue growth', status: 'open', note: 'Awaiting customer-level data.', cite: { doc: 'D1', page: 12 }, quote: d.description + '.' },
    { item: 'Loan document terms', status: 'open', note: 'Term sheet under review.', cite: { doc: 'D3', page: 2 }, quote: `Pricing: SOFR + ${d.spread} bps.` },
  ];
}
