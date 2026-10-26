import React from 'react';
import { DEALS, checklistFor } from '../data.js';
import { analyze, fmt } from '../credit.js';
import { Icon, go } from '../ui.jsx';

export default function Deals() {
  const hold = DEALS.reduce((s, d) => s + d.hold, 0);
  const wAvg = (f) => DEALS.reduce((s, d) => s + f(d) * d.hold, 0) / hold;
  const next = DEALS.find((d) => d.stage === 'IC Review');
  const flags = DEALS.flatMap((d) => checklistFor(d.id).filter((c) => c.status === 'flag').map((c) => ({ d, c })));

  return (
    <>
      <div className="eyebrow">Deals</div>
      <h1>Pipeline</h1>
      <p className="lede">Pick a deal to see its securities, diligence and IC memo.</p>

      <div className="stats">
        <div className="stat dark"><div className="sub">Proposed hold</div><div className="stat-value num">${hold}M</div></div>
        <div className="stat"><div className="sub">Live deals</div><div className="stat-value num">{DEALS.length}</div></div>
        <div className="stat"><div className="sub">Avg spread</div><div className="stat-value num">S+{Math.round(wAvg((d) => d.spread))}</div></div>
        <div className="stat"><div className="sub">Avg leverage</div><div className="stat-value num">{fmt.x(wAvg((d) => analyze(d).leverage))}</div></div>
      </div>

      <div className="deal-grid">
        <div className="card">
          <table className="table">
            <thead>
              <tr><th>Company</th><th>Stage</th><th className="r">Loan</th><th className="r">Our hold</th><th className="r">Pricing</th><th className="r">Leverage</th></tr>
            </thead>
            <tbody>
              {DEALS.map((d) => (
                <tr key={d.id} className="click" onClick={() => go(`/deal/${d.id}`)}>
                  <td><div className="co">{d.name}</div><div className="sub">{d.sector}</div></td>
                  <td><span className={`tag ${d.stage === 'IC Review' ? 'dark' : ''}`}>{d.stage}</span></td>
                  <td className="r num">${d.size}M</td>
                  <td className="r num">${d.hold}M</td>
                  <td className="r num">S+{d.spread}</td>
                  <td className="r num">{fmt.x(analyze(d).leverage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="side">
          {next && (
            <div className="card next">
              <div className="eyebrow" style={{ color: 'var(--yellow)' }}>Up next at IC</div>
              <h2>{next.name}</h2>
              <p>${next.hold}M hold · S+{next.spread} · {checklistFor(next.id).filter((c) => c.status === 'flag').length} red flags to resolve</p>
              <button className="btn yellow" onClick={() => go(`/deal/${next.id}/memo`)}><Icon n="sparkle" fill /> Draft IC memo</button>
            </div>
          )}
          <div className="card">
            <div className="side-head"><b>Red flags across the pipeline</b><span className="tag bad">{flags.length}</span></div>
            {flags.map(({ d, c }) => (
              <button key={d.id + c.item} className="flag-row" onClick={() => go(`/deal/${d.id}/diligence`)}>
                <span className="sub">{d.name}</span>
                <span>{c.item}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
