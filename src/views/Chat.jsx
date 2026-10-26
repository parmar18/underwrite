import React, { useEffect, useRef, useState } from 'react';
import { editsFor } from '../data.js';
import { describeCall } from '../tools.js';
import { offlineAnswer } from '../agent.js';
import { streamEvents } from '../api.js';
import { simulateStream } from '../memo.js';
import { Icon, Markdown } from '../ui.jsx';

const SUGGESTIONS = [
  'What happens if EBITDA drops 20% and rates rise 200bps?',
  'What are the red flags?',
  'What does the credit agreement say about incremental debt?',
  'How does this deal compare to the pipeline?',
];

export function ToolCall({ c }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="call">
      <button className="call-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon n={c.done ? 'check-circle' : 'circle-notch'} className={c.done ? 'ok' : 'spin'} />
        <span className="mono">{describeCall(c.name, c.input)}</span>
        <Icon n={open ? 'caret-up' : 'caret-down'} className="caret-i" />
      </button>
      {open && c.result !== undefined && <pre className="call-body">{JSON.stringify(c.result, null, 2)}</pre>}
    </div>
  );
}

export default function Chat({ ctx, deal, onCite }) {
  const [threads, setThreads] = useState({});
  const log = threads[deal.id] || [];
  const setLog = (fn) => setThreads((t) => ({ ...t, [deal.id]: fn(t[deal.id] || []) }));
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef();
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [log]);

  const updateLast = (patch) => setLog((l) => [...l.slice(0, -1), { ...l[l.length - 1], ...patch(l[l.length - 1]) }]);

  const ask = async (question) => {
    if (!question.trim() || busy) return;
    setQ('');
    const history = log.map((m) => ({ role: m.role, content: m.text })).filter((m) => m.content);
    setLog((l) => [...l, { role: 'user', text: question }, { role: 'assistant', text: '', calls: [] }]);
    setBusy(true);
    try {
      if (ctx.api.live) {
        await streamEvents('/api/chat', { dealId: deal.id, edits: editsFor(deal.id), messages: [...history, { role: 'user', content: question }] }, (e) => {
          if (e.tool) updateLast((m) => ({ calls: [...m.calls, { ...e.tool, done: false }] }));
          if (e.tool_result) updateLast((m) => ({ calls: m.calls.map((c) => (c.id === e.tool_result.id ? { ...c, result: e.tool_result.result, done: true } : c)) }));
          if (e.text) updateLast((m) => ({ text: m.text + e.text }));
        });
      } else {
        const { calls, text } = offlineAnswer(deal.id, question);
        for (const c of calls) {
          updateLast((m) => ({ calls: [...m.calls, { ...c, result: undefined, done: false }] }));
          await new Promise((r) => setTimeout(r, 450));
          updateLast((m) => ({ calls: m.calls.map((x, i) => (i === m.calls.length - 1 ? { ...x, result: c.result, done: true } : x)) }));
        }
        await new Promise((r) => simulateStream(text, (t) => updateLast(() => ({ text: t })), r));
      }
    } catch (e) {
      updateLast(() => ({ text: `Something went wrong: ${e.message}` }));
    }
    setBusy(false);
  };

  return (
    <aside className="chat card">
      <div className="chat-head">
        <div>
          <b>Ask about {deal.name}</b>
        </div>
        {log.length > 0 && <button className="btn ghost sm" onClick={() => setLog(() => [])} title="Clear chat"><Icon n="trash" /></button>}
      </div>
      <div className="chat-log">
        {log.length === 0 && (
          <div className="chat-empty">
            <p className="sub">Try one of these:</p>
            {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>)}
          </div>
        )}
        {log.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="msg-user">{m.text}</div>
          ) : (
            <div key={i} className="msg-ai">
              {m.calls?.map((c, j) => <ToolCall key={j} c={c} />)}
              {m.text ? <Markdown text={m.text} onCite={onCite} streaming={busy && i === log.length - 1} /> : busy && i === log.length - 1 && !m.calls?.length && <span className="sub">Thinking…</span>}
            </div>
          )
        )}
        <div ref={end} />
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input id="chat-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question…" autoComplete="off" />
        <button className="btn" disabled={busy || !q.trim()} aria-label="Send"><Icon n="paper-plane-right" /></button>
      </form>
    </aside>
  );
}
