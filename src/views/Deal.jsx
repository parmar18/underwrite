import React, { useState } from 'react';
import { DOCS, checklistFor } from '../data.js';
import { analyze, fmt } from '../credit.js';
import { templateMemo, simulateStream, MEMO_SECTIONS } from '../memo.js';
import { streamPost } from '../api.js';
import { Icon, Status, Cite, Markdown, go } from '../ui.jsx';
import Chat from './Chat.jsx';

const TABS = [
  { key: 'securities', label: 'Securities' },
  { key: 'diligence', label: 'Due Diligence' },
  { key: 'memo', label: 'IC Memo' },
];

export default function Deal({ ctx, deal, tab }) {
  const checklist = checklistFor(deal.id);
  const [source, setSource] = useState(null);
  const a = analyze(deal);
  const flags = checklist.filter((c) => c.status === 'flag').length;

  return (
    <>
      <button className="back" onClick={() => go('/')}><Icon n="arrow-left" /> All deals</button>
      <h1>{deal.name}</h1>
      <p className="lede">{deal.description} · owned by {deal.sponsor}</p>

      <div className="stats">
        <Stat label="Our hold" value={`$${deal.hold}M`} />
        <Stat label="Pricing" value={`S+${deal.spread}`} />
        <Stat label="Leverage" value={fmt.x(a.leverage)} />
        <Stat label="Yield" value={`${a.yield.toFixed(1)}%`} />
      </div>

      <div className="deal-grid">
        <div className="deal-main">
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.key} className={`tab ${tab === t.key ? 'on' : ''}`} onClick={() => go(`/deal/${deal.id}/${t.key}`)}>
                {t.label}
                {t.key === 'diligence' && flags > 0 && <span className="tag bad">{flags}</span>}
              </button>
            ))}
          </div>

          {tab === 'securities' && <Securities deal={deal} a={a} />}
          {tab === 'diligence' && <Diligence checklist={checklist} onCite={setSource} />}
          {tab === 'memo' && <Memo ctx={ctx} deal={deal} checklist={checklist} onCite={setSource} />}
        </div>
        <Chat ctx={ctx} deal={deal} onCite={setSource} />
      </div>

      {source && <SourceDrawer source={source} checklist={checklist} onClose={() => setSource(null)} />}
    </>
  );
}

const Stat = ({ label, value }) => (
  <div className="stat"><div className="sub">{label}</div><div className="stat-value num">{value}</div></div>
);

function Securities({ deal, a }) {
  const sources = [
    ['Debt', deal.size],
    ['Sponsor equity', deal.ev - deal.size],
  ];
  return (
    <div style={{ display: 'grid', gap: 16 }}>
    <div className="card">
      <table className="table">
        <thead><tr><th>Tranche</th><th>Type</th><th className="r">Size</th><th className="r">Pricing</th><th className="r">Price</th><th className="r">Term</th></tr></thead>
        <tbody>
          {deal.tranches.map((t) => (
            <tr key={t.name}>
              <td className="co">{t.name}</td>
              <td className="sub">{t.type}</td>
              <td className="r num">${t.size}M</td>
              <td className="r num">S+{deal.spread}</td>
              <td className="r num">{deal.oid}</td>
              <td className="r num">{deal.tenor} yrs</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="foot sub">
        Covenant: leverage must stay under {deal.covenant}x. EBITDA can fall <b>{fmt.pct(a.cushion)}</b> before that happens.
      </div>
    </div>

    <div className="snap">
      <div className="card snap-card">
        <h3>Leverage: which EBITDA?</h3>
        <dl className="kv">
          <dt>Our case (QoE ${deal.ebitda}M)</dt><dd>{fmt.x(a.leverage)}</dd>
          <dt>Sponsor case (${deal.sponsorEbitda}M)</dt><dd>{fmt.x(a.sponsorLeverage)}</dd>
          <dt>Covenant max</dt><dd>{deal.covenant.toFixed(2)}x</dd>
        </dl>
        <div className="meter" aria-label={`Leverage ${a.leverage.toFixed(1)}x of ${deal.covenant}x covenant`}>
          <div style={{ width: `${Math.min(100, (a.leverage / deal.covenant) * 100)}%` }} />
        </div>
        <div className="sub">{fmt.pct(1 - a.leverage / deal.covenant)} headroom to covenant</div>
      </div>
      <div className="card snap-card">
        <h3>Capital structure</h3>
        <div className="stack" aria-label="Debt vs equity">
          <div style={{ width: `${a.ltv * 100}%` }} className="debt" />
          <div style={{ width: `${(1 - a.ltv) * 100}%` }} className="equity" />
        </div>
        <dl className="kv">
          {sources.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>${v}M</dd></React.Fragment>)}
          <dt>Enterprise value</dt><dd>${deal.ev}M</dd>
          <dt>Loan-to-value</dt><dd>{fmt.pct(a.ltv)}</dd>
        </dl>
      </div>
    </div>
    </div>
  );
}

function Diligence({ checklist, onCite }) {
  return (
    <div className="card">
      {checklist.map((c) => (
        <div key={c.item} className="check">
          <div className="check-head"><b>{c.item}</b><Status s={c.status} /></div>
          <p>{c.note} <Cite c={c.cite} onClick={onCite} /></p>
        </div>
      ))}
    </div>
  );
}

const cancels = {};

function Memo({ ctx, deal, checklist, onCite }) {
  const memo = ctx.memos[deal.id] || {};
  const streaming = memo.status === 'streaming';

  const generate = async () => {
    cancels[deal.id]?.();
    ctx.setMemo(deal.id, { text: '', status: 'streaming', error: null });
    if (ctx.api.live) {
      const ac = new AbortController();
      cancels[deal.id] = () => ac.abort();
      try {
        const pkg = { deal, credit: analyze(deal), checklist, documents: DOCS };
        await streamPost('/api/memo', { pkg, sections: MEMO_SECTIONS }, (t) => ctx.setMemo(deal.id, { text: t }), ac.signal);
        ctx.setMemo(deal.id, { status: 'done' });
      } catch (e) {
        if (e.name !== 'AbortError') ctx.setMemo(deal.id, { status: 'done', error: e.message });
      }
    } else {
      cancels[deal.id] = simulateStream(templateMemo(deal, checklist), (t) => ctx.setMemo(deal.id, { text: t }), () => ctx.setMemo(deal.id, { status: 'done' }));
    }
  };

  if (!memo.text && !streaming) {
    return (
      <div className="card empty">
        <Icon n="sparkle" fill />
        <h2>Draft the IC memo</h2>
        <p className="sub">Written from the deal data and diligence findings. Every claim links to its source.</p>
        <button className="btn yellow" onClick={generate}><Icon n="sparkle" fill /> Generate memo</button>
      </div>
    );
  }

  return (
    <div className="card paper">
      <div className="paper-head">
        <div className="eyebrow">Investment Committee Memo</div>
        <div className="no-print" style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost sm" onClick={generate} disabled={streaming}><Icon n="arrows-clockwise" /> Redo</button>
          <button className="btn ghost sm" onClick={() => window.print()} disabled={streaming}><Icon n="file-pdf" /> PDF</button>
        </div>
      </div>
      <h2 className="paper-title">{deal.name}</h2>
      <Markdown text={memo.text || ''} onCite={onCite} streaming={streaming} />
      {memo.error && <p className="tag bad">{memo.error}</p>}
    </div>
  );
}

function SourceDrawer({ source, checklist, onClose }) {
  const hit = checklist.find((c) => c.cite.doc === source.doc && c.cite.page === source.page);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="btn ghost sm" style={{ float: 'right' }} onClick={onClose}><Icon n="x" /></button>
        <div className="eyebrow">Source · page {source.page}</div>
        <h2>{DOCS[source.doc]}</h2>
        <div className="excerpt">{hit ? hit.quote : 'Source page from the data room.'}</div>
      </div>
    </div>
  );
}
