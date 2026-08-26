// Credential smoke-test — uses the SAME AWS SDK path as KubeNinja's Connect flow.
// Run:  node scripts/whoami.mjs [region]
// Reads AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN from the env.
import { EKSClient, ListClustersCommand } from '@aws-sdk/client-eks';

const region = (process.env.AWS_REGION || process.argv[2] || 'us-east-1').trim();
const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || '').trim();
const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();
let sessionToken = (process.env.AWS_SESSION_TOKEN || '').trim() || undefined;

// Permanent IAM keys (AKIA…) never use a session token; temporary ones (ASIA…) do.
if (accessKeyId.startsWith('AKIA')) sessionToken = undefined;

if (!accessKeyId || !secretAccessKey) {
  console.log('Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in the env first.');
  process.exit(1);
}
console.log(`Testing ${accessKeyId.slice(0, 8)}…  region=${region}  sessionToken=${sessionToken ? 'yes' : 'none'}\n`);

const eks = new EKSClient({ region, credentials: { accessKeyId, secretAccessKey, sessionToken } });
try {
  const r = await eks.send(new ListClustersCommand({}));
  console.log('✓ CREDENTIALS ARE VALID.');
  console.log('  EKS clusters in', region + ':', (r.clusters && r.clusters.length) ? r.clusters : '(none — the key works but this region has no clusters)');
} catch (e) {
  console.log('✗ FAILED:', e.name);
  console.log('  ' + e.message);
  if (e.name === 'InvalidClientTokenId' || /security token/i.test(e.message))
    console.log('\n  → AWS does not recognize this access key. It is invalid, deactivated, from another account, or a typo.');
  else if (e.name === 'UnrecognizedClientException' || e.name === 'SignatureDoesNotMatch')
    console.log('\n  → The secret key is wrong for this access key.');
  else if (/AccessDenied/i.test(e.name))
    console.log('\n  → The key is VALID but lacks eks:ListClusters permission (or wrong region).');
}
