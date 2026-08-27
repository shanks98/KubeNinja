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
  app: {
    version(): Promise<string>;
  };
}
