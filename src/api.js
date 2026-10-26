export async function health() {
  try {
    const r = await fetch('/api/health');
    return r.ok ? await r.json() : { live: false };
  } catch {
    return { live: false };
  }
}

// POST and consume a server-sent-event stream of {text}|{done}|{error} messages.
export async function streamPost(url, body, onText, signal) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  let meta = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split('\n\n');
    buf = events.pop();
    for (const e of events) {
      if (!e.startsWith('data: ')) continue;
      const msg = JSON.parse(e.slice(6));
      if (msg.error) throw new Error(msg.error);
      if (msg.text) onText((full += msg.text));
      if (msg.done) meta = msg;
    }
  }
  return { text: full, meta };
}

// POST and hand every server-sent event object to onEvent (used by the tool-calling chat).
export async function streamEvents(url, body, onEvent) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split('\n\n');
    buf = events.pop();
    for (const e of events) {
      if (!e.startsWith('data: ')) continue;
      const msg = JSON.parse(e.slice(6));
      if (msg.error) throw new Error(msg.error);
      onEvent(msg);
    }
  }
}

export async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Request failed (${r.status})`);
  return r.json();
}
