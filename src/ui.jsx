import React from 'react';

export const go = (path) => { window.location.hash = path; };

export const Icon = ({ n, fill, className = '' }) => <i className={`${fill ? 'ph-fill' : 'ph'} ph-${n} ${className}`} />;

const STATUS = { flag: ['bad', 'Red flag'], open: ['warn', 'Open'], done: ['good', 'Done'] };
export const Status = ({ s }) => <span className={`tag ${STATUS[s][0]}`}>{STATUS[s][1]}</span>;

export const Cite = ({ c, onClick }) => (
  <button className="cite" onClick={() => onClick(c)}><Icon n="file-text" />{c.doc} p.{c.page}</button>
);

// ---------- Markdown (subset) with clickable source citations ----------
const TOKEN_RE = /(\[D\d+ p\.\d+\])|(\*\*[^*]+\*\*)/g;

function Inline({ text, onCite }) {
  const parts = [];
  let last = 0;
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) {
      const [, doc, page] = m[1].match(/\[(D\d+) p\.(\d+)\]/);
      parts.push(<Cite key={m.index} c={{ doc, page: Number(page) }} onClick={onCite} />);
    } else parts.push(<strong key={m.index}>{m[2].slice(2, -2)}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ text, onCite, streaming }) {
  const lines = text.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      blocks.push({ t: 'h2', v: line.slice(3).trim() });
      i++;
    } else if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!/^\|[\s|:-]+\|?\s*$/.test(lines[i])) rows.push(lines[i].replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        i++;
      }
      blocks.push({ t: 'table', v: rows });
    } else if (/^\s*[-*] /.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*] /.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*] /, ''));
      blocks.push({ t: 'ul', v: items });
    } else if (line.trim() === '' || line.startsWith('# ')) {
      i++;
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() !== '' && !/^(## |\||\s*[-*] )/.test(lines[i])) para.push(lines[i++]);
      blocks.push({ t: 'p', v: para.join(' ') });
    }
  }
  const caret = streaming ? <span className="caret" /> : null;
  return (
    <div className="md">
      {blocks.map((b, k) => {
        const end = k === blocks.length - 1 ? caret : null;
        if (b.t === 'h2') return <h2 key={k}>{b.v}{end}</h2>;
        if (b.t === 'p') return <p key={k}><Inline text={b.v} onCite={onCite} />{end}</p>;
        if (b.t === 'ul')
          return <ul key={k}>{b.v.map((it, j) => <li key={j}><Inline text={it} onCite={onCite} />{j === b.v.length - 1 && end}</li>)}</ul>;
        const [head, ...body] = b.v;
        return (
          <table key={k}>
            <thead><tr>{head.map((c, j) => <th key={j}>{c}</th>)}</tr></thead>
            <tbody>{body.map((r, j) => <tr key={j}>{r.map((c, x) => <td key={x}><Inline text={c} onCite={onCite} /></td>)}</tr>)}</tbody>
          </table>
        );
      })}
      {blocks.length === 0 && caret}
    </div>
  );
}
