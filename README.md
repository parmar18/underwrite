# Underwrite: private credit underwriting demo

A simple prototype for a private credit deal team: **Deals → Securities → Due Diligence → IC Memo**. The sample deals are fictional; InnovAge is a real example built from its public SEC filings.

## Run it

```bash
npm install
npm run dev        # opens http://localhost:5173
```

It works offline. To have Claude write the IC memo and answer chat questions live, copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`.

## The 5-minute demo

1. **Deals.** "Here's the pipeline." Click **Meridian Health**.
2. **Securities.** "This is the loan we're being asked to make."
3. **Due Diligence.** "The AI read the documents and flagged 3 issues." Click a page reference to show the source quote. Click **Resolve** on a red flag and the flag count and memo recommendation update.
4. **IC Memo.** Click **Generate memo** and it writes itself, with every claim linked to its source.
5. **Deal chat** (right panel). Ask "What if EBITDA drops 20% and rates rise 200bps?" It shows the tool it called and the raw result, then answers. The numbers come from the tool, not the AI.
6. **InnovAge** (the real deal). Its Securities tab comes from the actual credit agreement: $75M term loan, L+175, 4.75x covenant. Click any page reference to open that page in the **Data Room**.

The system explanation (what's built, architecture, data model, tradeoffs, next steps) is a separate document, not part of the app.

## Code

```
src/data.js       sample deals and diligence checklist
src/credit.js     credit math (leverage, coverage, yield)
src/memo.js       offline memo writer
src/tools.js      chat tools: deal terms, credit stats (with stress), findings, document search, pipeline compare
src/agent.js      offline tool router (keywords → tools); live mode lets Claude pick the tools
src/views/        Deals, Deal (3 tabs + chat), Data Room
server/index.js   streams the memo; runs the Claude tool-calling loop for chat
```

## Data Room: the real-document pipeline

The **Data Room** page runs public SEC filings through the same pipeline a fund's data room would go through.

### Documents (all free, from SEC EDGAR)

| Pack | Document | Link |
|---|---|---|
| InnovAge (sponsor-backed healthcare) | Credit Agreement, March 2021 (180 pages) | [EX-10.1](https://www.sec.gov/Archives/edgar/data/1834376/000110465921035601/tm2037889d20_ex10-1.htm) |
| | Form 10-K, FY ended June 2021 | [10-K](https://www.sec.gov/Archives/edgar/data/1834376/000155837021012679/tmb-20210630x10k.htm) |
| LivaNova | First Lien Credit Agreement, 2021 (164 pages) | [EX-10.1](https://www.sec.gov/Archives/edgar/data/1639691/000163969121000096/ex10_1livanova-firstliencr.htm) |
| Maximus | Annual Report FY2023 (PDF) | [PDF](https://www.sec.gov/Archives/edgar/data/1032220/000103222024000011/maximusinc_10kx2024xv1.pdf) |

Get them either way:
- **Browser:** save each file into `data/raw/<pack>/` using the file names in `pipeline/sources.json`.
- **Script:** set `SEC_USER_AGENT="Your Name you@email.com"` in `.env`, then `npm run fetch`.

To add your own pack, drop PDF, HTML or TXT files into `data/raw/<new-pack>/` (and optionally list them in `sources.json`).

### Run it

```bash
npm run ingest            # all packs
npm run ingest -- innovage
npm run ingest -- --llm   # also have Claude extract the key terms; code verifies every quote
```

### What each step does

| Step | Code | What it does |
|---|---|---|
| Parse | `pipeline/parse.js` | HTML split on the filing's own page breaks, PDF rebuilt line by line with pdf.js. Tables stay tables. Printed page labels are kept. |
| Clean | `pipeline/chunk.js` | Removes running headers ("Table of Contents") and skips contents pages. |
| Structure | `pipeline/chunk.js` | Finds Article → Section (credit agreements) or Part → Item (10-Ks), including messy forms like `SECTION I.01Defined Terms`. Each defined term becomes its own unit. |
| Chunk | `pipeline/chunk.js` | Packs paragraphs to ~400 tokens (max ~800) inside one section. Never splits mid-sentence or across sections. Each chunk lists the defined terms it uses. |
| Index | `pipeline/search.js` | BM25 with headings and defined terms weighted. Light stemming. |
| Extract + verify | `pipeline/extract.js` | Pulls 8 decision-critical terms (sizes, maturity, pricing grid, covenant, EBITDA add-back cap, incremental). Every value carries a quote and page, and code checks the quote is really on that page. |

Results on these filings: InnovAge 8/8 terms found. LivaNova 5/8: its maturity comes from the revolver (no separate term loan date), and its facility sizes and EBITDA add-back cap aren't stated where the rules look, so those 3 are flagged for review instead of guessed. Every value found has its quote verified on the page.
