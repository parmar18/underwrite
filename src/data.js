// Synthetic demo data. Every company, sponsor and document here is fictional.

export const SOFR = 3.9; // % — assumed Term SOFR

export const DEALS = [
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
    oid: 98.0,
    tenor: 6,
    revenue: 312.4,
    sponsorEbitda: 41.5,
    ebitda: 37.9,
    ev: 540,
    covenant: 6.75,
    tranches: [
      { name: 'Term Loan', size: 200, type: 'Unitranche' },
      { name: 'Delayed Draw', size: 30, type: 'Unfunded at close' },
      { name: 'Revolver', size: 15, type: 'Unfunded at close' },
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
    oid: 98.5,
    tenor: 6,
    revenue: 488.0,
    sponsorEbitda: 52.0,
    ebitda: 49.5,
    ev: 470,
    covenant: 6.0,
    tranches: [{ name: 'Term Loan', size: 210, type: 'First lien' }],
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
    oid: 97.5,
    tenor: 5,
    revenue: 205.0,
    sponsorEbitda: 24.0,
    ebitda: 22.6,
    ev: 216,
    covenant: 6.0,
    tranches: [{ name: 'Term Loan', size: 110, type: 'First lien' }],
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
    oid: 98.0,
    tenor: 5,
    revenue: 64.0,
    sponsorEbitda: 9.5,
    ebitda: 8.8,
    ev: 520,
    covenant: 11.0,
    tranches: [{ name: 'Term Loan', size: 90, type: 'Recurring revenue loan' }],
  },
];

export const DOCS = {
  D1: 'Information Memorandum',
  D2: 'Quality of Earnings Report',
  D3: 'Credit Agreement (draft)',
  D4: 'Reimbursement Study',
};

// Due-diligence checklist. `quote` is the source passage shown when a citation is clicked.
export const CHECKLIST = {
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

export function checklistFor(dealId) {
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
