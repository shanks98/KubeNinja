import { useEffect, useRef, useState } from 'react';
import type { LogParams } from '@shared/types';
import type { DockTab } from '../store';
import { useApp } from '../store';
import { pinEvidence } from './cases/pin';

const TAILS = [100, 500, 2000, 10000];

/** Streams logs (container follow, or `tail -F` a file) into a scrolling pane,
 *  with container / previous / tail controls. */
function LogView({ tab, mode }: { tab: DockTab; mode: 'logs' | 'live' | 'trace' }) {
  const session = useApp((s) => s.session)!;
  const [container, setContainer] = useState(tab.container);
  const [previous, setPrevious] = useState(false);
  const [tailLines, setTailLines] = useState(mode === 'live' ? 200 : 500);
  const [lines, setLines] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [wrap, setWrap] = useState(false);
  const [autoscroll, setAutoscroll] = useState(true);
  const [err, setErr] = useState<string | undefined>();
  const pre = useRef<HTMLPreElement>(null);
  const carry = useRef('');
  const pending = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const params: LogParams = mode === 'live'
    ? { sessionId: session.id, namespace: tab.namespace, pod: tab.pod, container, filePath: tab.filePath, tailLines }
    : { sessionId: session.id, namespace: tab.namespace, pod: tab.pod, container, follow: true, tailLines, timestamps: true, previous };

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
    const r = await window.kn.logs.download(session.id, tab.namespace, tab.pod, container);
    if (!r.ok) { setErr(r.error); return; }
    const url = URL.createObjectURL(new Blob([r.data], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${tab.pod}${container ? '-' + container : ''}.log`; a.click();
    URL.revokeObjectURL(url);
  };

  const containers = tab.containers ?? (tab.container ? [tab.container] : []);
  return (
    <div className="logview">
      <div className="logbar">
        {containers.length > 1 && (
          <select className="input sm" style={{ width: 'auto' }} value={container} onChange={(e) => setContainer(e.target.value)} title="Container">
            {containers.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <input className="input sm" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 200 }} />
        <span className="muted mono" style={{ fontSize: 11 }}>{shown.length}/{lines.length}</span>
        <label className="chk"><input type="checkbox" checked={autoscroll} onChange={(e) => setAutoscroll(e.target.checked)} />Follow</label>
        <label className="chk"><input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} />Wrap</label>
        {mode !== 'live' && <label className="chk"><input type="checkbox" checked={previous} onChange={(e) => setPrevious(e.target.checked)} />Previous</label>}
        <label className="chk">Tail
          <select className="input sm" style={{ width: 'auto', padding: '2px 4px' }} value={tailLines} onChange={(e) => setTailLines(Number(e.target.value))}>
            {TAILS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn sm" title="Pins the selected lines, or the last 500" onClick={() => {
            const sel = window.getSelection()?.toString().trim();
            const content = sel || shown.slice(-500).join('\n');
            pinEvidence({ kind: 'snippet', title: `Logs · ${tab.pod}${container ? '/' + container : ''}${sel ? ` (${sel.split('\n').length} lines)` : ''}`, contentText: content, source: `${tab.namespace}/${tab.pod}` });
          }}>Pin to case</button>
          {mode !== 'live' && <button className="btn sm" onClick={download}>Download</button>}
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
  if (tab.mode === 'live') return <LogView tab={tab} mode="live" />;
  if (tab.mode === 'trace') {
    return (
      <div className="tracepanel">
        <TraceControls tab={tab} />
        <LogView tab={tab} mode="trace" />
      </div>
    );
  }
  return <LogView tab={tab} mode="logs" />;
}
