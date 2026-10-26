import { analyze, fmt } from './credit.js';

export const MEMO_SECTIONS = ['Summary', 'The Business', 'Credit Stats', 'Key Risks', 'Recommendation'];

const cite = (c) => `[${c.cite.doc} p.${c.cite.page}]`;

// Offline memo, used when no API key is set. Built from the same inputs the live prompt gets.
export function templateMemo(deal, checklist) {
  const a = analyze(deal);
  const flags = checklist.filter((c) => c.status === 'flag');
  const growth = checklist.find((c) => c.item === 'Revenue growth' && c.status === 'done');
  return `## Summary
We are asked to lend **$${deal.hold}M** of a $${deal.size}M loan to **${deal.name}**, owned by ${deal.sponsor}. It pays **SOFR + ${deal.spread}**, about **${a.yield.toFixed(1)}%** a year.

## The Business
${deal.description}. Revenue is $${deal.revenue}M with $${deal.ebitda}M of EBITDA.${growth ? ` ${growth.note} ${cite(growth)}` : ''}

## Credit Stats
| | Our case | Sponsor case |
|---|---|---|
| Leverage | ${fmt.x(a.leverage)} | ${fmt.x(a.sponsorLeverage)} |
| Interest coverage | ${fmt.x(a.coverage)} | — |
| Loan-to-value | ${fmt.pct(a.ltv)} | — |

EBITDA can fall **${fmt.pct(a.cushion)}** before the loan breaks its covenant.

## Key Risks
${flags.map((c) => `- **${c.item}.** ${c.note} ${cite(c)}`).join('\n')}

## Recommendation
**${flags.length ? 'Approve with conditions' : 'Approve'}.** ${flags.length ? `Resolve the ${flags.length} red flag${flags.length > 1 ? 's' : ''} above before closing.` : ''}
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
