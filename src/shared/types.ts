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

/** The typed surface exposed on `window.kn` by the preload bridge. */
export interface KnApi {
  aws: {
    listClusters(creds: AwsCreds): Promise<Result<EksClusterSummary[]>>;
    connect(creds: AwsCreds, clusterName: string): Promise<Result<ClusterSession>>;
  };
  cluster: {
    status(sessionId: string): Promise<Result<ClusterStatus>>;
    listPods(sessionId: string, namespace: string): Promise<Result<PodRow[]>>;
    disconnect(sessionId: string): Promise<Result<null>>;
  };
  app: {
    version(): Promise<string>;
  };
}

export interface PodRow {
  name: string;
  namespace: string;
  ready: string;
  phase: string;
  restarts: number;
  node: string;
  age: string;
}
