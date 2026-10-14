const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('load'),
  save: (data) => ipcRenderer.invoke('save', data),
  version: () => ipcRenderer.invoke('app-version'),
  updateStatus: () => ipcRenderer.invoke('update-status'),
  onUpdate: (cb) => ipcRenderer.on('update-status', (_e, s) => cb(s)),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  openReleases: () => ipcRenderer.invoke('open-releases'),
  http: (req) => ipcRenderer.invoke('http', req),
  hash: (password) => ipcRenderer.invoke('hash', password),
  verify: (password, stored) => ipcRenderer.invoke('verify', password, stored),
  emailFor: (login) => ipcRenderer.invoke('email-for', login)
});
