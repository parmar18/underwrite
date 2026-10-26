import { analyze, fmt } from './credit.js';

export const MEMO_SECTIONS = ['Summary', 'The Business', 'Credit Stats', 'Key Risks', 'Recommendation'];

const cite = (c) => `[${c.cite.doc} p.${c.cite.page}]`;

// Offline memo, used when no API key is set. Built from the same inputs the live prompt gets.
export function templateMemo(deal, checklist) {
  const a = analyze(deal);
  const flags = checklist.filter((c) => c.status === 'flag');
  const growth = checklist.find((c) => c.item === 'Revenue growth' && c.status === 'done');
  const src = (k) => (deal.sources?.[k] ? ` [${deal.sources[k][0]} p.${deal.sources[k][1]}]` : '');
  const ask = deal.stage === 'Closed' ? `We hold **$${deal.hold}M** of a $${deal.size}M loan to` : `We are asked to lend **$${deal.hold}M** of a $${deal.size}M loan to`;
  // One EBITDA basis (real filings) → two-column table; QoE vs sponsor (sample deals) → three columns.
  const stats = deal.ebitdaLabel
    ? `| | ${deal.ebitdaLabel} |\n|---|---|\n| Total leverage | ${fmt.x(a.leverage)} |\n| Interest coverage | ${fmt.x(a.coverage)} |\n`
    : `| | Our case (QoE) | Sponsor case |\n|---|---|---|\n| Total leverage | ${fmt.x(a.leverage)} | ${fmt.x(a.sponsorLeverage)} |\n| Interest coverage | ${fmt.x(a.coverage)} | — |\n${a.ltv == null ? '' : `| Loan-to-value | ${fmt.pct(a.ltv)} | — |\n`}`;
  return `## Summary
${ask} **${deal.name}**, owned by ${deal.sponsor}. It pays **${fmt.price(deal)}**${src('spread')}, about **${a.yield.toFixed(1)}%** a year${deal.oid ? ' including OID' : ''}.

## The Business
${deal.description}. Revenue is $${deal.revenue}M${src('revenue')} with $${deal.ebitda}M of ${deal.ebitdaLabel || 'EBITDA'}${src('ebitda')}.${growth ? ` ${growth.note} ${cite(growth)}` : ''}

## Credit Stats
${stats}
EBITDA can fall **${fmt.pct(a.cushion)}** before the loan breaks its ${deal.covenant}x covenant${src('covenant')}.

## Key Risks
${flags.map((c) => `- **${c.item}.** ${c.note} ${cite(c)}`).join('\n')}

## Recommendation
${deal.stage === 'Closed'
  ? `**Hold.** ${flags.length ? `Track the ${flags.length} red flag${flags.length > 1 ? 's' : ''} above and address them at the next amendment.` : 'No open red flags.'}`
  : `**${flags.length ? 'Approve with conditions' : 'Approve'}.** ${flags.length ? `Resolve the ${flags.length} red flag${flags.length > 1 ? 's' : ''} above before closing.` : ''}`}
`;
}


// Stream text into `onChunk` at a readable pace; returns a cancel function.
export function simulateStream(text, onChunk, onDone) {
  let i = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    i = Math.min(text.length, i + 4 + Math.floor(Math.random() * 6));
    onChunk(text.slice(0, i));
    if (i < text.length) setTimeout(tick, 18);
    else onDone?.();
  };
  tick();
  return () => { stopped = true; };
}
