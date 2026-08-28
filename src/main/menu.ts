import { app, Menu, shell, dialog, BrowserWindow, type MenuItemConstructorOptions } from 'electron';

const REPO = 'https://github.com/shanks98/KubeNinja';
const send = (channel: string) => BrowserWindow.getFocusedWindow()?.webContents.send(channel);

function about(): void {
  const win = BrowserWindow.getFocusedWindow() ?? undefined;
  dialog.showMessageBox(win!, {
    type: 'info',
    title: 'About KubeNinja',
    message: 'KubeNinja',
    detail: `A single-user Kubernetes / EKS operations & investigation desktop IDE.\n\nVersion ${app.getVersion()}\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}\n\nCredentials are held in memory only — nothing touches disk.`,
    buttons: ['OK', 'View on GitHub'],
    defaultId: 0,
  }).then((r) => { if (r.response === 1) shell.openExternal(REPO); });
}

/** Build and install the KubeNinja application menu (replaces Electron's default). */
export function buildMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: 'KubeNinja',
      submenu: [
        { label: 'About KubeNinja', click: about },
        { type: 'separator' as const },
        { role: 'hide' as const }, { role: 'hideOthers' as const }, { role: 'unhide' as const },
        { type: 'separator' as const }, { role: 'quit' as const },
      ],
    } as MenuItemConstructorOptions] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Add cluster…', accelerator: 'CmdOrCtrl+N', click: () => send('menu:add-cluster') },
        { label: 'Investigation cases', accelerator: 'CmdOrCtrl+Shift+C', click: () => send('menu:open-cases') },
        { label: 'Investigation tools', accelerator: 'CmdOrCtrl+Shift+T', click: () => send('menu:open-tools') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : [{ role: 'close' as const }])] },
    {
      role: 'help',
      submenu: [
        { label: 'Documentation', click: () => shell.openExternal(`${REPO}#readme`) },
        { label: "What's new", click: () => shell.openExternal(`${REPO}/releases`) },
        { label: 'KubeNinja on GitHub', click: () => shell.openExternal(REPO) },
        { label: 'Report an issue', click: () => shell.openExternal(`${REPO}/issues/new`) },
        ...(isMac ? [] : [{ type: 'separator' as const }, { label: 'About KubeNinja', click: about }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
