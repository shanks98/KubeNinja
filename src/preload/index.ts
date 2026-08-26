import { contextBridge, ipcRenderer } from 'electron';
import type { KnApi } from '@shared/types';

// The single, typed surface the renderer sees. No Node/Electron leaks past this bridge.
const api: KnApi = {
  aws: {
    listClusters: (creds) => ipcRenderer.invoke('aws:listClusters', creds),
    connect: (creds, clusterName) => ipcRenderer.invoke('aws:connect', creds, clusterName),
  },
  cluster: {
    status: (sessionId) => ipcRenderer.invoke('cluster:status', sessionId),
    listPods: (sessionId, namespace) => ipcRenderer.invoke('cluster:listPods', sessionId, namespace),
    disconnect: (sessionId) => ipcRenderer.invoke('cluster:disconnect', sessionId),
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
  },
};

contextBridge.exposeInMainWorld('kn', api);
