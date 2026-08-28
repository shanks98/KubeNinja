// Types shared across the main process, preload bridge, and renderer. Keep this
// free of Node/Electron imports so the renderer can use it.

export interface AwsCreds {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  /** Override the AWS endpoint (e.g. http://localhost:4566 for LocalStack / MiniStack). */
  endpoint?: string;
}

export interface EksClusterSummary {
  name: string;
  status: string;
  version: string;
  endpoint: string;
  arn: string;
}

/** A connected, in-memory cluster session. Creds/token never leave the main process. */
export interface ClusterSession {
  id: string;
  name: string;
  region: string;
  endpoint: string;
  version: string;
  tokenExpiresAt: number; // epoch ms
}

export interface ClusterStatus {
  version: string;
  nodeCount: number;
  namespaceCount: number;
  namespaces: string[];
}

export interface Ok<T> { ok: true; data: T; }
export interface Err { ok: false; error: string; code?: string; }
export type Result<T> = Ok<T> | Err;

// ── Generic Kubernetes resources (Slice 1) ─────────────────────────────
// The main process streams raw API objects; the renderer wraps them in
// KubeObject subclasses (Freelens pattern) for typed accessors and columns.

export interface RawKubeMeta {
  uid?: string;
  name?: string;
  namespace?: string;
  creationTimestamp?: string;
  resourceVersion?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  ownerReferences?: { kind: string; name: string; uid: string; controller?: boolean }[];
  deletionTimestamp?: string;
  [k: string]: unknown;
}
export interface RawKubeObject {
  apiVersion?: string;
  kind?: string;
  metadata: RawKubeMeta;
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
  data?: Record<string, unknown>;
  type?: string;
  [k: string]: unknown;
}

export type ResourceCategory = 'Workloads' | 'Network' | 'Config' | 'Storage' | 'Access' | 'Cluster';

/** A curated resource kind the browser can list/watch. `id` is the URL-safe key. */
export interface ResourceDescriptor {
  id: string;
  kind: string;
  apiVersion: string; // "v1" | "apps/v1" | …
  group: string; // "" for core
  version: string;
  plural: string;
  namespaced: boolean;
  category: ResourceCategory;
}

export type WatchEventType = 'ADDED' | 'MODIFIED' | 'DELETED' | 'ERROR' | 'RESET';
export interface WatchEvent {
  type: WatchEventType;
  object?: RawKubeObject;
  /** On ERROR: the message; on RESET: the watch restarted (renderer should clear). */
  message?: string;
}

export interface WatchParams { sessionId: string; resourceId: string; namespace?: string }
export interface LogParams {
  sessionId: string; namespace: string; pod: string; container?: string;
  follow?: boolean; tailLines?: number; previous?: boolean; timestamps?: boolean;
  /** Live-tail an on-disk file inside the container via `tail -F` instead of the log stream. */
  filePath?: string;
}
export interface ExecParams { sessionId: string; namespace: string; pod: string; container?: string; command?: string[] }

/** A local audit row for every mutating op — feeds the Cases timeline (Slice 2). */
export interface ActionLogEntry {
  id: string;
  ts: number; // epoch ms
  cluster: string;
  verb: string; // restart | scale | delete | cordon | uncordon | drain | apply | reveal
  kind: string;
  name: string;
  namespace?: string;
  detail?: string;
  ok: boolean;
  error?: string;
}

// ── Investigation Cases (Slice 2) ──────────────────────────────────────
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingStatus = 'open' | 'investigating' | 'mitigated' | 'resolved' | 'wontfix';
export type CaseStatus = 'open' | 'closed';
export const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
export const FINDING_STATUSES: FindingStatus[] = ['open', 'investigating', 'mitigated', 'resolved', 'wontfix'];

export interface Case {
  id: string;
  title: string;
  description?: string;
  status: CaseStatus;
  cluster?: string;
  createdAt: number;
  updatedAt: number;
}
export interface Finding {
  id: string;
  caseId: string;
  title: string;
  severity: Severity;
  status: FindingStatus;
  detail?: string;
  resource?: string; // e.g. "Pod/shop/web-1"
  createdAt: number;
  updatedAt: number;
}
export interface Comment {
  id: string;
  caseId: string;
  findingId?: string;
  text: string;
  createdAt: number;
}
export type EvidenceKind = 'note' | 'snippet' | 'yaml' | 'screenshot';
export interface Evidence {
  id: string;
  caseId: string;
  findingId?: string;
  kind: EvidenceKind;
  title: string;
  contentText?: string; // for note/snippet/yaml
  mime?: string; // for screenshot
  sha256?: string;
  source?: string; // where it came from (resource ref, pod, etc.)
  createdAt: number;
}
export interface CaseEvent {
  id: string;
  caseId: string;
  ts: number;
  type: string; // created | note | finding | evidence | status | closed …
  text: string;
}
export interface TimelineItem {
  ts: number;
  kind: 'event' | 'action' | 'finding' | 'evidence';
  text: string;
  severity?: Severity;
  verb?: string;
  ok?: boolean;
}
export interface SeverityRollup { top?: Severity; open: number; total: number; counts: Record<Severity, number> }
export interface CaseSummary extends Case { rollup: SeverityRollup; findingCount: number }
export interface CaseDetail {
  case: Case;
  findings: Finding[];
  comments: Comment[];
  evidence: Evidence[];
  timeline: TimelineItem[];
  rollup: SeverityRollup;
}

// ── Investigation tools (main-process backed) ──────────────────────────
export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS';
export interface DnsResult { host: string; type: DnsRecordType; records: string[]; ms: number }
export interface CertChainNode { subject: string; issuer: string; daysLeft: number }
export interface CertResult {
  host?: string; port?: number;
  subject: string; subjectCN?: string; subjectO?: string;
  issuer: string; issuerCN?: string;
  serialNumber?: string;
  validFrom: string; validTo: string; daysLeft: number; expired: boolean;
  sigAlg?: string; keyType?: string; bits?: number;
  sans?: string[]; isCA?: boolean; selfSigned?: boolean; authorized: boolean;
  chain?: CertChainNode[];
  error?: string;
}

// ── Helm (Slice 4) ─────────────────────────────────────────────────────
export interface HelmRelease { name: string; namespace: string; revision: number; updated: string; status: string; chart: string; appVersion: string }
export interface HelmHistoryEntry { revision: number; updated: string; status: string; chart: string; appVersion: string; description: string }
export interface HelmChart { name: string; version: string; appVersion: string; description: string }
export interface HelmRepo { name: string; url: string }

// ── Resource map (Slice 4) ─────────────────────────────────────────────
export type GraphNodeKind = string;
export interface GraphNode { id: string; kind: string; name: string; namespace?: string; status?: 'ok' | 'warn' | 'err' | 'off'; resourceId?: string }
export interface GraphEdge { source: string; target: string; kind: 'owns' | 'routes' | 'selects' | 'mounts' | 'uses' | 'scales' }
export interface ResourceGraph { nodes: GraphNode[]; edges: GraphEdge[] }

/** Handle to an interactive exec session (renderer side). */
export interface ExecHandle {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
}
export interface ExecHandlers {
  onData(text: string): void;
  onStatus?(message: string): void;
  onClose?(): void;
}

/** The typed surface exposed on `window.kn` by the preload bridge. */
export interface KnApi {
  aws: {
    listClusters(creds: AwsCreds): Promise<Result<EksClusterSummary[]>>;
    connect(creds: AwsCreds, clusterName: string): Promise<Result<ClusterSession>>;
  };
  cluster: {
    status(sessionId: string): Promise<Result<ClusterStatus>>;
    disconnect(sessionId: string): Promise<Result<null>>;
  };
  kube: {
    descriptors(): Promise<ResourceDescriptor[]>;
    list(sessionId: string, resourceId: string, namespace?: string): Promise<Result<RawKubeObject[]>>;
    get(sessionId: string, resourceId: string, namespace: string | undefined, name: string): Promise<Result<RawKubeObject>>;
    apply(sessionId: string, yaml: string): Promise<Result<RawKubeObject>>;
    remove(sessionId: string, resourceId: string, namespace: string | undefined, name: string, force?: boolean): Promise<Result<null>>;
    scale(sessionId: string, resourceId: string, namespace: string, name: string, replicas: number): Promise<Result<null>>;
    restart(sessionId: string, resourceId: string, namespace: string, name: string): Promise<Result<null>>;
    cordon(sessionId: string, name: string, on: boolean): Promise<Result<null>>;
    drain(sessionId: string, name: string): Promise<Result<{ evicted: number; skipped: number }>>;
    events(sessionId: string, namespace: string | undefined, uid: string): Promise<Result<RawKubeObject[]>>;
    /** Run a command to completion inside a pod; returns combined stdout/stderr. */
    execOnce(sessionId: string, params: ExecParams): Promise<Result<string>>;
    /** Subscribe to a live watch; returns an unsubscribe function. */
    watch(params: WatchParams, onEvent: (e: WatchEvent) => void): () => void;
  };
  logs: {
    download(sessionId: string, namespace: string, pod: string, container?: string): Promise<Result<string>>;
    /** Follow container logs (or tail -F a file when params.filePath is set); returns unsubscribe. */
    stream(params: LogParams, onChunk: (text: string) => void, onError: (message: string) => void): () => void;
  };
  exec: {
    open(params: ExecParams, handlers: ExecHandlers): ExecHandle;
  };
  actionLog: {
    list(): Promise<Result<ActionLogEntry[]>>;
  };
  cases: {
    list(): Promise<Result<CaseSummary[]>>;
    create(input: { title: string; description?: string; cluster?: string }): Promise<Result<Case>>;
    update(id: string, patch: Partial<Pick<Case, 'title' | 'description' | 'status'>>): Promise<Result<Case>>;
    remove(id: string): Promise<Result<null>>;
    get(id: string): Promise<Result<CaseDetail>>;
    addFinding(caseId: string, input: { title: string; severity: Severity; status?: FindingStatus; detail?: string; resource?: string }): Promise<Result<Finding>>;
    updateFinding(id: string, patch: Partial<Pick<Finding, 'title' | 'severity' | 'status' | 'detail'>>): Promise<Result<Finding>>;
    removeFinding(id: string): Promise<Result<null>>;
    addComment(caseId: string, input: { text: string; findingId?: string }): Promise<Result<Comment>>;
    addEvidence(caseId: string, input: { kind: EvidenceKind; title: string; contentText?: string; source?: string; findingId?: string }): Promise<Result<Evidence>>;
    addScreenshot(caseId: string, input: { title: string; dataUrl: string; findingId?: string }): Promise<Result<Evidence>>;
    evidenceDataUrl(id: string): Promise<Result<string>>;
    removeEvidence(id: string): Promise<Result<null>>;
    report(id: string, format: 'html' | 'json'): Promise<Result<string>>;
  };
  tools: {
    dns(host: string, type: DnsRecordType): Promise<Result<DnsResult>>;
    cert(hostPort: string): Promise<Result<CertResult>>;
    certPem(pem: string): Promise<Result<CertResult>>;
  };
  helm: {
    available(): Promise<Result<boolean>>;
    list(sessionId: string, namespace?: string): Promise<Result<HelmRelease[]>>;
    history(sessionId: string, name: string, namespace: string): Promise<Result<HelmHistoryEntry[]>>;
    values(sessionId: string, name: string, namespace: string): Promise<Result<string>>;
    manifest(sessionId: string, name: string, namespace: string): Promise<Result<string>>;
    rollback(sessionId: string, name: string, namespace: string, revision: number): Promise<Result<string>>;
    upgrade(sessionId: string, name: string, namespace: string, chart: string, version?: string, values?: string): Promise<Result<string>>;
    install(sessionId: string, name: string, namespace: string, chart: string, version?: string, values?: string): Promise<Result<string>>;
    uninstall(sessionId: string, name: string, namespace: string): Promise<Result<string>>;
    repoList(): Promise<Result<HelmRepo[]>>;
    repoAdd(name: string, url: string): Promise<Result<string>>;
    repoRemove(name: string): Promise<Result<string>>;
    search(term: string): Promise<Result<HelmChart[]>>;
  };
  app: {
    version(): Promise<string>;
    /** Capture the app window as a PNG data URL (for screenshot evidence). */
    capture(): Promise<Result<string>>;
    /** Subscribe to native-menu actions (menu:add-cluster | menu:open-cases | menu:open-tools). */
    onMenu(handler: (action: string) => void): () => void;
  };
}
