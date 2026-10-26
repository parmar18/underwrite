import React, { useState } from 'react';
import { checklistFor, docsFor } from '../data.js';
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
  const basis = deal.ebitdaLabel || 'QoE EBITDA';

  return (
    <>
      <button className="back" onClick={() => go('/')}><Icon n="arrow-left" /> All deals</button>
      <h1>{deal.name}</h1>
      <p className="lede">
        {deal.description} · owned by {deal.sponsor}
        {deal.pack && <button className="tag real-tag" onClick={() => go(`/dataroom/${deal.pack}`)}><Icon n="seal-check" /> From SEC filings</button>}
      </p>

      <div className="stats">
        <Stat label="Our hold" value={`$${deal.hold}M`} />
        <Stat label="Pricing" value={fmt.price(deal)} foot={deal.floor != null ? `${deal.floor.toFixed(2)}% floor` : null} />
        <Stat label="Total leverage" value={fmt.x(a.leverage)} foot={`on ${basis}`} />
        <Stat label={deal.oid ? 'Yield (3-yr, incl. OID)' : 'Cash yield'} value={`${a.yield.toFixed(1)}%`} />
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

          {tab === 'securities' && <Securities deal={deal} a={a} onCite={setSource} />}
          {tab === 'diligence' && <Diligence checklist={checklist} onCite={setSource} />}
          {tab === 'memo' && <Memo ctx={ctx} deal={deal} checklist={checklist} onCite={setSource} />}
        </div>
        <Chat ctx={ctx} deal={deal} onCite={setSource} />
      </div>

      {source && <SourceDrawer deal={deal} source={source} checklist={checklist} onClose={() => setSource(null)} />}
    </>
  );
}

const Stat = ({ label, value, foot }) => (
  <div className="stat">
    <div className="sub">{label}</div>
    <div className="stat-value num">{value}</div>
    {foot && <div className="sub small">{foot}</div>}
  </div>
);

// Page citation for a sourced deal field (real deals only).
function Src({ deal, k, onCite }) {
  const s = deal.sources?.[k];
  return s ? <Cite c={{ doc: s[0], page: s[1] }} onClick={onCite} /> : null;
}

function Securities({ deal, a, onCite }) {
  const funded = deal.tranches.reduce((s, t) => s + t.funded, 0);
  const committed = deal.tranches.reduce((s, t) => s + t.size, 0);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Tranche</th><th className="r">Commitment</th><th className="r">Funded at close</th>
              <th className="r">Pricing</th><th className="r">OID</th><th>Maturity</th><th>Call protection</th>
            </tr>
          </thead>
          <tbody>
            {deal.tranches.map((t, i) => (
              <tr key={t.name}>
                <td><div className="co">{t.name}</div><div className="sub">{t.type}</div></td>
                <td className="r num">${t.size}M{i === 0 && <Src deal={deal} k="size" onCite={onCite} />}</td>
                <td className="r num">{t.funded ? `$${t.funded}M` : <span className="sub">Undrawn</span>}</td>
                <td className="r num">
                  {fmt.price(deal)}{i === 0 && <Src deal={deal} k="spread" onCite={onCite} />}
                  {deal.floor != null && <div className="sub small">{deal.floor.toFixed(2)}% floor</div>}
                </td>
                <td className="r num">{deal.oid ?? <span className="sub">—</span>}</td>
                <td>{deal.maturity}{i === 0 && <Src deal={deal} k="maturity" onCite={onCite} />}</td>
                <td>{deal.callProtection}{i === 0 && <Src deal={deal} k="callProtection" onCite={onCite} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="foot sub">
          Amortization: {deal.amortization}<Src deal={deal} k="amortization" onCite={onCite} /> ·
          {' '}{deal.covenantName || 'Max total leverage'} {deal.covenant.toFixed(2)}x<Src deal={deal} k="covenant" onCite={onCite} />.
          {' '}EBITDA can fall <b>{fmt.pct(a.cushion)}</b> before a breach.
        </div>
      </div>

      <div className="snap">
        <div className="card snap-card">
          <h3>Total leverage vs. covenant</h3>
          <dl className="kv">
            {deal.ebitdaLabel ? (
              <><dt>{deal.ebitdaLabel} (${deal.ebitda}M)</dt><dd>{fmt.x(a.leverage)}</dd></>
            ) : (
              <>
                <dt>QoE EBITDA (${deal.ebitda}M)</dt><dd>{fmt.x(a.leverage)}</dd>
                <dt>Sponsor EBITDA (${deal.sponsorEbitda}M)</dt><dd>{fmt.x(a.sponsorLeverage)}</dd>
              </>
            )}
            <dt>Covenant max</dt><dd>{deal.covenant.toFixed(2)}x</dd>
          </dl>
          <div className="meter" aria-label={`Leverage ${a.leverage.toFixed(1)}x of ${deal.covenant}x covenant`}>
            <div style={{ width: `${Math.min(100, (a.leverage / deal.covenant) * 100)}%` }} />
          </div>
          <div className="sub">{fmt.pct(1 - a.leverage / deal.covenant)} headroom to covenant</div>
        </div>

        {a.ltv != null ? (
          <div className="card snap-card">
            <h3>Capital structure</h3>
            <div className="stack" aria-label="Debt vs equity">
              <div style={{ width: `${a.ltv * 100}%` }} className="debt" />
              <div style={{ width: `${(1 - a.ltv) * 100}%` }} className="equity" />
            </div>
            <dl className="kv">
              <dt>Funded debt</dt><dd>${deal.size}M</dd>
              <dt>Sponsor equity</dt><dd>${deal.ev - deal.size}M</dd>
              <dt>Enterprise value</dt><dd>${deal.ev}M</dd>
              <dt>Loan-to-value</dt><dd>{fmt.pct(a.ltv)}</dd>
            </dl>
          </div>
        ) : (
          <div className="card snap-card">
            <h3>Facilities</h3>
            <div className="stack" aria-label="Funded vs undrawn commitments">
              <div style={{ width: `${(funded / committed) * 100}%` }} className="debt" />
              <div style={{ width: `${(1 - funded / committed) * 100}%` }} className="equity" />
            </div>
            <dl className="kv">
              <dt>Funded at close</dt><dd>${funded}M</dd>
              <dt>Undrawn commitments</dt><dd>${committed - funded}M</dd>
              <dt>Revenue (FY)</dt><dd>${deal.revenue}M<Src deal={deal} k="revenue" onCite={onCite} /></dd>
            </dl>
          </div>
        )}
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
  const closed = deal.stage === 'Closed';

  const generate = async () => {
    cancels[deal.id]?.();
    ctx.setMemo(deal.id, { text: '', status: 'streaming', error: null });
    if (ctx.api.live) {
      const ac = new AbortController();
      cancels[deal.id] = () => ac.abort();
      try {
        const pkg = { deal, credit: analyze(deal), checklist, documents: docsFor(deal.id) };
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
        <h2>{closed ? 'Draft the credit review' : 'Draft the IC memo'}</h2>
        <p className="sub">Written from the deal data and diligence findings. Every claim links to its source.</p>
        <button className="btn yellow" onClick={generate}><Icon n="sparkle" fill /> Generate memo</button>
      </div>
    );
  }

  return (
    <div className="card paper">
      <div className="paper-head">
        <div className="eyebrow">{closed ? 'Credit review' : 'Investment Committee Memo'}</div>
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

function SourceDrawer({ deal, source, checklist, onClose }) {
  const hit = checklist.find((c) => c.cite.doc === source.doc && c.cite.page === source.page);
  const doc = docsFor(deal.id)[source.doc];
  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="btn ghost sm" style={{ float: 'right' }} onClick={onClose} aria-label="Close"><Icon n="x" /></button>
        <div className="eyebrow">Source · page {source.page}</div>
        <h2>{doc}</h2>
        {hit && <div className="excerpt">{hit.quote}</div>}
        {deal.pack && (
          <button className="btn" style={{ marginTop: 16 }} onClick={() => go(`/dataroom/${deal.pack}/${source.doc}/${source.page}`)}>
            <Icon n="file-text" /> Open page {source.page} in the Data Room
          </button>
        )}
        {!hit && !deal.pack && <div className="excerpt">Source page from the data room.</div>}
      </div>
    </div>
  );
}
