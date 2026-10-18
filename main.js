const { app, BrowserWindow, ipcMain, dialog, protocol, powerMonitor, Menu } = require('electron');
const path = require('path');
const { Vault, EXTS } = require('./vault');

protocol.registerSchemesAsPrivileged([{ scheme: 'vault', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }]);

const vault = new Vault(process.env.LOCKER_DIR || path.join(app.getPath('userData'), 'vault'));
let win;

function lock() {
  vault.lock();
  win?.webContents.reload();
}

// vault://<id> streams decrypted bytes straight to <img>/<video>, honouring Range so videos seek. Nothing is written to disk.
function serve(req) {
  const it = vault.key && vault.items.find(x => x.id === new URL(req.url).hostname);
  if (!it) return new Response(null, { status: 404 });
  const size = it.size, m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  let start = 0, end = size - 1;
  if (m) {
    start = m[1] ? +m[1] : size - +m[2];
    end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const chunks = vault.read(it.id, start, end);
  const body = new ReadableStream({
    async pull(c) { const { value, done } = await chunks.next(); done ? c.close() : c.enqueue(value); },
    cancel() { chunks.return(); },
  });
  const headers = { 'Content-Type': it.type, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' };
  if (m) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  return new Response(body, { status: m ? 206 : 200, headers });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('vault', serve);

  win = new BrowserWindow({
    width: 1200, height: 800, backgroundColor: '#0e0e10', title: 'Locker',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.setContentProtection(true); // window shows as blank in screen shares, recordings and screenshots
  win.on('minimize', lock);
  powerMonitor.on('lock-screen', lock);
  win.webContents.on('will-navigate', e => e.preventDefault()); // dropping a file must not open it
  win.loadFile('index.html');
});

app.on('window-all-closed', () => { vault.lock(); app.quit(); });

ipcMain.handle('state', () => ({ exists: vault.exists(), unlocked: !!vault.key }));

ipcMain.handle('unlock', async (_, password) => {
  try { await vault.unlock(password); return {}; }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle('list', () => ({ items: vault.items, folders: vault.folders }));
ipcMain.handle('lock', lock);

ipcMain.handle('import', async (_, paths, folder) => {
  if (!paths?.length) {
    const r = await dialog.showOpenDialog(win, {
      title: 'Move photos and videos into Locker',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Photos and videos', extensions: EXTS }, { name: 'All files', extensions: ['*'] }],
    });
    paths = r.filePaths;
  }
  const failed = [];
  for (const p of paths) {
    try { await vault.add(p, folder); }
    catch (e) { failed.push(`${path.basename(p)}: ${e.message}`); }
  }
  return { added: paths.length - failed.length, failed };
});

ipcMain.handle('export', async (_, id) => {
  const it = vault.items.find(x => x.id === id);
  const name = it.type === 'text/plain' ? `${it.name || 'Note'}.txt`.replace(/[\\/:*?"<>|]/g, '_') : it.name;
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('downloads'), name) });
  if (r.canceled) return false;
  await vault.export(id, r.filePath);
  return true;
});

ipcMain.handle('remove', (_, id) => vault.remove(id));
ipcMain.handle('addNote', (_, folder) => vault.addNote(folder));
ipcMain.handle('update', (_, id, { name, text, folder }) => vault.update(id, Object.fromEntries(Object.entries({ name, text, folder }).filter(([, v]) => v !== undefined))));
ipcMain.handle('addFolder', (_, name) => vault.addFolder(name));
ipcMain.handle('removeFolder', (_, name) => vault.removeFolder(name));
