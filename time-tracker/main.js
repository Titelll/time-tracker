const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// Укажите тот же GitHub-аккаунт и репозиторий, что и в package.json (build.publish)
const GH_OWNER = 'YOUR_GITHUB_USERNAME';
const GH_REPO = 'time-tracker';

const dataFile = () => path.join(app.getPath('userData'), 'timetracker-data.json');

ipcMain.handle('load', () => {
  try {
    return JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
  } catch {
    return { accounts: {}, lastLogin: '' };
  }
});

ipcMain.handle('save', (_e, data) => {
  const tmp = dataFile() + '.tmp';
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, dataFile());
  return true;
});

// ---------- защита аккаунтов и сеть (выполняется в основном процессе) ----------
const ALLOWED_HOSTS = new Set(['identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'firestore.googleapis.com']);

ipcMain.handle('http', async (_e, req) => {
  const u = new URL(req.url);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) throw new Error('host not allowed');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(req.url, {
      method: req.method || 'GET',
      headers: req.headers || {},
      body: req.body,
      signal: ctl.signal
    });
    let json = null;
    try { json = await res.json(); } catch { /* пустой ответ */ }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
});

ipcMain.handle('hash', (_e, password) => {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
});

ipcMain.handle('verify', (_e, password, stored) => {
  try {
    const [alg, s, h] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const calc = crypto.scryptSync(String(password), Buffer.from(s, 'hex'), 64);
    return crypto.timingSafeEqual(calc, Buffer.from(h, 'hex'));
  } catch {
    return false;
  }
});

ipcMain.handle('email-for', (_e, login) =>
  'u' + crypto.createHash('sha256').update(String(login).trim().toLowerCase()).digest('hex').slice(0, 40) + '@timetracker.app');

let lastUpdateStatus = null;

ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('update-status', () => lastUpdateStatus);
ipcMain.handle('install-update', () => autoUpdater.quitAndInstall());
ipcMain.handle('open-releases', () =>
  shell.openExternal(`https://github.com/${GH_OWNER}/${GH_REPO}/releases/latest`));

function setupUpdates(win) {
  if (!app.isPackaged || GH_OWNER === 'YOUR_GITHUB_USERNAME') return; // только в собранном приложении
  const send = (s) => {
    lastUpdateStatus = s;
    if (!win.isDestroyed()) win.webContents.send('update-status', s);
  };
  // Windows: скачиваем и ставим сами. macOS без подписи не умеет ставить сам: только сообщаем о новой версии.
  const manual = process.platform === 'darwin';
  autoUpdater.autoDownload = !manual;
  autoUpdater.autoInstallOnAppQuit = !manual;

  autoUpdater.on('update-available', (info) =>
    send(manual ? { state: 'available', version: info.version } : { state: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) =>
    send({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => send({ state: 'ready', version: info.version }));
  autoUpdater.on('error', () => {}); // нет сети или релиза: молча пробуем позже

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 5000);
  setInterval(check, 4 * 60 * 60 * 1000);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0f1218',
    autoHideMenuBar: true,
    title: 'Time Tracker',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  setupUpdates(win);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
