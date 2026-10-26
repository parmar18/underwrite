// Offline stand-in for the Claude tool loop: picks tools from keywords, runs them, writes a templated answer.
// The live path (server/index.js) lets Claude choose the tools instead.
import { runTool } from './tools.js';

const has = (s, re) => re.test(s);

export function planCalls(dealId, question) {
  const s = question.toLowerCase();
  const calls = [];
  const pct = s.match(/(\d+(?:\.\d+)?)\s*%/);
  const bps = s.match(/([+-]?\d+)\s*(?:bps|bp|basis)/);
  const stress = {
    deal_id: dealId,
    ebitda_basis: 'qoe',
    ebitda_haircut_pct: pct && has(s, /ebitda|earnings|drop|fall|decline|down|cut/) ? Number(pct[1]) : 0,
    sofr_shock_bps: bps ? Number(bps[1]) : has(s, /rates? (rise|up|go up)/) ? 200 : 0,
  };

  if (has(s, /compare|pipeline|other deals|versus|\bvs\b|rank|portfolio/)) calls.push({ name: 'compare_pipeline', input: {} });
  if (has(s, /leverage|coverage|covenant|cushion|headroom|ltv|loan.to.value|stress|what if|drop|fall|decline|sofr|rates?\b|breach/)) {
    calls.push({ name: 'get_credit_stats', input: stress });
    if (has(s, /sponsor/)) calls.push({ name: 'get_credit_stats', input: { ...stress, ebitda_basis: 'sponsor' } });
  }
  if (has(s, /pric|spread|oid|tranche|terms|size|hold|yield|tenor|structure|maturity/)) calls.push({ name: 'get_deal_terms', input: { deal_id: dealId } });
  if (has(s, /risk|flag|issue|concern|diligence|open item|problem|worr/)) {
    calls.push({ name: 'get_diligence_findings', input: { deal_id: dealId, status: has(s, /open/) ? 'open' : 'flag' } });
  }
  if (!calls.length || has(s, /say|says|document|agreement|turnover|incremental|collateral|qoe|cim|clause|medicare|add.?back/)) {
    calls.push({ name: 'search_documents', input: { deal_id: dealId, query: question } });
  }
  return calls;
}

const yes = (b) => (b ? '**breaches** the' : 'stays inside the');

function write(call, result, dealId) {
  switch (call.name) {
    case 'get_credit_stats': {
      const r = result;
      const sc = r.scenario;
      const label = [r.ebitda_label, sc.ebitda_haircut_pct ? `EBITDA down ${sc.ebitda_haircut_pct}%` : '', sc.sofr_shock_bps ? `SOFR ${sc.sofr_shock_bps > 0 ? '+' : ''}${sc.sofr_shock_bps}bps` : '']
        .filter(Boolean).join(', ');
      return `On ${label}: leverage is **${r.leverage_x}x**, which ${yes(r.breaches_covenant)} ${r.covenant_max_leverage}x covenant. Interest coverage is **${r.interest_coverage_x}x** and EBITDA could fall another **${r.covenant_cushion_pct}%** before a breach.`;
    }
    case 'get_deal_terms': {
      const r = result;
      return `${r.company} is a **$${r.loan_size_m}M** loan (${r.tranches.map((t) => `${t.name} $${t.size_m}M`).join(', ')}). We hold **$${r.our_hold_m}M** at **${r.base_rate === 'LIBOR' ? 'L' : 'S'}+${r.spread_bps}**${r.oid ? `, ${r.oid} OID` : ''}, maturing ${r.maturity}, for an estimated **${r.est_yield_pct}%** yield.`;
    }
    case 'get_diligence_findings':
      if (!result.length) return 'No matching diligence items.';
      return result.map((f) => `- **${f.item}** (${f.status === 'flag' ? 'red flag' : f.status}): ${f.note} ${f.citation}`).join('\n');
    case 'search_documents':
      if (!result.length) return "I couldn't find that in the data room. It may be worth adding to the diligence request list.";
      return result.map((p) => `- ${p.text} ${p.citation}`).join('\n');
    case 'compare_pipeline': {
      const rows = [...result].sort((a, b) => b.leverage_x - a.leverage_x);
      return `| Deal | Leverage | Spread | Yield |\n|---|---|---|---|\n${rows
        .map((d) => `| ${d.deal_id === dealId ? `**${d.company}**` : d.company} | ${d.leverage_x}x | S+${d.spread_bps} | ${d.est_yield_pct}% |`)
        .join('\n')}`;
    }
    default:
      return '';
  }
}

export function offlineAnswer(dealId, question) {
  const calls = planCalls(dealId, question).map((c) => ({ ...c, result: runTool(c.name, c.input) }));
  const text = calls.map((c) => write(c, c.result, dealId)).join('\n\n');
  return { calls, text };
}
