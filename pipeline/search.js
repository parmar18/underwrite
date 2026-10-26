// BM25 keyword search over chunks. No external service needed; good enough for exact legal and financial terms.
// Production would add embeddings (hybrid search). The interface stays the same.

const STOP = new Set('a an and are as at be by for from has have in is it its of on or shall such that the this to under with which any all each other than will may'.split(' '));
// Light suffix stemming so "prepayment", "prepayments" and "prepay" match each other.
const stem = (t) => (t.length > 5 ? t.replace(/(ments?|ings?|ies|es|s)$/, (m) => (m === 'ies' ? 'y' : '')) : t);
const tokenize = (s) => s.toLowerCase().replace(/[“”"’']/g, '').split(/[^a-z0-9$%.]+/).map((t) => t.replace(/\.$/, '')).filter((t) => t.length > 1 && !STOP.has(t)).map(stem);

export function buildIndex(chunks) {
  const docs = chunks.map((c) => {
    const tf = new Map();
    // Headings and defined-term names count extra: they say what the chunk is about.
    for (const t of [...tokenize(c.text), ...tokenize(`${c.context} ${c.title || ''} ${c.title || ''} ${c.term || ''} ${c.term || ''}`)]) tf.set(t, (tf.get(t) || 0) + 1);
    return { c, tf, len: [...tf.values()].reduce((a, b) => a + b, 0) };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const avg = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
  return { docs, df, avg, N: docs.length };
}

export function search(index, query, { k = 5, filter } = {}) {
  const q = tokenize(query);
  const K1 = 1.4, B = 0.75;
  const scored = [];
  for (const d of index.docs) {
    if (filter && !filter(d.c)) continue;
    let s = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (index.N - index.df.get(t) + 0.5) / (index.df.get(t) + 0.5));
      s += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / index.avg)));
    }
    // Exact phrase match and exact defined-term match are strong signals.
    if (q.length > 1 && d.c.text.toLowerCase().includes(query.toLowerCase())) s *= 1.5;
    if (d.c.term && d.c.term.toLowerCase() === query.toLowerCase()) s *= 3;
    if (s > 0) scored.push({ chunk: d.c, score: s });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}

// Short snippet around the first query hit, for result lists.
export function snippet(text, query, len = 260) {
  const words = tokenize(query);
  const lower = text.toLowerCase();
  const at = Math.max(0, Math.min(...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0), text.length) - 60);
  return (at > 0 ? '…' : '') + text.slice(at, at + len).trim() + (at + len < text.length ? '…' : '');
}
