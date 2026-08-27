import { useApp } from '../store';
import { LogsDockPanel } from './LogPanels';
import { ExecTerminal } from './ExecTerminal';

const ICON: Record<string, string> = { logs: '▤', live: '≈', trace: '◉', exec: '❯' };

/** Bottom dock hosting log/live/trace viewers and exec terminals as tabs. */
export function Dock() {
  const dock = useApp((s) => s.dock);
  const dockActive = useApp((s) => s.dockActive);
  const setDockActive = useApp((s) => s.setDockActive);
  const closeDock = useApp((s) => s.closeDock);

  if (!dock.length) return null;
  const activeId = dockActive ?? dock[dock.length - 1].id;

  return (
    <div className="dock">
      <div className="dock-tabs">
        {dock.map((t) => (
          <div key={t.id} className={'dock-tab' + (t.id === activeId ? ' on' : '')} onClick={() => setDockActive(t.id)}>
            <span className="dock-ic">{ICON[t.mode]}</span>
            <span className="dock-title">{t.title}</span>
            <button className="dock-x" onClick={(e) => { e.stopPropagation(); closeDock(t.id); }}>✕</button>
          </div>
        ))}
      </div>
      <div className="dock-body">
        {dock.map((t) => (
          <div key={t.id} className="dock-pane" style={{ display: t.id === activeId ? 'flex' : 'none' }}>
            {t.mode === 'exec' ? <ExecTerminal tab={t} /> : <LogsDockPanel tab={t} />}
          </div>
        ))}
      </div>
    </div>
  );
}
