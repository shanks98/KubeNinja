import { useState, type ReactNode } from 'react';
import { useApp } from '../../store';
import { pinEvidence } from '../cases/pin';
import { toast } from '../Toast';
import type { CertResult, DnsRecordType, DnsResult } from '@shared/types';
import {
  base64Encode, base64Decode, urlEncode, urlDecode,
  hashText, tsConvert, jsonFormat, cidrInfo,
} from '../../tools/pureTools';
import { analyzeJwt, relTime, type JwtAnalysis, type Sev } from '../../tools/jwt';
import { certFindings } from '../../tools/cert';
import { HarAnalyzer } from './HarAnalyzer';

const TOOLS = [
  { id: 'base64', name: 'Base64', ic: '⇄' },
  { id: 'jwt', name: 'JWT decoder', ic: '🔑' },
  { id: 'har', name: 'HAR analyzer', ic: '🌐' },
  { id: 'dns', name: 'DNS lookup', ic: '🔎' },
  { id: 'cert', name: 'Certificate check', ic: '🔒' },
  { id: 'hash', name: 'Hash', ic: '#' },
  { id: 'url', name: 'URL encode', ic: '%' },
  { id: 'ts', name: 'Timestamp', ic: '🕑' },
  { id: 'json', name: 'JSON format', ic: '{}' },
  { id: 'cidr', name: 'CIDR calc', ic: '⌗' },
] as const;

export function ToolsView() {
  const setOverlay = useApp((s) => s.setOverlay);
  const [active, setActive] = useState<string>('base64');
  return (
    <div className="cases">
      <div className="titlebar">
        <button className="btn sm" onClick={() => setOverlay(null)}>← Cluster</button>
        <div className="nav">
          <button onClick={() => setOverlay('cases')}>Cases</button>
          <button className="on">Tools</button>
        </div>
        <b style={{ letterSpacing: '.02em' }}>Investigation Tools</b>
      </div>
      <div className="cases-main">
        <div className="tool-list">
          {TOOLS.map((t) => (
            <button key={t.id} className={'tool-item' + (t.id === active ? ' on' : '')} onClick={() => setActive(t.id)}>
              <span className="tool-ic">{t.ic}</span>{t.name}
            </button>
          ))}
        </div>
        <div className="tool-pane">{renderTool(active)}</div>
      </div>
    </div>
  );
}

function renderTool(id: string): ReactNode {
  switch (id) {
    case 'base64': return <TextTool key="b" title="Base64 converter" hint="Encode/decode UTF-8 text · accepts URL-safe base64." actions={[['Encode →', base64Encode], ['← Decode', base64Decode]]} pin="Base64" />;
    case 'url': return <TextTool key="u" title="URL encode / decode" actions={[['Encode', urlEncode], ['Decode', urlDecode]]} pin="URL" />;
    case 'json': return <TextTool key="j" title="JSON formatter" hint="Pretty-print & validate JSON." actions={[['Format', jsonFormat]]} pin="JSON" mono />;
    case 'jwt': return <JwtTool key="jwt" />;
    case 'har': return <HarAnalyzer key="har" />;
    case 'hash': return <HashTool key="h" />;
    case 'ts': return <TsTool key="t" />;
    case 'cidr': return <CidrTool key="c" />;
    case 'dns': return <DnsTool key="d" />;
    case 'cert': return <CertTool key="cert" />;
    default: return null;
  }
}

function pinResult(title: string, text: string) {
  if (!text.trim()) { toast('Run the tool first'); return; }
  pinEvidence({ kind: 'snippet', title: `${title} result`, contentText: text, source: 'tools' });
}
const PinBtn = ({ title, text }: { title: string; text: string }) => <button className="btn sm" onClick={() => pinResult(title, text)}>Pin result to case</button>;
const H2 = ({ children, badge }: { children: ReactNode; badge?: boolean }) => (
  <h2 style={{ fontSize: 16 }}>{children}{badge && <span className="badge app" style={{ marginLeft: 8 }}>Runs in the app</span>}</h2>
);

function TextTool({ title, hint, actions, pin, mono }: { title: string; hint?: string; actions: [string, (s: string) => string][]; pin: string; mono?: boolean }) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const run = (fn: (s: string) => string) => { try { setOutput(fn(input)); } catch (e) { setOutput('⚠ ' + (e as Error).message); } };
  return (
    <>
      <H2>{title}</H2>
      {hint && <div className="muted" style={{ fontSize: 12 }}>{hint}</div>}
      <textarea className="input mono" style={{ minHeight: 96, marginTop: 12 }} value={input} onChange={(e) => setInput(e.target.value)} placeholder="input…" />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {actions.map(([label, fn]) => <button key={label} className="btn sm primary" onClick={() => run(fn)}>{label}</button>)}
        <PinBtn title={pin} text={output} />
      </div>
      <pre className="tool-out" style={mono ? undefined : {}}>{output || '—'}</pre>
    </>
  );
}

const JWT_SAMPLES = {
  k8s: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Imszcy1zYSJ9.eyJpc3MiOiJodHRwczovL29pZGMuc2hpbm9iaS5leGFtcGxlIiwic3ViIjoic3lzdGVtOnNlcnZpY2VhY2NvdW50OnBheW1lbnRzOmNoZWNrb3V0IiwiYXVkIjpbImh0dHBzOi8va3ViZXJuZXRlcy5kZWZhdWx0LnN2YyJdLCJleHAiOjIwNTM2ODMyMDAsImlhdCI6MTcyNDgwMDA1MSwia3ViZXJuZXRlcy5pbyI6eyJuYW1lc3BhY2UiOiJwYXltZW50cyJ9fQ.sig',
  risky: 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJyb290IiwiaWF0IjoxNzI0ODAwMDUxfQ.',
};
const SEV_FINDING = ({ f }: { f: { sev: Sev; title: string; detail: string; rec: string } }) => (
  <div className={'har-finding ' + f.sev}>
    <span className={'sev-' + f.sev}>[{f.sev}]</span> <strong>{f.title}</strong>
    <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{f.detail}</div>
    <div className="har-rec">→ {f.rec}</div>
  </div>
);

function JwtTool() {
  const [token, setToken] = useState('');
  const [res, setRes] = useState<JwtAnalysis | { error: string } | null>(null);
  const run = (t = token) => { try { setRes(analyzeJwt(t)); } catch (e) { setRes({ error: (e as Error).message }); } };
  const load = (t: string) => { setToken(t); run(t); };
  const p = res && 'payload' in res ? res.payload : null;
  const dt = (v: unknown) => (typeof v === 'number' ? `${new Date(v * 1000).toLocaleString()} · ${relTime(v)}` : '—');
  const pinText = res && 'payload' in res ? `alg ${res.alg}\nheader ${JSON.stringify(res.header)}\npayload ${JSON.stringify(res.payload, null, 2)}\n\n${res.findings.map((f) => `[${f.sev}] ${f.title}`).join('\n')}` : '';
  const exp = p && typeof p.exp === 'number' ? p.exp : undefined;

  return (
    <>
      <H2>JWT decoder</H2>
      <div className="muted" style={{ fontSize: 12 }}>Decode header &amp; claims. Signature is <b>not</b> verified.</div>
      <textarea className="input mono" style={{ minHeight: 78, marginTop: 12 }} value={token} onChange={(e) => setToken(e.target.value)} placeholder="eyJhbGciOi…" />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button className="btn sm primary" onClick={() => run()}>Decode</button>
        <button className="btn sm" onClick={() => load(JWT_SAMPLES.k8s)}>Load K8s SA token</button>
        <button className="btn sm" onClick={() => load(JWT_SAMPLES.risky)}>Load risky token</button>
        <PinBtn title="JWT" text={pinText} />
      </div>
      {res && 'error' in res && <div className="alert" style={{ marginTop: 10, fontSize: 12 }}>⚠ {res.error}</div>}
      {res && 'payload' in res && p && (
        <div style={{ marginTop: 12 }}>
          <div className="chips">
            <span className="tchip">alg <b>{res.alg || '—'}</b></span>
            {typeof res.header.typ === 'string' && <span className="tchip">typ <b>{res.header.typ}</b></span>}
            {typeof res.header.kid === 'string' && <span className="tchip">kid <b>{res.header.kid}</b></span>}
            {exp !== undefined
              ? <span className={'pill ' + (exp < Date.now() / 1000 ? 'err' : 'ok')}><span className="d" />{exp < Date.now() / 1000 ? `expired ${relTime(exp)}` : `expires ${relTime(exp)}`}</span>
              : <span className="pill warn"><span className="d" />no expiry</span>}
          </div>
          <div className="fcard"><h3>Claims</h3>
            <div className="kv">{['iss', 'sub', 'aud', 'iat', 'exp', 'nbf', 'jti'].filter((k) => p[k] !== undefined).map((k) => (
              <div key={k} style={{ display: 'contents' }}>
                <div className="k">{k}</div>
                <div className="mono">{String(Array.isArray(p[k]) ? (p[k] as string[]).join(', ') : typeof p[k] === 'object' ? JSON.stringify(p[k]) : p[k])}{['iat', 'exp', 'nbf'].includes(k) ? <span className="muted"> ({dt(p[k])})</span> : null}</div>
              </div>
            ))}</div>
          </div>
          <div className="jwt-cols">
            <div className="fcard"><h3>Header</h3><pre className="tool-out" style={{ margin: 0 }}>{JSON.stringify(res.header, null, 2)}</pre></div>
            <div className="fcard"><h3>Payload</h3><pre className="tool-out" style={{ margin: 0 }}>{JSON.stringify(res.payload, null, 2)}</pre></div>
          </div>
          <div className="fcard"><h3>Signature <span className="muted" style={{ fontWeight: 400 }}>· not verified</span></h3><pre className="tool-out" style={{ margin: 0, maxHeight: 80 }}>{res.signature || '(none)'}</pre></div>
          <div className="fcard"><h3>Security analysis ({res.findings.length})</h3>
            {res.findings.length ? res.findings.map((f, i) => <SEV_FINDING key={i} f={f} />) : <div className="muted" style={{ fontSize: 12.5 }}>No issues — asymmetric algorithm, has exp/iss/aud, within its validity window.</div>}
          </div>
        </div>
      )}
    </>
  );
}

function HashTool() {
  const [input, setInput] = useState('');
  const [out, setOut] = useState('');
  const run = async () => { try { const h = await hashText(input); setOut(`SHA-256  ${h.sha256}\nSHA-1    ${h.sha1}`); } catch (e) { setOut('⚠ ' + (e as Error).message); } };
  return (
    <>
      <H2>Hash</H2><div className="muted" style={{ fontSize: 12 }}>SHA-256 &amp; SHA-1 of the input (Web Crypto).</div>
      <textarea className="input mono" style={{ minHeight: 70, marginTop: 12 }} value={input} onChange={(e) => setInput(e.target.value)} placeholder="text to hash…" />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button className="btn sm primary" onClick={run}>Hash</button><PinBtn title="Hash" text={out} /></div>
      <pre className="tool-out">{out || '—'}</pre>
    </>
  );
}

function TsTool() {
  const [input, setInput] = useState('');
  const [out, setOut] = useState('');
  const run = (v: string) => { try { const r = tsConvert(v); setOut(`ISO 8601   ${r.iso}\nLocal      ${r.local}\nEpoch (s)  ${r.epochS}\nEpoch (ms) ${r.epochMs}\nRelative   ${r.relative}`); } catch (e) { setOut('⚠ ' + (e as Error).message); } };
  return (
    <>
      <H2>Timestamp converter</H2><div className="muted" style={{ fontSize: 12 }}>Epoch (s or ms) ⇄ ISO 8601, with local time and relative age.</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input className="input sm mono" value={input} onChange={(e) => setInput(e.target.value)} placeholder="1724800051 or 2026-08-28T03:07:31Z" />
        <button className="btn sm primary" onClick={() => run(input)}>Convert</button>
        <button className="btn sm" onClick={() => { const n = String(Math.floor(Date.now() / 1000)); setInput(n); run(n); }}>Now</button>
        <PinBtn title="Timestamp" text={out} />
      </div>
      <pre className="tool-out">{out || '—'}</pre>
    </>
  );
}

function CidrTool() {
  const [input, setInput] = useState('10.0.0.0/24');
  const [out, setOut] = useState('');
  const run = () => { try { const r = cidrInfo(input); setOut(`Network    ${r.network}\nBroadcast  ${r.broadcast}\nMask       ${r.mask}\nHost range ${r.firstHost} – ${r.lastHost}\nUsable     ${r.hosts}`); } catch (e) { setOut('⚠ ' + (e as Error).message); } };
  return (
    <>
      <H2>CIDR calculator</H2><div className="muted" style={{ fontSize: 12 }}>IPv4 network / broadcast / host range for a CIDR block.</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input className="input sm mono" value={input} onChange={(e) => setInput(e.target.value)} placeholder="10.0.0.0/24" />
        <button className="btn sm primary" onClick={run}>Calculate</button>
        <PinBtn title="CIDR" text={out} />
      </div>
      <pre className="tool-out">{out || '—'}</pre>
    </>
  );
}

function DnsTool() {
  const [host, setHost] = useState('');
  const [type, setType] = useState<DnsRecordType>('A');
  const [res, setRes] = useState<DnsResult | { error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); const r = await window.kn.tools.dns(host, type); setBusy(false); setRes(r.ok ? r.data : { error: r.error }); };
  const pinText = res && 'records' in res ? `${res.host} ${res.type}\n${res.records.join('\n')}` : '';
  return (
    <>
      <H2 badge>DNS lookup</H2><div className="muted" style={{ fontSize: 12 }}>Resolves via the OS resolver in the main process.</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input className="input sm mono" value={host} onChange={(e) => setHost(e.target.value)} placeholder="api.example.com" />
        <select className="input sm" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value as DnsRecordType)}>
          {(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'] as DnsRecordType[]).map((t) => <option key={t}>{t}</option>)}
        </select>
        <button className="btn sm primary" disabled={!host.trim() || busy} onClick={run}>{busy ? 'Resolving…' : 'Lookup'}</button>
        <PinBtn title="DNS" text={pinText} />
      </div>
      {res && 'error' in res && <div className="alert" style={{ marginTop: 10, fontSize: 12 }}>⚠ {res.error}</div>}
      {res && 'records' in res && <pre className="tool-out">{`;; ${res.host}  ${res.type}  (${res.ms}ms)\n\n${res.records.join('\n') || '(no records)'}`}</pre>}
    </>
  );
}

function CertTool() {
  const [mode, setMode] = useState<'host' | 'pem'>('host');
  const [hostPort, setHostPort] = useState('');
  const [pem, setPem] = useState('');
  const [res, setRes] = useState<CertResult | { error: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const r = mode === 'host' ? await window.kn.tools.cert(hostPort) : await window.kn.tools.certPem(pem);
    setBusy(false);
    setRes(r.ok ? r.data : { error: r.error });
  };
  const c = res && 'subject' in res ? res : null;
  const findings = c ? certFindings(c) : [];
  const status = (): [string, string] => {
    if (!c) return ['off', ''];
    if (c.daysLeft < 0) return ['err', 'EXPIRED'];
    if (c.daysLeft < 15) return ['warn', `${c.daysLeft} days left`];
    return ['ok', `${c.daysLeft} days left`];
  };
  const [tone, label] = status();
  const pinText = c ? `Subject ${c.subject}\nIssuer ${c.issuer}\nValid ${c.validFrom} – ${c.validTo} (${c.daysLeft}d)\nSig ${c.sigAlg ?? '?'} · ${c.keyType ?? '?'} ${c.bits ?? ''}\nSANs ${(c.sans ?? []).join(', ')}\n\n${findings.map((f) => `[${f.sev}] ${f.title}`).join('\n')}` : '';

  return (
    <>
      <H2 badge>Certificate inspector</H2>
      <div className="seg" style={{ marginTop: 10 }}>
        <button className={mode === 'host' ? 'on' : ''} onClick={() => { setMode('host'); setRes(null); }}>Host : port</button>
        <button className={mode === 'pem' ? 'on' : ''} onClick={() => { setMode('pem'); setRes(null); }}>Paste PEM</button>
      </div>
      {mode === 'host' ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input sm mono" value={hostPort} onChange={(e) => setHostPort(e.target.value)} placeholder="shop.example.com:443" />
          <button className="btn sm primary" disabled={!hostPort.trim() || busy} onClick={run}>{busy ? 'Connecting…' : 'Check'}</button>
          <PinBtn title="Certificate" text={pinText} />
        </div>
      ) : (
        <>
          <textarea className="input mono" style={{ minHeight: 90 }} value={pem} onChange={(e) => setPem(e.target.value)} placeholder="-----BEGIN CERTIFICATE-----" />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn sm primary" disabled={!pem.trim() || busy} onClick={run}>Inspect</button>
            <PinBtn title="Certificate" text={pinText} />
          </div>
        </>
      )}
      {res && 'error' in res && <div className="alert" style={{ marginTop: 10, fontSize: 12 }}>⚠ {res.error}</div>}
      {c && (
        <div style={{ marginTop: 12 }}>
          <div className="fcard">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span className={'pill ' + tone}><span className="d" />{label}</span>
              {c.authorized === false && <span className="pill warn"><span className="d" />untrusted chain</span>}
            </div>
            <div className="kv">
              <div className="k">Subject CN</div><div className="mono">{c.subjectCN ?? c.subject}</div>
              {c.subjectO && <><div className="k">Organization</div><div className="mono">{c.subjectO}</div></>}
              <div className="k">Issuer</div><div className="mono">{c.issuerCN ?? c.issuer}</div>
              {c.serialNumber && <><div className="k">Serial</div><div className="mono">{c.serialNumber}</div></>}
              <div className="k">Valid from</div><div className="mono">{new Date(c.validFrom).toUTCString()}</div>
              <div className="k">Valid to</div><div className="mono">{new Date(c.validTo).toUTCString()}</div>
              {c.sigAlg && <><div className="k">Signature</div><div className="mono">{c.sigAlg}</div></>}
              {c.keyType && <><div className="k">Public key</div><div className="mono">{c.keyType} {c.bits ? `${c.bits}-bit` : ''}</div></>}
              {c.sans && <><div className="k">SANs</div><div className="mono">{c.sans.join(', ')}</div></>}
            </div>
          </div>
          {c.chain && c.chain.length > 0 && (
            <div className="fcard"><h3>Chain</h3>
              {c.chain.map((n, i) => (
                <div key={i} className="chain-node" style={{ paddingLeft: i * 16 }}>
                  <span className="chain-dot" /><span className="mono">{n.subject || '(unnamed)'}</span>
                  <span className="muted"> · {n.daysLeft}d left</span>
                </div>
              ))}
            </div>
          )}
          <div className="fcard"><h3>Security analysis ({findings.length})</h3>
            {findings.length ? findings.map((f, i) => <SEV_FINDING key={i} f={f} />) : <div className="muted" style={{ fontSize: 12.5 }}>No issues — trusted chain, strong signature and key, valid window, hostname matches.</div>}
          </div>
        </div>
      )}
    </>
  );
}
