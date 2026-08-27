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
  app: {
    version: () => ipcRenderer.invoke('app:version'),
  },
};

contextBridge.exposeInMainWorld('kn', api);
