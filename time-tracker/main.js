const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// Укажите тот же GitHub-аккаунт и репозиторий, что и в package.json (build.publish)
const GH_OWNER = 'Titelll';
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
