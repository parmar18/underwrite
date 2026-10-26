import React, { useEffect, useState } from 'react';
import { DEALS } from './data.js';
import { health } from './api.js';
import { Icon, go } from './ui.jsx';
import Deals from './views/Deals.jsx';
import Deal from './views/Deal.jsx';
import DataRoom from './views/DataRoom.jsx';

function useRoute() {
  const [hash, setHash] = useState(window.location.hash.slice(1) || '/');
  useEffect(() => {
    const on = () => { setHash(window.location.hash.slice(1) || '/'); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.split('/').filter(Boolean);
}

export default function App() {
  const [top, id, tab, extra] = useRoute();
  const [api, setApi] = useState({ live: false });
  const [memos, setMemos] = useState({});
  useEffect(() => { health().then(setApi); }, []);

  const ctx = { api, memos, setMemo: (dealId, m) => setMemos((s) => ({ ...s, [dealId]: { ...s[dealId], ...m } })) };
  const deal = DEALS.find((d) => d.id === id);

  let view = <Deals />;
  if (top === 'deal' && deal) view = <Deal ctx={ctx} deal={deal} tab={tab || 'securities'} />;
  else if (top === 'dataroom') view = <DataRoom ctx={ctx} initial={{ pack: id, doc: tab, page: Number(extra) || null }} />;

  return (
    <div className="app">
      <header className="nav">
        <button className="brand" onClick={() => go('/')}>
          <span className="brand-mark">S</span> Underwrite
        </button>
        <button className={`nav-link ${top !== 'dataroom' ? 'on' : ''}`} onClick={() => go('/')}>Deals</button>
        <button className={`nav-link ${top === 'dataroom' ? 'on' : ''}`} onClick={() => go('/dataroom')}>Data Room</button>
        {api.live && (
          <span className="mode" title={api.model}>
            <span className="dot live" /> <span className="mode-text">AI live</span>
          </span>
        )}
      </header>
      <main className="page">{view}</main>
    </div>
  );
}
