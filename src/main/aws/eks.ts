import { EKSClient, ListClustersCommand, DescribeClusterCommand } from '@aws-sdk/client-eks';
import type { AwsCreds, EksClusterSummary } from '@shared/types';

function client(creds: AwsCreds): EKSClient {
  return new EKSClient({
    region: creds.region,
    ...(creds.endpoint ? { endpoint: creds.endpoint } : {}),
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    },
  });
}

/** List EKS clusters in the region, resolving each to its endpoint + version. */
export async function listEksClusters(creds: AwsCreds): Promise<EksClusterSummary[]> {
  const eks = client(creds);
  const { clusters = [] } = await eks.send(new ListClustersCommand({}));
  const out: EksClusterSummary[] = [];
  for (const name of clusters) {
    const { cluster } = await eks.send(new DescribeClusterCommand({ name }));
    if (!cluster) continue;
    out.push({
      name: cluster.name ?? name,
      status: cluster.status ?? 'UNKNOWN',
      version: cluster.version ?? '?',
      endpoint: cluster.endpoint ?? '',
      arn: cluster.arn ?? '',
    });
  }
  return out;
}

/** Describe one cluster and return the API endpoint + base64 CA needed to build a kube client. */
export async function describeEksCluster(creds: AwsCreds, name: string): Promise<{ endpoint: string; caData: string; version: string }> {
  const { cluster } = await client(creds).send(new DescribeClusterCommand({ name }));
  if (!cluster?.endpoint || !cluster.certificateAuthority?.data) {
    throw new Error(`cluster ${name} is not describable (endpoint/CA missing) — is it ACTIVE?`);
  }
  return { endpoint: cluster.endpoint, caData: cluster.certificateAuthority.data, version: cluster.version ?? '?' };
}
