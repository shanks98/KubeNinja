import { LOGO_URI } from '../logo';
import { Icon } from '../Icon';

const FEATURES = [
  { ic: 'grid', title: 'Operate', body: 'Resources, YAML, logs, live-tail, log4j trace, exec, restart / scale / drain.' },
  { ic: 'case', title: 'Investigate', body: 'Cases with findings, a timeline, evidence snippets and one-click reports.' },
  { ic: 'chart', title: 'Observe', body: 'Prometheus & Loki panels, inline pod / node metric sparklines.' },
  { ic: 'shield', title: 'Secure', body: 'Presigned STS token minted in memory. No kubeconfig, no creds on disk.' },
];

export function Welcome({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="welcome">
      <div className="hero">
        <div className="badge"><span className="d" />Single-user desktop · credentials in memory only</div>

        <div className="wordmark">
          <img src={LOGO_URI} alt="KubeNinja logo" />
          <div className="name">Kube<span>Ninja</span></div>
        </div>

        <p className="tagline">A stealthy Kubernetes &amp; EKS cockpit — operate clusters and run investigations from one desktop app.</p>
        <p className="sub">Browse resources, tail logs, exec into pods, and build investigation cases with pinned evidence — connecting to EKS with short-lived AWS session credentials that never touch disk.</p>

        <div className="cta">
          <button className="btn-lg primary" onClick={onConnect}><Icon name="bolt" />Add your clusters</button>
          <button className="btn-lg ghost" onClick={onConnect}>Import <span className="mono">aws eks</span> commands</button>
        </div>

        <div className="cards">
          {FEATURES.map((f) => (
            <div className="fcard" key={f.title}>
              <div className="fic"><Icon name={f.ic} /></div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>

        <div className="foot">
          <span className="mono">v{__APP_VERSION__}</span><span className="dot" />
          <a href="https://github.com/shanks98/KubeNinja#readme" target="_blank" rel="noreferrer">Docs</a><span className="dot" />
          <a href="https://github.com/shanks98/KubeNinja/releases" target="_blank" rel="noreferrer">What's new</a><span className="dot" />
          <a href="https://github.com/shanks98/KubeNinja" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </div>
    </div>
  );
}
