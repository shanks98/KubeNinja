// Assemble a portable, no-install KubeNinja app around the Electron runtime —
// without electron-builder. This sidesteps electron-builder's winCodeSign cache,
// which fails to extract on Windows without the symbolic-link privilege
// (Developer Mode / admin). Run AFTER `electron-vite build` (see the npm script).
//
// Windows: produces dist/KubeNinja-win-<arch>/KubeNinja.exe (double-click to run).
// macOS/Linux: for signed/native installers use electron-builder with the symlink
// privilege granted; this quick packer is Windows-focused for now.
import { cpSync, rmSync, mkdirSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

if (process.platform !== 'win32') {
  console.error('pack-portable currently targets Windows. Use electron-builder for mac/linux.');
  process.exit(1);
}

const electronExe = require('electron'); // path to node_modules/electron/dist/electron.exe
const runtimeDir = dirname(electronExe);
const outName = `KubeNinja-win-${process.arch}`;
const dest = join('dist', outName);

console.log(`packing ${outName} …`);
rmSync('dist', { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

// 1. Electron runtime
cpSync(runtimeDir, dest, { recursive: true });
renameSync(join(dest, 'electron.exe'), join(dest, 'KubeNinja.exe'));
rmSync(join(dest, 'resources', 'default_app.asar'), { force: true });

// 2. App code (unpacked, no asar)
const appDir = join(dest, 'resources', 'app');
mkdirSync(appDir, { recursive: true });
if (!existsSync('out')) {
  console.error('out/ missing — run `npm run build` first.');
  process.exit(1);
}
cpSync('out', join(appDir, 'out'), { recursive: true });
writeFileSync(join(appDir, 'package.json'), JSON.stringify({
  name: pkg.name,
  productName: 'KubeNinja',
  version: pkg.version,
  main: 'out/main/index.js',
  type: 'module',
}, null, 2));

console.log(`done → ${join(dest, 'KubeNinja.exe')}`);
