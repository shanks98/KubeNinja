import { Fragment, useMemo, useRef, useState } from 'react';
import { analyzeHar, type HarEntry, type HarSummary } from '../../tools/har';
import { pinEvidence } from '../cases/pin';

type Tab = 'overview' | 'requests' | 'errors' | 'performance' | 'auth' | 'security';

function statusColor(c: number): string {
  if (c >= 200 && c < 300) return 'var(--jade)';
  if (c >= 300 && c < 400) return '#a880ff';
  if (c >= 400 && c < 500) return 'var(--warn)';
  return 'var(--danger)';
}
const pct = (n: number, t: number) => (t > 0 ? Math.round((n / t) * 1000) / 10 : 0);

const SAMPLE = JSON.stringify({ log: { entries: [
  { time: 142, request: { method: 'GET', url: 'https://shop.example.com/', headers: [] }, response: { status: 200, content: { mimeType: 'text/html', size: 18422 }, headers: [{ name: 'content-type', value: 'text/html' }] } },
  { time: 268, request: { method: 'POST', url: 'https://shop.example.com/oauth/token', headers: [], postData: { text: 'grant_type=password&username=aya&password=•••' } }, response: { status: 200, content: { mimeType: 'application/json', size: 412, text: '{"access_token":"eyJhbGciOi...","token_type":"Bearer","expires_in":3600}' }, headers: [{ name: 'set-cookie', value: 'session=8f2a...; Path=/' }] } },
  { time: 120, request: { method: 'GET', url: 'https://api.example.com/user/profile?access_token=eyJhbGciOiJIUzI1NiJ9.abc', headers: [{ name: 'authorization', value: 'Bearer eyJhbGciOi...' }] }, response: { status: 200, content: { mimeType: 'application/json', size: 944, text: '{"id":42,"email":"aya@example.com","role":"admin"}' }, headers: [] } },
  { time: 82, request: { method: 'GET', url: 'https://api.example.com/cart', headers: [{ name: 'authorization', value: 'Bearer eyJhbGciOi...' }] }, response: { status: 200, content: { mimeType: 'application/json', size: 1834 }, headers: [] } },
  { time: 3021, request: { method: 'POST', url: 'https://api.example.com/checkout', headers: [{ name: 'authorization', value: 'Bearer eyJhbGciOi...' }], postData: { text: '{"items":[44192],"card":"4111..."}' } }, response: { status: 502, content: { mimeType: 'text/html', size: 512, text: '502 Bad Gateway' }, headers: [] } },
  { time: 640, request: { method: 'GET', url: 'https://api.example.com/inventory?sku=44192', headers: [] }, response: { status: 429, content: { mimeType: 'application/json', size: 88, text: '{"error":"rate limited"}' }, headers: [] } },
  { time: 14, request: { method: 'GET', url: 'http://cdn.example.com/app.js', headers: [] }, response: { status: 200, content: { mimeType: 'application/javascript', size: 88213 }, headers: [] } },
  { time: 96, request: { method: 'GET', url: 'https://api.example.com/admin/users', headers: [{ name: 'authorization', value: 'Basic YWRtaW46cGFzcw==' }] }, response: { status: 403, content: { mimeType: 'application/json', size: 64 }, headers: [] } },
  { time: 210, request: { method: 'GET', url: 'https://api.example.com/orders', headers: [{ name: 'authorization', value: 'Bearer eyJhbGciOi...' }] }, response: { status: 200, content: { mimeType: 'application/json', size: 5120 }, headers: [] } },
] } });

export function HarAnalyzer() {
  const [summary, setSummary] = useState<HarSummary | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [filter, setFilter] = useState('');
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);

  const load = (text: string, filename: string) => {
    try { setSummary(analyzeHar(text, filename)); setTab('overview'); setOpenRow(null); setErr(undefined); }
    catch (e) { setErr((e as Error).message); }
  };
  const readFile = (f: File | null) => { if (!f) return; const r = new FileReader(); r.onload = () => load(String(r.result), f.name); r.readAsText(f); };

  if (!summary) {
    return (
      <>
        <div className="page-head"><h2 style={{ fontSize: 16 }}>HAR Analyzer</h2><span className="muted" style={{ fontSize: 12 }}>Forensic analysis of captured web traffic.</span></div>
        <div className={'dropzone' + (drag ? ' drag' : '')}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); readFile(e.dataTransfer.files?.[0] ?? null); }}>
          <input ref={inputRef} type="file" accept=".har,application/json" style={{ display: 'none' }} onChange={(e) => readFile(e.target.files?.[0] ?? null)} />
          <div className="dz-big">Drop a <b>.har</b> file here, or click to browse</div>
          <div className="muted">Everything is parsed locally — nothing leaves the app.</div>
          <div style={{ marginTop: 12 }}><button className="btn sm primary" onClick={(e) => { e.stopPropagation(); load(SAMPLE, 'shop-checkout-502.har'); }}>Load sample capture</button></div>
        </div>
        {err && <div className="alert" style={{ marginTop: 12 }}>{err}</div>}
      </>
    );
  }

  const s = summary;
  const errorEntries = s.entries.filter((e) => e.status === 0 || e.status >= 400);
  const q = filter.trim().toLowerCase();
  const filtered = q ? s.entries.filter((e) => e.url.toLowerCase().includes(q) || e.method.toLowerCase().includes(q) || String(e.status).includes(q)) : s.entries;

  const pin = () => {
    const text = [
      `${s.filename} · ${s.totalRequests} requests · ${s.failedRequests} errors · avg ${s.avgTimeMs}ms`,
      `Security: High ${s.security.summary.High} · Medium ${s.security.summary.Medium} · Low ${s.security.summary.Low}`,
      '', ...s.security.findings.map((f) => `[${f.severity}] ${f.title} — ${f.description}`),
      '', ...s.auth.anomalies.map((a) => `[${a.severity}] ${a.type}: ${a.description}`),
    ].join('\n');
    pinEvidence({ kind: 'snippet', title: `HAR · ${s.filename}`, contentText: text, source: 'tools/har' });
  };

  const tabs: [Tab, string][] = [
    ['overview', 'Overview'], ['requests', `Requests (${s.totalRequests})`], ['errors', `Errors (${s.failedRequests})`],
    ['performance', 'Performance'], ['auth', `Auth Flow (${s.auth.steps.length})`], ['security', `Security (${s.security.findings.length})`],
  ];

  return (
    <>
      <div className="page-head"><h2 style={{ fontSize: 16 }}>HAR Analyzer</h2><span className="muted mono" style={{ fontSize: 12 }}>{s.filename} · {s.totalRequests} requests</span>
        <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setSummary(null)}>Load another</button></div>
      <div className="har-tabs">
        {tabs.map(([id, label]) => <button key={id} className={'tab' + (tab === id ? ' on' : '')} onClick={() => { setTab(id); setOpenRow(null); }}>{label}</button>)}
        <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={pin}>📎 Pin to case</button>
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="metrics">
            <Metric n={s.totalRequests} l="Total requests" />
            <Metric n={s.successRequests} l="Successful 2xx" color="var(--jade)" />
            <Metric n={s.redirectRequests} l="Redirects 3xx" color="#a880ff" />
            <Metric n={s.failedRequests} l="Errors 4xx/5xx" color="var(--danger)" />
            <Metric n={s.avgTimeMs} u="ms" l="Avg latency" />
            <Metric n={s.slowestTimeMs} u="ms" l="Slowest" />
          </div>
          <div className="split">
            <div className="fcard"><h3>Status code distribution</h3>
              {Object.entries(s.statusDistribution).sort((a, b) => b[1] - a[1]).map(([code, count]) => (
                <div key={code} className="bar-row">
                  <span className="chip mono" style={{ color: statusColor(Number(code)), minWidth: 44, textAlign: 'center' }}>{code}</span>
                  <div className="bar"><div className="bar-fill" style={{ width: pct(count, s.totalRequests) + '%', background: statusColor(Number(code)) }} /></div>
                  <span className="muted">{count} · {pct(count, s.totalRequests)}%</span>
                </div>
              ))}
            </div>
            <div className="fcard"><h3>Security summary</h3>
              <div className="metrics" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
                <Metric n={s.security.summary.High} l="High" cls="sev-High" />
                <Metric n={s.security.summary.Medium} l="Medium" cls="sev-Medium" />
                <Metric n={s.security.summary.Low} l="Low" cls="sev-Low" />
                <Metric n={s.security.summary.Informational} l="Info" cls="sev-Informational" />
              </div>
              {s.auth.anomalies.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <strong style={{ fontSize: 12 }}>Auth anomalies</strong>
                  {s.auth.anomalies.map((a, i) => <div key={i} style={{ fontSize: 12, marginTop: 4 }}><span className={'sev-' + a.severity}>[{a.severity}]</span> {a.type} — <span className="muted">{a.description}</span></div>)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'requests' && (
        <>
          <input className="input sm" placeholder="Filter by URL, method, or status…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginBottom: 10 }} />
          <EntriesTable entries={filtered} all={s.entries} openRow={openRow} setOpenRow={setOpenRow} />
        </>
      )}
      {tab === 'errors' && <EntriesTable entries={errorEntries} all={s.entries} openRow={openRow} setOpenRow={setOpenRow} />}

      {tab === 'performance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="fcard"><h3>Slowest requests</h3>
            <table className="har-table"><thead><tr><th>Method</th><th>URL</th><th>Status</th><th>Time</th></tr></thead>
              <tbody>{s.topSlow.map((r, i) => <tr key={i}><td><code>{r.method}</code></td><td className="url-cell muted" title={r.url}>{r.url}</td><td style={{ color: statusColor(r.status) }}>{r.status}</td><td className="mono">{r.timeMs}ms</td></tr>)}</tbody></table>
          </div>
          <div className="fcard"><h3>Endpoint usage</h3>
            <table className="har-table"><thead><tr><th>Endpoint</th><th>Count</th><th>Avg time</th></tr></thead>
              <tbody>{s.endpointUsage.map((u, i) => <tr key={i}><td className="url-cell muted" title={u.endpoint}>{u.endpoint}</td><td className="mono">{u.count}</td><td className="mono">{u.avgTimeMs}ms</td></tr>)}</tbody></table>
          </div>
        </div>
      )}

      {tab === 'auth' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {s.auth.anomalies.length > 0 && (
            <div className="fcard"><h3>Anomalies</h3>
              {s.auth.anomalies.map((a, i) => <div key={i} style={{ fontSize: 12.5, marginBottom: 5 }}><span className={'sev-' + a.severity}>[{a.severity}]</span> <strong>{a.type}</strong> — <span className="muted">{a.description}</span></div>)}
            </div>
          )}
          <table className="har-table"><thead><tr><th>#</th><th>Action</th><th>Method</th><th>Status</th><th>URL</th><th>Details</th></tr></thead>
            <tbody>
              {s.auth.steps.map((st) => <tr key={st.sequence}><td className="mono">{st.sequence}</td><td>{st.action}</td><td><code>{st.method}</code></td><td style={{ color: statusColor(st.status) }}>{st.status}</td><td className="url-cell muted" title={st.url}>{st.url}</td><td className="muted" style={{ fontSize: 11.5 }}>{st.details}</td></tr>)}
              {s.auth.steps.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 20 }}>No authentication activity detected.</td></tr>}
            </tbody></table>
        </div>
      )}

      {tab === 'security' && (
        <div>
          {s.security.findings.length === 0 && <p className="muted">No security findings.</p>}
          {s.security.findings.map((f) => (
            <div key={f.id} className={'har-finding ' + f.severity}>
              <span className={'sev-' + f.severity}>[{f.severity}]</span> <strong>{f.title}</strong> <span className="muted">· {f.category}</span>
              <div className="muted" style={{ margin: '5px 0', fontSize: 12.5 }}>{f.description}</div>
              {f.evidence && <code className="har-ev">{f.evidence}</code>}
              <div className="har-rec">→ {f.recommendation}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Metric({ n, l, u, color, cls }: { n: number; l: string; u?: string; color?: string; cls?: string }) {
  return <div className="metric"><div className={'n ' + (cls ?? '')} style={{ color }}>{n}{u && <span className="u">{u}</span>}</div><div className="l">{l}</div></div>;
}

function EntriesTable({ entries, all, openRow, setOpenRow }: { entries: HarEntry[]; all: HarEntry[]; openRow: number | null; setOpenRow: (n: number | null) => void }) {
  const cols = useMemo(() => ['', 'Method', 'URL', 'Status', 'Type', 'Size', 'Time', 'Risk'], []);
  if (entries.length === 0) return <p className="muted">No requests in this view.</p>;
  return (
    <div style={{ overflow: 'auto' }}>
      <table className="har-table">
        <thead><tr>{cols.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
        <tbody>
          {entries.map((e) => {
            const gi = all.indexOf(e);
            const open = openRow === gi;
            return (
              <Fragment key={gi}>
                <tr className="click" onClick={() => setOpenRow(open ? null : gi)}>
                  <td>{open ? '▾' : '▸'}</td><td><code>{e.method}</code></td>
                  <td className="url-cell muted" title={e.url}>{e.url}</td>
                  <td style={{ color: statusColor(e.status), fontWeight: 600 }}>{e.status || '—'}</td>
                  <td className="muted">{e.mime}</td><td className="muted mono">{(e.size / 1024).toFixed(1)}KB</td>
                  <td className="mono">{e.timeMs}ms</td><td className={'risk-' + e.risk}>{e.risk}</td>
                </tr>
                {open && (
                  <tr className="entry-detail"><td colSpan={8}>
                    {e.issues.length > 0 ? (
                      <div style={{ marginBottom: 8 }}><strong style={{ fontSize: 12 }}>Findings</strong>
                        {e.issues.map((iss, k) => <div key={k} style={{ fontSize: 12 }}><span className={'sev-' + iss.severity}>[{iss.severity}]</span> {iss.msg}</div>)}
                      </div>
                    ) : <div className="muted" style={{ fontSize: 12 }}>No issues flagged.</div>}
                    <div className="preview-cols">
                      <div><strong style={{ fontSize: 11.5 }}>Request payload</strong><pre>{e.payloadPreview || '(empty)'}</pre></div>
                      <div><strong style={{ fontSize: 11.5 }}>Response body</strong><pre>{e.responsePreview || '(empty)'}</pre></div>
                    </div>
                  </td></tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
