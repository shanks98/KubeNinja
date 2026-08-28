import { contextBridge, ipcRenderer } from 'electron';
import type { KnApi } from '@shared/types';

// Monotonic id for correlating a renderer-side stream subscription with its IPC channel.
let seq = 0;
const nextId = () => String(++seq);

// The single, typed surface the renderer sees. No Node/Electron leaks past this bridge.
const api: KnApi = {
  aws: {
    listClusters: (creds) => ipcRenderer.invoke('aws:listClusters', creds),
    connect: (creds, clusterName) => ipcRenderer.invoke('aws:connect', creds, clusterName),
  },
  cluster: {
    status: (sessionId) => ipcRenderer.invoke('cluster:status', sessionId),
    disconnect: (sessionId) => ipcRenderer.invoke('cluster:disconnect', sessionId),
  },
  kube: {
    descriptors: () => ipcRenderer.invoke('kube:descriptors'),
    list: (sessionId, resourceId, namespace) => ipcRenderer.invoke('kube:list', sessionId, resourceId, namespace),
    get: (sessionId, resourceId, namespace, name) => ipcRenderer.invoke('kube:get', sessionId, resourceId, namespace, name),
    apply: (sessionId, yaml) => ipcRenderer.invoke('kube:apply', sessionId, yaml),
    remove: (sessionId, resourceId, namespace, name, force) => ipcRenderer.invoke('kube:remove', sessionId, resourceId, namespace, name, force),
    scale: (sessionId, resourceId, namespace, name, replicas) => ipcRenderer.invoke('kube:scale', sessionId, resourceId, namespace, name, replicas),
    restart: (sessionId, resourceId, namespace, name) => ipcRenderer.invoke('kube:restart', sessionId, resourceId, namespace, name),
    cordon: (sessionId, name, on) => ipcRenderer.invoke('kube:cordon', sessionId, name, on),
    drain: (sessionId, name) => ipcRenderer.invoke('kube:drain', sessionId, name),
    events: (sessionId, namespace, uid) => ipcRenderer.invoke('kube:events', sessionId, namespace, uid),
    execOnce: (sessionId, params) => ipcRenderer.invoke('kube:execOnce', sessionId, params),
    watch: (params, onEvent) => {
      const id = nextId();
      const chan = `kube:watch:${id}`;
      const listener = (_e: unknown, ev: Parameters<typeof onEvent>[0]) => onEvent(ev);
      ipcRenderer.on(chan, listener);
      void ipcRenderer.invoke('kube:watch:start', id, params);
      return () => {
        void ipcRenderer.invoke('kube:watch:stop', id);
        ipcRenderer.removeListener(chan, listener);
      };
    },
  },
  logs: {
    download: (sessionId, namespace, pod, container) => ipcRenderer.invoke('logs:download', sessionId, namespace, pod, container),
    stream: (params, onChunk, onError) => {
      const id = nextId();
      const chan = `logs:${id}`;
      const listener = (_e: unknown, msg: { chunk?: string; error?: string }) => {
        if (msg.error) onError(msg.error);
        else if (msg.chunk != null) onChunk(msg.chunk);
      };
      ipcRenderer.on(chan, listener);
      void ipcRenderer.invoke('logs:start', id, params);
      return () => {
        void ipcRenderer.invoke('logs:stop', id);
        ipcRenderer.removeListener(chan, listener);
      };
    },
  },
  exec: {
    open: (params, handlers) => {
      const id = nextId();
      const chan = `exec:${id}`;
      const listener = (_e: unknown, msg: { data?: string; status?: string; closed?: boolean }) => {
        if (msg.data != null) handlers.onData(msg.data);
        else if (msg.status != null) handlers.onStatus?.(msg.status);
        if (msg.closed) handlers.onClose?.();
      };
      ipcRenderer.on(chan, listener);
      void ipcRenderer.invoke('exec:start', id, params);
      return {
        write: (data) => { void ipcRenderer.invoke('exec:stdin', id, data); },
        resize: (cols, rows) => { void ipcRenderer.invoke('exec:resize', id, cols, rows); },
        close: () => { void ipcRenderer.invoke('exec:stop', id); ipcRenderer.removeListener(chan, listener); },
      };
    },
  },
  actionLog: {
    list: () => ipcRenderer.invoke('actionLog:list'),
  },
  cases: {
    list: () => ipcRenderer.invoke('cases:list'),
    create: (input) => ipcRenderer.invoke('cases:create', input),
    update: (id, patch) => ipcRenderer.invoke('cases:update', id, patch),
    remove: (id) => ipcRenderer.invoke('cases:remove', id),
    get: (id) => ipcRenderer.invoke('cases:get', id),
    addFinding: (id, input) => ipcRenderer.invoke('cases:addFinding', id, input),
    updateFinding: (id, patch) => ipcRenderer.invoke('cases:updateFinding', id, patch),
    removeFinding: (id) => ipcRenderer.invoke('cases:removeFinding', id),
    addComment: (id, input) => ipcRenderer.invoke('cases:addComment', id, input),
    addEvidence: (id, input) => ipcRenderer.invoke('cases:addEvidence', id, input),
    addScreenshot: (id, input) => ipcRenderer.invoke('cases:addScreenshot', id, input),
    evidenceDataUrl: (id) => ipcRenderer.invoke('cases:evidenceDataUrl', id),
    removeEvidence: (id) => ipcRenderer.invoke('cases:removeEvidence', id),
    report: (id, format) => ipcRenderer.invoke('cases:report', id, format),
  },
  tools: {
    dns: (host, type) => ipcRenderer.invoke('tools:dns', host, type),
    cert: (hostPort) => ipcRenderer.invoke('tools:cert', hostPort),
    certPem: (pem) => ipcRenderer.invoke('tools:certPem', pem),
  },
  helm: {
    available: () => ipcRenderer.invoke('helm:available'),
    list: (sessionId, namespace) => ipcRenderer.invoke('helm:list', sessionId, namespace),
    history: (sessionId, name, namespace) => ipcRenderer.invoke('helm:history', sessionId, name, namespace),
    values: (sessionId, name, namespace) => ipcRenderer.invoke('helm:values', sessionId, name, namespace),
    manifest: (sessionId, name, namespace) => ipcRenderer.invoke('helm:manifest', sessionId, name, namespace),
    rollback: (sessionId, name, namespace, revision) => ipcRenderer.invoke('helm:rollback', sessionId, name, namespace, revision),
    upgrade: (sessionId, name, namespace, chart, version) => ipcRenderer.invoke('helm:upgrade', sessionId, name, namespace, chart, version),
    install: (sessionId, name, namespace, chart, version) => ipcRenderer.invoke('helm:install', sessionId, name, namespace, chart, version),
    uninstall: (sessionId, name, namespace) => ipcRenderer.invoke('helm:uninstall', sessionId, name, namespace),
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    capture: () => ipcRenderer.invoke('app:capture'),
  },
};

contextBridge.exposeInMainWorld('kn', api);
