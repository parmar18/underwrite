import { SOFR } from './data.js';

// Core credit stats. Money in $M, rates in %. Computed in code, never by the AI.
// Optional stress: EBITDA haircut (%), SOFR shock (bps), and which EBITDA to use.
export function analyze(deal, { haircut = 0, sofrShock = 0, basis = 'qoe' } = {}) {
  const ebitda = (basis === 'sponsor' ? deal.sponsorEbitda : deal.ebitda) * (1 - haircut / 100);
  const rate = SOFR + sofrShock / 100 + deal.spread / 100;
  const interest = (deal.size * rate) / 100;
  const leverage = deal.size / ebitda;
  return {
    ebitda,
    rate,
    interest,
    leverage,
    sponsorLeverage: deal.size / deal.sponsorEbitda,
    coverage: ebitda / interest,
    ltv: deal.size / deal.ev,
    cushion: 1 - deal.size / deal.covenant / ebitda, // EBITDA drop before covenant breach
    breach: leverage > deal.covenant,
    yield: rate + (100 - deal.oid) / 3,
  };
}

export const fmt = {
  x: (v) => `${v.toFixed(1)}x`,
  pct: (v) => `${Math.round(v * 100)}%`,
};
