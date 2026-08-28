// Fetch the Helm binaries KubeNinja bundles, into resources/bin/ (gitignored).
// Run once after cloning:  node scripts/fetch-helm.mjs
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const HELM_VERSION = 'v3.16.4';
const targets = [
  { file: 'helm-win-x64.exe', url: `https://get.helm.sh/helm-${HELM_VERSION}-windows-amd64.zip`, member: 'windows-amd64/helm.exe' },
  { file: 'helm-linux-x64', url: `https://get.helm.sh/helm-${HELM_VERSION}-linux-amd64.tar.gz`, member: 'linux-amd64/helm' },
  { file: 'helm-darwin-arm64', url: `https://get.helm.sh/helm-${HELM_VERSION}-darwin-arm64.tar.gz`, member: 'darwin-arm64/helm' },
  { file: 'helm-darwin-x64', url: `https://get.helm.sh/helm-${HELM_VERSION}-darwin-amd64.tar.gz`, member: 'darwin-amd64/helm' },
];

const dir = join('resources', 'bin');
mkdirSync(dir, { recursive: true });

// Only the host platform's binary is strictly needed for dev; fetch all so the
// packer can produce cross-platform builds. Requires curl + (unzip|tar).
for (const t of targets) {
  const dest = join(dir, t.file);
  if (existsSync(dest)) { console.log(`✓ ${t.file} already present`); continue; }
  console.log(`↓ ${t.url}`);
  try {
    if (t.url.endsWith('.zip')) {
      execSync(`curl -sL -o "${dir}/helm.zip" "${t.url}"`, { stdio: 'inherit' });
      execSync(`cd "${dir}" && unzip -o -j helm.zip "${t.member}" -d . && mv helm.exe "${t.file}" && rm helm.zip`, { stdio: 'inherit', shell: 'bash' });
    } else {
      execSync(`curl -sL "${t.url}" | tar -xz -C "${dir}" --strip-components=1 "${t.member}" && mv "${dir}/helm" "${dest}"`, { stdio: 'inherit', shell: 'bash' });
    }
    console.log(`✓ ${t.file}`);
  } catch (e) {
    console.warn(`⚠ could not fetch ${t.file}: ${e.message}`);
  }
}
console.log(`Helm ${HELM_VERSION} binaries in ${dir}`);
