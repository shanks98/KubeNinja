import { useEffect, useState } from 'react';
import type { ResourceDescriptor } from '@shared/types';

let cache: ResourceDescriptor[] | null = null;
let inflight: Promise<ResourceDescriptor[]> | null = null;

/** Load the curated resource descriptors once and share them across the app. */
export function useDescriptors(): ResourceDescriptor[] {
  const [list, setList] = useState<ResourceDescriptor[]>(cache ?? []);
  useEffect(() => {
    if (cache) return;
    inflight ??= window.kn.kube.descriptors().then((d) => (cache = d));
    inflight.then(setList);
  }, []);
  return list;
}

export function useDescriptor(id: string): ResourceDescriptor | undefined {
  return useDescriptors().find((d) => d.id === id);
}
