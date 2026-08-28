import { useEffect, useRef, useState } from 'react';
import type { LogParams } from '@shared/types';
import type { DockTab } from '../store';
import { useApp } from '../store';
import { pinEvidence } from './cases/pin';

/** Streams logs (container follow, or `tail -F` a file) into a scrolling pane. */
function LogView({ params, downloadName }: { params: LogParams; downloadName?: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [wrap, setWrap] = useState(false);
  const [autoscroll, setAutoscroll] = useState(true);
  const [err, setErr] = useState<string | undefined>();
  const pre = useRef<HTMLPreElement>(null);
  const carry = useRef('');
  const pending = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLines([]); setErr(undefined); carry.current = ''; pending.current = [];
    const flush = () => {
      timer.current = null;
      setLines((prev) => {
        const next = prev.concat(pending.current);
        pending.current = [];
        return next.length > 5000 ? next.slice(-5000) : next;
      });
    };
    const onChunk = (chunk: string) => {
      const text = carry.current + chunk;
      const parts = text.split('\n');
      carry.current = parts.pop() ?? '';
      if (parts.length) {
        pending.current.push(...parts);
        if (timer.current == null) timer.current = setTimeout(flush, 60);
      }
    };
    const unsub = window.kn.logs.stream(params, onChunk, setErr);
    return () => { unsub(); if (timer.current != null) clearTimeout(timer.current); };
  }, [JSON.stringify(params)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoscroll && pre.current) pre.current.scrollTop = pre.current.scrollHeight;
  }, [lines, autoscroll]);

  const shown = search ? lines.filter((l) => l.toLowerCase().includes(search.toLowerCase())) : lines;

  const download = async () => {
    const r = await window.kn.logs.download(params.sessionId, params.namespace, params.pod, params.container);
    if (!r.ok) { setErr(r.error); return; }
    const url = URL.createObjectURL(new Blob([r.data], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = (downloadName ?? params.pod) + '.log'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="logview">
      <div className="logbar">
        <input className="input sm" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 220 }} />
        <span className="muted mono" style={{ fontSize: 11 }}>{shown.length}/{lines.length} lines</span>
        <label className="chk"><input type="checkbox" checked={autoscroll} onChange={(e) => setAutoscroll(e.target.checked)} />Follow</label>
        <label className="chk"><input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} />Wrap</label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn sm" onClick={() => pinEvidence({ kind: 'snippet', title: `Logs · ${params.pod}${params.container ? '/' + params.container : ''}`, contentText: shown.slice(-500).join('\n'), source: `${params.namespace}/${params.pod}` })}>Pin to case</button>
          {!params.filePath && <button className="btn sm" onClick={download}>Download</button>}
          <button className="btn sm" onClick={() => setLines([])}>Clear</button>
        </div>
      </div>
      {err && <div className="alert" style={{ margin: '8px 10px' }}>{err}</div>}
      <pre ref={pre} className={'logpre' + (wrap ? ' wrap' : '')}>{shown.join('\n')}</pre>
    </div>
  );
}

const LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR'];

/** Trace: change a running JVM app's log level via its actuator endpoint, with auto-revert. Experimental / JVM. */
function TraceControls({ tab }: { tab: DockTab }) {
  const session = useApp((s) => s.session)!;
  const [logger, setLogger] = useState('ROOT');
  const [level, setLevel] = useState('DEBUG');
  const [port, setPort] = useState('8080');
  const [revert, setRevert] = useState('120');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  const setLevelOnce = async (lvl: string | null) => {
    const body = JSON.stringify({ configuredLevel: lvl });
    const url = `http://localhost:${port}/actuator/loggers/${logger}`;
    const cmd = ['sh', '-c', `curl -s -o /dev/null -w '%{http_code}' -XPOST -H 'Content-Type: application/json' ${url} -d '${body}'`];
    const r = await window.kn.kube.execOnce(session.id, { sessionId: session.id, namespace: tab.namespace, pod: tab.pod, container: tab.container, command: cmd });
    return r.ok ? r.data.trim() : `err: ${r.error}`;
  };

  const apply = async () => {
    setBusy(true); setMsg(undefined);
    const code = await setLevelOnce(level);
    setMsg(`${logger} → ${level} (HTTP ${code})`);
    const secs = parseInt(revert, 10);
    if (secs > 0) setTimeout(() => { void setLevelOnce(null).then((c) => setMsg(`${logger} reverted (HTTP ${c})`)); }, secs * 1000);
    setBusy(false);
  };

  return (
    <div className="tracebar">
      <span className="pill warn" title="Requires a JVM app exposing Spring-Boot-style /actuator/loggers">Experimental · JVM</span>
      <label className="lbl">Logger</label>
      <input className="input sm mono" value={logger} onChange={(e) => setLogger(e.target.value)} style={{ width: 130 }} />
      <label className="lbl">Level</label>
      <select className="input sm" value={level} onChange={(e) => setLevel(e.target.value)}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select>
      <label className="lbl">Port</label>
      <input className="input sm mono" value={port} onChange={(e) => setPort(e.target.value)} style={{ width: 64 }} />
      <label className="lbl">Revert after (s)</label>
      <input className="input sm mono" value={revert} onChange={(e) => setRevert(e.target.value)} style={{ width: 64 }} />
      <button className="btn sm primary" disabled={busy} onClick={apply}>Set level</button>
      {msg && <span className="muted mono" style={{ fontSize: 11 }}>{msg}</span>}
    </div>
  );
}

export function LogsDockPanel({ tab }: { tab: DockTab }) {
  const session = useApp((s) => s.session)!;
  const base = { sessionId: session.id, namespace: tab.namespace, pod: tab.pod, container: tab.container };

  if (tab.mode === 'live') {
    return <LogView params={{ ...base, filePath: tab.filePath, tailLines: 200 }} />;
  }
  if (tab.mode === 'trace') {
    return (
      <div className="tracepanel">
        <TraceControls tab={tab} />
        <LogView params={{ ...base, follow: true, tailLines: 500, timestamps: true }} />
      </div>
    );
  }
  return <LogView params={{ ...base, follow: true, tailLines: 500, timestamps: true }} downloadName={tab.pod} />;
}
