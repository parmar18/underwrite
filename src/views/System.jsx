import React from 'react';
import { Icon } from '../ui.jsx';

const STEPS = [
  { icon: 'files', title: 'Documents in', text: 'Upload the data room: CIM, QoE, loan docs.' },
  { icon: 'magnifying-glass', title: 'AI reads them', text: 'Pulls out the numbers and flags risks, with page references.' },
  { icon: 'calculator', title: 'Credit math', text: 'Leverage, coverage and yield are calculated in code, not by AI.' },
  { icon: 'file-text', title: 'IC memo', text: 'A first draft in minutes. The deal team edits and decides.' },
];

export default function System() {
  return (
    <>
      <div className="eyebrow">How it works</div>
      <h1>From data room to IC memo</h1>
      <p className="lede">Four steps. The AI drafts; people decide.</p>

      <div className="flow">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.title}>
            <div className="card step">
              <span className="step-n">{i + 1}</span>
              <Icon n={s.icon} />
              <h3>{s.title}</h3>
              <p className="sub">{s.text}</p>
            </div>
            {i < STEPS.length - 1 && <Icon n="arrow-right" className="flow-arrow" />}
          </React.Fragment>
        ))}
      </div>

      <h2 className="section-title">How the AI gets the numbers right</h2>
      <div className="trio">
        {[
          ['quotes', 'Every number has a source', 'The AI must quote the exact line and page. Code checks the quote is really there.'],
          ['scales', 'Cross-checks', 'The same number is compared across the CIM, QoE and model. Gaps become red flags.'],
          ['user-check', 'People approve', 'The ~40 numbers that drive the decision are approved by an analyst before IC.'],
        ].map(([ic, t, d]) => (
          <div key={t} className="card step"><Icon n={ic} /><h3>{t}</h3><p className="sub">{d}</p></div>
        ))}
      </div>

      <h2 className="section-title">What the deal chat can look up</h2>
      <div className="card">
        <table className="table">
          <thead><tr><th>Tool</th><th>Answers questions like</th></tr></thead>
          <tbody>
            <tr><td className="mono">get_deal_terms</td><td>What are we lending, and at what price?</td></tr>
            <tr><td className="mono">get_credit_stats</td><td>What if EBITDA drops 20% and rates rise 200bps?</td></tr>
            <tr><td className="mono">get_diligence_findings</td><td>What are the red flags?</td></tr>
            <tr><td className="mono">search_documents</td><td>What does the credit agreement say about incremental debt?</td></tr>
            <tr><td className="mono">compare_pipeline</td><td>How does this deal compare with the rest of the pipeline?</td></tr>
          </tbody>
        </table>
        <div className="foot sub">With an API key, Claude picks the tools. The numbers always come from the tools, never from the model.</div>
      </div>

      <h2 className="section-title">In this demo</h2>
      <div className="card">
        <table className="table">
          <thead><tr><th>In this demo</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td>Credit math</td><td><span className="tag good">Real</span></td></tr>
            <tr><td>IC memo with citations</td><td><span className="tag good">Real</span> <span className="sub">uses Claude when an API key is set</span></td></tr>
            <tr><td>Deal chat with tool lookups</td><td><span className="tag good">Real</span> <span className="sub">keyword routing when offline</span></td></tr>
            <tr><td>Document pipeline (Data Room)</td><td><span className="tag good">Real</span> <span className="sub">public SEC filings: parse, chunk, index, extract + verify</span></td></tr>
            <tr><td>Deals on the Deals page</td><td><span className="tag warn">Sample data</span></td></tr>
            <tr><td>Data room / CRM connections</td><td><span className="tag">Next step</span></td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
