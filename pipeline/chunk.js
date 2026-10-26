// Steps 2–4: clean, detect structure, and cut structure-aware chunks.
// Legal docs are chunked by Article → Section, and each defined term becomes its own chunk.
// 10-Ks are chunked by Part → Item. Tables are kept whole. Nothing is split mid-sentence.

const TARGET = 1600; // ~400 tokens: the size we pack paragraphs up to
const MAX = 3200; // ~800 tokens: hard ceiling for one chunk
export const tokens = (s) => Math.ceil(s.length / 4);

const RE = {
  // Real filings vary: "ARTICLE I Definitions", "ARTICLE IDEFINITIONS", "SECTION 1.01. Defined Terms",
  // "SECTION I.01Defined Terms." (Roman article numbers, missing spaces).
  article: /^ARTICLE\s+([IVXLC]+|\d+)(?![a-z])\.?\s*(.{0,100})$/,
  section: /^(?:SECTION|Section)\s+((?:\d{1,2}|[IVX]{1,4})\.\d{1,2}[a-z]?)\.?\s*([A-Z“"].*)$/,
  part: /^PART\s+([IV]+)\b\.?\s*(.{0,80})$/i,
  item: /^Item\s+(\d{1,2}[A-C]?)\.?\s+(.{2,140})$/i,
  definition: /^[“"]([^”"]{2,90})[”"]\s*(?:\([^)]*\)\s*)?(means|shall mean|has the meaning|shall have the meaning|includes|refers to)/,
};

const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100 };
const fromRoman = (r) => [...r].reduce((s, ch, i, a) => (ROMAN[ch] < (ROMAN[a[i + 1]] || 0) ? s - ROMAN[ch] : s + ROMAN[ch]), 0);
// "I.01" → "1.01" so sections are numbered the same way across documents.
const romanSection = (no) => no.replace(/^([IVX]+)\./, (_, r) => `${fromRoman(r)}.`);

// Running headers/footers ("Table of Contents", company name) repeat on many pages: drop them.
function dropRunningHeaders(pages) {
  const counts = new Map();
  for (const p of pages) for (const b of [p.blocks[0], p.blocks[p.blocks.length - 1]]) {
    if (b && b.text.length < 80) counts.set(b.text, (counts.get(b.text) || 0) + 1);
  }
  const repeated = new Set([...counts].filter(([, n]) => n >= Math.max(5, pages.length * 0.25)).map(([t]) => t));
  for (const p of pages) p.blocks = p.blocks.filter((b, i) => !(repeated.has(b.text) && (i === 0 || i === p.blocks.length - 1)));
  return [...repeated];
}

// A table-of-contents page is mostly short heading lines ending in page numbers.
function isTocPage(page) {
  const lines = page.blocks.flatMap((b) => b.text.split('\n'));
  const headingish = lines.filter((l) => /^(ARTICLE|SECTION|Section|Item|PART)\s/i.test(l) || /\s\d{1,3}$/.test(l)).length;
  return lines.length >= 8 && headingish / lines.length > 0.6;
}

function splitSentences(text) {
  const parts = text.match(/[^.;]+(?:[.;]+|$)\s*/g) || [text];
  const out = [];
  let cur = '';
  for (const s of parts) {
    if ((cur + s).length > TARGET && cur) { out.push(cur.trim()); cur = ''; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function chunkDocument(doc, pages) {
  const headers = dropRunningHeaders(pages);
  const legal = doc.type === 'credit_agreement';
  const tocPages = pages.filter(isTocPage).map((p) => p.page);

  // Walk blocks in order, tracking where we are in the outline.
  const units = []; // { kind, path, sectionNo, title, term?, blocks: [{text, page, type}] }
  let article = null;
  let current = null;
  const open = (u) => { current = { blocks: [], ...u }; units.push(current); };
  open({ kind: 'front', path: ['Front matter'], title: 'Front matter' });

  for (const p of pages) {
    if (tocPages.includes(p.page)) continue;
    for (const b of p.blocks) {
      const t = b.text;
      let m;
      if (legal && t.length < 140 && (m = t.match(RE.article))) {
        article = `Article ${/^\d+$/.test(m[1]) ? m[1] : fromRoman(m[1])}${m[2] ? ` · ${m[2].trim()}` : ''}`;
        open({ kind: 'section', path: [article], title: article, awaitingTitle: !m[2] });
        continue;
      }
      // "ARTICLE I" on one line, "Definitions" on the next: fold the title into the article name.
      if (current.awaitingTitle && !current.blocks.length && t.length < 80 && !/[.;:]$/.test(t)) {
        article = `${article} · ${t}`;
        current.path = [article];
        current.title = article;
        current.awaitingTitle = false;
        continue;
      }
      if (legal && (m = t.match(RE.section))) {
        const no = romanSection(m[1]);
        const [title, ...rest] = m[2].split(/\.\s*(?=[A-Z(“"]|$)/);
        open({ kind: 'section', path: [article, `§${no} ${title}`].filter(Boolean), sectionNo: no, title: title.slice(0, 120) });
        const body = rest.join('. ').trim();
        if (body) current.blocks.push({ text: body, page: p.page, type: 'p' });
        continue;
      }
      if (!legal && t.length < 100 && (m = t.match(RE.part))) {
        article = `Part ${m[1]}`;
        open({ kind: 'section', path: [article], title: article });
        continue;
      }
      if (!legal && t.length < 160 && (m = t.match(RE.item))) {
        // PDFs can merge the heading with the next line, e.g. "Financial Statements … Report of Independent …".
        const title = m[2].replace(/\s+(Report of|To the|Overview|Introduction)\b.*$/, '').slice(0, 90);
        open({ kind: 'section', path: [article, `Item ${m[1]}. ${title}`].filter(Boolean), sectionNo: `Item ${m[1]}`, title });
        continue;
      }
      if (legal && b.type === 'p' && (m = t.match(RE.definition))) {
        const parent = current.kind === 'definition' ? current.parent : current;
        open({ kind: 'definition', path: parent.path, sectionNo: parent.sectionNo, title: m[1], term: m[1], parent });
        current.blocks.push({ text: t, page: p.page, type: 'p' });
        continue;
      }
      // A non-definition paragraph after a definition: sub-clauses (a), (b)… stay with the definition,
      // anything else returns to the enclosing section.
      // Tables right after a definition (pricing grids) belong to that definition.
      if (current.kind === 'definition' && b.type !== 'table' && !/^\(?[a-z0-9]{1,4}\)/i.test(t) && t.length > 400) {
        const parent = current.parent;
        open({ kind: 'section', path: parent.path, sectionNo: parent.sectionNo, title: parent.title });
      }
      current.blocks.push({ text: t, page: p.page, type: b.type });
    }
  }

  // Pack each unit's blocks into chunks.
  const chunks = [];
  const emit = (u, blocks, kind = u.kind) => {
    const text = blocks.map((b) => b.text).join('\n\n');
    if (!text.trim()) return;
    chunks.push({
      id: `${doc.id}#${chunks.length + 1}`,
      doc_id: doc.id,
      kind,
      path: u.path,
      section: u.sectionNo || null,
      title: u.title,
      term: u.term || null,
      page_start: blocks[0].page,
      page_end: blocks[blocks.length - 1].page,
      text,
      context: [doc.title, ...u.path, u.term ? `“${u.term}”` : null].filter(Boolean).join(' › '),
      tokens: tokens(text),
    });
  };

  for (const u of units) {
    let buf = [];
    let size = 0;
    const flush = () => { if (buf.length) emit(u, buf); buf = []; size = 0; };
    for (const b of u.blocks) {
      if (b.type === 'table' && b.text.length > 200) { flush(); emit(u, [b], 'table'); continue; }
      if (b.text.length > MAX) { // one huge paragraph: split on sentences
        flush();
        for (const piece of splitSentences(b.text)) emit(u, [{ ...b, text: piece }]);
        continue;
      }
      if (size + b.text.length > TARGET && buf.length) {
        const carry = buf[buf.length - 1];
        flush();
        if (u.kind !== 'definition' && carry.text.length < 400) { buf = [carry]; size = carry.text.length; } // small overlap
      }
      buf.push(b);
      size += b.text.length;
    }
    flush();
  }

  // Link defined terms: each chunk lists the defined terms it uses, so retrieval can attach their definitions.
  const terms = [...new Set(chunks.filter((c) => c.term).map((c) => c.term))].sort((a, b) => b.length - a.length);
  if (terms.length) {
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b(${terms.map(esc).join('|')})\\b`, 'g');
    for (const c of chunks) {
      const used = new Set();
      for (const m of c.text.matchAll(re)) if (m[1] !== c.term) used.add(m[1]);
      c.uses = [...used].slice(0, 25);
    }
  }

  return { chunks, tocPages, headers, terms };
}
