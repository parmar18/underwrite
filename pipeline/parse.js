// Step 1: parse a file into pages of blocks. A block is a paragraph or a table, in reading order.
// Page numbers are preserved so every chunk and extracted value can cite the page it came from.
import fs from 'node:fs';
import * as cheerio from 'cheerio';

const clean = (s) => s.replace(/ /g, ' ').replace(/[ \t\r\n]+/g, ' ').trim();
const PAGE_LABEL = /^(?:-\s*)?(?:\d{1,3}|[ivxlc]{1,6})(?:\s*-)?$|^Page \d+( of \d+)?$/i;

// ---------- HTML (EDGAR filings) ----------
// EDGAR documents mark printed page boundaries with CSS page breaks; we split on those.
const BREAK_AFTER = /<[^>]+(?:page-)?break-after\s*:\s*(?:always|page)[^>]*>(?:\s*<\/(?:hr|div|p)>)?/gi;
const BREAK_BEFORE = /<(?=[^>]+(?:page-)?break-before\s*:\s*(?:always|page))/gi;
const MARK = '<!--UW_PAGE-->';

function htmlBlocks(html) {
  const $ = cheerio.load(html);
  $('script, style, head').remove();
  const blocks = [];
  const BLOCKS = 'p, div, h1, h2, h3, h4, h5, h6, li, table';
  $('body').find(BLOCKS).each((_, el) => {
    const $el = $(el);
    if ($el.parents('table').length) return; // handled by its table
    if (el.tagName === 'table') {
      const rows = [];
      $el.find('tr').each((_, tr) => {
        const cells = $(tr).find('td, th').map((_, td) => clean($(td).text())).get().filter(Boolean);
        if (cells.length) rows.push(cells);
      });
      if (!rows.length) return;
      const wide = Math.max(...rows.map((r) => r.length));
      // EDGAR often uses 1–2 column tables purely for layout (e.g. "SECTION 1.01 | Defined Terms").
      if (wide <= 2 && rows.length <= 3) rows.forEach((r) => blocks.push({ type: 'p', text: r.join(' ') }));
      else blocks.push({ type: 'table', text: rows.map((r) => r.join(' | ')).join('\n'), rows: rows.length });
      return;
    }
    if (el.tagName === 'div' && $el.children(BLOCKS).length) return; // only leaf blocks
    const text = clean($el.text());
    if (text) blocks.push({ type: 'p', text });
  });
  return blocks;
}

export function parseHtml(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const marked = raw.replace(BREAK_AFTER, (m) => m + MARK).replace(BREAK_BEFORE, MARK + '<');
  const parts = marked.split(MARK);
  const pages = [];
  for (const part of parts) {
    const blocks = htmlBlocks(part);
    // Drop a trailing printed page label ("12", "- iv -") and keep it as the page's label.
    let label = null;
    while (blocks.length && blocks[blocks.length - 1].type === 'p' && PAGE_LABEL.test(blocks[blocks.length - 1].text)) label = blocks.pop().text;
    if (blocks.length) pages.push({ page: pages.length + 1, label, blocks });
  }
  return pages;
}

// ---------- PDF ----------
// pdf.js gives positioned text runs; we rebuild lines by y-position and paragraphs by vertical gaps.
export async function parsePdf(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true, verbosity: 0 }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { items } = await page.getTextContent();
    const lines = [];
    for (const it of items) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      const h = Math.abs(it.transform[3]) || 10;
      const line = lines.find((l) => Math.abs(l.y - y) <= 2);
      if (line) line.parts.push({ x: it.transform[4], s: it.str });
      else lines.push({ y, h, parts: [{ x: it.transform[4], s: it.str }] });
    }
    lines.sort((a, b) => b.y - a.y);
    const blocks = [];
    let cur = null;
    let prev = null;
    for (const l of lines) {
      const text = clean(l.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(' '));
      const gap = prev ? prev.y - l.y : 0;
      if (!cur || gap > prev.h * 1.8) { cur = { type: 'p', text }; blocks.push(cur); }
      else cur.text += (cur.text.endsWith('-') ? '' : ' ') + text;
      prev = l;
    }
    let label = null;
    while (blocks.length && PAGE_LABEL.test(blocks[blocks.length - 1].text)) label = blocks.pop().text;
    pages.push({ page: n, label, blocks });
  }
  return pages;
}

export async function parseFile(file) {
  if (/\.pdf$/i.test(file)) return parsePdf(file);
  if (/\.html?$/i.test(file)) return parseHtml(file);
  // Plain text: blank lines separate paragraphs, form feeds separate pages.
  return fs.readFileSync(file, 'utf8').split('\f').map((t, i) => ({
    page: i + 1, label: null, blocks: t.split(/\n\s*\n/).map(clean).filter(Boolean).map((text) => ({ type: 'p', text })),
  }));
}
