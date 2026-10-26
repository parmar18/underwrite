import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getJSON, streamEvents } from '../api.js';
import { Icon, Markdown } from '../ui.jsx';
import { ToolCall } from './Chat.jsx';

const api = (pack, what = '', params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return getJSON(`/api/dataroom/${encodeURIComponent(pack)}${what ? `/${what}` : ''}${qs ? `?${qs}` : ''}`);
};
const norm = (s) => s.replace(/[“”]/g, '"').replace(/’/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
const TYPE_LABEL = { credit_agreement: 'Credit agreement', annual_report: 'Annual report', qoe: 'QoE', cim: 'CIM', other: 'Other' };

export default function DataRoom({ ctx }) {
  const [packs, setPacks] = useState(null);
  const [pack, setPack] = useState(null);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('terms');
  const [view, setView] = useState(null); // { mode: 'page'|'chunk', doc, page, highlight, chunkId }
  const [error, setError] = useState(null);

  useEffect(() => {
    getJSON('/api/dataroom').then((p) => { setPacks(p); if (p[0]) setPack(p[0].pack); }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!pack) return;
    setData(null);
    setView(null);
    api(pack).then((d) => {
      setData(d);
      const hasFields = d.fields.some((f) => f.rules.length);
      setTab(hasFields ? 'terms' : 'explore');
    }).catch((e) => setError(e.message));
  }, [pack]);

  if (error) return <Empty title="The data room server isn't reachable" body={`${error}. Start it with npm run dev.`} />;
  if (!packs) return <p className="sub">Loading data room…</p>;
  if (!packs.length) return <Empty title="No documents processed yet" body="Download the public filings and run the pipeline:" code={'npm run fetch     # needs SEC_USER_AGENT in .env\nnpm run ingest'} />;

  const openCite = (c) => setView({ mode: 'page', doc: c.doc, page: c.page });

  return (
    <>
      <div className="eyebrow">Data room</div>
      <h1>Real documents, parsed</h1>
      <p className="lede">Public SEC filings run through the pipeline: parsed by page, split along the document’s own structure, indexed, and checked for the terms that matter.</p>

      <div className="pack-tabs">
        {packs.map((p) => (
          <button key={p.pack} className={`pack-tab ${pack === p.pack ? 'on' : ''}`} onClick={() => setPack(p.pack)}>
            <b>{p.name}</b>
            <span className="sub">{p.totals.documents} doc{p.totals.documents === 1 ? '' : 's'} · {p.totals.pages} pages</span>
          </button>
        ))}
      </div>

      {!data ? <p className="sub">Loading…</p> : (
        <>
          <p className="sub" style={{ margin: '0 0 16px' }}>{data.report.about}</p>
          <Pipeline data={data} />
          <div className="deal-grid room-grid">
            <div className="deal-main">
              <div className="tabs">
                {[['terms', 'Key terms'], ['explore', 'Explore chunks'], ['search', 'Search & ask']].map(([k, l]) => (
                  <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>
                ))}
              </div>
              {tab === 'terms' && <KeyTerms data={data} onOpen={(f) => setView({ mode: 'page', doc: f.doc_id, page: f.page, highlight: f.quote })} />}
              {tab === 'explore' && <Explorer pack={pack} data={data} onChunk={(c) => setView({ mode: 'chunk', chunkId: c.id })} />}
              {tab === 'search' && <SearchAsk ctx={ctx} pack={pack} onChunk={(c) => setView({ mode: 'chunk', chunkId: c.id })} onCite={openCite} />}
            </div>
            <Inspector pack={pack} data={data} view={view} setView={setView} />
          </div>
        </>
      )}
    </>
  );
}

function Empty({ title, body, code }) {
  return (
    <div className="card empty">
      <Icon n="folder-open" />
      <h2>{title}</h2>
      <p className="sub">{body}</p>
      {code && <pre className="code-block">{code}</pre>}
    </div>
  );
}

// ---------- Pipeline strip: what each step did to this pack ----------
function Pipeline({ data }) {
  const d = data.documents;
  const t = data.report.totals;
  const sections = d.reduce((s, x) => s + x.sections, 0);
  const avgTok = Math.round(d.reduce((s, x) => s + x.avg_tokens * x.chunks, 0) / Math.max(1, t.chunks));
  const kinds = {};
  for (const x of d) { const k = /pdf$/i.test(x.file) ? 'PDF' : /html?$/i.test(x.file) ? 'HTML' : 'TXT'; kinds[k] = (kinds[k] || 0) + 1; }
  const tables = d.reduce((s, x) => s + x.tables, 0);
  const steps = [
    ['files', 'Ingest', `${t.documents} file${t.documents > 1 ? 's' : ''}`, Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(' · ')],
    ['file-magnifying-glass', 'Parse', `${t.pages} pages`, tables ? `${tables} tables kept as tables` : 'text layer, page by page'],
    ['tree-structure', 'Structure', `${sections} sections`, `${t.definitions} defined terms`],
    ['squares-four', 'Chunk', `${t.chunks.toLocaleString()} chunks`, `avg ${avgTok} tokens, never mid-sentence`],
    ['list-magnifying-glass', 'Index', 'BM25', 'headings and terms weighted'],
    ['seal-check', 'Extract', t.fields_total ? `${t.fields_verified}/${t.fields_total} verified` : 'n/a', t.fields_total ? 'quote found on the page' : 'no credit agreement'],
  ];
  return (
    <div className="pipe-strip">
      {steps.map(([ic, name, big, small], i) => (
        <div key={name} className="pipe-step">
          <div className="pipe-top"><Icon n={ic} /><span className="sub">{i + 1} · {name}</span></div>
          <div className="pipe-big num">{big}</div>
          <div className="sub">{small}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- Key terms extracted and verified ----------
function KeyTerms({ data, onOpen }) {
  const docs = data.fields.filter((f) => f.rules.length);
  if (!docs.length) return <div className="card empty"><p className="sub">This pack has no credit agreement, so there are no loan terms to extract. Use Explore or Search.</p></div>;
  return docs.map((f) => {
    const doc = data.documents.find((d) => d.id === f.doc_id);
    const llm = Object.fromEntries((f.llm || []).map((r) => [r.key, r]));
    return (
      <div key={f.doc_id} className="card">
        <div className="side-head"><b>{doc.title}</b><span className="sub">{doc.id} · {doc.pages} pages</span></div>
        <table className="table terms">
          <thead><tr><th>Term</th><th>Value</th><th>Source</th><th>Check</th></tr></thead>
          <tbody>
            {f.rules.map((r) => (
              <tr key={r.key} className={r.page ? 'click' : ''} onClick={() => r.page && onOpen(r)}>
                <td className="co">{r.label}</td>
                <td>
                  {r.value ? <b className="num">{r.value}</b> : <span className="sub">{r.status === 'not_found' ? 'Not found' : 'Needs a human read'}</span>}
                  {r.note && <div className="sub small">{r.note === 'revolver' ? 'Revolver maturity (no separate term loan date)' : r.note}</div>}
                  {llm[r.key] && <div className="sub small"><Icon n="sparkle" /> Claude: {llm[r.key].value || 'not found'} {llm[r.key].verified ? '✓' : '✗'}</div>}
                </td>
                <td>{r.page ? <span className="cite"><Icon n="file-text" />{r.doc_id} p.{r.page}{r.section ? ` · §${r.section}` : ''}</span> : '—'}</td>
                <td>
                  {r.status === 'found' && r.verified && <span className="tag good"><Icon n="check" /> Quote verified</span>}
                  {r.status === 'needs_review' && <span className="tag warn">Review</span>}
                  {r.status === 'not_found' && <span className="tag">Missing</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="foot sub">Click a row to see the exact sentence on its page. “Quote verified” means code found the quoted text on that page, not just that a value was returned.</div>
      </div>
    );
  });
}

// ---------- Explorer: document → outline → chunks ----------
function Explorer({ pack, data, onChunk }) {
  const [doc, setDoc] = useState(data.documents[0].id);
  const [filter, setFilter] = useState('');
  const [section, setSection] = useState(null);
  const [chunks, setChunks] = useState(null);
  const sections = (data.outline.find((o) => o.doc_id === doc)?.sections || []).filter((s) => !filter || s.key.toLowerCase().includes(filter.toLowerCase()));
  const d = data.documents.find((x) => x.id === doc);

  useEffect(() => { setSection(null); setChunks(null); }, [doc, pack]);
  useEffect(() => {
    if (!section) return;
    setChunks(null);
    api(pack, 'section', { doc, key: section.key }).then(setChunks);
  }, [section, doc, pack]);

  return (
    <div className="explorer">
      <div className="doc-pills">
        {data.documents.map((x) => (
          <button key={x.id} className={`doc-pill ${doc === x.id ? 'on' : ''}`} onClick={() => setDoc(x.id)}>
            <span className="tag">{x.id}</span> {x.title}
          </button>
        ))}
      </div>
      <div className="doc-stats sub">
        {TYPE_LABEL[d.type]} · {d.pages} pages · {d.chunks} chunks · {d.sections} sections{d.definitions ? ` · ${d.definitions} definitions` : ''} · avg {d.avg_tokens} / max {d.max_tokens} tokens
        {d.toc_pages ? ` · ${d.toc_pages} contents pages skipped` : ''}{d.running_headers?.length ? ` · removed running header “${d.running_headers[0]}”` : ''}
      </div>
      <div className="explore-cols">
        <div className="card outline">
          <input className="filter" placeholder="Filter sections…" value={filter} onChange={(e) => setFilter(e.target.value)} id="outline-filter" />
          <div className="outline-list">
            {sections.map((s) => (
              <button key={s.key} className={`outline-row ${section?.key === s.key ? 'on' : ''}`} onClick={() => setSection(s)}>
                <span className="outline-title">{s.path.length > 1 && <span className="sub">{s.path[0].split(' · ')[0]} › </span>}{s.title}</span>
                <span className="sub num">p.{s.page} · {s.chunks}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="chunk-list">
          {!section && <div className="card empty small-empty"><p className="sub">Pick a section to see how it was chunked.</p></div>}
          {section && !chunks && <p className="sub">Loading…</p>}
          {chunks?.map((c) => (
            <button key={c.id} className="card chunk-card" onClick={() => onChunk(c)}>
              <div className="chunk-meta">
                <span className="mono">{c.id}</span>
                <span className={`tag ${c.kind === 'definition' ? 'yellow' : c.kind === 'table' ? 'dark' : ''}`}>{c.kind}</span>
                <span className="sub num">p.{c.page_start}{c.page_end !== c.page_start ? `–${c.page_end}` : ''} · {c.tokens} tok</span>
              </div>
              <div className="chunk-title">{c.term ? `“${c.term}”` : c.title}</div>
              {c.uses?.length > 0 && <div className="sub small">Uses: {c.uses.slice(0, 5).join(', ')}{c.uses.length > 5 ? ` +${c.uses.length - 5}` : ''}</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Search (always) and Ask Claude (with an API key) ----------
function SearchAsk({ ctx, pack, onChunk, onCite }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const examples = ['Change of Control', 'restricted payments dividends', 'Consolidated EBITDA cost savings', 'financial covenant leverage ratio', 'incremental facilities'];

  const run = async (query) => {
    if (!query.trim()) return;
    setQ(query);
    setAnswer(null);
    setResults(await api(pack, 'search', { q: query, k: 6 }));
  };

  const ask = async () => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setAnswer({ text: '', calls: [] });
    const upd = (fn) => setAnswer((a) => ({ ...a, ...fn(a) }));
    try {
      await streamEvents('/api/dataroom-chat', { pack, messages: [{ role: 'user', content: q }] }, (e) => {
        if (e.tool) upd((a) => ({ calls: [...a.calls, { ...e.tool, done: false }] }));
        if (e.tool_result) upd((a) => ({ calls: a.calls.map((c) => (c.id === e.tool_result.id ? { ...c, result: e.tool_result.result, done: true } : c)) }));
        if (e.text) upd((a) => ({ text: a.text + e.text }));
      });
    } catch (err) {
      upd(() => ({ text: `Something went wrong: ${err.message}` }));
    }
    setBusy(false);
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <form className="search-bar" onSubmit={(e) => { e.preventDefault(); run(q); }}>
        <Icon n="magnifying-glass" />
        <input id="room-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the documents, e.g. change of control" autoComplete="off" />
        <button className="btn ghost sm" type="submit">Search</button>
        <button className="btn sm" type="button" disabled={!ctx.api.live || busy || !q.trim()} onClick={ask} title={ctx.api.live ? 'Claude searches the documents with tools' : 'Set ANTHROPIC_API_KEY to ask Claude'}>
          <Icon n="sparkle" fill /> Ask
        </button>
      </form>
      {!results && !answer && (
        <div className="chips-row">
          {examples.map((x) => <button key={x} className="chip" onClick={() => run(x)}>{x}</button>)}
        </div>
      )}
      {!ctx.api.live && <p className="sub small">Search runs locally. “Ask” uses Claude with search tools when an API key is set.</p>}
      {answer && (
        <div className="card answer">
          <div className="sub small"><Icon n="sparkle" fill /> Claude, using the data room tools</div>
          {answer.calls.map((c, i) => <ToolCall key={i} c={c} />)}
          {answer.text ? <Markdown text={answer.text} onCite={onCite} streaming={busy} /> : busy && <span className="sub">Searching…</span>}
        </div>
      )}
      {results && results.length === 0 && <p className="sub">No matches. Try a defined term, like “Permitted Liens”.</p>}
      {results?.map((r) => (
        <button key={r.id} className="card result" onClick={() => onChunk(r)}>
          <div className="chunk-meta">
            <span className="tag">{r.doc_id} p.{r.page_start}</span>
            <span className="sub">{r.path.join(' › ')}{r.term ? ` › “${r.term}”` : ''}</span>
            <span className="sub num score">score {r.score}</span>
          </div>
          <Highlight text={r.snippet} query={q} />
        </button>
      ))}
    </div>
  );
}

function Highlight({ text, query }) {
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  if (!words.length) return <p className="snippet">{text}</p>;
  const re = new RegExp(`\\b(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return <p className="snippet">{text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))}</p>;
}

// ---------- Inspector: source page with highlight, or one chunk with its linked definitions ----------
function Inspector({ pack, data, view, setView }) {
  const [page, setPage] = useState(null);
  const [chunk, setChunk] = useState(null);
  const [def, setDef] = useState(null);
  const ref = useRef();

  useEffect(() => {
    setDef(null);
    if (view?.mode === 'page') api(pack, 'page', { doc: view.doc, page: view.page }).then(setPage);
    if (view?.mode === 'chunk') api(pack, 'chunk', { id: view.chunkId }).then(setChunk);
  }, [view, pack]);
  useEffect(() => { ref.current?.querySelector('.hl')?.scrollIntoView({ block: 'center' }); }, [page]);

  const hlKey = useMemo(() => (view?.highlight ? norm(view.highlight).slice(0, 70) : null), [view]);

  if (!view) {
    return (
      <aside className="card inspector">
        <div className="inspector-empty">
          <Icon n="file-text" />
          <p className="sub">Click a term, chunk or search result to see its source here.</p>
        </div>
      </aside>
    );
  }

  if (view.mode === 'chunk' && chunk) {
    return (
      <aside className="card inspector">
        <div className="inspector-head">
          <div><span className="mono">{chunk.id}</span> <span className="tag">{chunk.kind}</span></div>
          <button className="btn ghost sm" onClick={() => setView({ mode: 'page', doc: chunk.doc_id, page: chunk.page_start, highlight: chunk.text.slice(0, 120) })}><Icon n="file-text" /> Page {chunk.page_start}</button>
        </div>
        <div className="inspector-body" ref={ref}>
          <div className="sub small">{chunk.context}</div>
          <div className="kv small-kv">
            <dt>Pages</dt><dd>{chunk.page_start}{chunk.page_end !== chunk.page_start ? `–${chunk.page_end}` : ''}</dd>
            <dt>Tokens</dt><dd>{chunk.tokens}</dd>
            <dt>Section</dt><dd>{chunk.section ? (/^Item/.test(chunk.section) ? chunk.section : `§${chunk.section}`) : '—'}</dd>
          </div>
          <pre className="chunk-text">{chunk.text}</pre>
          {chunk.definitions?.length > 0 && (
            <>
              <div className="sub small" style={{ marginTop: 6 }}>Defined terms this chunk depends on (attached at retrieval):</div>
              <div className="chips-row">
                {chunk.definitions.map((d) => <button key={d.term} className={`chip small ${def?.term === d.term ? 'on' : ''}`} onClick={() => setDef(def?.term === d.term ? null : d)}>{d.term}</button>)}
              </div>
              {def && <div className="def-box"><b>“{def.term}”</b> <span className="sub">p.{def.page}</span><p>{def.text}{def.text.length >= 600 ? '…' : ''}</p></div>}
            </>
          )}
        </div>
      </aside>
    );
  }

  if (view.mode === 'page' && page) {
    const doc = data.documents.find((d) => d.id === view.doc);
    let marked = false;
    return (
      <aside className="card inspector">
        <div className="inspector-head">
          <div><b>{doc?.title}</b><div className="sub small">{doc?.id} · page {view.page} of {page.total}{page.label ? ` · printed “${page.label}”` : ''}</div></div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn ghost sm" disabled={view.page <= 1} onClick={() => setView({ ...view, page: view.page - 1, highlight: null })} aria-label="Previous page"><Icon n="caret-left" /></button>
            <button className="btn ghost sm" disabled={view.page >= page.total} onClick={() => setView({ ...view, page: view.page + 1, highlight: null })} aria-label="Next page"><Icon n="caret-right" /></button>
          </div>
        </div>
        <div className="inspector-body page-view" ref={ref}>
          {page.blocks?.map((b, i) => {
            const hit = !marked && hlKey && norm(b.text).includes(hlKey.slice(0, 50));
            if (hit) marked = true;
            return b.type === 'table'
              ? <pre key={i} className={`page-table ${hit ? 'hl' : ''}`}>{b.text}</pre>
              : <p key={i} className={hit ? 'hl' : ''}>{b.text}</p>;
          })}
        </div>
      </aside>
    );
  }
  return <aside className="card inspector"><p className="sub" style={{ padding: 16 }}>Loading…</p></aside>;
}
