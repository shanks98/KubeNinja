import type { ResourceDescriptor } from '@shared/types';
import { useApp } from '../store';
import { KubeObject } from '../kube/KubeObject';
import { confirmDialog, promptDialog } from './Dialog';
import { notifyResult, toast } from './Toast';

export interface Action { label: string; danger?: boolean; run: () => void | Promise<void> }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function containers(o: KubeObject): string[] {
  const spec = o.raw.spec as any;
  return [...(spec?.initContainers ?? []), ...(spec?.containers ?? []), ...(spec?.ephemeralContainers ?? [])].map((c: any) => c.name);
}

/**
 * The context actions for an object, mirroring Freelens's per-kind menu items:
 * pods get Logs/Exec/Live/Trace, workloads get Scale/Restart, nodes get
 * Cordon/Drain, everything gets Edit + Delete. Mutations write the action log
 * (main side) and confirm before anything destructive.
 */
export function useResourceActions() {
  const session = useApp((s) => s.session)!;
  const openDock = useApp((s) => s.openDock);
  const setDetails = useApp((s) => s.setDetails);

  return (d: ResourceDescriptor, o: KubeObject): Action[] => {
    const ns = o.getNs();
    const name = o.getName();
    const uid = o.getId();
    const acts: Action[] = [];

    if (d.id === 'pods') {
      const cs = containers(o);
      const c0 = cs[0];
      acts.push({ label: 'Logs', run: () => openDock({ id: `logs:${uid}`, mode: 'logs', title: `Logs · ${name}`, namespace: ns!, pod: name, container: c0, containers: cs }) });
      acts.push({ label: 'Exec / Shell', run: () => openDock({ id: `exec:${uid}`, mode: 'exec', title: `Shell · ${name}`, namespace: ns!, pod: name, container: c0, containers: cs }) });
      acts.push({ label: 'Live file tail…', run: async () => {
        const f = await promptDialog({ title: 'Live file tail', label: 'File path inside the container', initial: '/var/log/app.log', okLabel: 'Tail' });
        if (f) openDock({ id: `live:${uid}:${f}`, mode: 'live', title: `Live · ${name}`, namespace: ns!, pod: name, container: c0, containers: cs, filePath: f });
      } });
      acts.push({ label: 'Trace (log level)…', run: () => openDock({ id: `trace:${uid}`, mode: 'trace', title: `Trace · ${name}`, namespace: ns!, pod: name, container: c0, containers: cs }) });
    }

    if (['deployments', 'statefulsets', 'replicasets'].includes(d.id)) {
      acts.push({ label: 'Scale…', run: async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cur = (o.raw.spec as any)?.replicas ?? 0;
        const v = await promptDialog({ title: `Scale ${name}`, label: 'Replicas', initial: String(cur), okLabel: 'Scale' });
        if (v != null && v.trim() !== '') notifyResult(await window.kn.kube.scale(session.id, d.id, ns!, name, parseInt(v, 10) || 0), 'Scaled');
      } });
    }
    if (['deployments', 'statefulsets', 'daemonsets'].includes(d.id)) {
      acts.push({ label: 'Restart', run: async () => {
        if (await confirmDialog({ title: 'Restart', message: <>Rollout-restart <b>{name}</b>?</>, okLabel: 'Restart' }))
          notifyResult(await window.kn.kube.restart(session.id, d.id, ns!, name), 'Restart triggered');
      } });
    }
    if (d.id === 'nodes') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const unsched = (o.raw.spec as any)?.unschedulable;
      acts.push({ label: unsched ? 'Uncordon' : 'Cordon', run: async () => notifyResult(await window.kn.kube.cordon(session.id, name, !unsched), unsched ? 'Uncordoned' : 'Cordoned') });
      acts.push({ label: 'Drain…', danger: true, run: async () => {
        if (await confirmDialog({ title: 'Drain node', message: <>Cordon and evict all evictable pods on <b>{name}</b>?</>, okLabel: 'Drain', danger: true })) {
          const r = await window.kn.kube.drain(session.id, name);
          toast(r.ok ? `Drained: ${r.data.evicted} evicted, ${r.data.skipped} skipped` : r.error);
        }
      } });
    }

    acts.push({ label: 'Edit / YAML', run: () => setDetails({ resourceId: d.id, namespace: ns, name, uid }) });
    acts.push({ label: 'Delete…', danger: true, run: async () => {
      if (await confirmDialog({ title: `Delete ${d.kind}`, message: <>Delete <b>{name}</b>{ns ? <> in <b>{ns}</b></> : null}? This can't be undone.</>, okLabel: 'Delete', danger: true }))
        notifyResult(await window.kn.kube.remove(session.id, d.id, ns, name), 'Deleted');
    } });

    return acts;
  };
}
