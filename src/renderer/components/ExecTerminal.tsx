import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { DockTab } from '../store';
import { useApp } from '../store';

/** Interactive shell into a pod container, bridged to the main-process exec channel.
 *  A container picker re-opens the session against the chosen container. */
export function ExecTerminal({ tab }: { tab: DockTab }) {
  const session = useApp((s) => s.session)!;
  const host = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState(tab.container);
  const containers = tab.containers ?? (tab.container ? [tab.container] : []);

  useEffect(() => {
    const term = new Terminal({
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: 12.5,
      cursorBlink: true,
      theme: { background: '#0a0c11', foreground: '#e6e9ef', cursor: '#2dd4a7', selectionBackground: '#233' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current!);
    try { fit.fit(); } catch { /* not laid out yet */ }

    const sess = window.kn.exec.open(
      { sessionId: session.id, namespace: tab.namespace, pod: tab.pod, container },
      {
        onData: (t) => term.write(t),
        onClose: () => term.write('\r\n\x1b[90m[session closed]\x1b[0m\r\n'),
      },
    );

    const onData = term.onData((d) => sess.write(d));
    const onResize = term.onResize(({ cols, rows }) => sess.resize(cols, rows));
    const ro = new ResizeObserver(() => { try { fit.fit(); } catch { /* ignore */ } });
    ro.observe(host.current!);
    const t = setTimeout(() => { try { fit.fit(); sess.resize(term.cols, term.rows); term.focus(); } catch { /* ignore */ } }, 60);

    return () => {
      clearTimeout(t);
      ro.disconnect();
      onData.dispose();
      onResize.dispose();
      sess.close();
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container]);

  return (
    <div className="xterm-panel">
      {containers.length > 1 && (
        <div className="xterm-bar">
          <span className="lbl">Container</span>
          <select className="input sm" style={{ width: 'auto' }} value={container} onChange={(e) => setContainer(e.target.value)}>
            {containers.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}
      <div ref={host} className="xterm-host" />
    </div>
  );
}
